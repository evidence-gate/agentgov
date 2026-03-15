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

  it('error body mentions GEMINI_API_KEY', async () => {
    const res = await forwardToLlm(
      { model: 'gemini-2.0-flash', messages: [{ role: 'user', content: 'Hello' }] },
      holdId,
      agentId,
      makeDbMock(),
      {},
    );
    const body = await res.json() as { error: string };
    expect(body.error).toContain('GEMINI_API_KEY');
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
