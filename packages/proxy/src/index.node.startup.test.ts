import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { it } from 'vitest';
import { startHranaBridge, type HranaBridge } from '../scripts/hrana-bridge';

const PROXY_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REDIRECT_PRELOAD = fileURLToPath(new URL('../scripts/redirect-provider-fetch.mjs', import.meta.url));
const FAKE_API_KEY = 'test-local-openai-key';
const PROVIDER_CONTENT = 'config-reached-provider';

async function unusedPort(): Promise<number> {
  const server = createNetServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('failed to reserve a port');
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return address.port;
}

type ProviderHit = { authorization: string | undefined; model: unknown };

async function startFakeProvider(): Promise<{ origin: string; hits: ProviderHit[]; close(): Promise<void> }> {
  const hits: ProviderHit[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      let model: unknown;
      try {
        model = (JSON.parse(Buffer.concat(chunks).toString('utf8')) as { model?: unknown }).model;
      } catch {
        model = undefined;
      }
      hits.push({ authorization: req.headers.authorization, model });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: 'chatcmpl-local-config',
        object: 'chat.completion',
        created: 0,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: PROVIDER_CONTENT },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('fake provider failed to bind');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    hits,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await Promise.race([exited, delay(2_000).then(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    return exited;
  })]);
}

it('Node startup delivers Turso config and calls the provider instead of the dev stub', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agentgov-node-config-'));
  const fileUrl = `file:${join(dir, 'test.db')}`;
  let bridge: HranaBridge | undefined;
  let provider: Awaited<ReturnType<typeof startFakeProvider>> | undefined;
  let child: ChildProcess | undefined;
  let output = '';
  try {
    bridge = await startHranaBridge(fileUrl);
    provider = await startFakeProvider();
    const port = await unusedPort();
    child = spawn(process.execPath, ['--import', REDIRECT_PRELOAD, '--import', 'tsx', 'src/index.node.ts'], {
      cwd: PROXY_ROOT,
      env: {
        PATH: process.env.PATH,
        PORT: String(port),
        DATABASE_URL: bridge.url,
        OPENAI_API_KEY: FAKE_API_KEY,
        AGENTGOV_TEST_PROVIDER_ORIGIN: provider.origin,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (chunk: Buffer) => { output += chunk; });
    child.stderr?.on('data', (chunk: Buffer) => { output += chunk; });

    let healthy = false;
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      assert.equal(child.exitCode, null, `Node exited before becoming healthy:\n${output}`);
      try {
        const health = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) });
        assert.equal(health.status, 200);
        assert.deepEqual(await health.json(), { status: 'ok' });
        healthy = true;
        break;
      } catch (error) {
        if (error instanceof assert.AssertionError) throw error;
        await delay(50);
      }
    }
    assert.ok(healthy, `Node did not become healthy:\n${output}`);
    bridge.authorizations.length = 0;

    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-agent-id': 'node-startup-config',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 16,
        messages: [{ role: 'user', content: 'hello from the node startup test' }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json() as {
      id?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    assert.equal(
      content,
      PROVIDER_CONTENT,
      `chat request did not reach the configured provider (stub means Turso config never arrived).\n` +
      `status=${response.status} body=${JSON.stringify(body)}\n${output}`,
    );
    assert.equal(response.status, 200, output);
    assert.equal(body.id?.startsWith('stub-'), false, output);
    assert.deepEqual(
      provider.hits,
      [{ authorization: `Bearer ${FAKE_API_KEY}`, model: 'gpt-4o' }],
      `provider calls:\n${JSON.stringify(provider.hits)}\n${output}`,
    );
    assert.ok(
      bridge.authorizations.includes('Bearer local'),
      `database requests after /health did not carry TURSO_AUTH_TOKEN.\n${JSON.stringify(bridge.authorizations)}\n${output}`,
    );

    const stored = createClient({ url: fileUrl });
    try {
      const ledger = await stored.execute({
        sql: 'SELECT agent_id FROM budget_ledger WHERE agent_id = ?',
        args: ['node-startup-config'],
      });
      assert.equal(ledger.rows.length, 1, 'budget gate did not write the agent row');
    } finally {
      stored.close();
    }
  } finally {
    if (child) await stopChild(child);
    if (provider) await provider.close();
    if (bridge) await bridge.close();
    await rm(dir, { recursive: true, force: true });
  }
}, 30_000);
