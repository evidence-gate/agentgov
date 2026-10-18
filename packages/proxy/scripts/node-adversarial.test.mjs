import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createClient } from '@libsql/client';

// Optional baseline snapshot path makes before/after evidence independent of edits.
const appDir = process.env.TEST_NODE_APP_DIR ?? fileURLToPath(new URL('../', import.meta.url));
const observeOnly = process.env.TEST_ADVERSARIAL_OBSERVE === '1';
const syntheticAgentToken = 'synthetic-agent-token-0123456789abcdef';
const rotatedAgentToken = 'rotated-synthetic-token-0123456789abcdef';
const tokenHash = token => createHash('sha256').update(token).digest('hex');
const authConfigFor = (token, agentIds) => JSON.stringify([{ subject: 'synthetic-http-test', tokenSha256: tokenHash(token), agentIds }]);
const defaultAuthConfig = authConfigFor(syntheticAgentToken, [
  'invalid-json', 'null', 'array', 'missing-messages', 'null-message', 'negative-max', 'fraction-max',
  'zero-max', 'null-max', 'string-max', 'multiple-completions', 'completion-token-alias', 'malformed-tool',
  'hitl', 'missing-key', 'concurrent', ...Array.from({ length: 5 }, (_, i) => `unprovisioned-rotation-${i}`),
]);
const requestBody = { model: 'gpt-4o-mini', max_tokens: 100, messages: [{ role: 'user', content: 'synthetic input' }] };
async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}
const close = server => new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));

async function fixture(withKey = true, adminToken, authConfig = defaultAuthConfig) {
  const dir = await mkdtemp(join(tmpdir(), 'agentgov-adversarial-'));
  const url = `file:${join(dir, 'test.db')}`;
  const client = createClient({ url });
  await client.execute('PRAGMA busy_timeout=3000');
  const calls = [];
  const provider = createServer(async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    const body = JSON.parse(text);
    const balances = (await client.execute('SELECT agent_id,limit_usd,spent_usd,reserved_usd FROM budget_ledger')).rows;
    calls.push({ body, balances, headers: { ...req.headers } });
    if (body.messages?.[0]?.content === 'concurrent') await delay(300);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: 'local-adversarial-response', object: 'chat.completion', model: body.model,
      choices: [{ index: 0, message: { role: 'assistant', content: 'local-only' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: body.max_tokens === 1000 ? 1000 : 50, total_tokens: 60 },
    }));
  });
  const providerPort = await listen(provider);
  const reservation = createServer();
  const port = await listen(reservation);
  await close(reservation);
  const child = spawn(process.execPath, ['--import', 'tsx', '--import', './scripts/fixtures/local-provider.mjs', 'src/index.node.ts'], {
    cwd: appDir,
    // Deliberately exclude inherited credentials, webhooks and database settings.
    env: { PATH: process.env.PATH, DATABASE_URL: url, PORT: String(port),
      ...(withKey ? { OPENAI_API_KEY: 'synthetic-adversarial-key' } : {}),
      ...(adminToken ? { AGENTGOV_BUDGET_ADMIN_TOKEN: adminToken } : {}),
      ...(authConfig === null ? {} : { AGENTGOV_AGENT_AUTH: authConfig }),
      TEST_PROVIDER_URL: `http://127.0.0.1:${providerPort}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', c => { output += c; });
  child.stderr.on('data', c => { output += c; });
  const exited = once(child, 'exit');
  const base = `http://127.0.0.1:${port}`;
  async function cleanup() {
    if (child.exitCode === null) child.kill('SIGTERM');
    await exited;
    client.close();
    await close(provider);
    await rm(dir, { recursive: true, force: true });
  }
  try {
    let healthy = false;
    for (let i = 0; i < 100; i++) {
      assert.equal(child.exitCode, null, output);
      try { healthy = (await fetch(`${base}/health`, { signal: AbortSignal.timeout(500) })).status === 200; } catch {}
      if (healthy) break;
      await delay(50);
    }
    assert.ok(healthy, output);
  } catch (error) { await cleanup(); throw error; }
  async function seed(agent, limit = 10) {
    await client.execute({ sql: 'INSERT INTO budget_ledger(agent_id,limit_usd,spent_usd,reserved_usd,updated_at) VALUES(?,?,0,0,?)', args: [agent, limit, Date.now()] });
  }
  async function chat(agent, body, raw = false, token = syntheticAgentToken) {
    const response = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agent-Id': agent, ...(token === null ? {} : { 'X-Agentgov-Token': token }) },
      body: raw ? body : JSON.stringify(body), signal: AbortSignal.timeout(10_000),
    });
    const text = await response.text();
    let result;
    try { result = JSON.parse(text); } catch { result = text; }
    return { status: response.status, body: result };
  }
  async function state(agent) {
    const ledger = (await client.execute({ sql: 'SELECT * FROM budget_ledger WHERE agent_id=?', args: [agent] })).rows[0];
    const holds = (await client.execute({ sql: 'SELECT * FROM holds WHERE agent_id=?', args: [agent] })).rows;
    const audit = (await client.execute({ sql: 'SELECT * FROM audit_log WHERE agent_id=? ORDER BY seq', args: [agent] })).rows;
    return { ledger, holds, audit };
  }
  return { client, calls, base, chat, seed, state, cleanup };
}
function evidence(name, result, state, providerCalls) {
  console.log(JSON.stringify({ case: name, status: result.status, response: result.body,
    reserved: state.ledger.reserved_usd, spent: state.ledger.spent_usd,
    holds: state.holds.map(h => ({ status: h.status, reserved: h.estimated_cost_usd })),
    events: state.audit.map(a => a.event_type), providerCalls }));
}

test('Node rejects adversarial inputs before reservation or provider dispatch', { timeout: 40_000 }, async t => {
  const f = await fixture();
  try {
    const cases = [
      ['invalid-json', '{', true], ['null', null], ['array', []], ['missing-messages', { model: 'gpt-4o-mini' }],
      ['null-message', { ...requestBody, messages: [null] }],
      ['negative-max', { ...requestBody, max_tokens: -1000000 }],
      ['fraction-max', { ...requestBody, max_tokens: 0.5 }],
      ['zero-max', { ...requestBody, max_tokens: 0 }],
      ['null-max', { ...requestBody, max_tokens: null }],
      ['string-max', { ...requestBody, max_tokens: '100' }],
      ['multiple-completions', { ...requestBody, n: 1000 }],
      ['completion-token-alias', { ...requestBody, max_completion_tokens: 1000000 }],
      ['malformed-tool', { ...requestBody, messages: [{ role: 'assistant', tool_calls: [{ function: null }] }] }],
    ];
    for (const [name] of cases) await f.seed(name, name === 'negative-max' ? 0 : 10);
    await f.seed('hitl');
    for (const [name, body, raw] of cases) await t.test(name, async () => {
      const before = f.calls.length;
      const result = await f.chat(name, body, raw);
      if (observeOnly) await delay(50);
      const state = await f.state(name);
      evidence(name, result, state, f.calls.length - before);
      if (observeOnly) return;
      assert.equal(result.status, 400);
      assert.equal(f.calls.length, before);
      assert.equal(state.holds.length, 0);
      assert.equal(state.ledger.reserved_usd, 0);
      assert.equal(state.ledger.spent_usd, 0);
    });
    await t.test('Node HITL unavailable is rejected before reservation', async () => {
      const name = 'hitl';
      const before = f.calls.length;
      const result = await f.chat(name, { ...requestBody, messages: [{ role: 'assistant', content: null,
        tool_calls: [{ id: 'synthetic-call', type: 'function', function: { name: 'send_email', arguments: '{}' } }] }] });
      const state = await f.state(name);
      evidence(name, result, state, f.calls.length - before);
      if (observeOnly) return;
      assert.equal(result.status, 501);
      assert.equal(result.body.error.code, 'HITL_NOT_AVAILABLE');
      assert.equal(f.calls.length, before);
      assert.equal(state.holds.length, 0);
      assert.equal(state.ledger.reserved_usd, 0);
    });
    await t.test('Node HITL control routes fail explicitly without database/provider work', async () => {
      const before = f.calls.length;
      for (const [method, path] of [
        ['GET', '/v1/hitl/synthetic-ticket/status'],
        ['POST', '/v1/hitl/synthetic-ticket/approve'],
        ['POST', '/v1/hitl/synthetic-ticket/deny'],
        ['POST', '/v1/slack/callback'],
      ]) {
        const response = await fetch(`${f.base}${path}`, { method, signal: AbortSignal.timeout(5000) });
        const text = await response.text();
        console.log(JSON.stringify({ case: 'node-hitl-route', method, path, status: response.status, response: text }));
        if (!observeOnly) {
          assert.equal(response.status, 501);
          assert.equal(JSON.parse(text).error.code, 'HITL_NOT_AVAILABLE');
        }
      }
      assert.equal(f.calls.length, before);
    });
  } finally { await f.cleanup(); }
});

test('Missing provider key does not strand a budget hold', { timeout: 20_000 }, async () => {
  const f = await fixture(false);
  try {
    await f.seed('missing-key');
    const result = await f.chat('missing-key', requestBody);
    const state = await f.state('missing-key');
    evidence('missing-key', result, state, f.calls.length);
    if (observeOnly) return;
    assert.ok(result.status >= 500);
    assert.equal(f.calls.length, 0);
    assert.equal(state.ledger.reserved_usd, 0);
    assert.equal(state.ledger.spent_usd, 0);
    assert.equal(state.holds.filter(h => h.status === 'active').length, 0);
  } finally { await f.cleanup(); }
});

test('Concurrent HTTP requests cannot over-reserve one shared budget; holds and audit correlate', { timeout: 30_000 }, async () => {
  const f = await fixture();
  try {
    await f.seed('concurrent', 0.00075);
    const results = await Promise.all(Array.from({ length: 12 }, () => f.chat('concurrent', {
      ...requestBody, max_tokens: 1000, messages: [{ role: 'user', content: 'concurrent' }],
    })));
    if (observeOnly) await delay(100);
    let state;
    for (let i = 0; i < 100; i++) {
      state = await f.state('concurrent');
      if (state.holds.every(h => h.status !== 'active')) break;
      await delay(20);
    }
    console.log(JSON.stringify({ case: 'concurrent', statuses: results.map(r => r.status), providerCalls: f.calls.length,
      reserved: state.ledger.reserved_usd, spent: state.ledger.spent_usd, holds: state.holds.length,
      events: state.audit.map(a => a.event_type) }));
    if (observeOnly) return;
    assert.equal(results.filter(r => r.status === 200).length, 1);
    assert.equal(results.filter(r => r.status === 429).length, 11);
    assert.equal(f.calls.length, 1);
    const atDispatch = f.calls[0].balances.find(b => b.agent_id === 'concurrent');
    assert.ok(atDispatch.reserved_usd > 0);
    assert.ok(atDispatch.spent_usd + atDispatch.reserved_usd <= atDispatch.limit_usd + 1e-12);
    assert.equal(state.ledger.reserved_usd, 0);
    assert.ok(Math.abs(state.ledger.spent_usd - 0.0006015) < 1e-12);
    assert.equal(state.holds.length, 1);
    assert.equal(state.holds[0].status, 'settled');
    const holdEvents = state.audit.filter(a => a.event_type === 'budget_hold');
    const settleEvents = state.audit.filter(a => a.event_type === 'budget_settle');
    assert.equal(holdEvents.length, 1);
    assert.equal(settleEvents.length, 1);
    assert.equal(state.audit.filter(a => a.event_type === 'budget_blocked').length, 11);
    assert.equal(JSON.parse(holdEvents[0].payload).holdId, state.holds[0].id);
    assert.equal(JSON.parse(settleEvents[0].payload).holdId, state.holds[0].id);
    assert.equal(settleEvents[0].agent_id, 'concurrent');
    assert.equal(settleEvents[0].model, 'gpt-4o-mini');
    assert.ok(!JSON.stringify(state.audit).includes('synthetic-adversarial-key'));
    // This fixture contains one agent: validate the complete global audit chain.
    let previousHash = '0'.repeat(64);
    for (const row of state.audit) {
      assert.equal(row.prev_hash, previousHash, `forked audit predecessor at seq ${row.seq}`);
      const encoded = JSON.stringify({ eventType: row.event_type, agentId: row.agent_id,
        model: row.model, costDelta: row.cost_delta, runningBalance: row.running_balance,
        meta: JSON.parse(row.payload), prevHash: row.prev_hash, ts: row.ts });
      assert.equal(row.hash, createHash('sha256').update(encoded).digest('hex'));
      previousHash = row.hash;
    }
  } finally { await f.cleanup(); }
});

test('Rotating unprovisioned agent IDs cannot manufacture budgets', { timeout: 20_000 }, async () => {
  const f = await fixture();
  try {
    const results = [];
    for (let i = 0; i < 5; i++) {
      const agent = `unprovisioned-rotation-${i}`;
      const result = await f.chat(agent, requestBody);
      const state = await f.state(agent);
      results.push(result.status);
      assert.equal(result.status, 403);
      assert.equal(result.body.error.code, 'BUDGET_NOT_PROVISIONED');
      assert.equal(state.ledger, undefined);
      assert.equal(state.holds.length, 0);
    }
    assert.equal((await f.client.execute('SELECT COUNT(*) AS n FROM budget_ledger')).rows[0].n, 0);
    assert.equal((await f.client.execute('SELECT COUNT(*) AS n FROM holds')).rows[0].n, 0);
    assert.equal(f.calls.length, 0);
    console.log(JSON.stringify({ case: 'unknown-agent-rotation', statuses: results, budgetRows: 0, holds: 0, providerCalls: 0 }));
  } finally { await f.cleanup(); }
});

async function patchBudget(f, authorization, limitUsd = 20) {
  const response = await fetch(`${f.base}/api/v1/dashboard/budgets/admin-target`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
    body: JSON.stringify({ limitUsd }), signal: AbortSignal.timeout(5000),
  });
  return { status: response.status, body: await response.json() };
}

test('Budget administrator route fails closed when its server token is unset', { timeout: 20_000 }, async () => {
  const f = await fixture();
  try {
    await f.seed('admin-target');
    const result = await patchBudget(f, 'Bearer arbitrary-caller-token');
    const state = await f.state('admin-target');
    assert.equal(result.status, 503);
    assert.equal(result.body.error.code, 'ADMIN_AUTH_UNAVAILABLE');
    assert.equal(state.ledger.limit_usd, 10);
    assert.equal(state.audit.length, 0);
    assert.equal(f.calls.length, 0);
    console.log(JSON.stringify({ case: 'admin-token-unset', status: result.status, limit: state.ledger.limit_usd, auditEvents: state.audit.length }));
  } finally { await f.cleanup(); }
});

test('Only the budget administrator can mutate a limit, with exactly one matching audit', { timeout: 20_000 }, async () => {
  const token = 'synthetic-admin-only';
  const f = await fixture(true, token);
  try {
    await f.seed('admin-target');
    // Preserve a real nonzero ledger snapshot across the administrative operation.
    await f.client.execute("UPDATE budget_ledger SET spent_usd=2,reserved_usd=1 WHERE agent_id='admin-target'");
    for (const authorization of [undefined, 'Bearer incorrect-admin-token']) {
      const result = await patchBudget(f, authorization);
      const state = await f.state('admin-target');
      assert.equal(result.status, 401);
      assert.equal(result.body.error.code, 'UNAUTHORIZED');
      assert.equal(state.ledger.limit_usd, 10);
      assert.equal(state.ledger.spent_usd, 2);
      assert.equal(state.ledger.reserved_usd, 1);
      assert.equal(state.audit.length, 0);
    }
    const result = await patchBudget(f, `Bearer ${token}`);
    const state = await f.state('admin-target');
    assert.equal(result.status, 200);
    assert.equal(result.body.agentId, 'admin-target');
    assert.equal(result.body.limitUsd, 20);
    assert.equal(state.ledger.limit_usd, 20);
    assert.equal(state.ledger.spent_usd, 2);
    assert.equal(state.ledger.reserved_usd, 1);
    assert.equal(state.audit.length, 1);
    const event = state.audit[0];
    assert.equal(event.event_type, 'budget_limit_changed');
    assert.equal(event.agent_id, 'admin-target');
    assert.equal(event.cost_delta, 0);
    assert.equal(event.running_balance, 17);
    assert.equal(JSON.parse(event.payload).previousLimitUsd, 10);
    assert.equal(JSON.parse(event.payload).newLimitUsd, 20);
    assert.equal(event.prev_hash, '0'.repeat(64));
    const encoded = JSON.stringify({ eventType: event.event_type, agentId: event.agent_id,
      model: event.model, costDelta: event.cost_delta, runningBalance: event.running_balance,
      meta: JSON.parse(event.payload), prevHash: event.prev_hash, ts: event.ts });
    assert.equal(event.hash, createHash('sha256').update(encoded).digest('hex'));
    assert.ok(!JSON.stringify(state.audit).includes(token));
    assert.equal(f.calls.length, 0);
    console.log(JSON.stringify({ case: 'admin-token-required', statuses: [401, 401, result.status],
      limit: state.ledger.limit_usd, spent: state.ledger.spent_usd, reserved: state.ledger.reserved_usd,
      auditEvents: state.audit.length, event: event.event_type }));
  } finally { await f.cleanup(); }
});

test('Chat authentication rejects absent or malformed server configuration before ledger mutation', { timeout: 30_000 }, async () => {
  for (const config of [null, '{malformed', '[]', JSON.stringify([{ subject: 'bad', tokenSha256: 'not-a-hash', agentIds: ['auth-allowed'] }])]) {
    const f = await fixture(true, undefined, config);
    try {
      await f.seed('auth-allowed');
      const before = await f.state('auth-allowed');
      const result = await f.chat('auth-allowed', requestBody);
      const after = await f.state('auth-allowed');
      assert.equal(result.status, 503);
      assert.deepEqual(after, before);
      assert.equal(f.calls.length, 0);
      console.log(JSON.stringify({ case: 'chat-auth-config', config: config === null ? 'unset' : 'invalid', status: result.status, mutations: 0, providerCalls: 0 }));
    } finally { await f.cleanup(); }
  }
});

test('Chat token is bound to allowed agent IDs and never forwarded or audited', { timeout: 20_000 }, async () => {
  const f = await fixture(true, undefined, authConfigFor(syntheticAgentToken, ['auth-allowed']));
  try {
    await f.seed('auth-allowed');
    await f.seed('auth-other');
    for (const token of [null, 'incorrect-agent-token-0123456789abcdef', 'short', 'x'.repeat(257)]) {
      const before = await f.state('auth-allowed');
      const result = await f.chat('auth-allowed', requestBody, false, token);
      assert.equal(result.status, 401);
      assert.deepEqual(await f.state('auth-allowed'), before);
      assert.equal(f.calls.length, 0);
    }
    const otherBefore = await f.state('auth-other');
    const crossAgent = await f.chat('auth-other', requestBody);
    assert.equal(crossAgent.status, 403);
    assert.deepEqual(await f.state('auth-other'), otherBefore);
    assert.equal(f.calls.length, 0);
    const allowed = await f.chat('auth-allowed', requestBody);
    assert.equal(allowed.status, 200);
    assert.equal(allowed.body.id, 'local-adversarial-response');
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].headers['x-agentgov-token'], undefined);
    assert.ok(!JSON.stringify(f.calls).includes(syntheticAgentToken));
    const state = await f.state('auth-allowed');
    assert.equal(state.holds.length, 1);
    assert.equal(state.holds[0].status, 'settled');
    assert.equal(state.ledger.reserved_usd, 0);
    assert.ok(state.ledger.spent_usd > 0);
    assert.equal(state.audit.filter(a => a.event_type === 'budget_hold').length, 1);
    assert.equal(JSON.parse(state.audit.find(a => a.event_type === 'budget_hold').payload).subject, 'synthetic-http-test');
    assert.equal(state.audit.filter(a => a.event_type === 'budget_settle').length, 1);
    assert.ok(!JSON.stringify(state.audit).includes(syntheticAgentToken));
    console.log(JSON.stringify({ case: 'chat-auth-binding', invalidTokens: [401, 401, 401, 401], crossAgent: crossAgent.status,
      allowed: allowed.status, providerCalls: 1, tokenForwarded: false, tokenAudited: false }));
  } finally { await f.cleanup(); }
});

test('Replacing configured token rejects the old token and accepts the new token', { timeout: 20_000 }, async () => {
  // A newly started Node process models a deployment/restart with rotated config.
  const f = await fixture(true, undefined, authConfigFor(rotatedAgentToken, ['auth-allowed']));
  try {
    await f.seed('auth-allowed');
    const oldToken = await f.chat('auth-allowed', requestBody);
    assert.equal(oldToken.status, 401);
    const beforeNewToken = await f.state('auth-allowed');
    assert.equal(beforeNewToken.holds.length, 0);
    assert.equal(beforeNewToken.audit.length, 0);
    assert.equal(f.calls.length, 0);
    const newToken = await f.chat('auth-allowed', requestBody, false, rotatedAgentToken);
    assert.equal(newToken.status, 200);
    assert.equal(f.calls.length, 1);
    assert.ok(!JSON.stringify(f.calls).includes(rotatedAgentToken));
    assert.ok(!JSON.stringify((await f.state('auth-allowed')).audit).includes(rotatedAgentToken));
    console.log(JSON.stringify({ case: 'chat-auth-token-rotation', oldToken: oldToken.status, newToken: newToken.status, providerCalls: 1 }));
  } finally { await f.cleanup(); }
});
