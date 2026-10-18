/**
 * Retry engine with exponential backoff and jitter for the agentgov proxy.
 *
 * Features:
 * - Only confirmed transient rejections (429) are retried.
 * - Full-jitter exponential backoff (https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
 * - Retry-After header support
 * - Configurable via AGENTGOV_MAX_RETRIES and AGENTGOV_RETRY_BASE_MS env vars
 * - Audit logging for every error decision
 * - Confirmed rejections release holds; ambiguous transport/5xx failures charge the reservation.
 *
 * IMPORTANT: forwardWithRetry is on the hot path (awaited in the request handler),
 * NOT in waitUntil(). The caller needs the response from the retry engine.
 */

import { classifyHttpError } from './classifier';
import { buildAgentErrorResponse } from './reporter';
import { appendAuditEvent } from '../audit/writer';
import { budgetSettle } from '../budget/gate';
import type { DbClient } from '../db/client';
import type { AgentId, HoldId } from '../types';

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  capMs: number;
}

/**
 * Parse retry configuration from environment variables.
 * Defaults: maxRetries=3, baseDelayMs=1000, capMs=30000 (fixed).
 */
export function parseRetryConfig(env: Record<string, string | undefined>): RetryConfig {
  const maxRetriesRaw = parseInt(env.AGENTGOV_MAX_RETRIES ?? '', 10);
  const baseDelayMsRaw = parseInt(env.AGENTGOV_RETRY_BASE_MS ?? '', 10);

  return {
    maxRetries: Number.isNaN(maxRetriesRaw) ? 3 : Math.max(0, Math.min(5, maxRetriesRaw)),
    baseDelayMs: Number.isNaN(baseDelayMsRaw) ? 1000 : Math.max(0, Math.min(30000, baseDelayMsRaw)),
    capMs: 30000,
  };
}

/**
 * Calculate full-jitter exponential backoff delay in milliseconds.
 *
 * Full jitter: Math.random() * min(cap, base * 2^attempt)
 * This produces uniform distribution [0, cap_for_attempt] which reduces
 * thundering herd problems better than capped exponential.
 *
 * @param attempt - Zero-based retry attempt number
 * @param config - Retry configuration
 * @returns Delay in milliseconds (integer)
 */
export function calcBackoffMs(attempt: number, config: RetryConfig): number {
  const uncapped = config.baseDelayMs * Math.pow(2, attempt);
  const cap = Math.min(config.capMs, uncapped);
  return Math.floor(Math.random() * cap);
}

/**
 * Sleep for a given number of milliseconds.
 * Uses setTimeout (available in Workers per WinterCG spec).
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Forward a request with automatic retry on transient errors.
 *
 * Loop from attempt=0 to config.maxRetries (inclusive) = maxRetries+1 total attempts.
 * - On success (response.ok): return immediately
 * - On permanent error: settle hold at 0, return structured 502 permanent_error response
 * - On last attempt transient: settle hold at 0, return structured 502 retry_exhausted response
 * - On non-last transient: sleep (Retry-After or calcBackoffMs), then retry
 *
 * Every non-ok response logs error_classified.
 * Retries log retry_attempt (with delayMs).
 * Halts log permanent_error or retry_exhausted.
 *
 * @param requestFn - Function that performs the HTTP request, returns Response
 * @param config - Retry configuration
 * @param db - DB client for audit logging
 * @param holdId - Budget hold ID to settle on halt
 * @param agentId - Agent ID for audit events
 * @param model - Model name for audit events
 * @param sleepFn - Injectable sleep function (default: real setTimeout-based sleep)
 */
export async function forwardWithRetry(
  requestFn: () => Promise<Response>,
  config: RetryConfig,
  db: DbClient,
  holdId: HoldId,
  agentId: AgentId,
  model: string,
  sleepFn: (ms: number) => Promise<void> = sleep,
): Promise<Response> {
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    let response: Response;
    try {
      response = await requestFn();
    } catch {
      // Transport failure may occur after inference began. Never retry or release for free.
      await budgetSettle(db, holdId, null, model, agentId);
      return Response.json({ error: 'provider transport failed; usage unknown' }, { status: 502 });
    }

    // Success — return immediately, no error handling needed
    if (response.ok) {
      return response;
    }

    // Only explicit rate-limit rejection is safe to replay. Unknown statuses may
    // follow paid work; do not infer safety from a classifier category.
    const definitiveRejection = [400, 401, 403, 404, 422].includes(response.status);
    if (response.status !== 429 && !definitiveRejection) {
      void response.body?.cancel().catch(() => {});
      await budgetSettle(db, holdId, null, model, agentId);
      return Response.json({ error: 'provider failed; usage unknown' }, { status: 502 });
    }
    void response.body?.cancel().catch(() => {});
    const classified = classifyHttpError(response.status);

    // Always log error_classified for every non-2xx response
    await appendAuditEvent(db, {
      eventType: 'error_classified',
      agentId,
      model,
      costDelta: 0,
      runningBalance: 0,
      meta: {
        holdId,
        status: response.status,
        errorClass: classified.class,
        retryable: classified.retryable,
        attempt,
      },
    });

    // Permanent error — halt immediately, no retry
    if (definitiveRejection) {
      await appendAuditEvent(db, {
        eventType: 'permanent_error',
        agentId,
        model,
        costDelta: 0,
        runningBalance: 0,
        meta: {
          holdId,
          status: response.status,
          errorClass: classified.class,
          attempt,
        },
      });

      // Release hold at 0 cost
      await budgetSettle(db, holdId, { promptTokens: 0, completionTokens: 0 }, model, agentId);

      return buildAgentErrorResponse('permanent_error', agentId, classified, response.status);
    }

    // Last attempt — retry_exhausted
    if (attempt === config.maxRetries) {
      await appendAuditEvent(db, {
        eventType: 'retry_exhausted',
        agentId,
        model,
        costDelta: 0,
        runningBalance: 0,
        meta: {
          holdId,
          status: response.status,
          errorClass: classified.class,
          maxRetries: config.maxRetries,
        },
      });

      // Release hold at 0 cost
      await budgetSettle(db, holdId, { promptTokens: 0, completionTokens: 0 }, model, agentId);

      return buildAgentErrorResponse('retry_exhausted', agentId, classified, response.status);
    }

    // Transient error — calculate delay and retry
    const retryAfterHeader = response.headers.get('Retry-After');
    const retryAfterSecs = retryAfterHeader !== null ? parseInt(retryAfterHeader, 10) : NaN;
    const delayMs = !Number.isNaN(retryAfterSecs)
      ? Math.max(0, Math.min(config.capMs, retryAfterSecs * 1000))
      : calcBackoffMs(attempt, config);

    await appendAuditEvent(db, {
      eventType: 'retry_attempt',
      agentId,
      model,
      costDelta: 0,
      runningBalance: 0,
      meta: {
        holdId,
        status: response.status,
        errorClass: classified.class,
        attempt,
        nextAttempt: attempt + 1,
        delayMs,
      },
    });

    try { await sleepFn(delayMs); } catch {
      // Every attempted request was definitively rejected; interruption during backoff costs zero.
      await budgetSettle(db, holdId, { promptTokens: 0, completionTokens: 0 }, model, agentId);
      return Response.json({ error: 'provider retry interrupted' }, { status: 502 });
    }
  }

  // This line is unreachable — the loop always returns inside the body.
  // TypeScript requires it for exhaustiveness.
  throw new Error('forwardWithRetry: unreachable — loop did not return');
}
