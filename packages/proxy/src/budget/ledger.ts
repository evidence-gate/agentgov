/**
 * Budget ledger — DB read/write for budget_ledger and holds tables.
 *
 * Implements the Hold/Settle pattern for concurrent budget enforcement.
 * Every LLM request that passes the gate creates a Hold (pessimistic reservation).
 * After the response arrives, the hold is settled to the actual cost.
 *
 * Concurrency note: Steps in createHold are NOT wrapped in a single DB transaction
 * because the Turso HTTP client does not support interactive transactions.
 * At high concurrency, two simultaneous reads could both see sufficient budget.
 * This is a known consistency risk documented here; Phase 2 mitigates it by
 * running each agent's gate in a Cloudflare Durable Object (serialized per agent).
 * See PITFALLS.md #8.
 */

import { eq } from 'drizzle-orm';
import { budgetLedger, holds } from '../db/schema';
import type { DbClient } from '../db/client';
import type { AgentId, HoldId } from '../types';

/**
 * Ensure an agent has a budget_ledger row.
 * Uses INSERT OR IGNORE semantics (onConflictDoNothing) — does nothing if row exists.
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

/**
 * Create a pessimistic budget hold before forwarding a request.
 *
 * Returns { approved: true, holdId } if sufficient budget exists.
 * Returns { approved: false, remaining } if budget would be exceeded.
 *
 * CRITICAL: This function reads from the primary replica for enforcement correctness.
 * // primary read for enforcement correctness — see PITFALLS.md #8
 *
 * Atomicity: NOT a single DB transaction (Turso HTTP does not support interactive
 * transactions). Phase 2 Durable Objects mitigate race conditions per-agent.
 */
export async function createHold(
  db: DbClient,
  agentId: AgentId,
  model: string,
  estimatedCost: number
): Promise<{ approved: true; holdId: HoldId } | { approved: false; remaining: number }> {
  // primary read for enforcement correctness — see PITFALLS.md #8
  const budget = await getBudget(db, agentId);

  if (!budget) {
    // Agent has no ledger row — treat as zero budget to fail closed
    return { approved: false, remaining: 0 };
  }

  const { limitUsd, spentUsd, reservedUsd } = budget;
  const projectedTotal = spentUsd + reservedUsd + estimatedCost;

  if (projectedTotal > limitUsd) {
    return {
      approved: false,
      remaining: limitUsd - spentUsd - reservedUsd,
    };
  }

  // Sufficient budget — create the hold
  const holdId = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + 3_600_000; // 1 hour

  // INSERT hold row
  await db.insert(holds).values({
    id: holdId,
    agentId,
    model,
    estimatedCost,
    status: 'active',
    createdAt: now,
    expiresAt,
  });

  // UPDATE budget_ledger: increment reservedUsd
  await db
    .update(budgetLedger)
    .set({ reservedUsd: reservedUsd + estimatedCost, updatedAt: now })
    .where(eq(budgetLedger.agentId, agentId));

  return { approved: true, holdId };
}

/**
 * Settle a hold after the LLM response arrives.
 *
 * Marks the hold as settled, decrements reservedUsd, increments spentUsd.
 * Note: We do a separate SELECT to get hold data, then two UPDATEs.
 * This is sequential, not transactional — same concurrency caveat as createHold.
 */
export async function settleHold(
  db: DbClient,
  holdId: HoldId,
  actualCost: number
): Promise<void> {
  // Step 1: SELECT the hold to get agentId and estimatedCost
  const holdRows = await db
    .select()
    .from(holds)
    .where(eq(holds.id, holdId))
    .limit(1);

  if (holdRows.length === 0) {
    console.error(`settleHold: hold ${holdId} not found`);
    return;
  }

  const hold = holdRows[0];
  const { agentId, estimatedCost } = hold;
  const now = Date.now();

  // Step 2: UPDATE holds SET status='settled'
  await db
    .update(holds)
    .set({ status: 'settled' })
    .where(eq(holds.id, holdId));

  // Step 3: UPDATE budget_ledger: release reservation, record actual spend
  // Get current budget to compute new values
  const budget = await getBudget(db, agentId);
  if (!budget) {
    console.error(`settleHold: no budget row for agent ${agentId}`);
    return;
  }

  await db
    .update(budgetLedger)
    .set({
      reservedUsd: Math.max(0, budget.reservedUsd - estimatedCost),
      spentUsd: budget.spentUsd + actualCost,
      updatedAt: now,
    })
    .where(eq(budgetLedger.agentId, agentId));
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
  const now = Date.now();
  const rows = await db
    .update(budgetLedger)
    .set({ limitUsd, updatedAt: now })
    .where(eq(budgetLedger.agentId, agentId))
    .returning();
  return rows[0] ?? null;
}
