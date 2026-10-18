import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDockerDbClient, runMigrations } from '../db/client.node';
import { budgetGate, budgetSettle } from './gate';
import { createHold, ensureAgent, getBudget, settleHold, updateBudgetLimit } from './ledger';

let db: ReturnType<typeof createDockerDbClient>;
let second: ReturnType<typeof createDockerDbClient>;
let dir: string;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'agentgov-budget-'));
  const url = `file:${join(dir, 'db.sqlite')}`;
  db = createDockerDbClient(url); await runMigrations(db);
  second = createDockerDbClient(url);
  await ensureAgent(db, 'agent', 1);
});
afterEach(() => { db.$client.close(); second.$client.close(); rmSync(dir, { recursive: true, force: true }); });
const request = { model: 'gpt-4o', messages: [{ role: 'user' as const, content: 'hello' }] };
async function reserve(cost = 0.6) {
  const result = await createHold(db, 'agent', 'gpt-4o', cost);
  if (!result.approved) throw new Error('Expected approval');
  return result.holdId;
}
async function auditCount(type: string) {
  const r = await db.$client.execute({ sql: 'SELECT COUNT(*) n FROM audit_log WHERE event_type=?', args: [type] });
  return Number(r.rows[0].n);
}
describe('atomic budget gate with real SQLite and independent connections', () => {
  it('reserves and audits before passing', async () => {
    expect((await budgetGate({ db, agentId: 'agent', request })).action).toBe('pass');
    expect(await auditCount('budget_hold')).toBe(1);
    expect((await getBudget(db, 'agent'))!.reservedUsd).toBeGreaterThan(0);
  });
  it('blocks and audits unknown models and exhausted budgets', async () => {
    expect(await budgetGate({ db, agentId: 'agent', request: { ...request, model: 'unknown' } })).toEqual({ action: 'block', reason: 'unknown_model' });
    await reserve(1);
    expect(await budgetGate({ db, agentId: 'agent', request })).toEqual({ action: 'block', reason: 'budget_exceeded' });
    expect(await auditCount('budget_blocked')).toBe(2);
  });
  it('does not overapprove or lose reservations across concurrent connections', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => createHold(i % 2 ? db : second, 'agent', 'gpt-4o', 0.6)));
    expect(results.filter(r => r.approved)).toHaveLength(1);
    expect((await getBudget(db, 'agent'))!.reservedUsd).toBe(0.6);
    expect(await auditCount('budget_hold')).toBe(1);
  });
  it('settles a hold exactly once under concurrent duplicate completion', async () => {
    const id = await reserve();
    await Promise.all(Array.from({ length: 20 }, (_, i) => settleHold(i % 2 ? db : second, id, 0.2)));
    expect(await getBudget(db, 'agent')).toMatchObject({ reservedUsd: 0, spentUsd: 0.2 });
    expect(await auditCount('budget_settle')).toBe(1);
  });
  it('does not lose simultaneous settlements of distinct holds', async () => {
    const ids = await Promise.all(Array.from({ length: 10 }, () => reserve(0.05)));
    await Promise.all(ids.map(id => settleHold(db, id, 0.02)));
    const budget = (await getBudget(db, 'agent'))!;
    expect(budget.reservedUsd).toBeCloseTo(0, 10);
    expect(budget.spentUsd).toBeCloseTo(0.2, 10);
    expect(await auditCount('budget_settle')).toBe(10);
  });
  it('rejects mismatched settlement identity without changes', async () => {
    const id = await reserve();
    await expect(budgetSettle(db, id, null, 'gpt-4o', 'other')).rejects.toThrow('identity');
    await expect(budgetSettle(db, id, null, 'gpt-4o-mini', 'agent')).rejects.toThrow('identity');
    expect((await getBudget(db, 'agent'))!.spentUsd).toBe(0);
    expect(await auditCount('budget_settle')).toBe(0);
  });
  it('conservatively settles unknown usage and persists its provenance', async () => {
    const id = await reserve();
    await budgetSettle(db, id, null, 'gpt-4o', 'agent');
    expect(await getBudget(db, 'agent')).toMatchObject({ reservedUsd: 0, spentUsd: 0.6 });
    const r = await db.$client.execute("SELECT payload FROM audit_log WHERE event_type='budget_settle'");
    expect(JSON.parse(String(r.rows[0].payload))).toMatchObject({ holdId: id, estimated: true, reason: 'usage_unknown', actualUsage: null });
  });
  it('fails closed on audit failure with no hold or reservation committed', async () => {
    await db.$client.execute("CREATE TRIGGER fail_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
    await expect(budgetGate({ db, agentId: 'agent', request })).rejects.toThrow();
    expect((await getBudget(db, 'agent'))!.reservedUsd).toBe(0);
    expect((await db.$client.execute('SELECT * FROM holds')).rows).toHaveLength(0);
  });
  it('rolls back settlement if audit fails, and retry commits once', async () => {
    const id = await reserve();
    await db.$client.execute("CREATE TRIGGER fail_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
    await expect(settleHold(db, id, 0.2)).rejects.toThrow();
    expect(await getBudget(db, 'agent')).toMatchObject({ reservedUsd: 0.6, spentUsd: 0 });
    await db.$client.execute('DROP TRIGGER fail_audit');
    await settleHold(db, id, 0.2);
    expect(await auditCount('budget_settle')).toBe(1);
  });
  it('rolls back the audit too when a later mutation fails', async () => {
    await db.$client.execute("CREATE TRIGGER fail_hold BEFORE INSERT ON holds BEGIN SELECT RAISE(ABORT,'hold unavailable'); END");
    await expect(reserve()).rejects.toThrow();
    expect(await auditCount('budget_hold')).toBe(0);
    expect((await getBudget(db, 'agent'))!.reservedUsd).toBe(0);
  });
  it('rejects non-finite/negative cost and usage and unknown holds', async () => {
    for (const n of [-1, NaN, Infinity]) await expect(createHold(db, 'agent', 'gpt-4o', n)).rejects.toThrow();
    const id = await reserve();
    await expect(budgetSettle(db, id, { promptTokens: -1, completionTokens: 0 }, 'gpt-4o', 'agent')).rejects.toThrow();
    await expect(settleHold(db, 'missing', 0)).rejects.toThrow();
  });
});

describe('provisioned budgets and atomic budget administration', () => {
  it('blocks rotating unknown agent IDs without granting any new budget', async () => {
    for (let i = 0; i < 5; i++) {
      expect(await budgetGate({ db, agentId: `unregistered-${i}`, request })).toEqual({ action: 'block', reason: 'unknown_agent' });
    }
    expect((await db.$client.execute('SELECT * FROM budget_ledger')).rows).toHaveLength(1);
    expect((await db.$client.execute('SELECT * FROM holds')).rows).toHaveLength(0);
    const { rows } = await db.$client.execute("SELECT payload FROM audit_log WHERE event_type='budget_blocked'");
    expect(rows).toHaveLength(5);
    for (const row of rows) expect(JSON.parse(String(row.payload)).reason).toBe('unknown_agent');
  });
  it('atomically orders concurrent limit changes with correct previous values', async () => {
    await reserve(0.2);
    await Promise.all(Array.from({ length: 15 }, (_, i) => updateBudgetLimit(i % 2 ? db : second, 'agent', i + 2)));
    const { rows } = await db.$client.execute("SELECT payload FROM audit_log WHERE event_type='budget_limit_changed' ORDER BY seq");
    expect(rows).toHaveLength(15);
    let previous = 1;
    for (const row of rows) {
      const meta = JSON.parse(String(row.payload));
      expect(meta.previousLimitUsd).toBe(previous);
      previous = meta.newLimitUsd;
    }
    expect(await getBudget(db, 'agent')).toMatchObject({ limitUsd: previous, reservedUsd: 0.2, spentUsd: 0 });
  });
  it('does not apply limit updates when the audit cannot persist', async () => {
    await db.$client.execute("CREATE TRIGGER fail_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT,'unavailable'); END");
    await expect(updateBudgetLimit(db, 'agent', 100)).rejects.toThrow();
    expect((await getBudget(db, 'agent'))!.limitUsd).toBe(1);
  });
  it('preserves update return shape and rejects invalid limits without provisioning unknown agents', async () => {
    const row = await updateBudgetLimit(db, 'agent', 2);
    expect(row).toMatchObject({ agentId: 'agent', limitUsd: 2, reservedUsd: 0, spentUsd: 0 });
    expect(typeof row!.updatedAt).toBe('number');
    for (const limit of [-1, NaN, Infinity]) await expect(updateBudgetLimit(db, 'agent', limit)).rejects.toThrow();
    expect(await updateBudgetLimit(db, 'unregistered', 10)).toBeNull();
    expect(await getBudget(db, 'unregistered')).toBeNull();
    expect(await auditCount('budget_limit_changed')).toBe(1);
  });
});
