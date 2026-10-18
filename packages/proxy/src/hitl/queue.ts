/**
 * HITL queue — Turso CRUD for hitl_queue table.
 *
 * Uses the same Drizzle fluent query pattern as budget/ledger.ts.
 * Concurrency note: NOT wrapped in DB transactions (Turso HTTP doesn't support
 * interactive transactions). Same documented race condition as Phase 1 ledger.ts.
 */

import { and, eq } from 'drizzle-orm';
import { hitlQueue } from '../db/schema';
import type { DbClient } from '../db/client';
import type { RiskTier } from './classifier';
import { auditedWrite } from '../audit/writer';
import { settleHold } from '../budget/ledger';

export interface CreateTicketParams {
  agentId: string;
  riskTier: RiskTier;
  actionName: string;
  requestPayload: string | null;
  holdId: string | null;
  ttlSeconds: number;
}

export interface HitlTicket {
  id: string;
  agentId: string;
  status: string;
  riskTier: string;
  actionName: string;
  requestPayload: string | null;
  approver: string | null;
  approverReason: string | null;
  holdId: string | null;
  createdAt: number;
  expiresAt: number;
  decidedAt: number | null;
}

/**
 * Insert a new HITL ticket with status='pending'.
 *
 * @param db - DB client
 * @param params - Ticket creation parameters
 * @returns ticketId (UUID) — also used as Cloudflare Workflows instance ID
 */
export async function createTicket(db: DbClient, params: CreateTicketParams): Promise<string> {
  const ticketId = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + params.ttlSeconds * 1000;

  await db.insert(hitlQueue).values({
    id: ticketId,
    agentId: params.agentId,
    status: 'pending',
    riskTier: params.riskTier,
    actionName: params.actionName,
    requestPayload: params.requestPayload,
    approver: null,
    approverReason: null,
    holdId: params.holdId,
    createdAt: now,
    expiresAt,
    decidedAt: null,
  });

  return ticketId;
}

/**
 * Retrieve a ticket by ID.
 *
 * @param db - DB client
 * @param ticketId - Ticket UUID to retrieve
 * @returns HitlTicket or null if not found
 */
export async function getTicket(db: DbClient, ticketId: string): Promise<HitlTicket | null> {
  const rows = await db
    .select()
    .from(hitlQueue)
    .where(eq(hitlQueue.id, ticketId))
    .limit(1);

  if (rows.length === 0) return null;
  return rows[0] as HitlTicket;
}

export interface TransitionOptions {
  approver?: string;
  reason?: string;
  decidedAt?: number;
}

/**
 * Transition a ticket to a new status and optionally record decision metadata.
 *
 * @param db - DB client
 * @param ticketId - Ticket UUID to update
 * @param status - New status: 'approved' | 'denied' | 'expired'
 * @param opts - Optional approver, reason, and decidedAt timestamp
 */
export async function transitionStatus(
  db: DbClient,
  ticketId: string,
  status: 'approved' | 'denied' | 'expired',
  opts?: TransitionOptions,
): Promise<void> {
  const updates: Record<string, unknown> = { status };

  if (opts?.approver !== undefined) updates.approver = opts.approver;
  if (opts?.reason !== undefined) updates.approverReason = opts.reason;
  if (opts?.decidedAt !== undefined) {
    updates.decidedAt = opts.decidedAt;
  } else {
    updates.decidedAt = Date.now();
  }

  await db
    .update(hitlQueue)
    .set(updates as Parameters<ReturnType<DbClient['update']>['set']>[0])
    .where(and(eq(hitlQueue.id, ticketId), eq(hitlQueue.status, 'pending')));
}

/** Workflow retries reuse the instance ID and atomically persist its suspension audit. */
export async function persistWorkflowTicket(db: DbClient, id: string, params: CreateTicketParams): Promise<HitlTicket> {
  if (!Number.isFinite(params.ttlSeconds) || params.ttlSeconds <= 0) throw new Error('Invalid HITL TTL');
  await auditedWrite(db, async () => {
    const existing = await getTicket(db, id);
    if (existing) {
      if (existing.agentId !== params.agentId || existing.holdId !== params.holdId || existing.requestPayload !== params.requestPayload) {
        throw new Error('HITL ticket identity mismatch');
      }
      return null;
    }
    const now = Date.now();
    return {
      event: { eventType: 'hitl_suspended', agentId: params.agentId, model: '', costDelta: 0,
        runningBalance: 0, meta: { ticketId: id, actionName: params.actionName, riskTier: params.riskTier, holdId: params.holdId } },
      condition: { sql: 'NOT EXISTS(SELECT 1 FROM hitl_queue WHERE id=?)', args: [id] },
      statements: hash => [{
        sql: `INSERT INTO hitl_queue (id,agent_id,status,risk_tier,action_name,request_payload,hold_id,created_at,expires_at)
              SELECT ?,?,'pending',?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM audit_log WHERE hash=?)`,
        args: [id, params.agentId, params.riskTier, params.actionName, params.requestPayload, params.holdId, now, now + params.ttlSeconds * 1000, hash],
      }],
    };
  });
  return (await getTicket(db, id))!;
}

/** No provider dispatch happens in this workflow, including approval: release its hold. */
export async function finalizeWorkflowTicket(
  db: DbClient, id: string, decision: { decision: 'approved' | 'denied' | 'expired'; actor: string; reason?: string },
): Promise<void> {
  const ticket = await getTicket(db, id);
  if (!ticket) throw new Error('HITL ticket not found');
  // Settlement is independently atomic/idempotent. A crash after it is safely retried
  // before marking the ticket terminal; terminal success never leaves a live hold.
  if (ticket.holdId) await settleHold(db, ticket.holdId, 0);
  await auditedWrite(db, async () => {
    const current = await getTicket(db, id);
    if (!current || current.status !== 'pending') return null;
    const now = Date.now();
    const status = now >= current.expiresAt ? 'expired' : decision.decision;
    const actor = status === 'expired' ? 'system' : decision.actor;
    const reason = status === 'expired' ? 'TTL expired' : decision.reason;
    return {
      event: { eventType: status === 'approved' ? 'hitl_approved' : status === 'expired' ? 'hitl_expired' : 'hitl_denied',
        agentId: current.agentId, model: '', costDelta: 0, runningBalance: 0,
        meta: { ticketId: id, decision: status, actor, reason, actionName: current.actionName, holdId: current.holdId } },
      condition: { sql: "EXISTS(SELECT 1 FROM hitl_queue WHERE id=? AND status='pending')", args: [id] },
      statements: hash => [{
        sql: 'UPDATE hitl_queue SET status=?,approver=?,approver_reason=?,decided_at=? WHERE id=? AND EXISTS(SELECT 1 FROM audit_log WHERE hash=?)',
        args: [status, actor, reason ?? null, now, id, hash],
      }],
    };
  });
}
