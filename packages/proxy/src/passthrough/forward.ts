/** Provider forwarding with bounded lifetime and fail-closed usage accounting. */
import { budgetSettle } from '../budget/gate';
import { forwardWithRetry, parseRetryConfig } from '../error/retry';
import type { DbClient } from '../db/client';
import type { HoldId, ChatCompletionRequest, AgentId } from '../types';

export interface ForwardEnv {
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
  AGENTGOV_MAX_RETRIES?: string;
  AGENTGOV_RETRY_BASE_MS?: string;
  AGENTGOV_PROVIDER_TIMEOUT_MS?: string;
}
type Usage = { promptTokens: number; completionTokens: number };
function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function usage(value: unknown, anthropic: boolean): Usage | null {
  if (!value || typeof value !== 'object') return null;
  const u = value as Record<string, unknown>;
  const p = u[anthropic ? 'input_tokens' : 'prompt_tokens'];
  const c = u[anthropic ? 'output_tokens' : 'completion_tokens'];
  return count(p) && count(c) ? { promptTokens: p, completionTokens: c } : null;
}
function failure(status = 502): Response {
  // Never echo upstream bodies, request data, or exception messages (may contain keys).
  return Response.json({ error: 'provider request failed or usage unavailable' }, { status });
}

/** The optional signal covers client disconnect; the deadline includes headers and body. */
export async function forwardToLlm(
  requestBody: ChatCompletionRequest, holdId: HoldId, agentId: AgentId,
  db: DbClient, env: ForwardEnv, signal?: AbortSignal,
): Promise<Response> {
  const model = requestBody.model;
  const anthropic = model.startsWith('claude-');
  const google = model.startsWith('gemini-');
  const openai = /^(gpt-|o1-|o3-)/.test(model);
  const apiKey = anthropic ? env.ANTHROPIC_API_KEY : google ? env.GEMINI_API_KEY : env.OPENAI_API_KEY;
  const settle = (u: Usage | null) => budgetSettle(db, holdId, u, model, agentId);
  if ((!anthropic && !google && !openai) || !apiKey || signal?.aborted) {
    await settle({ promptTokens: 0, completionTokens: 0 });
    return failure(!anthropic && !google && !openai ? 422 : !apiKey ? 503 : 499);
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const configured = Number(env.AGENTGOV_PROVIDER_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configured) && configured > 0
    ? Math.min(configured, 120000) : 60000;
  const timer = setTimeout(abort, timeoutMs);
  const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
  // Race as well as passing signal: custom streams can otherwise ignore fetch cancellation.
  const bounded = <T>(work: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const onAbort = () => reject(new Error('provider deadline/disconnect'));
    if (controller.signal.aborted) { reject(new Error('provider deadline/disconnect')); return; }
    controller.signal.addEventListener('abort', onAbort, { once: true });
    work.then(resolve, reject).finally(() => controller.signal.removeEventListener('abort', onAbort));
  });
  const max_tokens = requestBody.max_tokens ?? 4096;
  const body = anthropic ? {
    model, max_tokens,
    system: requestBody.messages.filter(m => m.role === 'system').map(m => m.content ?? '').join('\n'),
    messages: requestBody.messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content ?? '' })),
    stream: requestBody.stream === true,
  } : { ...requestBody, max_tokens, ...(requestBody.stream ? { stream_options: { include_usage: true } } : {}) };
  const url = anthropic ? 'https://api.anthropic.com/v1/messages'
    : google ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';
  try {
    const response = await forwardWithRetry(() => bounded(fetch(url, {
      method: 'POST', signal: controller.signal,
      headers: anthropic ? { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
        : { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    })), parseRetryConfig(env as Record<string, string | undefined>), db, holdId, agentId, model,
    ms => bounded(new Promise(resolve => {
      const id = setTimeout(resolve, ms);
      controller.signal.addEventListener('abort', () => { clearTimeout(id); resolve(); }, { once: true });
    })));
    if (!response.ok) { cleanup(); return response; } // Retry engine settled rejection.
    if (!requestBody.stream) {
      const data = await bounded(response.json()) as { usage?: unknown };
      const actual = usage(data?.usage, anthropic);
      await settle(actual);
      cleanup();
      return actual ? Response.json(data) : failure();
    }
    if (!response.body) throw new Error('missing provider body');
    const reader = response.body.getReader();
    void reader.closed.catch(() => {});
    const decoder = new TextDecoder();
    let buffer = '';
    let event = '';
    let actual: Usage | null = null;
    let input: number | undefined;
    let terminal = false;
    let finished: Promise<void> | undefined;
    const finish = (known: boolean) => {
      finished ??= settle(known ? actual : null).finally(cleanup);
      return finished;
    };
    const parseLine = (line: string) => {
      if (line.startsWith('event:')) { event = line.slice(6).trim(); return; }
      if (!line.startsWith('data:')) return;
      const data = line.slice(5).trim();
      if (data === '[DONE]') { terminal = true; return; }
      try {
        const value = JSON.parse(data);
        if (!anthropic) {
          if (value.usage != null) actual = usage(value.usage, false);
        } else if (event === 'message_start') {
          const p = value.message?.usage?.input_tokens;
          input = count(p) ? p : undefined;
        } else if (event === 'message_delta') {
          const c = value.usage?.output_tokens;
          actual = input !== undefined && count(c) ? { promptTokens: input, completionTokens: c } : null;
        } else if (event === 'message_stop') terminal = true;
      } catch { /* Unknown or malformed usage remains conservatively charged. */ }
    };
    const stream = new ReadableStream<Uint8Array>({
      async pull(out) {
        try {
          const { done, value } = await bounded(reader.read());
          if (done) {
            buffer += decoder.decode();
            if (buffer) parseLine(buffer);
            await finish(terminal && actual !== null);
            out.close();
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          // Bound incomplete SSE line memory; oversized events fail closed.
          if (buffer.length > 1024 * 1024) throw new Error('oversized SSE event');
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) parseLine(line.trimEnd());
          out.enqueue(value);
        } catch {
          controller.abort();
          void reader.cancel().catch(() => {});
          try { await finish(false); } catch { /* Failed settlement leaves the hold reserved. */ }
          try {
            out.enqueue(new TextEncoder().encode('event: error\ndata: {"error":"provider stream interrupted"}\n\n'));
            out.close();
          } catch { /* Downstream already cancelled. */ }
        }
      },
      async cancel() {
        controller.abort();
        void reader.cancel().catch(() => {});
        await finish(false);
      },
      start() {
        // Settle even when the downstream never consumes the stream.
        controller.signal.addEventListener('abort', () => {
          void reader.cancel().catch(() => {});
          void finish(false).catch(() => {});
        }, { once: true });
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
  } catch {
    controller.abort();
    try { await settle(null); } finally { cleanup(); }
    return failure();
  }
}
