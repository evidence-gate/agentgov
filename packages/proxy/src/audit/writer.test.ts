import { afterEach, beforeEach, expect, it } from 'vitest';
import { createDockerDbClient, runMigrations } from '../db/client.node';
import { appendAuditEvent } from './writer';
let db: ReturnType<typeof createDockerDbClient>;
beforeEach(async () => { db = createDockerDbClient('file::memory:'); await runMigrations(db); });
afterEach(() => db.$client.close());
const event = { eventType: 'budget_hold' as const, agentId: 'synthetic', model: 'gpt-4o', costDelta: 0.01, runningBalance: 1 };
it('concurrent appends produce one unbroken, independently verifiable chain', async () => {
  await Promise.all(Array.from({ length: 30 }, (_, index) => appendAuditEvent(db, { ...event, meta: { index } })));
  const { rows } = await db.$client.execute('SELECT * FROM audit_log ORDER BY seq');
  expect(rows).toHaveLength(30);
  let prevHash = '0'.repeat(64);
  for (const row of rows) {
    expect(row.prev_hash).toBe(prevHash);
    const payload = JSON.stringify({ eventType: row.event_type, agentId: row.agent_id, model: row.model,
      costDelta: row.cost_delta, runningBalance: row.running_balance, meta: JSON.parse(String(row.payload)), prevHash, ts: row.ts });
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
    const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    expect(row.hash).toBe(hash);
    prevHash = hash;
  }
});
it('propagates audit database failures', async () => {
  await db.$client.execute("CREATE TRIGGER fail_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT,'unavailable'); END");
  await expect(appendAuditEvent(db, event)).rejects.toThrow();
  expect((await db.$client.execute('SELECT * FROM audit_log')).rows).toHaveLength(0);
});
