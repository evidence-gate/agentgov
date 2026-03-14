/**
 * Structured error response builder for the agentgov proxy.
 *
 * Builds a 502 Response with a structured AgentErrorResponseBody JSON body.
 * The proxy always returns 502 (not the original upstream status) for structured governance errors.
 * The original upstream status is preserved in context.originalStatus for debugging.
 */

import type { ClassifiedError } from './classifier';

export interface AgentErrorResponseBody {
  error: {
    code: 'AGENT_ERROR';
    type: 'retry_exhausted' | 'permanent_error' | 'stuck_detected';
    message: string;
    agentId: string;
    timestamp: number;
    context: {
      originalStatus: number;
      errorClass: string;
    };
    suggestedRemediation: string;
  };
}

/**
 * Build a structured 502 Response with AgentErrorResponseBody JSON.
 *
 * @param type - Error type ('permanent_error' | 'retry_exhausted')
 * @param agentId - Agent ID for attribution
 * @param classified - ClassifiedError from classifyHttpError
 * @param originalStatus - The original upstream HTTP status code
 * @returns Response with status 502 and application/json Content-Type
 */
export function buildAgentErrorResponse(
  type: 'retry_exhausted' | 'permanent_error' | 'stuck_detected',
  agentId: string,
  classified: ClassifiedError,
  originalStatus: number,
): Response {
  const message = type === 'permanent_error'
    ? `LLM request permanently failed with HTTP ${originalStatus}. Retrying would not help.`
    : type === 'retry_exhausted'
    ? `LLM request failed after all retry attempts. Last error: HTTP ${originalStatus}.`
    : `Agent stuck detected — request halted.`;

  const body: AgentErrorResponseBody = {
    error: {
      code: 'AGENT_ERROR',
      type,
      message,
      agentId,
      timestamp: Date.now(),
      context: {
        originalStatus,
        errorClass: classified.class,
      },
      suggestedRemediation: classified.suggestedRemediation,
    },
  };

  return new Response(JSON.stringify(body), {
    status: 502,
    headers: { 'Content-Type': 'application/json' },
  });
}
