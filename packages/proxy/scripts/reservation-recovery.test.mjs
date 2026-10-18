import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createDockerDbClient, runMigrations } from '../src/db/client.node.ts';
import { settleHold, getBudget } from '../src/budget/ledger.ts';

test('durable abandoned holds survive restart and reconcile once without provider replay', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agentgov-recovery-'));
  const url = `file:${join(dir, 'test.db')}`;
  let db;
  try {
    const code = `import { createDockerDbClient,runMigrations } from './src/db/client.node.ts';
      import { ensureAgent,createHold } from './src/budget/ledger.ts';
      const db=createDockerDbClient(process.env.TEST_DB_URL); await runMigrations(db);
      for (const id of ['known','unknown','undispatched']) { await ensureAgent(db,id,1); await createHold(db,id,'gpt-4o-mini',0.6); }
      process.kill(process.pid,'SIGKILL');`;
    const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], {
      env: { PATH: process.env.PATH, TEST_DB_URL: url }, encoding: 'utf8', timeout: 15000,
    });
    assert.equal(child.signal, 'SIGKILL', child.stderr);
    db = createDockerDbClient(url); await runMigrations(db);
    const holds = (await db.$client.execute('SELECT * FROM holds')).rows;
    assert.equal(holds.length, 3);
    for (const hold of holds) {
      assert.equal(hold.status, 'active');
      assert.equal((await getBudget(db, hold.agent_id)).reservedUsd, 0.6);
      const cost = hold.agent_id === 'known' ? 0.2 : hold.agent_id === 'undispatched' ? 0 : null;
      await settleHold(db, hold.id, cost);
    }
    db.$client.close(); db = createDockerDbClient(url);
    for (const hold of holds) {
      // Retry after uncertain acknowledgement / another restart cannot add spend again.
      await settleHold(db, hold.id, 0.9);
      const budget = await getBudget(db, hold.agent_id);
      assert.equal(budget.reservedUsd, 0);
      assert.equal(budget.spentUsd, hold.agent_id === 'known' ? 0.2 : hold.agent_id === 'undispatched' ? 0 : 0.6);
    }
    const audits = await db.$client.execute("SELECT COUNT(*) AS n FROM audit_log WHERE event_type='budget_settle'");
    assert.equal(audits.rows[0].n, 3);
  } finally { db?.$client.close(); await rm(dir, { recursive: true, force: true }); }
});
