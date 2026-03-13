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
 * Estimate the number of input tokens for a request using a character-based heuristic.
 *
 * Heuristic: sum all message content character counts ÷ 4 (GPT tokenization approximation).
 * Rounds up to the nearest integer.
 */
export function estimateInputTokens(request: ChatCompletionRequest): number {
  const totalChars = request.messages.reduce((sum, msg) => sum + (msg.content?.length ?? 0), 0);
  return Math.ceil(totalChars / 4);
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
