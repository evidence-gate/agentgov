/** Atomic, fail-closed audit appends shared by Node and Workers. */
import type { InStatement, InValue } from '@libsql/client';
import type { DbClient } from '../db/client';
import type { AuditEvent } from '../types';

const GENESIS_HASH = '0'.repeat(64);

export interface AuditedMutation {
  event: AuditEvent;
  /** Snapshot precondition, evaluated inside the write transaction. */
  condition?: { sql: string; args: InValue[] };
  /** Every statement must be conditional on the supplied audit hash existing. */
  statements?: (hash: string) => InStatement[];
}

/**
 * A libSQL write batch works over HTTP as well as embedded SQLite. The first
 * statement CAS-appends to the chain; subsequent writes are gated by that new
 * hash. A stale snapshot changes nothing and is retried. Any SQL failure rolls
 * back the entire batch, including its audit row. No interactive transaction.
 */
export async function auditedWrite(
  db: DbClient,
  prepare: () => Promise<AuditedMutation | null>,
): Promise<boolean> {
  for (let attempt = 0; attempt < 128; attempt++) {
    const mutation = await prepare();
    if (!mutation) return false;
    const last = await db.$client.execute('SELECT seq, hash FROM audit_log ORDER BY seq DESC LIMIT 1');
    const seq = Number(last.rows[0]?.seq ?? 0);
    const prevHash = String(last.rows[0]?.hash ?? GENESIS_HASH);
    const ts = Date.now();
    // Unique per attempt: a failed CAS can never reuse another append's guard.
    const { eventType, agentId, model, costDelta, runningBalance, meta } = mutation.event;
    const event = { eventType, agentId, model, costDelta, runningBalance,
      meta: { ...meta, auditId: crypto.randomUUID() } };
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ ...event, prevHash, ts })));
    const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    const condition = mutation.condition ?? { sql: '1', args: [] };
    const result = await db.$client.batch([
      {
        sql: `INSERT INTO audit_log (event_type,agent_id,model,cost_delta,running_balance,payload,prev_hash,hash,ts)
              SELECT ?,?,?,?,?,?,?,?,? WHERE COALESCE((SELECT MAX(seq) FROM audit_log),0)=? AND (${condition.sql})`,
        args: [event.eventType, event.agentId, event.model, event.costDelta, event.runningBalance,
          JSON.stringify(event.meta), prevHash, hash, ts, seq, ...condition.args],
      },
      ...(mutation.statements?.(hash) ?? []),
    ], 'write');
    if (result[0].rowsAffected === 1) return true;
  }
  throw new Error('Audit/budget contention: no mutation committed');
}

/** Propagate persistence failures: no provider dispatch without durable audit. */
export async function appendAuditEvent(db: DbClient, event: AuditEvent): Promise<void> {
  await auditedWrite(db, async () => ({ event }));
}
