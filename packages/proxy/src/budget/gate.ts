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
 * Default budget limit: $10.00 USD per agent.
 * TODO: replace with config lookup in a later plan (per-agent configurable limits via API).
 */

import { estimateCost, estimateInputTokens, settleCost } from './calculator';
import { ensureAgent, createHold, settleHold, getBudget } from './ledger';
import { appendAuditEvent } from '../audit/writer';
import type { DbClient } from '../db/client';
import type { AgentId, HoldId, ChatCompletionRequest, GateResult } from '../types';

const DEFAULT_BUDGET_LIMIT_USD = 10.0;

export interface GateContext {
  db: DbClient;
  agentId: AgentId;
  request: ChatCompletionRequest;
}

/**
 * Evaluate budget gate before forwarding a request.
 *
 * Every code path through this function writes an audit event.
 */
export async function budgetGate(ctx: GateContext): Promise<GateResult> {
  const { db, agentId, request } = ctx;
  const model = request.model;

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

  // Step 2: Ensure agent has a ledger row (idempotent — does nothing if exists)
  await ensureAgent(db, agentId, DEFAULT_BUDGET_LIMIT_USD);

  // Step 3: Attempt to create hold
  const holdResult = await createHold(db, agentId, model, estimatedCost);

  if (holdResult.approved) {
    // Pass — write 'budget_hold' audit event
    const budget = await getBudget(db, agentId);
    const runningBalance = budget
      ? budget.limitUsd - budget.spentUsd - budget.reservedUsd
      : 0;

    await appendAuditEvent(db, {
      eventType: 'budget_hold',
      agentId,
      model,
      costDelta: estimatedCost,
      runningBalance,
      meta: { holdId: holdResult.holdId, estimatedCost },
    });

    return { action: 'pass', holdId: holdResult.holdId };
  } else {
    // Block — budget exceeded
    const budget = await getBudget(db, agentId);
    const spent = budget ? budget.spentUsd : 0;
    const limit = budget ? budget.limitUsd : DEFAULT_BUDGET_LIMIT_USD;

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
  actualUsage: { promptTokens: number; completionTokens: number },
  model: string,
  agentId: AgentId
): Promise<void> {
  const actualCost = settleCost(model, actualUsage);

  await settleHold(db, holdId, actualCost);

  const budget = await getBudget(db, agentId);
  const runningBalance = budget
    ? budget.limitUsd - budget.spentUsd - budget.reservedUsd
    : 0;

  await appendAuditEvent(db, {
    eventType: 'budget_settle',
    agentId,
    model,
    costDelta: actualCost,
    runningBalance,
    meta: { holdId, actualUsage, actualCost },
  });
}
