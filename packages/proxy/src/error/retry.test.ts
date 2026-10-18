import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calcBackoffMs, parseRetryConfig, forwardWithRetry, type RetryConfig } from './retry';

// ---------------------------------------------------------------------------
// calcBackoffMs tests
// ---------------------------------------------------------------------------
describe('calcBackoffMs', () => {
  const config: RetryConfig = { maxRetries: 3, baseDelayMs: 1000, capMs: 30000 };

  it('returns value in [0, 1000] for attempt 0', () => {
    for (let i = 0; i < 20; i++) {
      const ms = calcBackoffMs(0, config);
      expect(ms).toBeGreaterThanOrEqual(0);
      expect(ms).toBeLessThanOrEqual(1000);
    }
  });

  it('returns value in [0, 4000] for attempt 2', () => {
    for (let i = 0; i < 20; i++) {
      const ms = calcBackoffMs(2, config);
      expect(ms).toBeGreaterThanOrEqual(0);
      expect(ms).toBeLessThanOrEqual(4000);
    }
  });

  it('returns value in [0, 30000] for attempt 10 (capped at capMs)', () => {
    for (let i = 0; i < 20; i++) {
      const ms = calcBackoffMs(10, config);
      expect(ms).toBeGreaterThanOrEqual(0);
      expect(ms).toBeLessThanOrEqual(30000);
    }
  });

  it('returns integer values', () => {
    const ms = calcBackoffMs(1, config);
    expect(Number.isInteger(ms)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseRetryConfig tests
// ---------------------------------------------------------------------------
describe('parseRetryConfig', () => {
  it('returns defaults when env is empty', () => {
    const config = parseRetryConfig({});
    expect(config.maxRetries).toBe(3);
    expect(config.baseDelayMs).toBe(1000);
    expect(config.capMs).toBe(30000);
  });

  it('parses AGENTGOV_MAX_RETRIES from env', () => {
    const config = parseRetryConfig({ AGENTGOV_MAX_RETRIES: '5' });
    expect(config.maxRetries).toBe(5);
  });

  it('parses AGENTGOV_RETRY_BASE_MS from env', () => {
    const config = parseRetryConfig({ AGENTGOV_RETRY_BASE_MS: '500' });
    expect(config.baseDelayMs).toBe(500);
  });

  it('parses both env vars together', () => {
    const config = parseRetryConfig({ AGENTGOV_MAX_RETRIES: '5', AGENTGOV_RETRY_BASE_MS: '500' });
    expect(config.maxRetries).toBe(5);
    expect(config.baseDelayMs).toBe(500);
    expect(config.capMs).toBe(30000);
  });

  it('uses defaults for invalid/NaN env values', () => {
    const config = parseRetryConfig({ AGENTGOV_MAX_RETRIES: 'not-a-number' });
    expect(config.maxRetries).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// forwardWithRetry tests
// ---------------------------------------------------------------------------

// Mock the dependencies
vi.mock('../audit/writer', () => ({
  appendAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../budget/gate', () => ({
  budgetSettle: vi.fn().mockResolvedValue(undefined),
}));

import { appendAuditEvent } from '../audit/writer';
import { budgetSettle } from '../budget/gate';

const mockAppendAuditEvent = appendAuditEvent as ReturnType<typeof vi.fn>;
const mockBudgetSettle = budgetSettle as ReturnType<typeof vi.fn>;

function makeDbMock() {
  return {} as Parameters<typeof forwardWithRetry>[2];
}

const holdId = 'hold-abc-123';
const agentId = 'agent-test-1';
const model = 'gpt-4o';
const baseConfig: RetryConfig = { maxRetries: 3, baseDelayMs: 10, capMs: 100 };

// Helper: create a mock requestFn that returns given statuses in sequence
function makeRequestFn(statuses: number[]): () => Promise<Response> {
  let call = 0;
  return vi.fn(async () => {
    const status = statuses[call] ?? statuses[statuses.length - 1];
    call++;
    return new Response(JSON.stringify({ success: status === 200 }), {
      status,
      headers: { 'Content-Type': 'application/json' },
      ok: status >= 200 && status < 300,
    } as ResponseInit);
  });
}

// Helper that actually sets ok correctly
function makeResponses(statuses: number[]): () => Promise<Response> {
  let call = 0;
  return vi.fn(async () => {
    const status = statuses[Math.min(call, statuses.length - 1)];
    call++;
    return new Response(JSON.stringify({ ok: status < 400 }), {
      status,
    });
  });
}

describe('forwardWithRetry', () => {
  const sleepFn = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    mockAppendAuditEvent.mockClear();
    mockBudgetSettle.mockClear();
    sleepFn.mockClear();
  });

  it('returns successful response immediately (200, no retry needed)', async () => {
    const requestFn = makeResponses([200]);
    const response = await forwardWithRetry(requestFn, baseConfig, makeDbMock(), holdId, agentId, model, sleepFn);
    expect(response.ok).toBe(true);
    expect(requestFn).toHaveBeenCalledTimes(1);
  });

  it('retries confirmed 429 rejections then returns 200', async () => {
    const requestFn = makeResponses([429, 429, 200]);
    const response = await forwardWithRetry(requestFn, baseConfig, makeDbMock(), holdId, agentId, model, sleepFn);
    expect(response.ok).toBe(true);
    expect(requestFn).toHaveBeenCalledTimes(3);
  });

  it('halts immediately on 401 (permanent error, 1 call only)', async () => {
    const requestFn = makeResponses([401]);
    const response = await forwardWithRetry(requestFn, baseConfig, makeDbMock(), holdId, agentId, model, sleepFn);
    expect(requestFn).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(502);
    const body = await response.json() as { error: { type: string } };
    expect(body.error.type).toBe('permanent_error');
  });

  it('settles hold at 0 cost on permanent_error halt', async () => {
    const requestFn = makeResponses([401]);
    await forwardWithRetry(requestFn, baseConfig, makeDbMock(), holdId, agentId, model, sleepFn);
    expect(mockBudgetSettle).toHaveBeenCalledWith(
      expect.anything(),
      holdId,
      { promptTokens: 0, completionTokens: 0 },
      model,
      agentId,
    );
  });

  it('returns retry_exhausted after maxRetries+1 attempts with 429', async () => {
    const config: RetryConfig = { maxRetries: 3, baseDelayMs: 10, capMs: 100 };
    const requestFn = makeResponses([429, 429, 429, 429]);
    const response = await forwardWithRetry(requestFn, config, makeDbMock(), holdId, agentId, model, sleepFn);
    expect(requestFn).toHaveBeenCalledTimes(4); // attempt 0,1,2,3
    expect(response.status).toBe(502);
    const body = await response.json() as { error: { type: string } };
    expect(body.error.type).toBe('retry_exhausted');
  });

  it('settles hold at 0 cost on retry_exhausted', async () => {
    const config: RetryConfig = { maxRetries: 3, baseDelayMs: 10, capMs: 100 };
    const requestFn = makeResponses([429, 429, 429, 429]);
    await forwardWithRetry(requestFn, config, makeDbMock(), holdId, agentId, model, sleepFn);
    expect(mockBudgetSettle).toHaveBeenCalledWith(
      expect.anything(),
      holdId,
      { promptTokens: 0, completionTokens: 0 },
      model,
      agentId,
    );
  });

  it('respects Retry-After header over computed backoff', async () => {
    let call = 0;
    const requestFn = vi.fn(async () => {
      call++;
      if (call === 1) {
        const r = new Response(JSON.stringify({}), { status: 429 });
        Object.defineProperty(r, 'headers', {
          value: new Headers({ 'Retry-After': '2' }),
        });
        return r;
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    // Use a version where we can check what sleep was called with
    const capturedSleepFn = vi.fn().mockResolvedValue(undefined);

    // Build response with Retry-After header properly
    const requestFn2 = vi.fn()
      .mockResolvedValueOnce(
        (() => {
          const resp = new Response(JSON.stringify({}), { status: 429 });
          // Headers are read-only so we need a different approach
          // We'll create the response fresh with headers
          return new Response(JSON.stringify({}), {
            status: 429,
            headers: { 'Retry-After': '2' },
          });
        })(),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await forwardWithRetry(requestFn2, baseConfig, makeDbMock(), holdId, agentId, model, capturedSleepFn);

    // Should have slept for 2000ms (2s * 1000)
    expect(capturedSleepFn).toHaveBeenCalledWith(100);
  });

  it('logs error_classified audit event on non-2xx response', async () => {
    const requestFn = makeResponses([429, 200]);
    await forwardWithRetry(requestFn, baseConfig, makeDbMock(), holdId, agentId, model, sleepFn);
    const calls = mockAppendAuditEvent.mock.calls as [unknown, { eventType: string }][];
    const errorClassifiedCalls = calls.filter(
      ([, event]) => event.eventType === 'error_classified',
    );
    expect(errorClassifiedCalls.length).toBeGreaterThan(0);
  });

  it('logs retry_attempt audit event when retrying', async () => {
    const requestFn = makeResponses([429, 200]);
    await forwardWithRetry(requestFn, baseConfig, makeDbMock(), holdId, agentId, model, sleepFn);
    const calls = mockAppendAuditEvent.mock.calls as [unknown, { eventType: string }][];
    const retryAttemptCalls = calls.filter(
      ([, event]) => event.eventType === 'retry_attempt',
    );
    expect(retryAttemptCalls.length).toBeGreaterThan(0);
  });

  it('logs permanent_error audit event on permanent halt', async () => {
    const requestFn = makeResponses([401]);
    await forwardWithRetry(requestFn, baseConfig, makeDbMock(), holdId, agentId, model, sleepFn);
    const calls = mockAppendAuditEvent.mock.calls as [unknown, { eventType: string }][];
    const permanentCalls = calls.filter(
      ([, event]) => event.eventType === 'permanent_error',
    );
    expect(permanentCalls.length).toBeGreaterThan(0);
  });

  it('logs retry_exhausted audit event when all retries exhausted', async () => {
    const config: RetryConfig = { maxRetries: 2, baseDelayMs: 10, capMs: 100 };
    const requestFn = makeResponses([429, 429, 429]);
    await forwardWithRetry(requestFn, config, makeDbMock(), holdId, agentId, model, sleepFn);
    const calls = mockAppendAuditEvent.mock.calls as [unknown, { eventType: string }][];
    const exhaustedCalls = calls.filter(
      ([, event]) => event.eventType === 'retry_exhausted',
    );
    expect(exhaustedCalls.length).toBeGreaterThan(0);
  });

  it('does NOT retry on 400 (permanent, halts immediately)', async () => {
    const requestFn = makeResponses([400]);
    await forwardWithRetry(requestFn, baseConfig, makeDbMock(), holdId, agentId, model, sleepFn);
    expect(requestFn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on 403 (permanent, halts immediately)', async () => {
    const requestFn = makeResponses([403]);
    await forwardWithRetry(requestFn, baseConfig, makeDbMock(), holdId, agentId, model, sleepFn);
    expect(requestFn).toHaveBeenCalledTimes(1);
  });

  it('does not retry ambiguous 503; conservatively settles', async () => {
    const requestFn = makeResponses([503, 200]);
    const response = await forwardWithRetry(requestFn, baseConfig, makeDbMock(), holdId, agentId, model, sleepFn);
    expect(requestFn).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(502);
    expect(mockBudgetSettle).toHaveBeenCalledWith(expect.anything(), holdId, null, model, agentId);
  });
});

describe('adversarial retry policy', () => {
  beforeEach(() => { mockBudgetSettle.mockClear(); });
  it.each([301, 302, 307, 308, 402, 408, 409, 418, 425, 451, 500, 502, 503])('does not replay ambiguous status %i', async status => {
    const request = makeResponses([status, 200]);
    const result = await forwardWithRetry(request, baseConfig, makeDbMock(), holdId, agentId, model);
    expect(result.status).toBe(502);
    expect(request).toHaveBeenCalledTimes(1);
    expect(mockBudgetSettle).toHaveBeenCalledExactlyOnceWith(expect.anything(), holdId, null, model, agentId);
  });
  it('clamps invalid retry configuration', () => {
    expect(parseRetryConfig({ AGENTGOV_MAX_RETRIES: '-3', AGENTGOV_RETRY_BASE_MS: '-1' })).toMatchObject({ maxRetries: 0, baseDelayMs: 0 });
    expect(parseRetryConfig({ AGENTGOV_MAX_RETRIES: '99999', AGENTGOV_RETRY_BASE_MS: '9999999' })).toMatchObject({ maxRetries: 5, baseDelayMs: 30000 });
  });
  it('interrupted 429 backoff releases without another provider request', async () => {
    const request = makeResponses([429, 200]);
    await forwardWithRetry(request, baseConfig, makeDbMock(), holdId, agentId, model, async () => { throw new Error('synthetic disconnect'); });
    expect(request).toHaveBeenCalledTimes(1);
    expect(mockBudgetSettle).toHaveBeenCalledExactlyOnceWith(expect.anything(), holdId, { promptTokens: 0, completionTokens: 0 }, model, agentId);
  });
});
