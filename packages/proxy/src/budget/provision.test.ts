import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client/web';
import { drizzle } from 'drizzle-orm/libsql';
import { afterEach, describe, expect, it } from 'vitest';
import app from '../app';
import { budgetGate } from './gate';
import { getBudget, provisionAgentBudget } from './ledger';
import { createDockerDbClient, runMigrations } from '../db/client.node';
import * as schema from '../db/schema';
import { startHranaBridge, type HranaBridge } from '../../scripts/hrana-bridge';

const proxyRoot = fileURLToPath(new URL('../..', import.meta.url));
const request = { model: 'gpt-4o', messages: [{ role: 'user' as const, content: 'hello' }] };
const dirs: string[] = [];
const closers: Array<() => void | Promise<void>> = [];

function freshFile() {
  const dir = mkdtempSync(join(tmpdir(), 'agentgov-provision-'));
  dirs.push(dir);
  return `file:${join(dir, 'budget.db')}`;
}

afterEach(async () => {
  while (closers.length) await closers.pop()?.();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

async function migrated(url = freshFile()) {
  const db = createDockerDbClient(url);
  closers.push(() => db.$client.close());
  await runMigrations(db);
  return db;
}

async function count(db: ReturnType<typeof createDockerDbClient>, event: string) {
  const result = await db.$client.execute({ sql: 'SELECT COUNT(*) n FROM audit_log WHERE event_type=?', args: [event] });
  return Number(result.rows[0]?.n ?? 0);
}

describe('operator provisioning on a fresh SQLite database', () => {
  it('blocks an unprovisioned agent, then passes the budget gate after an audited grant', async () => {
    const db = await migrated();
    expect(await budgetGate({ db, agentId: 'fresh-agent', request })).toEqual({ action: 'block', reason: 'unknown_agent' });
    const granted = await provisionAgentBudget(db, 'fresh-agent', 10);
    expect(granted.created).toBe(true);
    expect(granted.row).toMatchObject({ agentId: 'fresh-agent', limitUsd: 10, spentUsd: 0, reservedUsd: 0 });
    expect((await budgetGate({ db, agentId: 'fresh-agent', request })).action).toBe('pass');
    expect(await count(db, 'budget_provisioned')).toBe(1);
  });

  it('is idempotent and preserves spend and reservations when the limit changes', async () => {
    const db = await migrated();
    await provisionAgentBudget(db, 'fresh-agent', 10);
    await db.$client.execute("UPDATE budget_ledger SET spent_usd=2, reserved_usd=1 WHERE agent_id='fresh-agent'");
    const same = await provisionAgentBudget(db, 'fresh-agent', 10);
    expect(same.created).toBe(false);
    expect(same.row).toMatchObject({ limitUsd: 10, spentUsd: 2, reservedUsd: 1 });
    expect(await count(db, 'budget_provisioned')).toBe(1);
    expect(await count(db, 'budget_limit_changed')).toBe(0);
    const changed = await provisionAgentBudget(db, 'fresh-agent', 30);
    expect(changed.created).toBe(false);
    expect(changed.row).toMatchObject({ limitUsd: 30, spentUsd: 2, reservedUsd: 1 });
    expect(await count(db, 'budget_limit_changed')).toBe(1);
  });

  it('commits one row when two connections provision together', async () => {
    const url = freshFile();
    const db = await migrated(url);
    const second = createDockerDbClient(url);
    closers.push(() => second.$client.close());
    const results = await Promise.all([
      provisionAgentBudget(db, 'fresh-agent', 5),
      provisionAgentBudget(second, 'fresh-agent', 5),
    ]);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(await getBudget(db, 'fresh-agent')).toMatchObject({ limitUsd: 5, spentUsd: 0, reservedUsd: 0 });
    expect(await count(db, 'budget_provisioned')).toBe(1);
  });

  it('does not leave a row when the audit append fails', async () => {
    const db = await migrated();
    await db.$client.execute("CREATE TRIGGER fail_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT,'unavailable'); END");
    await expect(provisionAgentBudget(db, 'fresh-agent', 4)).rejects.toThrow();
    expect(await getBudget(db, 'fresh-agent')).toBeNull();
  });

  it('rejects invalid ids and limits', async () => {
    const db = await migrated();
    await expect(provisionAgentBudget(db, '*', 1)).rejects.toThrow('Invalid agent id');
    await expect(provisionAgentBudget(db, 'fresh-agent', -1)).rejects.toThrow('Invalid budget limit');
    expect(await getBudget(db, 'fresh-agent')).toBeNull();
  });
});

function runCli(args: string[], env: Record<string, string>) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/cli/provision-budget.ts', ...args], {
      cwd: proxyRoot,
      env: { PATH: process.env['PATH'] ?? '', ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk; });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk; });
    child.on('error', reject);
    once(child, 'exit').then(([code]) => resolve({ code: code ?? 1, stdout, stderr })).catch(reject);
  });
}

describe('budget:provision CLI', () => {
  it('provisions a fresh file database, then passes the budget gate without resetting later spend', async () => {
    const url = freshFile();
    const first = await runCli(['--agent', 'cli-agent', '--limit-usd', '12'], { DATABASE_URL: url });
    expect(first.code).toBe(0);
    expect(JSON.parse(first.stdout)).toMatchObject({ agentId: 'cli-agent', limitUsd: 12, spentUsd: 0, reservedUsd: 0, created: true });
    const db = await migrated(url);
    expect((await budgetGate({ db, agentId: 'cli-agent', request })).action).toBe('pass');
    const reserved = (await getBudget(db, 'cli-agent'))!.reservedUsd;
    expect(reserved).toBeGreaterThan(0);
    const second = await runCli(['--agent', 'cli-agent', '--limit-usd', '12'], { DATABASE_URL: url });
    expect(second.code).toBe(0);
    expect(JSON.parse(second.stdout)).toMatchObject({ created: false, spentUsd: 0, reservedUsd: reserved });
    expect(await count(db, 'budget_provisioned')).toBe(1);
  });

  it('refuses missing arguments and remote URLs without a database token', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentgov-provision-cli-'));
    dirs.push(dir);
    const file = join(dir, 'absent.db');
    const missing = await runCli([], { DATABASE_URL: `file:${file}` });
    expect(missing.code).not.toBe(0);
    expect(existsSync(file)).toBe(false);
    const remote = await runCli(['--agent', 'cli-agent', '--limit-usd', '1'], { DATABASE_URL: 'http://127.0.0.1:9' });
    expect(remote.code).not.toBe(0);
    expect(remote.stderr).toContain('TURSO_AUTH_TOKEN');
  });
});

describe('Workers web client provisioning', () => {
  it('rejects an unauthenticated put, then a granted budget passes the gate over libsql HTTP', async () => {
    const url = freshFile();
    const native = createDockerDbClient(url);
    await runMigrations(native);
    native.$client.close();
    const bridge: HranaBridge = await startHranaBridge(url);
    closers.push(() => bridge.close());
    const secret = 'operator-secret';
    const env = {
      TURSO_DATABASE_URL: bridge.url,
      TURSO_AUTH_TOKEN: 'local',
      AGENTGOV_BUDGET_ADMIN_TOKEN: secret,
    } as unknown as Env;
    const web = drizzle(createClient({ url: bridge.url, authToken: 'local' }), { schema });
    closers.push(() => web.$client.close());
    expect(await budgetGate({ db: web, agentId: 'web-agent', request })).toEqual({ action: 'block', reason: 'unknown_agent' });

    const denied = await app.request('/api/v1/operator/budgets/web-agent', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: 'Bearer wrong-token' },
      body: JSON.stringify({ limitUsd: 8 }),
    }, env);
    expect(denied.status).toBe(401);
    const check = createDockerDbClient(url);
    closers.push(() => check.$client.close());
    expect(await getBudget(check, 'web-agent')).toBeNull();

    bridge.authorizations.length = 0;
    const created = await app.request('/api/v1/operator/budgets/web-agent', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      body: JSON.stringify({ limitUsd: 8 }),
    }, env);
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ agentId: 'web-agent', limitUsd: 8, spentUsd: 0, reservedUsd: 0, created: true });
    expect(bridge.authorizations).toContain('Bearer local');
    expect((await budgetGate({ db: web, agentId: 'web-agent', request })).action).toBe('pass');
  });
});
