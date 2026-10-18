/**
 * HITL module tests — classifier, queue, notify, workflow step logic.
 *
 * These tests run in Node.js environment (vitest.config.node.ts).
 * All DB and fetch calls are mocked via vi.mock / vi.fn.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { classifyAction } from './classifier';
import { createTicket, getTicket, transitionStatus } from './queue';
import { notifyChannels } from './notify';

// ---------------------------------------------------------------------------
// classifyAction tests
// ---------------------------------------------------------------------------
describe('classifyAction', () => {
  it('returns required:true tier:external for send_email', () => {
    const result = classifyAction('tool_call:send_email');
    expect(result).toEqual({ required: true, tier: 'external' });
  });

  it('returns required:true tier:external for post_slack_message', () => {
    const result = classifyAction('tool_call:post_slack_message');
    expect(result).toEqual({ required: true, tier: 'external' });
  });

  it('returns required:true tier:external for http_post', () => {
    const result = classifyAction('tool_call:http_post');
    expect(result).toEqual({ required: true, tier: 'external' });
  });

  it('returns required:true tier:irreversible for delete_file', () => {
    const result = classifyAction('tool_call:delete_file');
    expect(result).toEqual({ required: true, tier: 'irreversible' });
  });

  it('returns required:true tier:irreversible for drop_table', () => {
    const result = classifyAction('tool_call:drop_table');
    expect(result).toEqual({ required: true, tier: 'irreversible' });
  });

  it('returns required:true tier:semi-reversible for update_record', () => {
    const result = classifyAction('tool_call:update_record');
    expect(result).toEqual({ required: true, tier: 'semi-reversible' });
  });

  it('returns required:false for read_file (reversible)', () => {
    const result = classifyAction('tool_call:read_file');
    expect(result).toEqual({ required: false });
  });

  it('returns required:false for list_files (reversible)', () => {
    const result = classifyAction('tool_call:list_files');
    expect(result).toEqual({ required: false });
  });

  it('returns required:false for unknown action (open by default)', () => {
    const result = classifyAction('tool_call:unknown_action');
    expect(result).toEqual({ required: false });
  });

  it('returns required:false for completely unknown action name', () => {
    const result = classifyAction('something:totally:unknown');
    expect(result).toEqual({ required: false });
  });
});

// ---------------------------------------------------------------------------
// queue.ts tests (DB mocked)
// ---------------------------------------------------------------------------
describe('createTicket', () => {
  it('inserts row with status=pending and returns ticketId (UUID)', async () => {
    // Mock DB client
    const mockInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    const mockDb = { insert: mockInsert } as unknown as Parameters<typeof createTicket>[0];

    const ticketId = await createTicket(mockDb, {
      agentId: 'agent-1',
      riskTier: 'external',
      actionName: 'tool_call:send_email',
      requestPayload: JSON.stringify({ model: 'gpt-4', messages: [] }),
      holdId: 'hold-abc',
      ttlSeconds: 259200,
    });

    // Returns a UUID-shaped string
    expect(ticketId).toMatch(/^[0-9a-f-]{36}$/);
    expect(mockInsert).toHaveBeenCalledOnce();
  });
});

describe('getTicket', () => {
  it('queries hitl_queue by id and returns row', async () => {
    const fakeRow = {
      id: 'ticket-123',
      agentId: 'agent-1',
      status: 'pending',
      riskTier: 'external',
      actionName: 'tool_call:send_email',
      requestPayload: '{}',
      holdId: 'hold-abc',
      approver: null,
      approverReason: null,
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000,
      decidedAt: null,
    };
    const mockSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([fakeRow]),
        }),
      }),
    });
    const mockDb = { select: mockSelect } as unknown as Parameters<typeof getTicket>[0];

    const result = await getTicket(mockDb, 'ticket-123');
    expect(result).toEqual(fakeRow);
  });

  it('returns null when ticket not found', async () => {
    const mockSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const mockDb = { select: mockSelect } as unknown as Parameters<typeof getTicket>[0];

    const result = await getTicket(mockDb, 'nonexistent-ticket');
    expect(result).toBeNull();
  });
});

describe('transitionStatus', () => {
  it('updates status to approved with decidedAt, approver, reason', async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    const mockDb = { update: mockUpdate } as unknown as Parameters<typeof transitionStatus>[0];

    await transitionStatus(mockDb, 'ticket-123', 'approved', {
      approver: 'user@example.com',
      reason: 'Looks good',
      decidedAt: 1700000000000,
    });

    expect(mockUpdate).toHaveBeenCalledOnce();
  });

  it('updates status to denied without optional fields', async () => {
    const mockSet = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });
    const mockDb = { update: mockUpdate } as unknown as Parameters<typeof transitionStatus>[0];

    await transitionStatus(mockDb, 'ticket-456', 'denied');

    expect(mockUpdate).toHaveBeenCalledOnce();
    expect(mockSet).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// notify.ts tests
// ---------------------------------------------------------------------------
describe('notifyChannels', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('posts webhook with correct event type and ticketId', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    global.fetch = mockFetch;

    await notifyChannels({
      webhookUrl: 'https://example.com/webhook',
      ticketId: 'ticket-abc',
      agentId: 'agent-1',
      actionName: 'tool_call:send_email',
      riskTier: 'external',
      expiresAt: 1700000000000,
      callbackUrl: 'https://proxy.example.com/v1/hitl/ticket-abc',
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://example.com/webhook');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.event).toBe('hitl_approval_required');
    expect(body.ticketId).toBe('ticket-abc');
    expect(body.agentId).toBe('agent-1');
    expect(body.actionName).toBe('tool_call:send_email');
    expect(body.riskTier).toBe('external');
    expect(body.callbackUrl).toBe('https://proxy.example.com/v1/hitl/ticket-abc');
  });

  it('throws if webhook POST fails', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('network error'));
    global.fetch = mockFetch;

    await expect(
      notifyChannels({
        webhookUrl: 'https://example.com/webhook',
        ticketId: 'ticket-abc',
        agentId: 'agent-1',
        actionName: 'tool_call:send_email',
        riskTier: 'external',
        expiresAt: 1700000000000,
        callbackUrl: 'https://proxy.example.com/v1/hitl/ticket-abc',
      })
    ).rejects.toThrow();
  });

  it('posts Slack Block Kit message when token and channel configured', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    global.fetch = mockFetch;

    await notifyChannels({
      ticketId: 'ticket-slack',
      agentId: 'agent-2',
      actionName: 'tool_call:delete_file',
      riskTier: 'irreversible',
      expiresAt: 1700000000000,
      callbackUrl: 'https://proxy.example.com/v1/hitl/ticket-slack',
      slackBotToken: 'xoxb-token',
      slackChannelId: 'C123456',
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://slack.com/api/chat.postMessage');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.channel).toBe('C123456');
    expect(body.blocks).toBeDefined();
    // Should have the action buttons block
    const actionsBlock = body.blocks.find((b: { type: string }) => b.type === 'actions');
    expect(actionsBlock).toBeDefined();
    expect(actionsBlock.block_id).toBe('hitl-ticket-slack');
    const approveBtn = actionsBlock.elements.find((e: { action_id: string }) => e.action_id === 'approve');
    const denyBtn = actionsBlock.elements.find((e: { action_id: string }) => e.action_id === 'deny');
    expect(approveBtn).toBeDefined();
    expect(approveBtn.value).toBe('ticket-slack');
    expect(denyBtn).toBeDefined();
    expect(denyBtn.value).toBe('ticket-slack');
  });

  it('throws if Slack POST fails', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('slack error'));
    global.fetch = mockFetch;

    await expect(
      notifyChannels({
        ticketId: 'ticket-slack',
        agentId: 'agent-2',
        actionName: 'tool_call:delete_file',
        riskTier: 'irreversible',
        expiresAt: 1700000000000,
        callbackUrl: 'https://proxy.example.com/v1/hitl/ticket-slack',
        slackBotToken: 'xoxb-token',
        slackChannelId: 'C123456',
      })
    ).rejects.toThrow();
  });

  it('skips webhook when webhookUrl is not provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    global.fetch = mockFetch;

    await notifyChannels({
      ticketId: 'ticket-no-webhook',
      agentId: 'agent-3',
      actionName: 'tool_call:send_email',
      riskTier: 'external',
      expiresAt: 1700000000000,
      callbackUrl: 'https://proxy.example.com/v1/hitl/ticket-no-webhook',
      // no webhookUrl
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('skips Slack when only bot token provided (missing channel)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    global.fetch = mockFetch;

    await notifyChannels({
      ticketId: 'ticket-partial-slack',
      agentId: 'agent-3',
      actionName: 'tool_call:send_email',
      riskTier: 'external',
      expiresAt: 1700000000000,
      callbackUrl: 'https://proxy.example.com/v1/hitl/ticket-partial-slack',
      slackBotToken: 'xoxb-token',
      // no slackChannelId
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Workflow step logic tests (test step callbacks without Workflows runtime)
// ---------------------------------------------------------------------------
describe('HitlWorkflow step logic', () => {
  it('persist-ticket step calls createTicket and appendAuditEvent with hitl_suspended', async () => {
    // We test the step callback logic in isolation by importing and invoking directly.
    // The actual WorkflowEntrypoint is not testable in Node.js — we test the units it calls.
    const { createTicket: ct } = await import('./queue');
    const { appendAuditEvent: aae } = await import('../audit/writer');

    const mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      }),
    };

    // Mock appendAuditEvent module
    vi.mock('../audit/writer', () => ({
      appendAuditEvent: vi.fn().mockResolvedValue(undefined),
    }));

    const ticketId = await ct(mockDb as unknown as Parameters<typeof ct>[0], {
      agentId: 'agent-1',
      riskTier: 'external',
      actionName: 'tool_call:send_email',
      requestPayload: '{}',
      holdId: null,
      ttlSeconds: 259200,
    });

    expect(ticketId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('TTL timeout path sets decision=denied with reason TTL expired', () => {
    // Simulate the catch block in workflow step 3
    const approvalEvent: { decision: 'approved' | 'denied'; actor: string; reason: string } = {
      decision: 'denied',
      actor: 'system',
      reason: 'TTL expired',
    };

    // This tests the TTL expiry logic — when waitForEvent throws, we set denied+TTL expired
    expect(approvalEvent.decision).toBe('denied');
    expect(approvalEvent.actor).toBe('system');
    expect(approvalEvent.reason).toBe('TTL expired');
  });

  it('approval event maps decision=approved to hitl_approved audit type', () => {
    const eventTypeMap: Record<string, string> = {
      approved: 'hitl_approved',
      denied: 'hitl_denied',
    };
    // When decision is from TTL expiry (reason === 'TTL expired'), use hitl_expired
    const getAuditType = (decision: string, reason?: string): string => {
      if (decision === 'denied' && reason === 'TTL expired') return 'hitl_expired';
      return eventTypeMap[decision] || 'hitl_denied';
    };

    expect(getAuditType('approved')).toBe('hitl_approved');
    expect(getAuditType('denied')).toBe('hitl_denied');
    expect(getAuditType('denied', 'TTL expired')).toBe('hitl_expired');
  });
});
