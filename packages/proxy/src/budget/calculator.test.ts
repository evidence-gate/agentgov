import { describe, it, expect, beforeAll, vi } from 'vitest';
import { estimateCost, estimateInputTokens, settleCost, type TokenUsage } from './calculator';
import { loadPricing, getPriceForModel, PRICING_STALENESS_DAYS } from './pricing';

// ---- estimateCost tests ----

describe('estimateCost', () => {
  it('returns correct cost for gpt-4o 1000 input tokens', () => {
    // $2.50 per 1M input tokens → 1000 tokens = $0.0025
    const cost = estimateCost('gpt-4o', { inputTokens: 1000, outputTokens: 0 });
    expect(cost).toBeCloseTo(0.0025, 5);
    // ±5% tolerance
    expect(cost).toBeGreaterThanOrEqual(0.0025 * 0.95);
    expect(cost).toBeLessThanOrEqual(0.0025 * 1.05);
  });

  it('returns correct cost for gpt-4o 1000 output tokens', () => {
    // $10.00 per 1M output tokens → 1000 tokens = $0.01
    const cost = estimateCost('gpt-4o', { inputTokens: 0, outputTokens: 1000 });
    expect(cost).toBeCloseTo(0.01, 5);
    // ±5% tolerance
    expect(cost).toBeGreaterThanOrEqual(0.01 * 0.95);
    expect(cost).toBeLessThanOrEqual(0.01 * 1.05);
  });

  it('returns a positive cost for claude-3-5-sonnet', () => {
    const cost = estimateCost('claude-3-5-sonnet-20241022', { inputTokens: 1000, outputTokens: 1000 });
    expect(cost).toBeGreaterThan(0);
  });

  it('throws with "unknown model" message for an unknown model', () => {
    expect(() =>
      estimateCost('unknown-model-xyz', { inputTokens: 1000, outputTokens: 1000 })
    ).toThrow(/unknown model/i);
  });

  it('handles zero tokens gracefully', () => {
    const cost = estimateCost('gpt-4o', { inputTokens: 0, outputTokens: 0 });
    expect(cost).toBe(0);
  });
});

// ---- estimateInputTokens tests ----

describe('estimateInputTokens', () => {
  it('returns a positive integer for a non-empty message', () => {
    const tokens = estimateInputTokens({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hello' }],
    });
    expect(tokens).toBeGreaterThan(0);
    expect(Number.isInteger(tokens)).toBe(true);
  });

  it('returns more tokens for longer content', () => {
    const short = estimateInputTokens({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
    });
    const long = estimateInputTokens({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'a'.repeat(400) }],
    });
    expect(long).toBeGreaterThan(short);
  });
});

// ---- settleCost tests ----

describe('settleCost', () => {
  it('calculates settlement cost from actual usage', () => {
    // Same as estimateCost but uses promptTokens/completionTokens naming
    const cost = settleCost('gpt-4o', { promptTokens: 1000, completionTokens: 500 });
    // $2.50/1M input + $10.00/1M output
    // = 0.0025 + 0.005 = 0.0075
    expect(cost).toBeCloseTo(0.0075, 5);
    expect(cost).toBeGreaterThan(0);
  });

  it('throws for unknown model on settlement too', () => {
    expect(() =>
      settleCost('unknown-model-xyz', { promptTokens: 100, completionTokens: 50 })
    ).toThrow(/unknown model/i);
  });
});

// ---- Pricing staleness tests ----

describe('loadPricing staleness check', () => {
  it('exports PRICING_STALENESS_DAYS constant equal to 30', () => {
    expect(PRICING_STALENESS_DAYS).toBe(30);
  });

  it('loadPricing returns a models map with gpt-4o entry', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pricing = loadPricing();
    warnSpy.mockRestore();
    expect(pricing).toBeDefined();
    expect(pricing['gpt-4o']).toBeDefined();
    expect(pricing['gpt-4o'].inputPer1m).toBeGreaterThan(0);
    expect(pricing['gpt-4o'].outputPer1m).toBeGreaterThan(0);
  });

  it('emits console.warn when pricing is stale', () => {
    // We test via getPriceForModel via a stale pricing table — can't easily mock file timestamp
    // Instead verify the warning behavior via direct test of the stale path
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Import is module-level, loadPricing reads last_updated from the JSON file.
    // For coverage, call it and spy:
    loadPricing({ forceStale: true });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('pricing data is stale'));
    warnSpy.mockRestore();
  });

  it('does NOT emit console.warn when pricing is fresh', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    loadPricing({ forceStale: false });
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ---- getPriceForModel tests ----

describe('getPriceForModel', () => {
  it('returns pricing entry for known models', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pricing = loadPricing();
    warnSpy.mockRestore();
    const price = getPriceForModel('gpt-4o', pricing);
    expect(price.inputPer1m).toBe(2.5);
    expect(price.outputPer1m).toBe(10.0);
  });

  it('throws for unknown model', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pricing = loadPricing();
    warnSpy.mockRestore();
    expect(() => getPriceForModel('unknown-model-xyz', pricing)).toThrow(/unknown model/i);
  });
});
