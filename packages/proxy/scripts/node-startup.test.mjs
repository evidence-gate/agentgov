import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createClient } from '@libsql/client';

async function unusedPort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function checkStartup(databaseUrl) {
  const port = await unusedPort();
  // Execute the real entry point without any cloudflare:workers mocks.
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.node.ts'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { PATH: process.env.PATH, DATABASE_URL: databaseUrl, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const exited = once(child, 'exit');
  try {
    let healthy = false;
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      assert.equal(child.exitCode, null, `Node exited before becoming healthy:\n${output}`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`, {
          signal: AbortSignal.timeout(500),
        });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        healthy = true;
        break;
      } catch (error) {
        if (error instanceof assert.AssertionError) throw error;
        await delay(50);
      }
    }
    assert.ok(healthy, `Node did not become healthy:\n${output}`);
    assert.match(output, /migrations applied/);
  } finally {
    if (child.exitCode === null) child.kill('SIGTERM');
    await exited;
  }
}

test('Node entry point migrates a new database, serves health, and restarts safely', { timeout: 30_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agentgov-startup-'));
  const url = `file:${join(dir, 'test.db')}`;
  try {
    await checkStartup(url);
    const client = createClient({ url });
    let applied;
    try {
      const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table'");
      const names = tables.rows.map(row => row.name);
      for (const table of ['audit_log', 'budget_ledger', 'holds', '__drizzle_migrations']) {
        assert.ok(names.includes(table), `Missing migrated table ${table}`);
      }
      applied = (await client.execute('SELECT count(*) AS n FROM __drizzle_migrations')).rows[0].n;
      assert.ok(applied > 0);
    } finally {
      client.close();
    }
    await checkStartup(url);
    const reopened = createClient({ url });
    try {
      assert.equal((await reopened.execute('SELECT count(*) AS n FROM __drizzle_migrations')).rows[0].n, applied);
    } finally {
      reopened.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
