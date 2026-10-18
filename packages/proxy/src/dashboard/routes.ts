import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { budgetLedger, auditLog, hitlQueue } from '../db/schema';
import type { DbClient } from '../db/client';
import { updateBudgetLimit } from '../budget/ledger';
import type { AgentId } from '../types';

/**
 * Creates a Hono router with dashboard API endpoints.
 *
 * GET endpoints are read-only.
 * PATCH /api/v1/dashboard/budgets/:agentId allows updating the budget limit per agent.
 *
 * Uses DbClient (not DockerDbClient) so this works in both Docker (Node.js) and
 * Cloudflare Workers contexts. Both are structurally identical ReturnType<typeof drizzle(...)>.
 *
 * @param db - DbClient instance
 */
export function createDashboardRoutes(db: DbClient) {
  const router = new Hono<{ Bindings: { AGENTGOV_BUDGET_ADMIN_TOKEN?: string } }>();

  /**
   * GET /api/v1/dashboard/budgets
   * Returns all rows from budget_ledger as a JSON array.
   */
  router.get('/api/v1/dashboard/budgets', async (c) => {
    const rows = await db.select().from(budgetLedger);
    return c.json(rows);
  });

  /**
   * GET /api/v1/dashboard/audit
   * Returns audit_log rows ordered by seq DESC.
   * Query param: limit (default 100)
   */
  router.get('/api/v1/dashboard/audit', async (c) => {
    const limitParam = c.req.query('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 100;
    const safeLimit = isNaN(limit) || limit < 1 ? 100 : Math.min(limit, 1000);
    const rows = await db
      .select()
      .from(auditLog)
      .orderBy(auditLog.seq)
      .limit(safeLimit);
    return c.json(rows);
  });

  /**
   * GET /api/v1/dashboard/approvals
   * Returns pending HITL queue rows ordered by created_at DESC.
   */
  router.get('/api/v1/dashboard/approvals', async (c) => {
    const rows = await db
      .select()
      .from(hitlQueue)
      .where(eq(hitlQueue.status, 'pending'))
      .orderBy(hitlQueue.createdAt);
    return c.json(rows);
  });

  /**
   * PATCH /api/v1/dashboard/budgets/:agentId
   * Updates the budget limit (limit_usd) for a specific agent.
   *
   * Body: { limitUsd: number }
   * Returns: updated budget_ledger row on success
   * Errors:
   *   400 INVALID_LIMIT — limitUsd is negative, NaN, or Infinity
   *   404 AGENT_NOT_FOUND — no budget row exists for the given agentId
   *
   * CRITICAL: Only updates limit_usd. Never touches spent_usd or reserved_usd.
   * Every successful change appends a budget_limit_changed audit event (BUDGET-02).
   */
  router.patch('/api/v1/dashboard/budgets/:agentId', async (c) => {
    const secret = c.env?.AGENTGOV_BUDGET_ADMIN_TOKEN as string | undefined;
    if (!secret) return c.json({ error: { code: 'ADMIN_AUTH_UNAVAILABLE' } }, 503);
    const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
    const [actual, expected] = await Promise.all([digest(c.req.header('Authorization') ?? ''), digest(`Bearer ${secret}`)]);
    let difference = 0;
    for (let i = 0; i < expected.length; i++) difference |= actual[i] ^ expected[i];
    if (difference !== 0) return c.json({ error: { code: 'UNAUTHORIZED' } }, 401);
    const agentId = c.req.param('agentId');
    let body: { limitUsd?: unknown } | null;
    try { body = await c.req.json(); } catch { return c.json({ error: { code: 'INVALID_LIMIT' } }, 400); }

    // Validate limitUsd
    if (!body || typeof body.limitUsd !== 'number' || !isFinite(body.limitUsd) || body.limitUsd < 0) {
      return c.json({ error: { code: 'INVALID_LIMIT', message: 'limitUsd must be a non-negative finite number' } }, 400);
    }

    const updated = await updateBudgetLimit(db, agentId as AgentId, body.limitUsd);
    if (!updated) {
      return c.json({ error: { code: 'AGENT_NOT_FOUND', message: `No budget row for agent: ${agentId}` } }, 404);
    }

    return c.json(updated);
  });

  return router;
}
