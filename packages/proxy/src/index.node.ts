/**
 * Node.js entry point for the agentgov proxy.
 *
 * Starts the same Hono app used in Cloudflare Workers, but adapts it for Node.js:
 * - Uses @hono/node-server instead of Cloudflare's fetch handler
 * - Uses embedded libSQL (file: URL) instead of Turso cloud HTTP
 * - Maps process.env values into c.env so existing proxy code works unchanged
 * - Stubs HITL_WORKFLOW: any request that triggers HITL approval returns 501
 * - Mounts read-only dashboard API routes for the SPA (Plan 03)
 */

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createDockerDbClient, runMigrations } from './db/client.node';
import { createDashboardRoutes } from './dashboard/routes';

// Import the same Hono app object used in Workers — no changes to existing routes
import sharedApp, { type AppEnvironment } from './app';

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

  // Create embedded libSQL client (file: URL, no Turso cloud needed)
  const db = createDockerDbClient();

  // Run migrations idempotently on every startup
  await runMigrations(db);
  console.log('agentgov: migrations applied');

  // Register Node's database context before mounting the shared routes.
  const app = new Hono<AppEnvironment>();
  app.use('*', async (c, next) => {
    c.set('db', db);
    c.set('hitlUnavailable', true);
    if (c.req.path.startsWith('/v1/hitl/') || c.req.path === '/v1/slack/callback') {
      return c.json({ error: { code: 'HITL_NOT_AVAILABLE', message: 'HITL requires Cloudflare Workflows deployment.' } }, 501);
    }
    await next();
  });
  app.route('/', sharedApp);

  // Pass bindings directly to Hono before any route executes.
  const env: Record<string, unknown> = {};
  env['TURSO_DATABASE_URL'] = process.env['DATABASE_URL'] ?? 'file:agentgov.db';
  env['TURSO_AUTH_TOKEN'] = 'local';
  env['AGENTGOV_PROVIDER_TIMEOUT_MS'] = process.env['AGENTGOV_PROVIDER_TIMEOUT_MS'];
  env['AGENTGOV_BUDGET_ADMIN_TOKEN'] = process.env['AGENTGOV_BUDGET_ADMIN_TOKEN'];
  env['AGENTGOV_MAX_RETRIES'] = process.env['AGENTGOV_MAX_RETRIES'];
  env['AGENTGOV_RETRY_BASE_MS'] = process.env['AGENTGOV_RETRY_BASE_MS'];
  env['OPENAI_API_KEY'] = process.env['OPENAI_API_KEY'] ?? '';
  env['ANTHROPIC_API_KEY'] = process.env['ANTHROPIC_API_KEY'] ?? '';
  env['GEMINI_API_KEY'] = process.env['GEMINI_API_KEY'] ?? '';
  env['AGENTGOV_ALERT_WEBHOOK_URL'] = process.env['AGENTGOV_ALERT_WEBHOOK_URL'] ?? '';
  env['AGENTGOV_ALERT_THRESHOLDS'] = process.env['AGENTGOV_ALERT_THRESHOLDS'] ?? '0.80,1.00';
  env['AGENTGOV_HITL_TTL_SECONDS'] = process.env['AGENTGOV_HITL_TTL_SECONDS'] ?? '259200';
  env['AGENTGOV_HITL_WEBHOOK_URL'] = process.env['AGENTGOV_HITL_WEBHOOK_URL'] ?? '';
  env['SLACK_BOT_TOKEN'] = process.env['SLACK_BOT_TOKEN'] ?? '';
  env['SLACK_CHANNEL_ID'] = process.env['SLACK_CHANNEL_ID'] ?? '';
  env['SLACK_SIGNING_SECRET'] = process.env['SLACK_SIGNING_SECRET'] ?? '';
  // Stub HITL_WORKFLOW — throws HitlNotAvailableError if triggered.
  // The fetch wrapper below catches this and returns 501.
  env['HITL_WORKFLOW'] = HITL_WORKFLOW_STUB;

  // Mount read-only dashboard API routes (for Plan 03 SPA)
  app.route('/', createDashboardRoutes(db));

  console.log(`agentgov: starting on port ${port}`);

  // Wrap app.fetch to catch HitlNotAvailableError and return 501
  const fetchWithHitlGuard = async (req: Request) => {
    try {
      return await app.fetch(req, env as unknown as Env);
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
