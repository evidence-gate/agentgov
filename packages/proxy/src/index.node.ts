/**
 * Node.js entry point for the agentgov proxy.
 *
 * Starts the same Hono app used in Cloudflare Workers, but adapts it for Node.js:
 * - Uses @hono/node-server instead of Cloudflare's fetch handler
 * - Uses embedded libSQL (file: URL) instead of Turso cloud HTTP
 * - Passes process.env into app.fetch as bindings so existing proxy code works unchanged
 * - Stubs HITL_WORKFLOW: any request that triggers HITL approval returns 501
 * - Mounts read-only dashboard API routes for the SPA (Plan 03)
 */

import { serve } from '@hono/node-server';
import { setDbClientFactory } from './db/client';
import { createDockerDbClient, runMigrations } from './db/client.node';
import { createDashboardRoutes } from './dashboard/routes';

// Import the same Hono app object used in Workers — no changes to existing routes
import app from './app';

/**
 * Stub HITL_WORKFLOW binding.
 * In self-host (Docker) mode, Cloudflare Workflows are not available.
 * Any attempt to create a workflow instance is intercepted and returns 501.
 *
 * The stub throws a special sentinel error that the HITL code path catches.
 * Note: The actual TypeError from calling undefined.create() is what we avoid here —
 * we replace it with a controlled 501 response by wrapping the app fetch.
 */
const HITL_WORKFLOW_STUB = {
  create: async (_params: unknown) => {
    throw new HitlNotAvailableError();
  },
  get: async (_id: string) => {
    throw new HitlNotAvailableError();
  },
};

class HitlNotAvailableError extends Error {
  readonly code = 'HITL_NOT_AVAILABLE';
  constructor() {
    super('HITL requires Cloudflare Workflows deployment');
  }
}

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

  // Mount read-only dashboard API routes (for Plan 03 SPA)
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
    // Stub HITL_WORKFLOW — throws HitlNotAvailableError if triggered.
    // The fetch wrapper below catches this and returns 501.
    HITL_WORKFLOW: HITL_WORKFLOW_STUB,
  } as Parameters<typeof app.fetch>[1]);

  // Wrap app.fetch to catch HitlNotAvailableError and return 501
  const fetchWithHitlGuard = async (req: Request) => {
    try {
      return await app.fetch(req, nodeBindings());
    } catch (err) {
      if (err instanceof HitlNotAvailableError) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'HITL_NOT_AVAILABLE',
              message: 'HITL requires Cloudflare Workflows deployment. Self-hosted mode does not support HITL workflows.',
            },
          }),
          {
            status: 501,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }
      throw err;
    }
  };

  serve({
    fetch: fetchWithHitlGuard,
    port,
  });

  console.log(`agentgov proxy running at http://localhost:${port}`);
  console.log(`Dashboard API available at http://localhost:${port}/api/v1/dashboard/`);
}

main().catch((err) => {
  console.error('agentgov startup error:', err);
  process.exit(1);
});
