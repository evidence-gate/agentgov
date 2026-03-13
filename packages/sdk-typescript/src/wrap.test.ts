import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BudgetExceeded } from './errors';
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
