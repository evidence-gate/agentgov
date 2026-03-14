/**
 * HITL proxy integration tests — classification in request pipeline.
 *
 * These tests run in Node.js environment (vitest.config.node.ts) so we can
 * use vi.mock to mock budget gate and DB operations.
 *
 * Tests verify:
 * - Risky tool_calls return 202 + HITL_PENDING body with HITL_WORKFLOW.create called
 * - Reversible tool_calls pass through to LLM (no HITL triggered)
 * - No tool_calls pass through to LLM (backward compatible)
 * - Budget hold is created before HITL (mock DB validates order)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock cloudflare:workers module — not available in Node.js (only in Cloudflare Workers runtime)
// This allows importing index.ts (which re-exports HitlWorkflow) in Node.js test env.
vi.mock('cloudflare:workers', () => ({
  WorkflowEntrypoint: class WorkflowEntrypoint {},
}));

// ---------------------------------------------------------------------------
// extractToolCalls and classifyToolCalls helper tests
// (tested via the pipeline behavior through app.request)
// ---------------------------------------------------------------------------

describe('HITL pipeline integration (via index.ts app with mocked DB)', () => {
  beforeEach(() => {
    vi.resetModules();
    // Re-apply the cloudflare:workers mock after resetModules
    vi.mock('cloudflare:workers', () => ({
      WorkflowEntrypoint: class WorkflowEntrypoint {},
    }));
  });

  it('returns 202 with HITL_PENDING when request has risky tool_calls (send_email)', async () => {
    // Mock budgetGate to return pass + holdId
    vi.doMock('../budget/gate', () => ({
      budgetGate: vi.fn().mockResolvedValue({ action: 'pass', holdId: 'hold-mock-123' }),
    }));

    // Mock DB client
    vi.doMock('../db/client', () => ({
      createDbClient: vi.fn().mockReturnValue({}),
    }));

    const mockCreate = vi.fn().mockResolvedValue(undefined);
    const mockSendEvent = vi.fn().mockResolvedValue(undefined);
    const mockWorkflowGet = vi.fn().mockReturnValue({ sendEvent: mockSendEvent });

    const { default: app } = await import('../index');

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

  it('forwards to LLM stub when tool_calls are all reversible (read_file)', async () => {
    vi.doMock('../budget/gate', () => ({
      budgetGate: vi.fn().mockResolvedValue({ action: 'pass', holdId: 'hold-mock-safe' }),
    }));

    vi.doMock('../db/client', () => ({
      createDbClient: vi.fn().mockReturnValue({}),
    }));

    // Mock forwardToLlm to return stub
    vi.doMock('../passthrough/forward', () => ({
      forwardToLlm: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'chatcmpl-safe',
            object: 'chat.completion',
            choices: [{ message: { role: 'assistant', content: 'ok' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    }));

    vi.doMock('../budget/alerts', () => ({
      checkAndFireAlerts: vi.fn().mockResolvedValue(undefined),
    }));

    const { default: app } = await import('../index');

    const mockEnv = {
      TURSO_DATABASE_URL: 'http://mock-db',
      TURSO_AUTH_TOKEN: 'mock-token',
      HITL_WORKFLOW: {
        get: vi.fn(),
        create: vi.fn(),
      },
      AGENTGOV_HITL_TTL_SECONDS: '3600',
    };

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
      mockEnv,
    );

    // Reversible action — proceeds to forwardToLlm, no 202
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['id']).toBe('chatcmpl-safe');
  });

  it('forwards to LLM when no tool_calls present (backward compatible)', async () => {
    vi.doMock('../budget/gate', () => ({
      budgetGate: vi.fn().mockResolvedValue({ action: 'pass', holdId: 'hold-mock-notool' }),
    }));

    vi.doMock('../db/client', () => ({
      createDbClient: vi.fn().mockReturnValue({}),
    }));

    vi.doMock('../passthrough/forward', () => ({
      forwardToLlm: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'chatcmpl-notool',
            object: 'chat.completion',
            choices: [{ message: { role: 'assistant', content: 'ok' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    }));

    vi.doMock('../budget/alerts', () => ({
      checkAndFireAlerts: vi.fn().mockResolvedValue(undefined),
    }));

    const { default: app } = await import('../index');

    const mockEnv = {
      TURSO_DATABASE_URL: 'http://mock-db',
      TURSO_AUTH_TOKEN: 'mock-token',
      HITL_WORKFLOW: { get: vi.fn(), create: vi.fn() },
    };

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
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['id']).toBe('chatcmpl-notool');
  });

  it('budget hold is created before HITL (gate called before HITL_WORKFLOW.create)', async () => {
    const callOrder: string[] = [];

    vi.doMock('../budget/gate', () => ({
      budgetGate: vi.fn().mockImplementation(async () => {
        callOrder.push('budgetGate');
        return { action: 'pass', holdId: 'hold-order-test' };
      }),
    }));

    vi.doMock('../db/client', () => ({
      createDbClient: vi.fn().mockReturnValue({}),
    }));

    const mockCreate = vi.fn().mockImplementation(async () => {
      callOrder.push('HITL_WORKFLOW.create');
    });

    const { default: app } = await import('../index');

    const mockEnv = {
      TURSO_DATABASE_URL: 'http://mock-db',
      TURSO_AUTH_TOKEN: 'mock-token',
      HITL_WORKFLOW: { get: vi.fn(), create: mockCreate },
      AGENTGOV_HITL_TTL_SECONDS: '3600',
    };

    await app.request(
      '/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Id': 'test-order',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'assistant',
              content: null,
              tool_calls: [{ id: 'c1', type: 'function', function: { name: 'delete_file', arguments: '{}' } }],
            },
          ],
        }),
      },
      mockEnv,
    );

    expect(callOrder[0]).toBe('budgetGate');
    expect(callOrder[1]).toBe('HITL_WORKFLOW.create');
  });
});

// ---------------------------------------------------------------------------
// Loop detection integration tests
// ---------------------------------------------------------------------------

describe('Loop detection integration (via index.ts with mocked DB)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mock('cloudflare:workers', () => ({
      WorkflowEntrypoint: class WorkflowEntrypoint {},
    }));
  });

  it('returns 502 AGENT_ERROR stuck_detected when same tool_call appears twice in messages', async () => {
    vi.doMock('../budget/gate', () => ({
      budgetGate: vi.fn().mockResolvedValue({ action: 'pass', holdId: 'hold-loop-test' }),
      budgetSettle: vi.fn().mockResolvedValue(undefined),
    }));

    vi.doMock('../db/client', () => ({
      createDbClient: vi.fn().mockReturnValue({}),
    }));

    vi.doMock('../audit/writer', () => ({
      appendAuditEvent: vi.fn().mockResolvedValue(undefined),
    }));

    const { default: app } = await import('../index');

    const mockEnv = {
      TURSO_DATABASE_URL: 'http://mock-db',
      TURSO_AUTH_TOKEN: 'mock-token',
      HITL_WORKFLOW: { get: vi.fn(), create: vi.fn() },
    };

    // Two identical tool_calls in separate messages within a single request
    const res = await app.request(
      '/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Id': 'test-agent-stuck',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'read_file', arguments: '{"path":"/a"}' },
                },
              ],
            },
            {
              role: 'tool',
              content: 'file contents',
            },
            {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_2',
                  type: 'function',
                  function: { name: 'read_file', arguments: '{"path":"/a"}' },
                },
              ],
            },
          ],
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(502);
    const body = await res.json() as Record<string, unknown>;
    const error = body['error'] as Record<string, unknown>;
    expect(error['code']).toBe('AGENT_ERROR');
    expect(error['type']).toBe('stuck_detected');
    expect(typeof error['agentId']).toBe('string');
    expect(error['agentId']).toBe('test-agent-stuck');
  });

  it('passes through when all tool_calls are unique (no false positives)', async () => {
    vi.doMock('../budget/gate', () => ({
      budgetGate: vi.fn().mockResolvedValue({ action: 'pass', holdId: 'hold-unique' }),
      budgetSettle: vi.fn().mockResolvedValue(undefined),
    }));

    vi.doMock('../db/client', () => ({
      createDbClient: vi.fn().mockReturnValue({}),
    }));

    vi.doMock('../audit/writer', () => ({
      appendAuditEvent: vi.fn().mockResolvedValue(undefined),
    }));

    vi.doMock('../passthrough/forward', () => ({
      forwardToLlm: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ id: 'chatcmpl-unique', object: 'chat.completion', choices: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    }));

    vi.doMock('../budget/alerts', () => ({
      checkAndFireAlerts: vi.fn().mockResolvedValue(undefined),
    }));

    const { default: app } = await import('../index');

    const mockEnv = {
      TURSO_DATABASE_URL: 'http://mock-db',
      TURSO_AUTH_TOKEN: 'mock-token',
      HITL_WORKFLOW: { get: vi.fn(), create: vi.fn() },
    };

    const res = await app.request(
      '/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Id': 'test-agent-unique',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_a',
                  type: 'function',
                  function: { name: 'read_file', arguments: '{"path":"/a"}' },
                },
              ],
            },
            {
              role: 'tool',
              content: 'result a',
            },
            {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_b',
                  type: 'function',
                  function: { name: 'read_file', arguments: '{"path":"/b"}' },
                },
              ],
            },
          ],
        }),
      },
      mockEnv,
    );

    // Different paths — no stuck detection — proceeds to LLM
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['id']).toBe('chatcmpl-unique');
  });

  it('passes through when no tool_calls present (loop detection not triggered)', async () => {
    vi.doMock('../budget/gate', () => ({
      budgetGate: vi.fn().mockResolvedValue({ action: 'pass', holdId: 'hold-notool-loop' }),
      budgetSettle: vi.fn().mockResolvedValue(undefined),
    }));

    vi.doMock('../db/client', () => ({
      createDbClient: vi.fn().mockReturnValue({}),
    }));

    vi.doMock('../passthrough/forward', () => ({
      forwardToLlm: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ id: 'chatcmpl-notool-loop', object: 'chat.completion', choices: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    }));

    vi.doMock('../budget/alerts', () => ({
      checkAndFireAlerts: vi.fn().mockResolvedValue(undefined),
    }));

    const { default: app } = await import('../index');

    const mockEnv = {
      TURSO_DATABASE_URL: 'http://mock-db',
      TURSO_AUTH_TOKEN: 'mock-token',
      HITL_WORKFLOW: { get: vi.fn(), create: vi.fn() },
    };

    const res = await app.request(
      '/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Id': 'test-agent-notool-loop',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['id']).toBe('chatcmpl-notool-loop');
  });
});
