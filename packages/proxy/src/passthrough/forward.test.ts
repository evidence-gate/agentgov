/**
 * Tests for Gemini provider forwarding in forward.ts
 *
 * These tests run under the Workers pool (vitest.config.ts) because they use
 * Workers-runtime APIs: fetch (global), TransformStream, TextDecoder, ReadableStream.
 *
 * Mock strategy: vi.stubGlobal('fetch', mockFetch) so forwardWithRetry uses the mocked fetch.
 * budgetSettle and appendAuditEvent are vi.mock'd to capture calls without DB.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { forwardToLlm } from './forward';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../budget/gate', () => ({
  budgetSettle: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../audit/writer', () => ({
  appendAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import { budgetSettle } from '../budget/gate';

const mockBudgetSettle = budgetSettle as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDbMock() {
  return {} as Parameters<typeof forwardToLlm>[3];
}

/** Encode a string to Uint8Array */
function enc(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** Build a mock ReadableStream that emits the given chunks sequentially */
function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(enc(chunk));
      }
      controller.close();
    },
  });
}

/** Read all bytes from a ReadableStream and return as string */
async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

const holdId = 'hold-gemini-test';
const agentId = 'agent-gemini-test';

// ---------------------------------------------------------------------------
// Gemini non-streaming tests
// ---------------------------------------------------------------------------

describe('Gemini non-streaming', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockBudgetSettle.mockClear();
    fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'chatcmpl-gemini-123',
          object: 'chat.completion',
          model: 'gemini-2.0-flash',
          choices: [{ index: 0, message: { role: 'assistant', content: 'Hi!' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls fetch with correct Gemini endpoint URL', async () => {
    const res = await forwardToLlm(
      { model: 'gemini-2.0-flash', messages: [{ role: 'user', content: 'Hello' }], stream: false },
      holdId,
      agentId,
      makeDbMock(),
      { GEMINI_API_KEY: 'test-gemini-key' },
    );

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
  });

  it('sends Authorization: Bearer header with the API key', async () => {
    await forwardToLlm(
      { model: 'gemini-2.0-flash', messages: [{ role: 'user', content: 'Hello' }], stream: false },
      holdId,
      agentId,
      makeDbMock(),
      { GEMINI_API_KEY: 'test-gemini-key' },
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-gemini-key');
  });

  it('returns 200 status', async () => {
    const res = await forwardToLlm(
      { model: 'gemini-2.0-flash', messages: [{ role: 'user', content: 'Hello' }], stream: false },
      holdId,
      agentId,
      makeDbMock(),
      { GEMINI_API_KEY: 'test-gemini-key' },
    );
    expect(res.status).toBe(200);
  });

  it('calls budgetSettle with correct token counts from response usage', async () => {
    await forwardToLlm(
      { model: 'gemini-2.0-flash', messages: [{ role: 'user', content: 'Hello' }], stream: false },
      holdId,
      agentId,
      makeDbMock(),
      { GEMINI_API_KEY: 'test-gemini-key' },
    );

    // budgetSettle is async fire-and-forget — wait a tick
    await new Promise((r) => setTimeout(r, 0));

    expect(mockBudgetSettle).toHaveBeenCalledWith(
      expect.anything(),
      holdId,
      { promptTokens: 10, completionTokens: 20 },
      'gemini-2.0-flash',
      agentId,
    );
  });
});

// ---------------------------------------------------------------------------
// Gemini streaming tests
// ---------------------------------------------------------------------------

describe('Gemini streaming', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  // SSE chunks representing a streaming Gemini (OpenAI-compat) response
  const sseChunks = [
    'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"gemini-2.0-flash","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}\n\n',
    'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"gemini-2.0-flash","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":15,"total_tokens":20}}\n\n',
    'data: [DONE]\n\n',
  ];

  beforeEach(() => {
    mockBudgetSettle.mockClear();
    fetchMock = vi.fn().mockResolvedValue(
      new Response(makeStream(sseChunks), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('injects stream_options.include_usage into the forwarded body', async () => {
    await forwardToLlm(
      { model: 'gemini-2.0-flash', messages: [{ role: 'user', content: 'Hello' }], stream: true },
      holdId,
      agentId,
      makeDbMock(),
      { GEMINI_API_KEY: 'test-gemini-key' },
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { stream_options?: { include_usage?: boolean } };
    expect(body.stream_options).toBeDefined();
    expect(body.stream_options?.include_usage).toBe(true);
  });

  it('returns 200 with a streaming response', async () => {
    const res = await forwardToLlm(
      { model: 'gemini-2.0-flash', messages: [{ role: 'user', content: 'Hello' }], stream: true },
      holdId,
      agentId,
      makeDbMock(),
      { GEMINI_API_KEY: 'test-gemini-key' },
    );
    expect(res.status).toBe(200);
    expect(res.body).not.toBeNull();
  });

  it('calls budgetSettle with non-zero tokens from final SSE chunk usage', async () => {
    const res = await forwardToLlm(
      { model: 'gemini-2.0-flash', messages: [{ role: 'user', content: 'Hello' }], stream: true },
      holdId,
      agentId,
      makeDbMock(),
      { GEMINI_API_KEY: 'test-gemini-key' },
    );

    // Consume the stream to trigger processStreamAndSettle
    if (res.body) {
      await readStream(res.body);
    }

    // processStreamAndSettle calls budgetSettle after stream completes — wait a tick
    await new Promise((r) => setTimeout(r, 10));

    expect(mockBudgetSettle).toHaveBeenCalledWith(
      expect.anything(),
      holdId,
      { promptTokens: 5, completionTokens: 15 },
      'gemini-2.0-flash',
      agentId,
    );
  });

  it('pipes SSE chunks through to response body', async () => {
    const res = await forwardToLlm(
      { model: 'gemini-2.0-flash', messages: [{ role: 'user', content: 'Hello' }], stream: true },
      holdId,
      agentId,
      makeDbMock(),
      { GEMINI_API_KEY: 'test-gemini-key' },
    );

    const output = await readStream(res.body!);
    expect(output).toContain('data:');
    expect(output).toContain('gemini-2.0-flash');
  });
});

// ---------------------------------------------------------------------------
// Anthropic SSE streaming tests
// ---------------------------------------------------------------------------

/**
 * Helper: Build an Anthropic SSE stream from an array of {event, data} pairs.
 * Each entry is encoded as:
 *   event: <event>\n
 *   data: <JSON>\n
 *   \n
 */
function createAnthropicSSEStream(
  events: Array<{ event: string; data: object }>,
): ReadableStream<Uint8Array> {
  const chunks = events.map(
    ({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
  );
  return makeStream(chunks);
}

describe('Anthropic SSE streaming', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  const anthropicHoldId = 'hold-anthropic-sse-test';
  const anthropicAgentId = 'agent-anthropic-sse-test';

  function makeAnthropicEnv() {
    return { ANTHROPIC_API_KEY: 'test-anthropic-key' };
  }

  function makeAnthropicRequest(extra: Record<string, unknown> = {}) {
    return {
      model: 'claude-3-5-sonnet-20241022',
      messages: [{ role: 'user' as const, content: 'Hello' }],
      stream: true,
      ...extra,
    };
  }

  /** Full Anthropic SSE event sequence */
  function makeFullSSEStream(inputTokens = 25, finalOutputTokens = 15) {
    return createAnthropicSSEStream([
      {
        event: 'message_start',
        data: {
          type: 'message_start',
          message: { usage: { input_tokens: inputTokens, output_tokens: 1 } },
        },
      },
      {
        event: 'content_block_start',
        data: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      },
      {
        event: 'content_block_delta',
        data: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Hello' },
        },
      },
      {
        event: 'message_delta',
        data: {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: finalOutputTokens },
        },
      },
      { event: 'message_stop', data: { type: 'message_stop' } },
    ]);
  }

  beforeEach(() => {
    mockBudgetSettle.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('message_start: extracts input_tokens (ignores placeholder output_tokens: 1)', async () => {
    fetchMock = vi.fn().mockResolvedValue(
      new Response(makeFullSSEStream(25, 15), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await forwardToLlm(
      makeAnthropicRequest(),
      anthropicHoldId,
      anthropicAgentId,
      makeDbMock(),
      makeAnthropicEnv(),
    );

    // Consume the stream to trigger processAnthropicStreamAndSettle
    await readStream(res.body!);
    await new Promise((r) => setTimeout(r, 10));

    expect(mockBudgetSettle).toHaveBeenCalledWith(
      expect.anything(),
      anthropicHoldId,
      { promptTokens: 25, completionTokens: 15 },
      'claude-3-5-sonnet-20241022',
      anthropicAgentId,
    );
  });

  it('message_delta: uses overwrite (not sum) — two message_delta events with output_tokens 8 then 15 yields 15', async () => {
    // Two message_delta events: first output_tokens=8, second output_tokens=15
    // Expected: completionTokens=15 (overwrite), NOT 23 (sum)
    const stream = createAnthropicSSEStream([
      {
        event: 'message_start',
        data: {
          type: 'message_start',
          message: { usage: { input_tokens: 25, output_tokens: 1 } },
        },
      },
      {
        event: 'message_delta',
        data: {
          type: 'message_delta',
          delta: { stop_reason: null },
          usage: { output_tokens: 8 },
        },
      },
      {
        event: 'message_delta',
        data: {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: 15 },
        },
      },
      { event: 'message_stop', data: { type: 'message_stop' } },
    ]);

    fetchMock = vi.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await forwardToLlm(
      makeAnthropicRequest(),
      anthropicHoldId,
      anthropicAgentId,
      makeDbMock(),
      makeAnthropicEnv(),
    );

    await readStream(res.body!);
    await new Promise((r) => setTimeout(r, 10));

    expect(mockBudgetSettle).toHaveBeenCalledWith(
      expect.anything(),
      anthropicHoldId,
      { promptTokens: 25, completionTokens: 15 },
      'claude-3-5-sonnet-20241022',
      anthropicAgentId,
    );
  });

  it('no message_delta: conservatively accounts unknown usage', async () => {
    const stream = createAnthropicSSEStream([
      {
        event: 'message_start',
        data: {
          type: 'message_start',
          message: { usage: { input_tokens: 25, output_tokens: 1 } },
        },
      },
      { event: 'message_stop', data: { type: 'message_stop' } },
    ]);

    fetchMock = vi.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await forwardToLlm(
      makeAnthropicRequest(),
      anthropicHoldId,
      anthropicAgentId,
      makeDbMock(),
      makeAnthropicEnv(),
    );

    await readStream(res.body!);
    await new Promise((r) => setTimeout(r, 10));

    expect(mockBudgetSettle).toHaveBeenCalledWith(
      expect.anything(),
      anthropicHoldId,
      null,
      'claude-3-5-sonnet-20241022',
      anthropicAgentId,
    );
  });

  it('chunk boundary split: event: and data: lines arrive in separate chunks', async () => {
    // Split the message_start SSE event across two chunks at the line boundary
    const chunk1 = 'event: message_start\n';
    const chunk2 =
      'data: {"type":"message_start","message":{"usage":{"input_tokens":42,"output_tokens":1}}}\n\n';
    const chunk3 =
      'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":7}}\n\n';
    const chunk4 = 'event: message_stop\ndata: {"type":"message_stop"}\n\n';

    const stream = makeStream([chunk1, chunk2, chunk3, chunk4]);

    fetchMock = vi.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await forwardToLlm(
      makeAnthropicRequest(),
      anthropicHoldId,
      anthropicAgentId,
      makeDbMock(),
      makeAnthropicEnv(),
    );

    await readStream(res.body!);
    await new Promise((r) => setTimeout(r, 10));

    expect(mockBudgetSettle).toHaveBeenCalledWith(
      expect.anything(),
      anthropicHoldId,
      { promptTokens: 42, completionTokens: 7 },
      'claude-3-5-sonnet-20241022',
      anthropicAgentId,
    );
  });

  it('all SSE chunks are piped to client without data loss', async () => {
    const events = [
      {
        event: 'message_start',
        data: {
          type: 'message_start',
          message: { usage: { input_tokens: 10, output_tokens: 1 } },
        },
      },
      {
        event: 'content_block_delta',
        data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hi' } },
      },
      {
        event: 'message_delta',
        data: {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: 5 },
        },
      },
      { event: 'message_stop', data: { type: 'message_stop' } },
    ];

    // Compute expected bytes (the exact same encoding used in createAnthropicSSEStream)
    const encoder = new TextEncoder();
    const expectedBytes = events.reduce(
      (sum, { event, data }) =>
        sum + encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).byteLength,
      0,
    );

    const stream = createAnthropicSSEStream(events);

    fetchMock = vi.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await forwardToLlm(
      makeAnthropicRequest(),
      anthropicHoldId,
      anthropicAgentId,
      makeDbMock(),
      makeAnthropicEnv(),
    );

    const output = await readStream(res.body!);
    const outputBytes = encoder.encode(output).byteLength;
    expect(outputBytes).toBe(expectedBytes);
  });
});

// ---------------------------------------------------------------------------
// Gemini missing key tests
// ---------------------------------------------------------------------------

describe('Gemini missing API key', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockBudgetSettle.mockClear();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns 503 when GEMINI_API_KEY is undefined', async () => {
    const res = await forwardToLlm(
      { model: 'gemini-2.0-flash', messages: [{ role: 'user', content: 'Hello' }] },
      holdId,
      agentId,
      makeDbMock(),
      { GEMINI_API_KEY: undefined },
    );
    expect(res.status).toBe(503);
  });

  it('returns 503 when GEMINI_API_KEY is empty string', async () => {
    const res = await forwardToLlm(
      { model: 'gemini-2.0-flash', messages: [{ role: 'user', content: 'Hello' }] },
      holdId,
      agentId,
      makeDbMock(),
      { GEMINI_API_KEY: '' },
    );
    expect(res.status).toBe(503);
  });

  it('error body is sanitized', async () => {
    const res = await forwardToLlm(
      { model: 'gemini-2.0-flash', messages: [{ role: 'user', content: 'Hello' }] },
      holdId,
      agentId,
      makeDbMock(),
      {},
    );
    const body = await res.json() as { error: string };
    expect(body.error).toBe('provider request failed or usage unavailable');
  });

  it('does NOT call fetch when GEMINI_API_KEY is missing', async () => {
    await forwardToLlm(
      { model: 'gemini-2.0-flash', messages: [{ role: 'user', content: 'Hello' }] },
      holdId,
      agentId,
      makeDbMock(),
      {},
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('adversarial provider lifecycle', () => {
  const request = { model: 'gpt-4o', messages: [{ role: 'user' as const, content: 'synthetic' }] };
  const env = { OPENAI_API_KEY: 'synthetic-secret', AGENTGOV_PROVIDER_TIMEOUT_MS: '100' };
  const run = (stream = false, signal?: AbortSignal) => forwardToLlm({ ...request, stream }, holdId, agentId, makeDbMock(), env, signal);
  const unknown = () => expect(mockBudgetSettle).toHaveBeenCalledExactlyOnceWith(expect.anything(), holdId, null, request.model, agentId);
  beforeEach(() => { mockBudgetSettle.mockReset().mockResolvedValue(undefined); });
  afterEach(() => { vi.unstubAllGlobals(); });
  it('releases a missing-key hold before returning', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await forwardToLlm(request, holdId, agentId, makeDbMock(), {});
    expect(mockBudgetSettle).toHaveBeenCalledExactlyOnceWith(expect.anything(), holdId, { promptTokens: 0, completionTokens: 0 }, request.model, agentId);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not retry or leak transport exception/key; conservatively settles', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(env.OPENAI_API_KEY)));
    const response = await run();
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain(env.OPENAI_API_KEY);
    expect(fetch).toHaveBeenCalledTimes(1);
    unknown();
  });
  it.each(['not json', '{}', '{"usage":{"prompt_tokens":-1,"completion_tokens":2}}', '{"usage":{"prompt_tokens":1,"completion_tokens":"2"}}'])('does not settle malformed usage for free: %s', async data => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(data)));
    expect((await run()).status).toBe(502);
    unknown();
  });
  it('sets actual output cap to the same 4096 default reserved by gate', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ usage: { prompt_tokens: 1, completion_tokens: 2 } })));
    await run();
    expect(JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string).max_tokens).toBe(4096);
  });
  it('reassembles usage split in the middle of JSON', async () => {
    const text = 'data: {"choices":[],"usage":{"prompt_tokens":17,"completion_tokens":31}}\n\ndata: [DONE]\n\n';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(makeStream([...text]))));
    const response = await run(true);
    expect(await response.text()).toBe(text);
    expect(mockBudgetSettle).toHaveBeenCalledExactlyOnceWith(expect.anything(), holdId, { promptTokens: 17, completionTokens: 31 }, request.model, agentId);
  });
  it('requires terminal marker before trusting partial usage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(makeStream(['data: {"usage":{"prompt_tokens":1,"completion_tokens":2}}\n\n']))));
    await (await run(true)).text();
    unknown();
  });
  it('bounds a hanging fetch and does not retry', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    expect((await run()).status).toBe(502);
    expect(fetch).toHaveBeenCalledTimes(1);
    unknown();
  });
  it('bounds a hanging non-streaming response body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({ start() {} }))));
    expect((await run()).status).toBe(502);
    unknown();
  });
  it('settles when downstream cancels while upstream hangs', async () => {
    const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }))));
    const response = await run(true);
    await response.body!.cancel();
    expect(cancel).toHaveBeenCalled();
    unknown();
  });
  it('settles and terminates an upstream stream read error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(c) { c.error(new Error('synthetic')); } }))));
    const response = await run(true);
    expect(await response.text()).toContain('provider stream interrupted');
    unknown();
  });
  it('settles on client signal cancellation without replaying inference', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({ start() {} }))));
    const controller = new AbortController();
    const pending = run(false, controller.signal);
    controller.abort();
    expect((await pending).status).toBe(502);
    unknown();
  });
  it('deadline settles even a stream never consumed downstream', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(makeStream(['data: {}\n\n']))));
    const response = await run(true);
    await new Promise(resolve => setTimeout(resolve, 160));
    unknown();
    expect(await response.text()).toContain('provider stream interrupted');
  });
});
