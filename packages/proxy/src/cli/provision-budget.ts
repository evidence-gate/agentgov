/**
 * Operator CLI for a fresh or existing budget database.
 *
 * Uses the native @libsql/client, so file: URLs (Docker/Node) and remote
 * libsql/http URLs (the same Turso database a Worker reaches with the web
 * client) both work. Run from packages/proxy so migrations resolve.
 *
 *   pnpm budget:provision -- --agent agent-a --limit-usd 25
 *
 * DATABASE_URL wins when both database variables are set.
 * Remote URLs require TURSO_AUTH_TOKEN. The token is not printed.
 */
import { isAgentId } from '../agent-auth';
import { provisionAgentBudget } from '../budget/ledger';
import { createDockerDbClient, runMigrations } from '../db/client.node';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function argumentsOf(argv: string[]): { agentId: string; limitUsd: number } {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key !== '--agent' && key !== '--limit-usd') fail(`unknown argument ${key ?? ''}`);
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) fail(`missing value for ${key}`);
    if (values.has(key)) fail(`duplicate argument ${key}`);
    values.set(key, value);
  }
  const agentId = values.get('--agent');
  const limitRaw = values.get('--limit-usd');
  if (!agentId || limitRaw === undefined) {
    fail('usage: budget:provision -- --agent <id> --limit-usd <non-negative decimal>');
  }
  if (!isAgentId(agentId)) fail('invalid agent id');
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(limitRaw)) fail('limit-usd must be a non-negative decimal');
  const limitUsd = Number(limitRaw);
  if (!Number.isFinite(limitUsd) || limitUsd < 0) fail('limit-usd must be a non-negative decimal');
  return { agentId, limitUsd };
}

async function main() {
  const { agentId, limitUsd } = argumentsOf(process.argv.slice(2));
  const url = process.env['DATABASE_URL'] || process.env['TURSO_DATABASE_URL'];
  const authToken = process.env['TURSO_AUTH_TOKEN'];
  if (!url) fail('DATABASE_URL or TURSO_DATABASE_URL is required');
  if (!url.startsWith('file:') && !authToken) {
    fail('TURSO_AUTH_TOKEN is required when the database URL is not a file: URL');
  }
  const db = createDockerDbClient(url, authToken);
  try {
    await runMigrations(db);
    const { row, created } = await provisionAgentBudget(db, agentId, limitUsd);
    console.log(JSON.stringify({ ...row, created }));
  } finally {
    db.$client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'budget provisioning failed');
  process.exit(1);
});
