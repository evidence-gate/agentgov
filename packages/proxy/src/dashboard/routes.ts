import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { budgetLedger, auditLog, hitlQueue } from '../db/schema';
import type { DockerDbClient } from '../db/client.node';

/**
 * Creates a Hono router with read-only dashboard API endpoints.
 *
 * These endpoints are SELECT-only. No POST/PUT/DELETE — hard constraint.
 * Designed for the dashboard SPA (Plan 03) to consume.
 *
 * @param db - DockerDbClient instance (embedded libSQL)
 */
export function createDashboardRoutes(db: DockerDbClient): Hono {
  const router = new Hono();

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

  return router;
}
