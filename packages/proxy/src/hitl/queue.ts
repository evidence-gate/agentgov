/**
 * HITL queue — Turso CRUD for hitl_queue table.
 *
 * Uses the same Drizzle fluent query pattern as budget/ledger.ts.
 * Concurrency note: NOT wrapped in DB transactions (Turso HTTP doesn't support
 * interactive transactions). Same documented race condition as Phase 1 ledger.ts.
 */

import { eq } from 'drizzle-orm';
import { hitlQueue } from '../db/schema';
import type { DbClient } from '../db/client';
import type { RiskTier } from './classifier';

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
    .where(eq(hitlQueue.id, ticketId));
}
