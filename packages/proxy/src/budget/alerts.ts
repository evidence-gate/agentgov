/**
 * Budget alert webhook — fires notifications at configurable spend thresholds.
 *
 * Idempotent: checks audit_log for prior 'alert_fired' events before firing.
 * Webhook POST failures are caught and logged — never propagated to the caller.
 * Missing webhookUrl is silently ignored.
 */

import { eq, and, sql } from 'drizzle-orm';
import { auditLog } from '../db/schema';
import { getBudget } from './ledger';
import { appendAuditEvent } from '../audit/writer';
import type { DbClient } from '../db/client';
import type { AgentId } from '../types';

export interface AlertPayload {
  event: 'budget_alert';
  agentId: AgentId;
  threshold: number;
  spent: number;
  limit: number;
  timestamp: string; // ISO8601
}

/**
 * Check current budget ratio and fire webhook alerts for uncrossed thresholds.
 *
 * Thresholds should be checked descending (highest first) to fire 100% before 80%.
 *
 * @param db - DB client
 * @param agentId - Agent whose budget to check
 * @param webhookUrl - Webhook URL to POST alerts to; if undefined, silently returns
 * @param thresholds - Alert thresholds as ratios (e.g., [0.80, 1.0])
 */
export async function checkAndFireAlerts(
  db: DbClient,
  agentId: AgentId,
  webhookUrl: string | undefined,
  thresholds: number[],
): Promise<void> {
  // Short-circuit if no webhook configured
  if (!webhookUrl) return;

  // Get current budget state
  const budget = await getBudget(db, agentId);
  if (!budget) return;

  const { spentUsd, limitUsd } = budget;
  if (limitUsd <= 0) return;

  const ratio = spentUsd / limitUsd;

  // Check thresholds in descending order (fire highest first)
  const sortedThresholds = [...thresholds].sort((a, b) => b - a);

  for (const threshold of sortedThresholds) {
    if (ratio < threshold) continue;

    // Check if alert was already fired for this threshold (idempotency via audit_log)
    const alreadyFired = await hasAlertBeenFired(db, agentId, threshold);
    if (alreadyFired) continue;

    // Fire the webhook
    const payload: AlertPayload = {
      event: 'budget_alert',
      agentId,
      threshold,
      spent: spentUsd,
      limit: limitUsd,
      timestamp: new Date().toISOString(),
    };

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      // Webhook failures must NOT propagate to the caller
      console.error(`checkAndFireAlerts: webhook POST failed for threshold ${threshold}:`, err);
      continue; // Don't record audit event if the POST failed
    }

    // Record in audit_log so this threshold isn't fired again
    await appendAuditEvent(db, {
      eventType: 'alert_fired',
      agentId,
      model: '',
      costDelta: 0,
      runningBalance: limitUsd - spentUsd,
      meta: { threshold, webhookUrl },
    });
  }
}

/**
 * Check if an alert has already been fired for a given threshold.
 *
 * Queries audit_log for a row with eventType='alert_fired' and threshold in payload.
 */
async function hasAlertBeenFired(
  db: DbClient,
  agentId: AgentId,
  threshold: number,
): Promise<boolean> {
  const rows = await (db as unknown as {
    select: () => {
      from: (table: unknown) => {
        where: (condition: unknown) => {
          limit: (n: number) => Promise<unknown[]>;
        };
      };
    };
  })
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.agentId, agentId),
        eq(auditLog.eventType, 'alert_fired'),
        sql`json_extract(${auditLog.payload}, '$.threshold') = ${threshold}`,
      ),
    )
    .limit(1);

  return rows.length > 0;
}
