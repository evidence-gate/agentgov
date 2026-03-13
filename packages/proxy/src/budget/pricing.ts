/**
 * Pricing table loader for agentgov proxy.
 *
 * Reads pricing.json at module load time (bundled by Wrangler/Vite at build time).
 * Emits a console.warn if the table is more than 30 days old.
 */

import pricingData from '../../pricing.json';

export const PRICING_STALENESS_DAYS = 30;

export interface ModelPrice {
  inputPer1m: number;
  outputPer1m: number;
}

export type PricingTable = Record<string, ModelPrice>;

// Normalize the JSON format (snake_case keys in JSON → camelCase in TS)
function normalizePricing(raw: typeof pricingData): PricingTable {
  const table: PricingTable = {};
  for (const [model, prices] of Object.entries(raw.models)) {
    table[model] = {
      inputPer1m: prices.input_per_1m,
      outputPer1m: prices.output_per_1m,
    };
  }
  return table;
}

/**
 * Load the pricing table.
 *
 * @param options.forceStale - For testing: override staleness check. If true, forces
 *   the stale warning. If false, forces no warning. If undefined, checks actual date.
 */
export function loadPricing(options?: { forceStale?: boolean }): PricingTable {
  const table = normalizePricing(pricingData);

  let isStale: boolean;
  if (options?.forceStale === true) {
    isStale = true;
  } else if (options?.forceStale === false) {
    isStale = false;
  } else {
    // Check real date
    const lastUpdated = new Date(pricingData.last_updated);
    const now = new Date();
    const daysDiff = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
    isStale = daysDiff > PRICING_STALENESS_DAYS;
  }

  if (isStale) {
    console.warn(
      'agentgov: pricing data is stale (>30 days). Run agentgov pricing sync.'
    );
  }

  return table;
}

/**
 * Look up a model in the pricing table.
 *
 * @throws Error if the model is not found — agentgov fails closed on unknown models
 *   to prevent budget bypass via unknown model names.
 */
export function getPriceForModel(model: string, pricing: PricingTable): ModelPrice {
  const price = pricing[model];
  if (!price) {
    throw new Error(
      `unknown model: ${model}. agentgov fails closed on unknown models to prevent budget bypass.`
    );
  }
  return price;
}
