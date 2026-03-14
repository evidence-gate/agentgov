/**
 * HTTP error classifier for the agentgov retry engine.
 *
 * Pure function — no I/O, no side effects.
 * Classifies HTTP status codes into transient (retryable) or permanent (halt-immediately).
 */

export type ErrorClass = 'transient' | 'permanent' | 'unknown';

export interface ClassifiedError {
  class: ErrorClass;
  retryable: boolean;
  status: number;
  suggestedRemediation: string;
}

/**
 * Transient errors: temporary upstream failures — safe to retry with backoff.
 * 429 = rate limit, 500/502/503/504 = server-side transient issues.
 */
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);

/**
 * Permanent errors: client-side or auth failures — retrying won't help.
 * 400 = bad request, 401 = unauthorized, 403 = forbidden, 404 = not found, 422 = unprocessable.
 */
const PERMANENT_STATUSES = new Set([400, 401, 403, 404, 422]);

function getRemediation(status: number): string {
  switch (status) {
    case 429:
      return 'Rate limit exceeded. The retry engine will back off exponentially and retry automatically.';
    case 401:
      return 'Unauthorized: check your LLM provider API key (OPENAI_API_KEY or ANTHROPIC_API_KEY). The request will not be retried.';
    case 403:
      return 'Forbidden: the API key lacks permission for this operation. Verify key permissions and model access. The request will not be retried.';
    case 400:
      return 'Bad request: the request body is malformed or contains invalid parameters. Fix the request and try again. The request will not be retried.';
    case 404:
      return 'Not found: the model or endpoint does not exist. Verify the model name and endpoint URL. The request will not be retried.';
    case 422:
      return 'Unprocessable entity: the request is syntactically valid but semantically incorrect. Review the request parameters. The request will not be retried.';
    case 500:
      return 'Internal server error at the LLM provider. This is a transient upstream failure — retry is in progress.';
    case 502:
      return 'Bad gateway from the LLM provider. This is a transient upstream failure — retry is in progress.';
    case 503:
      return 'Service unavailable from the LLM provider. This is a transient upstream failure — retry is in progress.';
    case 504:
      return 'Gateway timeout from the LLM provider. This is a transient upstream failure — retry is in progress.';
    default:
      return `Unexpected HTTP status ${status}. This error was not classified as retryable. Inspect the upstream response for details.`;
  }
}

/**
 * Classify an HTTP status code from an LLM provider response.
 *
 * @param status - HTTP status code
 * @returns ClassifiedError with class, retryable flag, status, and suggestedRemediation
 */
export function classifyHttpError(status: number): ClassifiedError {
  if (TRANSIENT_STATUSES.has(status)) {
    return {
      class: 'transient',
      retryable: true,
      status,
      suggestedRemediation: getRemediation(status),
    };
  }

  if (PERMANENT_STATUSES.has(status)) {
    return {
      class: 'permanent',
      retryable: false,
      status,
      suggestedRemediation: getRemediation(status),
    };
  }

  return {
    class: 'unknown',
    retryable: false,
    status,
    suggestedRemediation: getRemediation(status),
  };
}
