import { describe, it, expect } from 'vitest';
import { buildAgentErrorResponse } from './reporter';
import { classifyHttpError } from './classifier';

describe('buildAgentErrorResponse', () => {
  it('returns a Response with status 502 for permanent_error', async () => {
    const classified = classifyHttpError(401);
    const response = buildAgentErrorResponse('permanent_error', 'agent-123', classified, 401);
    expect(response.status).toBe(502);
  });

  it('returns a Response with status 502 for retry_exhausted', async () => {
    const classified = classifyHttpError(429);
    const response = buildAgentErrorResponse('retry_exhausted', 'agent-456', classified, 429);
    expect(response.status).toBe(502);
  });

  it('sets Content-Type to application/json', async () => {
    const classified = classifyHttpError(500);
    const response = buildAgentErrorResponse('retry_exhausted', 'agent-789', classified, 500);
    expect(response.headers.get('Content-Type')).toBe('application/json');
  });

  it('returns AgentErrorResponseBody with all required fields for permanent_error', async () => {
    const classified = classifyHttpError(401);
    const response = buildAgentErrorResponse('permanent_error', 'agent-123', classified, 401);
    const body = await response.json() as {
      error: {
        code: string;
        type: string;
        message: string;
        agentId: string;
        timestamp: number;
        suggestedRemediation: string;
        context: { originalStatus: number; errorClass: string };
      };
    };

    expect(body.error.code).toBe('AGENT_ERROR');
    expect(body.error.type).toBe('permanent_error');
    expect(body.error.agentId).toBe('agent-123');
    expect(typeof body.error.timestamp).toBe('number');
    expect(body.error.timestamp).toBeGreaterThan(0);
    expect(body.error.suggestedRemediation).toBeTruthy();
    expect(body.error.context.originalStatus).toBe(401);
    expect(body.error.context.errorClass).toBe('permanent');
    expect(body.error.message).toBeTruthy();
  });

  it('returns AgentErrorResponseBody with all required fields for retry_exhausted', async () => {
    const classified = classifyHttpError(429);
    const response = buildAgentErrorResponse('retry_exhausted', 'agent-456', classified, 429);
    const body = await response.json() as {
      error: {
        code: string;
        type: string;
        message: string;
        agentId: string;
        timestamp: number;
        suggestedRemediation: string;
        context: { originalStatus: number; errorClass: string };
      };
    };

    expect(body.error.code).toBe('AGENT_ERROR');
    expect(body.error.type).toBe('retry_exhausted');
    expect(body.error.agentId).toBe('agent-456');
    expect(typeof body.error.timestamp).toBe('number');
    expect(body.error.context.originalStatus).toBe(429);
    expect(body.error.context.errorClass).toBe('transient');
  });

  it('includes originalStatus from the classified error in context', async () => {
    const classified = classifyHttpError(503);
    const response = buildAgentErrorResponse('retry_exhausted', 'agent-abc', classified, 503);
    const body = await response.json() as { error: { context: { originalStatus: number } } };
    expect(body.error.context.originalStatus).toBe(503);
  });
});
