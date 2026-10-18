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

  // Create embedded libSQL client (file: URL, no Turso cloud needed)
  const db = createDockerDbClient();

  // Run migrations idempotently on every startup
  await runMigrations(db);
  console.log('agentgov: migrations applied');

  // Middleware to map process.env into c.env so existing Workers-style code works.
  // Runs before all other routes.
  app.use('*', async (c, next) => {
    // Cast to allow setting arbitrary env values — Env type is a Workers global type
    const env = c.env as unknown as Record<string, unknown>;
    env['TURSO_DATABASE_URL'] = process.env['DATABASE_URL'] ?? 'file:agentgov.db';
    env['TURSO_AUTH_TOKEN'] = 'local';
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
    await next();
  });

  // Mount read-only dashboard API routes (for Plan 03 SPA)
  app.route('/', createDashboardRoutes(db));

  console.log(`agentgov: starting on port ${port}`);

  // Wrap app.fetch to catch HitlNotAvailableError and return 501
  const fetchWithHitlGuard = async (req: Request, ...args: unknown[]) => {
    try {
      return await (app.fetch as (req: Request, ...args: unknown[]) => Promise<Response>)(req, ...args);
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
