import { describe, it, expect } from 'vitest';
import app from './index';

describe('GET /health', () => {
  it('returns 200 with { status: "ok" }', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });
});

describe('POST /v1/chat/completions', () => {
  it('returns 400 when X-Agent-Id header is missing', async () => {
    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body['error']).toBe('X-Agent-Id header required');
  });

  it('fails closed when DB bindings are missing, including risky tool requests', async () => {
    for (const messages of [
      [{ role: 'user', content: 'Hello' }],
      [{ role: 'assistant', content: null, tool_calls: [{ id: 't', type: 'function', function: { name: 'send_email', arguments: '{}' } }] }],
    ]) {
      const res = await app.request('/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agent-Id': 'test-agent' },
        body: JSON.stringify({ model: 'gpt-4o', messages }),
      });
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ error: { code: 'GOVERNANCE_UNAVAILABLE' } });
    }
  });

  it('returns 400 for non-JSON body (with X-Agent-Id header)', async () => {
    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Id': 'test-agent-01',
      },
      body: 'this is not json',
    });
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body['error']).toBe('invalid JSON');
  });
});

describe('HITL routes accessibility (Workers pool)', () => {
  it('POST /v1/hitl/:id/approve is mounted (returns non-404)', async () => {
    // Without HITL_WORKFLOW binding, this will fail — but the ROUTE is mounted
    // Hono default env has HITL_WORKFLOW: Workflow (from wrangler types)
    // In Workers pool with wrangler config, the binding is an actual Workflow stub
    const res = await app.request('/v1/hitl/test-ticket/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: 'test@example.com' }),
    });
    // The route exists — should not be Hono's built-in 404 (which has no body like { error: 'Not Found' })
    // Actual behavior: Workflow.get() might throw — resulting in 500 or other
    // We just verify the route is MOUNTED (not a Hono route-not-found 404)
    expect(res.status).not.toBe(404);
  });

  it('GET /v1/hitl/:id/status is mounted (returns non-404)', async () => {
    const res = await app.request('/v1/hitl/unknown-ticket/status');
    // Route is mounted — will fail with 500 (DB error) or similar, but NOT Hono 404
    expect(res.status).not.toBe(404);
  });
});
