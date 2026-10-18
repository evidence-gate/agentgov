/**
 * Per-request cost estimation and settlement for agentgov proxy.
 *
 * estimateCost: called before forwarding (pessimistic estimate)
 * settleCost: called after response arrives (actual cost from API usage data)
 */

import { loadPricing, getPriceForModel } from './pricing';
import type { ChatCompletionRequest } from '../types';

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
};

// Load pricing once at module load time — cached for the lifetime of the Worker instance.
// console.warn suppressed here; callers should call loadPricing() directly if they need
// staleness feedback at application startup.
let _pricingCache: ReturnType<typeof loadPricing> | null = null;

function getPricing() {
  if (!_pricingCache) {
    _pricingCache = loadPricing();
  }
  return _pricingCache;
}

/**
 * Reserve a conservative text-input upper bound, including tool schemas and
 * arguments. The former characters/4 heuristic omitted non-content fields and
 * underestimated non-ASCII text. UTF-8 bytes plus framing overhead intentionally
 * over-reserve; actual provider usage releases the difference after completion.
 */
export function estimateInputTokens(request: ChatCompletionRequest): number {
  return new TextEncoder().encode(JSON.stringify(request)).length + request.messages.length * 32 + 256;
}

/**
 * Estimate the cost of a request in USD.
 *
 * @throws Error if the model is not in the pricing table — fails closed to prevent budget bypass.
 */
export function estimateCost(model: string, usage: TokenUsage): number {
  const pricing = getPricing();
  const price = getPriceForModel(model, pricing);
  return (usage.inputTokens / 1_000_000) * price.inputPer1m +
    (usage.outputTokens / 1_000_000) * price.outputPer1m;
}

/**
 * Settle the actual cost after an LLM response arrives.
 *
 * Uses actual token counts from the API response (promptTokens / completionTokens).
 *
 * @throws Error if the model is not in the pricing table.
 */
export function settleCost(
  model: string,
  actualUsage: { promptTokens: number; completionTokens: number }
): number {
  const pricing = getPricing();
  const price = getPriceForModel(model, pricing);
  return (actualUsage.promptTokens / 1_000_000) * price.inputPer1m +
    (actualUsage.completionTokens / 1_000_000) * price.outputPer1m;
}
