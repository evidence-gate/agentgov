/**
 * HITL HTTP route handlers — approve, deny, status, Slack callback.
 *
 * Mounted as a sub-app on the main Hono app:
 *   app.route('/', hitlRoutes)
 *
 * Routes:
 *   POST /v1/hitl/:id/approve  — resume workflow with approved decision
 *   POST /v1/hitl/:id/deny     — resume workflow with denied decision
 *   GET  /v1/hitl/:id/status   — poll ticket status (for SDK polling)
 *   POST /v1/slack/callback    — Slack interactivity webhook (signature verified)
 *
 * The Slack callback returns 200 within 3 seconds by pushing the actual
 * workflow resumption work to executionCtx.waitUntil() (Cloudflare pattern).
 *
 * Per Slack interactivity requirements: the callback endpoint MUST respond
 * within 3 seconds. Actual work runs in waitUntil background task.
 */

import { Hono } from 'hono';
import { createDbClient } from '../db/client';
import { getTicket } from './queue';
import { verifySlackSignature } from './slack';

export const hitlRoutes = new Hono<{ Bindings: Env & { AGENTGOV_HITL_APPROVAL_TOKEN?: string } }>();

// Direct decisions require a separately provisioned operator secret. Never trust actor alone.
hitlRoutes.use('/v1/hitl/:id/:action', async (c, next) => {
  if (c.req.method !== 'POST' || !['approve', 'deny'].includes(c.req.param('action') ?? '')) return next();
  const secret = c.env.AGENTGOV_HITL_APPROVAL_TOKEN;
  if (!secret) return c.json({ error: 'approval authentication is not configured' }, 503);
  const supplied = c.req.header('Authorization') ?? '';
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [actual, expected] = await Promise.all([digest(supplied), digest(`Bearer ${secret}`)]);
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= actual[i] ^ expected[i];
  if (difference !== 0) return c.json({ error: 'unauthorized' }, 401);
  return next();
});

// ---------------------------------------------------------------------------
// POST /v1/hitl/:id/approve
// ---------------------------------------------------------------------------
hitlRoutes.post('/v1/hitl/:id/approve', async (c) => {
  const ticketId = c.req.param('id');
  let actor: string;
  let reason: string | undefined;

  try {
    const body = await c.req.json<{ actor: string; reason?: string }>();
    actor = body.actor;
    reason = body.reason;
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }

  try {
    const instance = await c.env.HITL_WORKFLOW.get(ticketId);
    await instance.sendEvent({
      type: 'hitl-decision',
      payload: { decision: 'approved', actor, reason },
    });
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('not found') || message.includes('404')) {
      return c.json({ error: 'ticket not found' }, 404);
    }
    return c.json({ error: 'workflow error' }, 500);
  }
});

// ---------------------------------------------------------------------------
// POST /v1/hitl/:id/deny
// ---------------------------------------------------------------------------
hitlRoutes.post('/v1/hitl/:id/deny', async (c) => {
  const ticketId = c.req.param('id');
  let actor: string;
  let reason: string | undefined;

  try {
    const body = await c.req.json<{ actor: string; reason?: string }>();
    actor = body.actor;
    reason = body.reason;
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }

  try {
    const instance = await c.env.HITL_WORKFLOW.get(ticketId);
    await instance.sendEvent({
      type: 'hitl-decision',
      payload: { decision: 'denied', actor, reason },
    });
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('not found') || message.includes('404')) {
      return c.json({ error: 'ticket not found' }, 404);
    }
    return c.json({ error: 'workflow error' }, 500);
  }
});

// ---------------------------------------------------------------------------
// GET /v1/hitl/:id/status
// ---------------------------------------------------------------------------
hitlRoutes.get('/v1/hitl/:id/status', async (c) => {
  const ticketId = c.req.param('id');

  const db = createDbClient(c.env.TURSO_DATABASE_URL, c.env.TURSO_AUTH_TOKEN);
  const ticket = await getTicket(db, ticketId);

  if (!ticket) {
    return c.json({ error: 'ticket not found' }, 404);
  }

  return c.json({
    id: ticket.id,
    status: ticket.status,
    riskTier: ticket.riskTier,
    actionName: ticket.actionName,
    approver: ticket.approver,
    createdAt: ticket.createdAt,
    expiresAt: ticket.expiresAt,
    decidedAt: ticket.decidedAt,
  });
});

// ---------------------------------------------------------------------------
// POST /v1/slack/callback
// ---------------------------------------------------------------------------
hitlRoutes.post('/v1/slack/callback', async (c) => {
  // Read raw body ONCE — needed for signature verification
  const rawBody = await c.req.text();

  // Verify Slack signature (returns 401 if invalid)
  const isValid = await verifySlackSignature(
    c.req.raw,
    rawBody,
    c.env.SLACK_SIGNING_SECRET ?? '',
  );
  if (!isValid) {
    return c.json({ error: 'invalid signature' }, 401);
  }

  // Parse block_actions payload
  let payload: {
    type: string;
    actions: Array<{ action_id: string; value: string }>;
    user: { username: string };
  };

  try {
    const params = new URLSearchParams(rawBody);
    const payloadStr = params.get('payload');
    if (!payloadStr) {
      return c.json({ error: 'missing payload' }, 400);
    }
    payload = JSON.parse(payloadStr);
  } catch {
    return c.json({ error: 'invalid payload' }, 400);
  }

  // Extract action data
  const actionId = payload.actions?.[0]?.action_id; // 'approve' | 'deny'
  const ticketId = payload.actions?.[0]?.value;
  const actor = payload.user?.username ?? 'unknown';

  if (!actionId || !ticketId) {
    return c.json({ error: 'missing action or ticketId' }, 400);
  }

  // Push actual work to waitUntil — Slack requires 200 within 3 seconds
  // The workflow resumption runs in the background (per research Pitfall 5)
  const workPromise = (async () => {
    try {
      const instance = await c.env.HITL_WORKFLOW.get(ticketId);
      await instance.sendEvent({
        type: 'hitl-decision',
        payload: {
          decision: actionId === 'approve' ? 'approved' : 'denied',
          actor,
        },
      });
    } catch (err) {
      console.error('Slack callback workflow resumption error:', err);
    }
  })();

  try {
    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(workPromise);
    }
  } catch {
    // executionCtx not available (Node.js test env) — workPromise runs in background
  }

  // Return 200 immediately — Slack 3-second constraint
  return c.json({ ok: true });
});
