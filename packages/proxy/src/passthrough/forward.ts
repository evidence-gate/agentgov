/**
 * LLM passthrough — forwards approved requests to the real LLM provider.
 *
 * Features:
 * - Routes by model name prefix (gpt-* / o1-* / o3-* → OpenAI, claude-* → Anthropic, gemini-* → Google)
 * - Streams responses directly without buffering
 * - For streaming: uses stream_options.include_usage so the final SSE chunk contains token counts
 * - Calls budgetSettle after the stream/response completes with actual token usage
 * - Returns provider errors (4xx/5xx) wrapped in structured AgentError responses via retry engine
 * - Returns 503 if the required LLM provider API key is not configured
 * - Automatically retries transient errors (429, 5xx) with exponential backoff and jitter
 * - Immediately halts on permanent errors (401, 4xx) without wasting budget
 */

import { budgetSettle } from '../budget/gate';
import { forwardWithRetry, parseRetryConfig } from '../error/retry';
import type { DbClient } from '../db/client';
import type { HoldId, ChatCompletionRequest, AgentId } from '../types';

/**
 * Environment bindings expected by the passthrough handler.
 * These must be set in wrangler.jsonc (non-secret) or .dev.vars / Wrangler secrets (secret values).
 */
export interface ForwardEnv {
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  AGENTGOV_MAX_RETRIES?: string;
  AGENTGOV_RETRY_BASE_MS?: string;
}

type LlmProvider = 'openai' | 'anthropic' | 'google';

/**
 * Determine the LLM provider from the model name.
 */
function resolveProvider(model: string): LlmProvider | null {
  if (model.startsWith('gpt-') || model.startsWith('o1-') || model.startsWith('o3-')) {
    return 'openai';
  }
  if (model.startsWith('claude-')) {
    return 'anthropic';
  }
  if (model.startsWith('gemini-')) {
    return 'google';
  }
  return null;
}

/**
 * Forward an approved request to the real LLM provider and stream the response back.
 *
 * @param requestBody - Parsed ChatCompletionRequest from the incoming request
 * @param holdId - Active budget hold ID to settle after the response arrives
 * @param agentId - Agent ID (for budgetSettle audit event)
 * @param db - DB client
 * @param env - Environment bindings (API keys)
 */
export async function forwardToLlm(
  requestBody: ChatCompletionRequest,
  holdId: HoldId,
  agentId: AgentId,
  db: DbClient,
  env: ForwardEnv,
): Promise<Response> {
  const model = requestBody.model;
  const provider = resolveProvider(model);

  if (!provider) {
    return new Response(
      JSON.stringify({ error: `cannot determine LLM provider from model name: ${model}` }),
      { status: 422, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Validate API key availability before making the request
  if (provider === 'openai' && !env.OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({
        error:
          'LLM provider API key not configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in wrangler secrets.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (provider === 'anthropic' && !env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({
        error:
          'LLM provider API key not configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in wrangler secrets.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (provider === 'google') {
    // Google Gemini uses a different API key — for Phase 1, return 503 if not configured
    // (GEMINI_API_KEY support can be added in a later plan)
    return new Response(
      JSON.stringify({
        error:
          'LLM provider API key not configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in wrangler secrets.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const retryEnv = {
    AGENTGOV_MAX_RETRIES: env.AGENTGOV_MAX_RETRIES,
    AGENTGOV_RETRY_BASE_MS: env.AGENTGOV_RETRY_BASE_MS,
  };

  if (provider === 'openai') {
    return forwardToOpenAI(requestBody, holdId, agentId, db, env.OPENAI_API_KEY!, retryEnv);
  }

  // Anthropic
  return forwardToAnthropic(requestBody, holdId, agentId, db, env.ANTHROPIC_API_KEY!, retryEnv);
}

// ---------------------------------------------------------------------------
// OpenAI forwarding
// ---------------------------------------------------------------------------

async function forwardToOpenAI(
  requestBody: ChatCompletionRequest,
  holdId: HoldId,
  agentId: AgentId,
  db: DbClient,
  apiKey: string,
  retryEnv: Record<string, string | undefined> = {},
): Promise<Response> {
  const isStreaming = requestBody.stream === true;

  // For streaming: add stream_options.include_usage so we get token counts in the final chunk
  const forwardBody = isStreaming
    ? { ...requestBody, stream_options: { include_usage: true } }
    : requestBody;

  const retryConfig = parseRetryConfig(retryEnv);

  // Use forwardWithRetry to wrap the fetch call with automatic retry on transient errors.
  // On permanent errors or retry exhaustion, forwardWithRetry returns a 502 AgentError response
  // and settles the hold at 0 cost — we return that directly.
  // On success, response.ok is true and we continue with settle/streaming logic.
  const llmResponse = await forwardWithRetry(
    () =>
      fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(forwardBody),
      }),
    retryConfig,
    db,
    holdId,
    agentId,
    requestBody.model,
  );

  // If retry engine returned an error response (502), pass it through directly.
  // The hold has already been settled at 0 cost by forwardWithRetry.
  if (!llmResponse.ok) {
    return llmResponse;
  }

  if (!isStreaming) {
    // Non-streaming: buffer the response, extract usage, settle, return
    const responseJson = await llmResponse.json() as {
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const promptTokens = responseJson.usage?.prompt_tokens ?? 0;
    const completionTokens = responseJson.usage?.completion_tokens ?? 0;

    // Settle budget asynchronously (non-blocking)
    budgetSettle(db, holdId, { promptTokens, completionTokens }, requestBody.model, agentId).catch(
      (err) => console.error('forwardToLlm: budgetSettle failed:', err),
    );

    return new Response(JSON.stringify(responseJson), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Streaming: pipe through a TransformStream, intercept the final chunk for usage data
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  // Process the stream in the background — extract usage from the final chunk
  const model = requestBody.model;
  processStreamAndSettle(llmResponse.body!, writer, db, holdId, agentId, model).catch((err) =>
    console.error('forwardToLlm: stream processing error:', err),
  );

  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': llmResponse.headers.get('Content-Type') ?? 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

/**
 * Pipe an SSE stream through a TransformStream writer.
 * Detects the final data chunk containing usage information and calls budgetSettle.
 *
 * OpenAI SSE format with stream_options.include_usage:
 * The last data chunk (before [DONE]) contains a usage field in the delta.
 */
async function processStreamAndSettle(
  body: ReadableStream<Uint8Array>,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  db: DbClient,
  holdId: HoldId,
  agentId: AgentId,
  model: string,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let promptTokens = 0;
  let completionTokens = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Forward chunk to response stream
      await writer.write(value);

      // Parse SSE chunks to extract usage
      const text = decoder.decode(value, { stream: true });
      const lines = text.split('\n');

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data) as {
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          if (parsed.usage) {
            promptTokens = parsed.usage.prompt_tokens ?? 0;
            completionTokens = parsed.usage.completion_tokens ?? 0;
          }
        } catch {
          // Not valid JSON — skip
        }
      }
    }
  } finally {
    await writer.close();
  }

  // Settle budget after stream completes
  budgetSettle(db, holdId, { promptTokens, completionTokens }, model, agentId).catch((err) =>
    console.error('processStreamAndSettle: budgetSettle failed:', err),
  );
}

// ---------------------------------------------------------------------------
// Anthropic forwarding
// ---------------------------------------------------------------------------

/**
 * Convert OpenAI chat message format to Anthropic Messages API format.
 *
 * OpenAI: { role: 'system'|'user'|'assistant', content: string }[]
 * Anthropic: { system?: string, messages: { role: 'user'|'assistant', content: string }[] }
 */
function convertToAnthropicFormat(requestBody: ChatCompletionRequest): {
  model: string;
  max_tokens: number;
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  stream?: boolean;
} {
  const messages = requestBody.messages;
  let system: string | undefined;
  const nonSystemMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      system = msg.content ?? undefined;
    } else {
      nonSystemMessages.push({ role: msg.role as 'user' | 'assistant', content: msg.content ?? '' });
    }
  }

  return {
    model: requestBody.model,
    max_tokens: requestBody.max_tokens ?? 4096,
    ...(system ? { system } : {}),
    messages: nonSystemMessages,
    ...(requestBody.stream ? { stream: true } : {}),
  };
}

async function forwardToAnthropic(
  requestBody: ChatCompletionRequest,
  holdId: HoldId,
  agentId: AgentId,
  db: DbClient,
  apiKey: string,
  retryEnv: Record<string, string | undefined> = {},
): Promise<Response> {
  const anthropicBody = convertToAnthropicFormat(requestBody);
  const retryConfig = parseRetryConfig(retryEnv);

  const llmResponse = await forwardWithRetry(
    () =>
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(anthropicBody),
      }),
    retryConfig,
    db,
    holdId,
    agentId,
    requestBody.model,
  );

  // If retry engine returned an error response (502), pass it through directly.
  // The hold has already been settled at 0 cost by forwardWithRetry.
  if (!llmResponse.ok) {
    return llmResponse;
  }

  if (!requestBody.stream) {
    // Non-streaming: extract usage from Anthropic response format
    const responseJson = await llmResponse.json() as {
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const promptTokens = responseJson.usage?.input_tokens ?? 0;
    const completionTokens = responseJson.usage?.output_tokens ?? 0;

    budgetSettle(db, holdId, { promptTokens, completionTokens }, requestBody.model, agentId).catch(
      (err) => console.error('forwardToLlm (Anthropic): budgetSettle failed:', err),
    );

    return new Response(JSON.stringify(responseJson), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Streaming: pipe through (Anthropic SSE format — settle with 0 tokens for Phase 1)
  // TODO: parse Anthropic SSE usage events in a later plan
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  const model = requestBody.model;
  pipeAndSettle(llmResponse.body!, writer, db, holdId, agentId, model).catch((err) =>
    console.error('forwardToLlm (Anthropic streaming): error:', err),
  );

  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': llmResponse.headers.get('Content-Type') ?? 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}

/**
 * Pipe a stream directly without usage extraction (used for Anthropic streaming in Phase 1).
 * budgetSettle is called with 0 tokens — hold is released without accurate cost.
 */
async function pipeAndSettle(
  body: ReadableStream<Uint8Array>,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  db: DbClient,
  holdId: HoldId,
  agentId: AgentId,
  model: string,
): Promise<void> {
  const reader = body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await writer.write(value);
    }
  } finally {
    await writer.close();
  }

  // Settle with 0 tokens — Anthropic streaming usage parsing is a TODO for later plans
  budgetSettle(db, holdId, { promptTokens: 0, completionTokens: 0 }, model, agentId).catch((err) =>
    console.error('pipeAndSettle: budgetSettle failed:', err),
  );
}
