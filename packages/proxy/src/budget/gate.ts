/**
 * Budget gate — Hold/Settle pattern for budget enforcement.
 *
 * budgetGate: called BEFORE forwarding any request to the LLM.
 *   - Blocks unknown models (fails closed — no budget bypass possible via unknown model name)
 *   - Blocks when budget is exhausted (returns { action: 'block', reason: 'budget_exceeded' })
 *   - Creates a Hold reservation when budget is sufficient (returns { action: 'pass', holdId })
 *   - Writes an audit event for EVERY decision (pass AND block)
 *
 * budgetSettle: called AFTER the LLM response arrives.
 *   - Settles the hold to actual token cost
 *   - Writes 'budget_settle' audit event
 *
 * Only operator-provisioned agents may consume budget; request IDs never create grants.
 */

import { estimateCost, estimateInputTokens, settleCost } from './calculator';
import { createHold, settleHold, getBudget } from './ledger';
import { appendAuditEvent } from '../audit/writer';
import type { DbClient } from '../db/client';
import type { AgentId, HoldId, ChatCompletionRequest, GateResult } from '../types';

export interface GateContext {
  db: DbClient;
  agentId: AgentId;
  request: ChatCompletionRequest;
  subject?: string;
}

/**
 * Evaluate budget gate before forwarding a request.
 *
 * Every code path through this function writes an audit event.
 */
export async function budgetGate(ctx: GateContext): Promise<GateResult> {
  const { db, agentId, request } = ctx;
  const model = request.model;

  // Request-controlled agent IDs must never create a fresh budget grant.
  if (!await getBudget(db, agentId)) {
    await appendAuditEvent(db, { eventType: 'budget_blocked', agentId, model,
      costDelta: 0, runningBalance: 0, meta: { reason: 'unknown_agent' } });
    return { action: 'block', reason: 'unknown_agent' };
  }

  // Step 1: Estimate cost — throws on unknown model (fails closed)
  let estimatedCost: number;
  try {
    const inputTokens = estimateInputTokens(request);
    // Pessimistic output estimate: use max_tokens or default 4096
    const outputTokens = request.max_tokens ?? 4096;
    estimatedCost = estimateCost(model, { inputTokens, outputTokens });
  } catch (err) {
    // Unknown model — block immediately, fail closed
    const budget = await getBudget(db, agentId);
    const runningBalance = budget ? budget.limitUsd - budget.spentUsd - budget.reservedUsd : 0;

    await appendAuditEvent(db, {
      eventType: 'budget_blocked',
      agentId,
      model,
      costDelta: 0,
      runningBalance,
      meta: { reason: 'unknown_model', error: (err as Error).message },
    });

    return { action: 'block', reason: 'unknown_model' };
  }

  // Step 3: Attempt to create hold
  const holdResult = await createHold(db, agentId, model, estimatedCost, ctx.subject);

  if (holdResult.approved) {
    // The reservation and budget_hold audit committed together.
    return { action: 'pass', holdId: holdResult.holdId };
  } else {
    // Block — budget exceeded
    const budget = await getBudget(db, agentId);
    const spent = budget ? budget.spentUsd : 0;
    const limit = budget ? budget.limitUsd : 0;

    await appendAuditEvent(db, {
      eventType: 'budget_blocked',
      agentId,
      model,
      costDelta: 0,
      runningBalance: holdResult.remaining,
      meta: { reason: 'budget_exceeded', remaining: holdResult.remaining, spent, limit },
    });

    return { action: 'block', reason: 'budget_exceeded' };
  }
}

/**
 * Settle a hold after the LLM response arrives.
 *
 * Called with actual token counts from the LLM response.
 * Writes a 'budget_settle' audit event.
 */
export async function budgetSettle(
  db: DbClient,
  holdId: HoldId,
  actualUsage: { promptTokens: number; completionTokens: number } | null,
  model: string,
  agentId: AgentId
): Promise<void> {
  if (actualUsage && (![actualUsage.promptTokens, actualUsage.completionTokens].every(n => Number.isSafeInteger(n) && n >= 0))) {
    throw new Error('Invalid settlement usage');
  }
  const actualCost = actualUsage === null ? null : settleCost(model, actualUsage);
  await settleHold(db, holdId, actualCost, { model, agentId, actualUsage });
}
