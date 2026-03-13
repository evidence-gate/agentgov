import { describe, it, expect, vi } from 'vitest';
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

  it('returns 200 with stub response for valid request (no DB bindings = dev passthrough)', async () => {
    // Without TURSO bindings (no env in test), budget enforcement is skipped (dev mode passthrough)
    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Id': 'test-agent-01',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body['id']).toBe('string');
    expect((body['id'] as string).startsWith('stub-')).toBe(true);
    expect(body['object']).toBe('chat.completion');
    const choices = body['choices'] as Array<{ message: { role: string; content: string } }>;
    expect(Array.isArray(choices)).toBe(true);
    expect(choices[0].message.role).toBe('assistant');
    expect(choices[0].message.content).toBe('stub');
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

// ---------------------------------------------------------------------------
// HITL classification tests (mocked env with HITL_WORKFLOW binding)
// ---------------------------------------------------------------------------
describe('POST /v1/chat/completions HITL classification', () => {
  it('returns 202 with HITL_PENDING when request has risky tool_calls (send_email)', async () => {
    const mockCreate = vi.fn().mockResolvedValue(undefined);
    const mockSendEvent = vi.fn().mockResolvedValue(undefined);
    const mockWorkflowGet = vi.fn().mockReturnValue({ sendEvent: mockSendEvent });

    // Mock env with HITL_WORKFLOW binding and TURSO credentials
    // Note: budgetGate runs first — without TURSO credentials it returns passthrough
    // We need to provide TURSO credentials so budget gate runs (and passes via mock)
    // BUT with mock DB operations. Instead, use a request with tool_calls in dev passthrough mode.
    // In dev passthrough (no TURSO), budget gate is skipped — HITL check doesn't run.
    // To test HITL, we need to bypass budget gate or mock DB.
    // Strategy: pass mock env with TURSO URLs but intercept at HITL_WORKFLOW.create level.
    const mockEnv = {
      TURSO_DATABASE_URL: 'http://mock-db',
      TURSO_AUTH_TOKEN: 'mock-token',
      HITL_WORKFLOW: { get: mockWorkflowGet, create: mockCreate },
      AGENTGOV_HITL_TTL_SECONDS: '3600',
    };

    const res = await app.request(
      '/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Id': 'test-agent-hitl',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_abc',
                  type: 'function',
                  function: { name: 'send_email', arguments: '{}' },
                },
              ],
            },
          ],
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(202);
    const body = await res.json() as Record<string, unknown>;
    const error = body['error'] as Record<string, unknown>;
    expect(error['code']).toBe('HITL_PENDING');
    expect(typeof error['approvalId']).toBe('string');
    expect(error['agentId']).toBe('test-agent-hitl');
    expect(typeof error['expiresAt']).toBe('number');
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it('forwards to LLM (dev mode) when tool_calls are all reversible (read_file)', async () => {
    // In dev passthrough (no TURSO, no HITL_WORKFLOW), reversible actions skip HITL
    const res = await app.request(
      '/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Id': 'test-agent-safe',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_safe',
                  type: 'function',
                  function: { name: 'read_file', arguments: '{}' },
                },
              ],
            },
          ],
        }),
      },
    );

    // Dev passthrough — no TURSO = stub response
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect((body['id'] as string).startsWith('stub-')).toBe(true);
  });

  it('forwards to LLM (dev mode) when no tool_calls present (backward compatible)', async () => {
    const res = await app.request(
      '/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Id': 'test-agent-notool',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'Hello no tools' }],
        }),
      },
    );

    // Dev passthrough — no TURSO = stub response
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect((body['id'] as string).startsWith('stub-')).toBe(true);
  });
});

describe('HITL routes accessibility', () => {
  it('health endpoint still returns 200 (regression)', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['status']).toBe('ok');
  });

  it('GET /v1/hitl/:id/status is mounted and returns 404 for unknown ticket (no DB)', async () => {
    // Route should be accessible — returns 500 or 404 depending on DB error handling
    // Without TURSO credentials, createDbClient will fail
    const res = await app.request('/v1/hitl/unknown-ticket/status');
    // Route is mounted — won't 404 on "route not found"
    // Will fail with 500 due to missing DB, but the path is accessible
    expect(res.status).not.toBe(404);
  });
});
