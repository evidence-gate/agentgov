import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createClient } from '@libsql/client';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}
const close = server => new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));

test('Node chat injects bindings, enforces budget, calls the provider, and settles real usage', { timeout: 30_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agentgov-chat-'));
  const url = `file:${join(dir, 'test.db')}`;
  const client = createClient({ url });
  const calls = [];
  const provider = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const budgetAtDispatch = (await client.execute("SELECT reserved_usd FROM budget_ledger WHERE agent_id='allowed'")).rows[0];
    const activeHolds = (await client.execute("SELECT id FROM holds WHERE agent_id='allowed' AND status='active'")).rows.length;
    calls.push({ path: req.url, authorization: req.headers.authorization, body: JSON.parse(body), budgetAtDispatch, activeHolds });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: 'local-provider-result', object: 'chat.completion', model: 'gpt-4o-mini',
      choices: [{ index: 0, message: { role: 'assistant', content: 'local-provider-ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    }));
  });
  const providerPort = await listen(provider);
  const portReservation = createServer();
  const port = await listen(portReservation);
  await close(portReservation);
  const child = spawn(process.execPath, [
    '--import', 'tsx', '--import', './scripts/fixtures/local-provider.mjs', 'src/index.node.ts',
  ], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: {
      PATH: process.env.PATH, DATABASE_URL: url, PORT: String(port),
      OPENAI_API_KEY: 'synthetic-local-key', TEST_PROVIDER_URL: `http://127.0.0.1:${providerPort}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', c => { output += c; });
  child.stderr.on('data', c => { output += c; });
  const exited = once(child, 'exit');
  const base = `http://127.0.0.1:${port}`;
  try {
    let healthy = false;
    for (let n = 0; n < 100; n++) {
      assert.equal(child.exitCode, null, output);
      try {
        healthy = (await fetch(`${base}/health`, { signal: AbortSignal.timeout(500) })).status === 200;
        if (healthy) break;
      } catch {}
      await delay(50);
    }
    assert.ok(healthy, output);
    for (const [agent, limit] of [['allowed', 10], ['exhausted', 0]]) {
      await client.execute({
        sql: 'INSERT INTO budget_ledger(agent_id,limit_usd,spent_usd,reserved_usd,updated_at) VALUES(?,?,0,0,?)',
        args: [agent, limit, Date.now()],
      });
    }
    async function chat(agent, model = 'gpt-4o-mini') {
      const response = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agent-Id': agent },
        body: JSON.stringify({ model, max_tokens: 100, messages: [{ role: 'user', content: 'synthetic test' }] }),
        signal: AbortSignal.timeout(5000),
      });
      const text = await response.text();
      let body;
      try { body = JSON.parse(text); } catch { body = text; }
      return { status: response.status, body };
    }
    const blocked = await chat('exhausted');
    const callsAfterBlocked = calls.length;
    const allowed = await chat('allowed');
    const unknown = await chat('allowed', 'unknown-test-model');
    console.log(JSON.stringify({ blocked, allowed, unknown, callsAfterBlocked, providerCalls: calls.length }));
    assert.equal(blocked.status, 429, output);
    assert.equal(blocked.body.error.code, 'BUDGET_EXCEEDED');
    assert.equal(callsAfterBlocked, 0);
    assert.equal(allowed.status, 200, output);
    assert.equal(allowed.body.id, 'local-provider-result');
    assert.equal(allowed.body.choices[0].message.content, 'local-provider-ok');
    assert.equal(unknown.status, 422);
    assert.equal(unknown.body.error.code, 'UNKNOWN_MODEL');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].authorization, 'Bearer synthetic-local-key');
    assert.equal(calls[0].body.model, 'gpt-4o-mini');
    assert.ok(calls[0].budgetAtDispatch.reserved_usd > 0);
    assert.equal(calls[0].activeHolds, 1);
    // Settlement is asynchronous; wait for its audit record, not an arbitrary sleep.
    let events;
    for (let n = 0; n < 100; n++) {
      events = (await client.execute('SELECT event_type FROM audit_log')).rows.map(r => r.event_type);
      if (events.includes('budget_settle')) break;
      await delay(20);
    }
    assert.ok(events.includes('budget_hold'));
    assert.ok(events.includes('budget_blocked'));
    assert.ok(events.includes('budget_settle'));
    const ledger = (await client.execute("SELECT * FROM budget_ledger WHERE agent_id='allowed'")).rows[0];
    assert.ok(Math.abs(ledger.spent_usd - 0.000045) < 1e-10);
    assert.equal(ledger.reserved_usd, 0);
    const holds = (await client.execute('SELECT agent_id,status FROM holds')).rows;
    assert.equal(holds.length, 1);
    assert.equal(holds[0].agent_id, 'allowed');
    assert.equal(holds[0].status, 'settled');
  } finally {
    if (child.exitCode === null) child.kill('SIGTERM');
    await exited;
    client.close();
    await close(provider);
    await rm(dir, { recursive: true, force: true });
  }
});
