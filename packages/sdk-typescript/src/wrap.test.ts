import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentError, type AgentErrorBody, BudgetExceeded, HitlPending, type HitlPendingBody } from './errors';
import { createAgentgovFetch, buildProxyBaseUrl } from './interceptor';
import { wrap } from './wrap';

// ---------------------------------------------------------------------------
// BudgetExceeded tests
// ---------------------------------------------------------------------------
describe('BudgetExceeded', () => {
  it('is an instance of Error', () => {
    const body = {
      error: {
        code: 'BUDGET_EXCEEDED' as const,
        message: 'Budget exceeded',
        budgetId: 'agent-1',
        spent: 9.5,
        limit: 10.0,
      },
    };
    const err = new BudgetExceeded('Budget exceeded', body);
    expect(err).toBeInstanceOf(Error);
  });

  it('has code BUDGET_EXCEEDED', () => {
    const body = {
      error: {
        code: 'BUDGET_EXCEEDED' as const,
        message: 'Budget exceeded',
        budgetId: 'agent-1',
        spent: 9.5,
        limit: 10.0,
      },
    };
    const err = new BudgetExceeded('Budget exceeded', body);
    expect(err.code).toBe('BUDGET_EXCEEDED');
  });

  it('exposes spent and limit from error body', () => {
    const body = {
      error: {
        code: 'BUDGET_EXCEEDED' as const,
        message: 'Budget exceeded',
        budgetId: 'agent-99',
        spent: 7.25,
        limit: 8.0,
      },
    };
    const err = new BudgetExceeded('Budget exceeded', body);
    expect(err.spent).toBe(7.25);
    expect(err.limit).toBe(8.0);
    expect(err.budgetId).toBe('agent-99');
  });

  it('has name BudgetExceeded', () => {
    const body = {
      error: {
        code: 'BUDGET_EXCEEDED' as const,
        message: 'x',
        budgetId: 'agent-1',
        spent: 0,
        limit: 1,
      },
    };
    const err = new BudgetExceeded('x', body);
    expect(err.name).toBe('BudgetExceeded');
  });
});

// ---------------------------------------------------------------------------
// buildProxyBaseUrl tests
// ---------------------------------------------------------------------------
describe('buildProxyBaseUrl', () => {
  it('strips trailing slash', () => {
    expect(buildProxyBaseUrl('http://localhost:8787/')).toBe('http://localhost:8787');
  });

  it('preserves URL with no trailing slash', () => {
    expect(buildProxyBaseUrl('https://proxy.example.com')).toBe('https://proxy.example.com');
  });

  it('preserves https:// scheme', () => {
    expect(buildProxyBaseUrl('https://proxy.example.com/')).toBe('https://proxy.example.com');
  });

  it('preserves http:// scheme', () => {
    expect(buildProxyBaseUrl('http://localhost:9000/')).toBe('http://localhost:9000');
  });
});

// ---------------------------------------------------------------------------
// createAgentgovFetch tests
// ---------------------------------------------------------------------------
describe('createAgentgovFetch', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns a fetch-compatible function', () => {
    const agentFetch = createAgentgovFetch({ proxyUrl: 'http://proxy:8787', agentId: 'agent-1' });
    expect(typeof agentFetch).toBe('function');
  });

  it('rewrites OpenAI URL to proxy URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    global.fetch = mockFetch;

    const agentFetch = createAgentgovFetch({ proxyUrl: 'http://proxy:8787', agentId: 'agent-1' });
    await agentFetch('https://api.openai.com/v1/chat/completions', { method: 'POST' });

    expect(mockFetch).toHaveBeenCalledOnce();
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toBe('http://proxy:8787/v1/chat/completions');
  });

  it('injects X-Agent-Id header', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    global.fetch = mockFetch;

    const agentFetch = createAgentgovFetch({ proxyUrl: 'http://proxy:8787', agentId: 'my-agent-42' });
    await agentFetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const calledHeaders: Headers = mockFetch.mock.calls[0][1].headers;
    expect(calledHeaders.get('X-Agent-Id')).toBe('my-agent-42');
  });

  it('preserves existing headers alongside X-Agent-Id', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    global.fetch = mockFetch;

    const agentFetch = createAgentgovFetch({ proxyUrl: 'http://proxy:8787', agentId: 'agent-x' });
    await agentFetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sk-test' },
    });

    const calledHeaders: Headers = mockFetch.mock.calls[0][1].headers;
    expect(calledHeaders.get('Content-Type')).toBe('application/json');
    expect(calledHeaders.get('Authorization')).toBe('Bearer sk-test');
    expect(calledHeaders.get('X-Agent-Id')).toBe('agent-x');
  });

  it('throws BudgetExceeded when proxy returns 429 with BUDGET_EXCEEDED code', async () => {
    const budgetExceededBody = {
      error: {
        code: 'BUDGET_EXCEEDED',
        message: 'Budget exceeded for agent-1',
        budgetId: 'agent-1',
        spent: 10.0,
        limit: 10.0,
      },
    };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(budgetExceededBody), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    global.fetch = mockFetch;

    const agentFetch = createAgentgovFetch({ proxyUrl: 'http://proxy:8787', agentId: 'agent-1' });
    await expect(
      agentFetch('https://api.openai.com/v1/chat/completions', { method: 'POST' }),
    ).rejects.toThrow(BudgetExceeded);
  });

  it('returns 429 response as-is when code is not BUDGET_EXCEEDED', async () => {
    const rateLimitBody = { error: { code: 'RATE_LIMITED', message: 'Too many requests' } };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(rateLimitBody), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    global.fetch = mockFetch;

    const agentFetch = createAgentgovFetch({ proxyUrl: 'http://proxy:8787', agentId: 'agent-1' });
    const response = await agentFetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
    });
    expect(response.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// HitlPending tests
// ---------------------------------------------------------------------------
describe('HitlPending', () => {
  it('is an instance of Error', () => {
    const body: HitlPendingBody = {
      error: {
        code: 'HITL_PENDING',
        message: 'Action requires approval',
        approvalId: 'ticket-abc-123',
        agentId: 'agent-1',
        expiresAt: 1700000000000,
      },
    };
    const err = new HitlPending('Action requires approval', body);
    expect(err).toBeInstanceOf(Error);
  });

  it('has code HITL_PENDING', () => {
    const body: HitlPendingBody = {
      error: {
        code: 'HITL_PENDING',
        message: 'Action requires approval',
        approvalId: 'ticket-abc-123',
        agentId: 'agent-1',
        expiresAt: 1700000000000,
      },
    };
    const err = new HitlPending('Action requires approval', body);
    expect(err.code).toBe('HITL_PENDING');
  });

  it('has name HitlPending', () => {
    const body: HitlPendingBody = {
      error: {
        code: 'HITL_PENDING',
        message: 'Action requires approval',
        approvalId: 'ticket-abc-123',
        agentId: 'agent-1',
        expiresAt: 1700000000000,
      },
    };
    const err = new HitlPending('Action requires approval', body);
    expect(err.name).toBe('HitlPending');
  });

  it('exposes approvalId, agentId, expiresAt from error body', () => {
    const body: HitlPendingBody = {
      error: {
        code: 'HITL_PENDING',
        message: 'Action requires approval',
        approvalId: 'ticket-xyz-999',
        agentId: 'agent-42',
        expiresAt: 1700000099999,
      },
    };
    const err = new HitlPending('Action requires approval', body);
    expect(err.approvalId).toBe('ticket-xyz-999');
    expect(err.agentId).toBe('agent-42');
    expect(err.expiresAt).toBe(1700000099999);
  });
});

// ---------------------------------------------------------------------------
// HitlPending detection in createAgentgovFetch tests
// ---------------------------------------------------------------------------
describe('createAgentgovFetch HitlPending detection', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('throws HitlPending on 202 with HITL_PENDING code', async () => {
    const hitlPendingBody: HitlPendingBody = {
      error: {
        code: 'HITL_PENDING',
        message: 'Action requires approval',
        approvalId: 'ticket-abc',
        agentId: 'agent-1',
        expiresAt: 1700000000000,
      },
    };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(hitlPendingBody), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    global.fetch = mockFetch;

    const agentFetch = createAgentgovFetch({ proxyUrl: 'http://proxy:8787', agentId: 'agent-1' });
    await expect(
      agentFetch('https://api.openai.com/v1/chat/completions', { method: 'POST' }),
    ).rejects.toThrow(HitlPending);
  });

  it('thrown HitlPending has correct approvalId, agentId, expiresAt', async () => {
    const hitlPendingBody: HitlPendingBody = {
      error: {
        code: 'HITL_PENDING',
        message: 'Action requires approval',
        approvalId: 'ticket-exact-123',
        agentId: 'agent-exact',
        expiresAt: 9999999999999,
      },
    };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(hitlPendingBody), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    global.fetch = mockFetch;

    const agentFetch = createAgentgovFetch({ proxyUrl: 'http://proxy:8787', agentId: 'agent-exact' });
    try {
      await agentFetch('https://api.openai.com/v1/chat/completions', { method: 'POST' });
      expect.fail('Should have thrown HitlPending');
    } catch (err) {
      expect(err).toBeInstanceOf(HitlPending);
      const hitlErr = err as HitlPending;
      expect(hitlErr.approvalId).toBe('ticket-exact-123');
      expect(hitlErr.agentId).toBe('agent-exact');
      expect(hitlErr.expiresAt).toBe(9999999999999);
    }
  });

  it('returns original 202 response when body does not contain HITL_PENDING code', async () => {
    const otherBody = { status: 'accepted', id: 'job-123' };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(otherBody), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    global.fetch = mockFetch;

    const agentFetch = createAgentgovFetch({ proxyUrl: 'http://proxy:8787', agentId: 'agent-1' });
    const response = await agentFetch('https://api.openai.com/v1/chat/completions', { method: 'POST' });
    expect(response.status).toBe(202);
  });

  it('returns original 202 response when body has error with different code', async () => {
    const otherErrorBody = { error: { code: 'SOME_OTHER_CODE', message: 'Something else' } };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(otherErrorBody), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    global.fetch = mockFetch;

    const agentFetch = createAgentgovFetch({ proxyUrl: 'http://proxy:8787', agentId: 'agent-1' });
    const response = await agentFetch('https://api.openai.com/v1/chat/completions', { method: 'POST' });
    expect(response.status).toBe(202);
  });
});

// ---------------------------------------------------------------------------
// AgentError tests
// ---------------------------------------------------------------------------
describe('AgentError', () => {
  const makeBody = (type: 'retry_exhausted' | 'permanent_error' = 'retry_exhausted'): AgentErrorBody => ({
    error: {
      code: 'AGENT_ERROR',
      type,
      message: 'LLM request failed after all retry attempts.',
      agentId: 'agent-test-123',
      timestamp: 1700000000000,
      suggestedRemediation: 'Rate limit — retry with backoff.',
      context: { originalStatus: 429, errorClass: 'transient' },
    },
  });

  it('is an instance of Error', () => {
    const err = new AgentError('test', makeBody());
    expect(err).toBeInstanceOf(Error);
  });

  it('has name AgentError', () => {
    const err = new AgentError('test', makeBody());
    expect(err.name).toBe('AgentError');
  });

  it('has code AGENT_ERROR', () => {
    const err = new AgentError('test', makeBody());
    expect(err.code).toBe('AGENT_ERROR');
  });

  it('populates type from body', () => {
    const err = new AgentError('test', makeBody('permanent_error'));
    expect(err.type).toBe('permanent_error');
  });

  it('populates agentId from body', () => {
    const err = new AgentError('test', makeBody());
    expect(err.agentId).toBe('agent-test-123');
  });

  it('populates timestamp from body', () => {
    const err = new AgentError('test', makeBody());
    expect(err.timestamp).toBe(1700000000000);
  });

  it('populates suggestedRemediation from body', () => {
    const err = new AgentError('test', makeBody());
    expect(err.suggestedRemediation).toBe('Rate limit — retry with backoff.');
  });

  it('populates context from body', () => {
    const err = new AgentError('test', makeBody());
    expect(err.context?.originalStatus).toBe(429);
    expect(err.context?.errorClass).toBe('transient');
  });
});

// ---------------------------------------------------------------------------
// AgentError detection in createAgentgovFetch
// ---------------------------------------------------------------------------
describe('createAgentgovFetch AgentError detection', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('throws AgentError on 502 with AGENT_ERROR code', async () => {
    const agentErrorBody: AgentErrorBody = {
      error: {
        code: 'AGENT_ERROR',
        type: 'retry_exhausted',
        message: 'LLM request failed after all retry attempts.',
        agentId: 'agent-1',
        timestamp: 1700000000000,
        suggestedRemediation: 'Check rate limits.',
      },
    };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(agentErrorBody), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    global.fetch = mockFetch;

    const agentFetch = createAgentgovFetch({ proxyUrl: 'http://proxy:8787', agentId: 'agent-1' });
    await expect(
      agentFetch('https://api.openai.com/v1/chat/completions', { method: 'POST' }),
    ).rejects.toThrow(AgentError);
  });

  it('returns original 502 response when code is not AGENT_ERROR', async () => {
    const otherBody = { error: { code: 'GATEWAY_ERROR', message: 'upstream failed' } };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(otherBody), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    global.fetch = mockFetch;

    const agentFetch = createAgentgovFetch({ proxyUrl: 'http://proxy:8787', agentId: 'agent-1' });
    const response = await agentFetch('https://api.openai.com/v1/chat/completions', { method: 'POST' });
    expect(response.status).toBe(502);
  });

  it('thrown AgentError has correct type, agentId, timestamp, suggestedRemediation', async () => {
    const agentErrorBody: AgentErrorBody = {
      error: {
        code: 'AGENT_ERROR',
        type: 'permanent_error',
        message: 'Permanent failure',
        agentId: 'agent-exact',
        timestamp: 9999999999999,
        suggestedRemediation: 'Check your API key.',
      },
    };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(agentErrorBody), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    global.fetch = mockFetch;

    const agentFetch = createAgentgovFetch({ proxyUrl: 'http://proxy:8787', agentId: 'agent-exact' });
    try {
      await agentFetch('https://api.openai.com/v1/chat/completions', { method: 'POST' });
      expect.fail('Should have thrown AgentError');
    } catch (err) {
      expect(err).toBeInstanceOf(AgentError);
      const agentErr = err as AgentError;
      expect(agentErr.type).toBe('permanent_error');
      expect(agentErr.agentId).toBe('agent-exact');
      expect(agentErr.timestamp).toBe(9999999999999);
      expect(agentErr.suggestedRemediation).toBe('Check your API key.');
    }
  });
});

// ---------------------------------------------------------------------------
// wrap() tests
// ---------------------------------------------------------------------------
describe('wrap', () => {
  it('returns the same client instance', () => {
    const client = { baseURL: 'https://api.openai.com/v1' } as { baseURL?: string; fetch?: typeof fetch };
    const result = wrap(client, { proxyUrl: 'http://proxy:8787', agentId: 'agent-1' });
    expect(result).toBe(client);
  });

  it('patches client.fetch with agentgov fetch', () => {
    const client = { baseURL: 'https://api.openai.com/v1' } as { baseURL?: string; fetch?: typeof fetch };
    wrap(client, { proxyUrl: 'http://proxy:8787', agentId: 'agent-1' });
    expect(typeof client.fetch).toBe('function');
  });

  it('patches client.baseURL to proxy URL /v1', () => {
    const client = { baseURL: 'https://api.openai.com/v1' } as { baseURL?: string; fetch?: typeof fetch };
    wrap(client, { proxyUrl: 'http://proxy:8787', agentId: 'agent-1' });
    expect(client.baseURL).toBe('http://proxy:8787/v1');
  });

  it('strips trailing slash from proxyUrl when patching baseURL', () => {
    const client = { baseURL: 'https://api.openai.com/v1' } as { baseURL?: string; fetch?: typeof fetch };
    wrap(client, { proxyUrl: 'http://proxy:8787/', agentId: 'agent-1' });
    expect(client.baseURL).toBe('http://proxy:8787/v1');
  });
});
