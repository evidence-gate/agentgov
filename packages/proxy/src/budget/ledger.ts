import { eq } from 'drizzle-orm';
import { budgetLedger, holds } from '../db/schema';
import type { DbClient } from '../db/client';
import { isAgentId } from '../agent-auth';
import type { AgentId, HoldId } from '../types';
import { auditedWrite } from '../audit/writer';

export type BudgetRow = typeof budgetLedger.$inferSelect;

/**
 * Test/helper insert. Not an operator path and not called by chat.
 * Operator provisioning is provisionAgentBudget, which audits the grant.
 */
export async function ensureAgent(
  db: DbClient,
  agentId: AgentId,
  limitUsd: number
): Promise<void> {
  const now = Date.now();
  await db
    .insert(budgetLedger)
    .values({ agentId, limitUsd, spentUsd: 0, reservedUsd: 0, updatedAt: now })
    .onConflictDoNothing();
}

/**
 * Get the current budget state for an agent.
 */
export async function getBudget(
  db: DbClient,
  agentId: AgentId
): Promise<{ limitUsd: number; spentUsd: number; reservedUsd: number } | null> {
  const rows = await db
    .select()
    .from(budgetLedger)
    .where(eq(budgetLedger.agentId, agentId))
    .limit(1);

  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    limitUsd: row.limitUsd,
    spentUsd: row.spentUsd,
    reservedUsd: row.reservedUsd,
  };
}

/** Reserve and audit atomically; concurrent requests cannot spend the same balance. */
export async function createHold(
  db: DbClient, agentId: AgentId, model: string, estimatedCost: number, subject?: string,
): Promise<{ approved: true; holdId: HoldId } | { approved: false; remaining: number }> {
  if (!Number.isFinite(estimatedCost) || estimatedCost < 0) throw new Error('Invalid hold cost');
  const holdId = crypto.randomUUID();
  let remaining = 0;
  const committed = await auditedWrite(db, async () => {
    const budget = await getBudget(db, agentId);
    remaining = budget ? budget.limitUsd - budget.spentUsd - budget.reservedUsd : 0;
    if (!budget || estimatedCost > remaining) return null;
    const now = Date.now();
    return {
      event: { eventType: 'budget_hold', agentId, model, costDelta: estimatedCost,
        runningBalance: remaining - estimatedCost, meta: { holdId, estimatedCost, ...(subject ? { subject } : {}) } },
      condition: {
        sql: 'EXISTS(SELECT 1 FROM budget_ledger WHERE agent_id=? AND limit_usd=? AND spent_usd=? AND reserved_usd=?)',
        args: [agentId, budget.limitUsd, budget.spentUsd, budget.reservedUsd],
      },
      statements: (hash: string) => [
        { sql: `INSERT INTO holds (id,agent_id,model,estimated_cost,status,created_at,expires_at)
                SELECT ?,?,?,?,'active',?,? WHERE EXISTS(SELECT 1 FROM audit_log WHERE hash=?)`,
          args: [holdId, agentId, model, estimatedCost, now, now + 3_600_000, hash] },
        { sql: `UPDATE budget_ledger SET reserved_usd=reserved_usd+?,updated_at=?
                WHERE agent_id=? AND EXISTS(SELECT 1 FROM audit_log WHERE hash=?)`,
          args: [estimatedCost, now, agentId, hash] },
      ],
    };
  });
  return committed ? { approved: true, holdId } : { approved: false, remaining };
}

/** Settle and audit exactly once. Null cost conservatively consumes the reservation. */
export async function settleHold(
  db: DbClient, holdId: HoldId, actualCost: number | null,
  context?: { agentId: AgentId; model: string; actualUsage: { promptTokens: number; completionTokens: number } | null },
): Promise<void> {
  if (actualCost !== null && (!Number.isFinite(actualCost) || actualCost < 0)) throw new Error('Invalid settlement cost');
  await auditedWrite(db, async () => {
    const [hold] = await db.select().from(holds).where(eq(holds.id, holdId)).limit(1);
    if (!hold) throw new Error('Settlement hold not found');
    if (context && (context.agentId !== hold.agentId || context.model !== hold.model)) throw new Error('Settlement identity mismatch');
    if (hold.status === 'settled') return null;
    if (hold.status !== 'active') throw new Error('Settlement hold is not active');
    const budget = await getBudget(db, hold.agentId);
    if (!budget) throw new Error('Settlement budget not found');
    const cost = actualCost ?? hold.estimatedCost;
    return {
      event: { eventType: 'budget_settle', agentId: hold.agentId, model: hold.model, costDelta: cost,
        runningBalance: budget.limitUsd - budget.spentUsd - budget.reservedUsd + hold.estimatedCost - cost,
        meta: { holdId, actualCost: cost, ...(context ? { actualUsage: context.actualUsage } : {}),
          ...(actualCost === null ? { estimated: true, reason: 'usage_unknown' } : {}) } },
      condition: {
        sql: `EXISTS(SELECT 1 FROM holds WHERE id=? AND status='active') AND
              EXISTS(SELECT 1 FROM budget_ledger WHERE agent_id=? AND limit_usd=? AND spent_usd=? AND reserved_usd=?)`,
        args: [holdId, hold.agentId, budget.limitUsd, budget.spentUsd, budget.reservedUsd],
      },
      statements: (hash: string) => [
        { sql: `UPDATE holds SET status='settled' WHERE id=? AND EXISTS(SELECT 1 FROM audit_log WHERE hash=?)`, args: [holdId, hash] },
        { sql: `UPDATE budget_ledger SET reserved_usd=MAX(0,reserved_usd-?),spent_usd=spent_usd+?,updated_at=?
                WHERE agent_id=? AND EXISTS(SELECT 1 FROM audit_log WHERE hash=?)`,
          args: [hold.estimatedCost, cost, Date.now(), hold.agentId, hash] },
      ],
    };
  });
}

/**
 * Create or reuse an agent budget. Idempotent.
 * A new row starts at zero spend and zero reservation and writes budget_provisioned.
 * An existing row keeps spentUsd and reservedUsd. A changed limit reuses updateBudgetLimit.
 * The same limit writes nothing. Chat still cannot call this.
 */
export async function provisionAgentBudget(
  db: DbClient,
  agentId: AgentId,
  limitUsd: number,
): Promise<{ row: BudgetRow; created: boolean }> {
  if (!isAgentId(agentId)) throw new Error('Invalid agent id');
  if (!Number.isFinite(limitUsd) || limitUsd < 0) throw new Error('Invalid budget limit');
  for (let attempt = 0; attempt < 32; attempt++) {
    const [existing] = await db.select().from(budgetLedger).where(eq(budgetLedger.agentId, agentId)).limit(1);
    if (existing) {
      if (existing.limitUsd === limitUsd) return { row: existing, created: false };
      const updated = await updateBudgetLimit(db, agentId, limitUsd);
      if (updated) return { row: updated, created: false };
      continue;
    }
    const now = Date.now();
    const inserted = await auditedWrite(db, async () => {
      const [current] = await db.select().from(budgetLedger).where(eq(budgetLedger.agentId, agentId)).limit(1);
      if (current) return null;
      return {
        event: {
          eventType: 'budget_provisioned' as const,
          agentId,
          model: '',
          costDelta: 0,
          runningBalance: limitUsd,
          meta: { limitUsd },
        },
        condition: {
          sql: 'NOT EXISTS(SELECT 1 FROM budget_ledger WHERE agent_id=?)',
          args: [agentId],
        },
        statements: (hash: string) => [{
          sql: `INSERT INTO budget_ledger (agent_id,limit_usd,spent_usd,reserved_usd,updated_at)
                SELECT ?,?,0,0,? WHERE EXISTS(SELECT 1 FROM audit_log WHERE hash=?)`,
          args: [agentId, limitUsd, now, hash],
        }],
      };
    });
    if (!inserted) continue;
    const [row] = await db.select().from(budgetLedger).where(eq(budgetLedger.agentId, agentId)).limit(1);
    if (row) return { row, created: true };
  }
  throw new Error('Budget provisioning contention');
}

/**
 * Update the budget limit for an existing agent.
 *
 * CRITICAL: Only updates limitUsd and updatedAt.
 * NEVER touches spentUsd or reservedUsd — those are owned exclusively by Hold/Settle.
 * Including them would race-write stale values and corrupt budget data.
 *
 * Returns the updated row, or null if the agent does not exist.
 */
export async function updateBudgetLimit(
  db: DbClient,
  agentId: AgentId,
  limitUsd: number,
): Promise<typeof budgetLedger.$inferSelect | null> {
  if (!Number.isFinite(limitUsd) || limitUsd < 0) throw new Error('Invalid budget limit');
  let updated: typeof budgetLedger.$inferSelect | null = null;
  await auditedWrite(db, async () => {
    const [current] = await db.select().from(budgetLedger).where(eq(budgetLedger.agentId, agentId)).limit(1);
    if (!current) { updated = null; return null; }
    const now = Date.now();
    updated = { ...current, limitUsd, updatedAt: now };
    return {
      event: { eventType: 'budget_limit_changed', agentId, model: '', costDelta: 0,
        runningBalance: limitUsd - current.spentUsd - current.reservedUsd,
        meta: { previousLimitUsd: current.limitUsd, newLimitUsd: limitUsd } },
      condition: {
        sql: 'EXISTS(SELECT 1 FROM budget_ledger WHERE agent_id=? AND limit_usd=? AND spent_usd=? AND reserved_usd=?)',
        args: [agentId, current.limitUsd, current.spentUsd, current.reservedUsd],
      },
      statements: (hash: string) => [{
        sql: `UPDATE budget_ledger SET limit_usd=?,updated_at=? WHERE agent_id=?
              AND EXISTS(SELECT 1 FROM audit_log WHERE hash=?)`,
        args: [limitUsd, now, agentId, hash],
      }],
    };
  });
  return updated;
}
