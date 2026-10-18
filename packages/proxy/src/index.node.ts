/**
 * Node.js entry point for the agentgov proxy.
 *
 * Starts the same Hono app used in Cloudflare Workers, but adapts it for Node.js:
 * - Uses @hono/node-server instead of Cloudflare's fetch handler
 * - Uses embedded libSQL (file: URL) instead of Turso cloud HTTP
 * - Passes process.env into app.fetch as bindings so existing proxy code works unchanged
 * - Rejects Node HITL requests with 501 before reserving budget
 * - Serves operator budget provisioning on the shared app with the native client, including file: URLs
 * - Mounts read-only dashboard API routes for the SPA (Plan 03)
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { setDbClientFactory } from './db/client';
import { createDockerDbClient, runMigrations } from './db/client.node';
import { createDashboardRoutes } from './dashboard/routes';

// Import the same Hono app object used in Workers — no changes to existing routes
import sharedApp, { type AppEnvironment } from './app';

async function main() {
  const port = parseInt(process.env['PORT'] ?? '8787', 10);
  const databaseUrl = process.env['DATABASE_URL'] ?? 'file:agentgov.db';
  const authToken = 'local';

  // One native libSQL connection for migrations, the dashboard, and chat.
  // createDbClient() defaults to @libsql/client/web, which rejects file: URLs.
  // Install the native client in this process only. src/index.ts (Workers)
  // never imports this module, so the Workers bundle stays on the web client.
  const db = createDockerDbClient(databaseUrl, authToken);
  setDbClientFactory(() => db);

  // Run migrations idempotently on every startup
  await runMigrations(db);
  console.log('agentgov: migrations applied');

  // Register platform availability before mounting chat. Database access keeps
  // main's process-local factory; Node HITL rejects before any reservation.
  const app = new Hono<AppEnvironment>();
  app.use('*', async (c, next) => {
    c.set('hitlUnavailable', true);
    if (c.req.path.startsWith('/v1/hitl/') || c.req.path === '/v1/slack/callback') {
      return c.json({ error: { code: 'HITL_NOT_AVAILABLE', message: 'HITL requires Cloudflare Workflows deployment.' } }, 501);
    }
    await next();
  });
  app.route('/', sharedApp);

  // Mount dashboard API routes
  app.route('/', createDashboardRoutes(db));

  console.log(`agentgov: starting on port ${port}`);

  // Hono runs handlers in registration order. The shared app registers
  // /v1/chat/completions at import time, so middleware added here would run
  // only after that handler returns and would never populate c.env.
  // @hono/node-server also calls fetch(request, { incoming, outgoing }), which
  // is not the Workers binding object. Pass the Node config as app.fetch's env
  // argument — the same channel Cloudflare uses for c.env.
  const nodeBindings = (): Parameters<typeof app.fetch>[1] => ({
    TURSO_DATABASE_URL: databaseUrl,
    TURSO_AUTH_TOKEN: authToken,
    AGENTGOV_AGENT_AUTH: process.env['AGENTGOV_AGENT_AUTH'],
    AGENTGOV_BUDGET_ADMIN_TOKEN: process.env['AGENTGOV_BUDGET_ADMIN_TOKEN'],
    AGENTGOV_PROVIDER_TIMEOUT_MS: process.env['AGENTGOV_PROVIDER_TIMEOUT_MS'],
    AGENTGOV_MAX_RETRIES: process.env['AGENTGOV_MAX_RETRIES'],
    AGENTGOV_RETRY_BASE_MS: process.env['AGENTGOV_RETRY_BASE_MS'],
    OPENAI_API_KEY: process.env['OPENAI_API_KEY'] ?? '',
    ANTHROPIC_API_KEY: process.env['ANTHROPIC_API_KEY'] ?? '',
    GEMINI_API_KEY: process.env['GEMINI_API_KEY'] ?? '',
    AGENTGOV_ALERT_WEBHOOK_URL: process.env['AGENTGOV_ALERT_WEBHOOK_URL'] ?? '',
    AGENTGOV_ALERT_THRESHOLDS: process.env['AGENTGOV_ALERT_THRESHOLDS'] ?? '0.80,1.00',
    AGENTGOV_HITL_TTL_SECONDS: process.env['AGENTGOV_HITL_TTL_SECONDS'] ?? '259200',
    AGENTGOV_HITL_WEBHOOK_URL: process.env['AGENTGOV_HITL_WEBHOOK_URL'] ?? '',
    SLACK_BOT_TOKEN: process.env['SLACK_BOT_TOKEN'] ?? '',
    SLACK_CHANNEL_ID: process.env['SLACK_CHANNEL_ID'] ?? '',
    SLACK_SIGNING_SECRET: process.env['SLACK_SIGNING_SECRET'] ?? '',
  } as Parameters<typeof app.fetch>[1]);

  serve({
    fetch: (req: Request) => app.fetch(req, nodeBindings()),
    port,
  });

  console.log(`agentgov proxy running at http://localhost:${port}`);
  console.log(`Dashboard API available at http://localhost:${port}/api/v1/dashboard/`);
}

main().catch((err) => {
  console.error('agentgov startup error:', err);
  process.exit(1);
});
