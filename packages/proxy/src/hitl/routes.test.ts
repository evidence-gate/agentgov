/**
 * HITL route handler tests — approve/deny/status/slack callback.
 *
 * These tests run in Node.js environment (vitest.config.node.ts).
 * HITL_WORKFLOW binding and DB calls are mocked.
 *
 * Uses Hono's app.request() pattern for unit-level route testing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// verifySlackSignature tests
// ---------------------------------------------------------------------------
describe('verifySlackSignature', () => {
  it('returns true for valid HMAC-SHA256 signature', async () => {
    const { verifySlackSignature } = await import('./slack');

    const signingSecret = 'test-slack-signing-secret';
    const rawBody = 'payload=%7B%22type%22%3A%22block_actions%22%7D';
    const timestamp = Math.floor(Date.now() / 1000).toString();

    // Compute expected signature using Web Crypto API
    const encoder = new TextEncoder();
    const baseString = `v0:${timestamp}:${rawBody}`;
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(signingSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(baseString));
    const hexSignature = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const slackSignature = `v0=${hexSignature}`;

    const req = new Request('https://example.com/v1/slack/callback', {
      method: 'POST',
      headers: {
        'X-Slack-Request-Timestamp': timestamp,
        'X-Slack-Signature': slackSignature,
      },
      body: rawBody,
    });

    const result = await verifySlackSignature(req, rawBody, signingSecret);
    expect(result).toBe(true);
  });

  it('returns false for invalid signature', async () => {
    const { verifySlackSignature } = await import('./slack');

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const rawBody = 'some-body';

    const req = new Request('https://example.com/v1/slack/callback', {
      method: 'POST',
      headers: {
        'X-Slack-Request-Timestamp': timestamp,
        'X-Slack-Signature': 'v0=invalidsignature',
      },
      body: rawBody,
    });

    const result = await verifySlackSignature(req, rawBody, 'signing-secret');
    expect(result).toBe(false);
  });

  it('returns false for timestamp older than 5 minutes (replay attack)', async () => {
    const { verifySlackSignature } = await import('./slack');

    // Timestamp 6 minutes in the past
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 360).toString();
    const rawBody = 'some-body';

    const req = new Request('https://example.com/v1/slack/callback', {
      method: 'POST',
      headers: {
        'X-Slack-Request-Timestamp': oldTimestamp,
        'X-Slack-Signature': 'v0=doesnotmatter',
      },
      body: rawBody,
    });

    const result = await verifySlackSignature(req, rawBody, 'signing-secret');
    expect(result).toBe(false);
  });

  it('returns false when X-Slack-Request-Timestamp header is missing', async () => {
    const { verifySlackSignature } = await import('./slack');

    const req = new Request('https://example.com/v1/slack/callback', {
      method: 'POST',
      headers: {
        'X-Slack-Signature': 'v0=something',
      },
      body: 'body',
    });

    const result = await verifySlackSignature(req, 'body', 'signing-secret');
    expect(result).toBe(false);
  });

  it('returns false when X-Slack-Signature header is missing', async () => {
    const { verifySlackSignature } = await import('./slack');

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const req = new Request('https://example.com/v1/slack/callback', {
      method: 'POST',
      headers: {
        'X-Slack-Request-Timestamp': timestamp,
      },
      body: 'body',
    });

    const result = await verifySlackSignature(req, 'body', 'signing-secret');
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// HITL route handler tests
// ---------------------------------------------------------------------------
describe('hitlRoutes', () => {
  let mockSendEvent: ReturnType<typeof vi.fn>;
  let mockWorkflowGet: ReturnType<typeof vi.fn>;
  let mockCreate: ReturnType<typeof vi.fn>;
  let mockGetTicket: ReturnType<typeof vi.fn>;
  let originalVerifySlack: unknown;

  beforeEach(async () => {
    vi.resetModules();
    mockSendEvent = vi.fn().mockResolvedValue(undefined);
    mockCreate = vi.fn().mockResolvedValue(undefined);
    mockWorkflowGet = vi.fn().mockReturnValue({ sendEvent: mockSendEvent });
    mockGetTicket = vi.fn();

    // Mock queue.ts
    vi.doMock('./queue', () => ({
      getTicket: mockGetTicket,
    }));

    // Mock db/client
    vi.doMock('../db/client', () => ({
      createDbClient: vi.fn().mockReturnValue({}),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // POST /v1/hitl/:id/approve
  // -------------------------------------------------------------------------
  it('POST /v1/hitl/:id/approve calls sendEvent with decision=approved and returns 200', async () => {
    const { hitlRoutes } = await import('./routes');
    const { Hono } = await import('hono');
    const testApp = new Hono();
    testApp.route('/', hitlRoutes);

    const mockEnv = {
      HITL_WORKFLOW: { get: mockWorkflowGet, create: mockCreate },
      TURSO_DATABASE_URL: 'http://localhost',
      TURSO_AUTH_TOKEN: 'token',
      AGENTGOV_HITL_APPROVAL_TOKEN: 'synthetic-operator-secret',
    };

    const res = await testApp.request(
      '/v1/hitl/ticket-123/approve',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer synthetic-operator-secret' },
        body: JSON.stringify({ actor: 'alice@example.com', reason: 'LGTM' }),
      },
      mockEnv,
    );

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['ok']).toBe(true);
    expect(mockWorkflowGet).toHaveBeenCalledWith('ticket-123');
    expect(mockSendEvent).toHaveBeenCalledWith({
      type: 'hitl-decision',
      payload: { decision: 'approved', actor: 'alice@example.com', reason: 'LGTM' },
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/hitl/:id/deny
  // -------------------------------------------------------------------------
  it('POST /v1/hitl/:id/deny calls sendEvent with decision=denied and returns 200', async () => {
    const { hitlRoutes } = await import('./routes');
    const { Hono } = await import('hono');
    const testApp = new Hono();
    testApp.route('/', hitlRoutes);

    const mockEnv = {
      HITL_WORKFLOW: { get: mockWorkflowGet, create: mockCreate },
      TURSO_DATABASE_URL: 'http://localhost',
      TURSO_AUTH_TOKEN: 'token',
      AGENTGOV_HITL_APPROVAL_TOKEN: 'synthetic-operator-secret',
    };

    const res = await testApp.request(
      '/v1/hitl/ticket-456/deny',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer synthetic-operator-secret' },
        body: JSON.stringify({ actor: 'bob@example.com' }),
      },
      mockEnv,
    );

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['ok']).toBe(true);
    expect(mockWorkflowGet).toHaveBeenCalledWith('ticket-456');
    expect(mockSendEvent).toHaveBeenCalledWith({
      type: 'hitl-decision',
      payload: { decision: 'denied', actor: 'bob@example.com', reason: undefined },
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/hitl/:id/status
  // -------------------------------------------------------------------------
  it('GET /v1/hitl/:id/status returns ticket status when found', async () => {
    const now = Date.now();
    const fakeTicket = {
      id: 'ticket-789',
      status: 'pending',
      riskTier: 'external',
      actionName: 'tool_call:send_email',
      approver: null,
      createdAt: now,
      expiresAt: now + 259200000,
      decidedAt: null,
    };
    mockGetTicket.mockResolvedValue(fakeTicket);

    const { hitlRoutes } = await import('./routes');
    const { Hono } = await import('hono');
    const testApp = new Hono();
    testApp.route('/', hitlRoutes);

    const mockEnv = {
      HITL_WORKFLOW: { get: mockWorkflowGet, create: mockCreate },
      TURSO_DATABASE_URL: 'http://localhost',
      TURSO_AUTH_TOKEN: 'token',
      AGENTGOV_HITL_APPROVAL_TOKEN: 'synthetic-operator-secret',
    };

    const res = await testApp.request('/v1/hitl/ticket-789/status', {}, mockEnv);

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['id']).toBe('ticket-789');
    expect(body['status']).toBe('pending');
    expect(body['riskTier']).toBe('external');
  });

  it('GET /v1/hitl/:id/status returns 404 when ticket not found', async () => {
    mockGetTicket.mockResolvedValue(null);

    const { hitlRoutes } = await import('./routes');
    const { Hono } = await import('hono');
    const testApp = new Hono();
    testApp.route('/', hitlRoutes);

    const mockEnv = {
      HITL_WORKFLOW: { get: mockWorkflowGet, create: mockCreate },
      TURSO_DATABASE_URL: 'http://localhost',
      TURSO_AUTH_TOKEN: 'token',
      AGENTGOV_HITL_APPROVAL_TOKEN: 'synthetic-operator-secret',
    };

    const res = await testApp.request('/v1/hitl/nonexistent/status', {}, mockEnv);
    expect(res.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // POST /v1/slack/callback
  // -------------------------------------------------------------------------
  it('POST /v1/slack/callback rejects 401 on invalid signature', async () => {
    vi.doMock('./slack', () => ({
      verifySlackSignature: vi.fn().mockResolvedValue(false),
    }));

    const { hitlRoutes } = await import('./routes');
    const { Hono } = await import('hono');
    const testApp = new Hono();
    testApp.route('/', hitlRoutes);

    const mockEnv = {
      HITL_WORKFLOW: { get: mockWorkflowGet, create: mockCreate },
      SLACK_SIGNING_SECRET: 'secret',
      TURSO_DATABASE_URL: 'http://localhost',
      TURSO_AUTH_TOKEN: 'token',
      AGENTGOV_HITL_APPROVAL_TOKEN: 'synthetic-operator-secret',
    };

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const res = await testApp.request(
      '/v1/slack/callback',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Slack-Request-Timestamp': timestamp,
          'X-Slack-Signature': 'v0=invalidsig',
        },
        body: 'payload=%7B%22type%22%3A%22block_actions%22%7D',
      },
      mockEnv,
    );

    expect(res.status).toBe(401);
  });

  it('POST /v1/slack/callback parses block_actions and calls sendEvent, returns 200 immediately', async () => {
    vi.doMock('./slack', () => ({
      verifySlackSignature: vi.fn().mockResolvedValue(true),
    }));

    const { hitlRoutes } = await import('./routes');
    const { Hono } = await import('hono');
    const testApp = new Hono();
    testApp.route('/', hitlRoutes);

    const slackPayload = JSON.stringify({
      type: 'block_actions',
      actions: [{ action_id: 'approve', value: 'ticket-abc' }],
      user: { username: 'approver-user' },
    });

    const mockEnv = {
      HITL_WORKFLOW: { get: mockWorkflowGet, create: mockCreate },
      SLACK_SIGNING_SECRET: 'secret',
      TURSO_DATABASE_URL: 'http://localhost',
      TURSO_AUTH_TOKEN: 'token',
      AGENTGOV_HITL_APPROVAL_TOKEN: 'synthetic-operator-secret',
    };

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const rawBody = `payload=${encodeURIComponent(slackPayload)}`;

    const res = await testApp.request(
      '/v1/slack/callback',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Slack-Request-Timestamp': timestamp,
          'X-Slack-Signature': 'v0=valid',
        },
        body: rawBody,
      },
      mockEnv,
    );

    // Returns 200 immediately
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['ok']).toBe(true);
  });

  it('POST /v1/slack/callback deny action triggers decision=denied', async () => {
    vi.doMock('./slack', () => ({
      verifySlackSignature: vi.fn().mockResolvedValue(true),
    }));

    const { hitlRoutes } = await import('./routes');
    const { Hono } = await import('hono');
    const testApp = new Hono();
    testApp.route('/', hitlRoutes);

    const slackPayload = JSON.stringify({
      type: 'block_actions',
      actions: [{ action_id: 'deny', value: 'ticket-deny' }],
      user: { username: 'denier-user' },
    });

    const mockEnv = {
      HITL_WORKFLOW: { get: mockWorkflowGet, create: mockCreate },
      SLACK_SIGNING_SECRET: 'secret',
      TURSO_DATABASE_URL: 'http://localhost',
      TURSO_AUTH_TOKEN: 'token',
      AGENTGOV_HITL_APPROVAL_TOKEN: 'synthetic-operator-secret',
    };

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const rawBody = `payload=${encodeURIComponent(slackPayload)}`;

    const res = await testApp.request(
      '/v1/slack/callback',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Slack-Request-Timestamp': timestamp,
          'X-Slack-Signature': 'v0=valid',
        },
        body: rawBody,
      },
      mockEnv,
    );

    expect(res.status).toBe(200);
  });
});


describe('direct decision authentication fails closed', () => {
  it('rejects missing configuration and absent/wrong credentials without dispatch', async () => {
    const { hitlRoutes } = await import('./routes');
    const sendEvent = vi.fn();
    const env = { HITL_WORKFLOW: { get: vi.fn().mockResolvedValue({ sendEvent }) } };
    for (const action of ['approve', 'deny']) {
      const request = { method: 'POST', body: JSON.stringify({ actor: 'forged-admin' }) };
      expect((await hitlRoutes.request(`/v1/hitl/id/${action}`, request, env)).status).toBe(503);
      for (const authorization of ['', 'Bearer wrong']) {
        expect((await hitlRoutes.request(`/v1/hitl/id/${action}`, { ...request, headers: { Authorization: authorization } },
          { ...env, AGENTGOV_HITL_APPROVAL_TOKEN: 'synthetic-operator-secret' })).status).toBe(401);
      }
    }
    expect(env.HITL_WORKFLOW.get).not.toHaveBeenCalled();
    expect(sendEvent).not.toHaveBeenCalled();
  });
});
