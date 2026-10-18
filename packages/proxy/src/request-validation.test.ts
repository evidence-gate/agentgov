import { describe, expect, it } from 'vitest';
import { validateChatRequest } from './request-validation';
import { estimateInputTokens } from './budget/calculator';

const request = { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hello' }] };

describe('budget-compatible request boundary', () => {
  it('makes the reserved output limit explicit in the forwarded body', () => {
    expect(validateChatRequest(request).max_tokens).toBe(4096);
  });
  it('rejects malformed shape and unsupported pricing dimensions', () => {
    for (const value of [null, [], {}, { ...request, messages: null }, { ...request, messages: [] },
      { ...request, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: 'x' }] }] },
      { ...request, n: 2 }, { ...request, max_completion_tokens: 1000000 },
      { ...request, modalities: ['audio'] }, { ...request, stream: 'true' }]) {
      expect(() => validateChatRequest(value)).toThrow();
    }
  });
  it('rejects negative, zero, fractional, nonfinite and excessive output limits', () => {
    for (const max_tokens of [-1000, 0, 0.5, NaN, Infinity, '5', 65537]) {
      expect(() => validateChatRequest({ ...request, max_tokens })).toThrow();
    }
  });
  it('includes tool definitions, arguments and UTF-8 bytes in input reservation', () => {
    const toolRequest = validateChatRequest({ ...request, tools: [{ type: 'function', function: { name: 'x', description: 'あ'.repeat(1000) } }] });
    expect(estimateInputTokens(toolRequest)).toBeGreaterThan(3000);
    expect(estimateInputTokens(toolRequest)).toBeGreaterThan(estimateInputTokens(request));
    const argumentRequest = validateChatRequest({ ...request, messages: [{ role: 'assistant', content: null,
      tool_calls: [{ id: 'x', type: 'function', function: { name: 'read_file', arguments: 'x'.repeat(1000) } }] }] });
    expect(estimateInputTokens(argumentRequest)).toBeGreaterThan(1000);
  });
});
