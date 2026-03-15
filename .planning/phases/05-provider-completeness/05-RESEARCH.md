# Phase 5: Provider Completeness - Research

**Researched:** 2026-03-15
**Domain:** LLM provider forwarding — Gemini OpenAI-compat routing, Anthropic SSE streaming token extraction
**Confidence:** HIGH (codebase read directly; Anthropic SSE format verified via official docs; Gemini OpenAI-compat endpoint verified via official docs; existing patterns reused)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PROV-01 | `gemini-*` models forwarded via Gemini OpenAI-compat endpoint, non-streaming and streaming with accurate token settle | `resolveProvider()` already returns `'google'` for `gemini-*`; replace 503 stub with `forwardToGemini()` that calls `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`; reuse `processStreamAndSettle()` unchanged for streaming |
| PROV-02 | `GEMINI_API_KEY` absent returns 503 + clear error (same pattern as OpenAI/Anthropic) | Pattern already exists in `forwardToLlm()` lines 76-93; add identical guard for `provider === 'google'` checking `env.GEMINI_API_KEY`; add `GEMINI_API_KEY` to `ForwardEnv` interface, `wrangler.jsonc` vars, and `index.node.ts` env map |
| PROV-03 | Anthropic streaming settles with actual `input_tokens`/`output_tokens` from SSE events, not 0 | Replace `pipeAndSettle()` call in `forwardToAnthropic()` streaming branch with `processAnthropicStreamAndSettle()`; parse `message_start` (input_tokens) and `message_delta` (output_tokens, cumulative — take last) |
</phase_requirements>

---

## Summary

Phase 5 closes two known bugs in `forward.ts` introduced intentionally in v1.0 as deferred TODOs. The first bug is that `gemini-*` model requests return a 503 stub — the routing logic already works (`resolveProvider()` returns `'google'`) but the implementation branch is missing. The second is that Anthropic streaming calls settle at 0 tokens, meaning all streaming Claude requests are free in the budget ledger until the hold expires.

Both fixes are confined to a single file: `packages/proxy/src/passthrough/forward.ts`. No database schema changes, no new dependencies (Gemini uses the same OpenAI-compat SSE format as OpenAI, so `processStreamAndSettle()` can be reused without modification), and no changes to the request pipeline in `index.ts` beyond adding `GEMINI_API_KEY` passthrough. The wiring work (env var in wrangler.jsonc + index.node.ts) is similarly trivial.

The one risk area is that Gemini's OpenAI-compat layer's support for `stream_options: { include_usage: true }` is MEDIUM confidence — it has been community-confirmed but not officially documented. The plan must include a streaming integration test that verifies actual token counts arrive in the final SSE chunk. If `stream_options` is not honoured, the fallback is non-zero settle using the non-streaming path (Gemini supports non-streaming with accurate token counts unconditionally).

**Primary recommendation:** Two surgically scoped changes to `forward.ts` — add `forwardToGemini()` reusing existing `processStreamAndSettle()`, and replace `pipeAndSettle()` with `processAnthropicStreamAndSettle()` that parses named SSE events. Wire `GEMINI_API_KEY` in three config locations. No new dependencies needed.

---

## Standard Stack

### Core (no new installs — all existing)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Web Fetch API | Built-in (Workers) | HTTP forwarding to Gemini and Anthropic | Already used throughout `forward.ts`; Workers-native, no Node.js polyfill |
| `TextDecoder` | Built-in (Workers) | SSE chunk decoding for Anthropic token parsing | Already used in `processStreamAndSettle()` — identical pattern |
| `TransformStream` | Built-in (Workers) | Stream pipe with interception | Already used in `forwardToOpenAI()` streaming branch — same pattern for Anthropic |

### Supporting (no new installs)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `budgetSettle` | internal | Settle hold with actual tokens after stream | Called at end of both new stream functions |
| `forwardWithRetry` | internal | Retry with backoff on 429/5xx | Wrap Gemini fetch call same as OpenAI/Anthropic |
| `parseRetryConfig` | internal | Parse retry env vars | Already used in both existing provider functions |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw `fetch()` + `TextDecoder` for Gemini | `@google/genai` SDK | STACK.md considered `@google/genai` but it requires format translation (OpenAI messages → Gemini `contents[]` + `system_instruction`). The OpenAI-compat endpoint is format-translation-free; use the simpler path |
| `processStreamAndSettle()` reuse for Gemini | New `processGeminiStreamAndSettle()` | Gemini OpenAI-compat returns identical SSE format as OpenAI — no separate function needed |
| Inline `processAnthropicStreamAndSettle()` logic | Separate helper module | ~50 lines; keeping inline in `forward.ts` matches the existing `processStreamAndSettle()` pattern |

**Installation:** No new packages required for Phase 5.

---

## Architecture Patterns

### Recommended Project Structure (Phase 5 changes only)

```
packages/proxy/
├── src/
│   └── passthrough/
│       └── forward.ts          # MODIFY: add forwardToGemini(), processAnthropicStreamAndSettle()
│                                          ForwardEnv: add GEMINI_API_KEY
│                                          forwardToLlm(): add Gemini branch, fix Google 503 stub
│                                          Remove pipeAndSettle() or keep as dead code
├── wrangler.jsonc               # MODIFY: add "GEMINI_API_KEY": "" to vars block
└── src/
    └── index.ts                 # MODIFY: pass GEMINI_API_KEY in forwardToLlm() call (line ~192)
    └── index.node.ts            # MODIFY: add env['GEMINI_API_KEY'] mapping in middleware
```

### Pattern 1: Gemini Provider Branch (forwardToGemini)

**What:** Replace the 503 stub for `provider === 'google'` with a real forward function. Structurally identical to `forwardToOpenAI()` — same `forwardWithRetry` wrapper, same `processStreamAndSettle()` for streaming, same `stream_options: { include_usage: true }` injection. The only differences are the endpoint URL and the API key.

**When to use:** Any request where `resolveProvider()` returns `'google'`.

**Implementation:**

```typescript
// Source: codebase (forward.ts forwardToOpenAI as reference) + Gemini API docs
async function forwardToGemini(
  requestBody: ChatCompletionRequest,
  holdId: HoldId,
  agentId: AgentId,
  db: DbClient,
  apiKey: string,
  retryEnv: Record<string, string | undefined> = {},
): Promise<Response> {
  const isStreaming = requestBody.stream === true;
  const forwardBody = isStreaming
    ? { ...requestBody, stream_options: { include_usage: true } }
    : requestBody;

  const retryConfig = parseRetryConfig(retryEnv);

  const llmResponse = await forwardWithRetry(
    () =>
      fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,  // Same header format as OpenAI
        },
        body: JSON.stringify(forwardBody),
      }),
    retryConfig,
    db,
    holdId,
    agentId,
    requestBody.model,
  );

  if (!llmResponse.ok) return llmResponse;  // 502 from retry engine

  if (!isStreaming) {
    const responseJson = await llmResponse.json() as {
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const promptTokens = responseJson.usage?.prompt_tokens ?? 0;
    const completionTokens = responseJson.usage?.completion_tokens ?? 0;
    budgetSettle(db, holdId, { promptTokens, completionTokens }, requestBody.model, agentId)
      .catch(err => console.error('forwardToGemini: budgetSettle failed:', err));
    return new Response(JSON.stringify(responseJson), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Streaming — Gemini compat returns OpenAI SSE format; reuse processStreamAndSettle()
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  processStreamAndSettle(llmResponse.body!, writer, db, holdId, agentId, requestBody.model)
    .catch(err => console.error('forwardToGemini: stream error:', err));
  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': llmResponse.headers.get('Content-Type') ?? 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
```

### Pattern 2: Anthropic SSE Event-Type Tracking

**What:** Anthropic's SSE format uses named events (`event: message_start\ndata: {...}\n\n`), unlike OpenAI which uses only anonymous `data:` lines. The parser must track the most recently seen `event:` line to know how to interpret the following `data:` line.

**Critical distinction:** `message_delta.usage.output_tokens` is cumulative (total output so far), not incremental. Overwrite `outputTokens` on each `message_delta` occurrence — do NOT sum.

**When to use:** Only for Anthropic streaming. OpenAI/Gemini streaming uses `processStreamAndSettle()` instead.

**Implementation:**

```typescript
// Source: Anthropic Streaming Messages API docs (https://docs.anthropic.com/en/api/messages-streaming)
//         + codebase (processStreamAndSettle as structural reference)
async function processAnthropicStreamAndSettle(
  body: ReadableStream<Uint8Array>,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  db: DbClient,
  holdId: HoldId,
  agentId: AgentId,
  model: string,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let inputTokens = 0;
  let outputTokens = 0;
  let buffer = '';
  let currentEvent = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      await writer.write(value);   // pipe to client FIRST — do not buffer
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';  // last incomplete line stays in buffer

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const evt = JSON.parse(data) as Record<string, unknown>;
            if (currentEvent === 'message_start') {
              const msg = evt['message'] as Record<string, unknown> | undefined;
              const usage = msg?.['usage'] as Record<string, unknown> | undefined;
              inputTokens = (usage?.['input_tokens'] as number) ?? 0;
            }
            if (currentEvent === 'message_delta') {
              const usage = evt['usage'] as Record<string, unknown> | undefined;
              // Overwrite, not sum — output_tokens is cumulative
              outputTokens = (usage?.['output_tokens'] as number) ?? outputTokens;
            }
          } catch { /* skip malformed */ }
        }
      }
    }
  } finally {
    await writer.close();
  }

  budgetSettle(db, holdId, { promptTokens: inputTokens, completionTokens: outputTokens }, model, agentId)
    .catch(err => console.error('processAnthropicStreamAndSettle: budgetSettle failed:', err));
}
```

### Pattern 3: ForwardEnv Extension + GEMINI_API_KEY Wiring

**What:** Three co-located changes needed for `GEMINI_API_KEY`:
1. `forward.ts` `ForwardEnv` interface: add `GEMINI_API_KEY?: string`
2. `wrangler.jsonc` vars block: add `"GEMINI_API_KEY": ""`
3. `index.ts` line ~192: add `GEMINI_API_KEY: c.env?.GEMINI_API_KEY` to `forwardToLlm()` call
4. `index.node.ts` middleware: add `env['GEMINI_API_KEY'] = process.env['GEMINI_API_KEY'] ?? ''`

**The 503 guard in `forwardToLlm()` must be updated:**

```typescript
// Replace existing 'google' provider block (lines 94-104) with:
if (provider === 'google') {
  if (!env.GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({
        error: 'LLM provider API key not configured. Set GEMINI_API_KEY in wrangler secrets.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }
  return forwardToGemini(requestBody, holdId, agentId, db, env.GEMINI_API_KEY, retryEnv);
}
```

### Anti-Patterns to Avoid

- **Summing `message_delta.usage.output_tokens` across multiple events:** Anthropic output token values are cumulative. Summing gives 2x or more than actual tokens billed. Take only the last value.
- **Using `message_start.usage.output_tokens` as final output count:** The value in `message_start` is always 1 (a partial pre-emission count). Final output comes from `message_delta`.
- **Adding a separate `@google/genai` SDK for Gemini:** The OpenAI-compat endpoint accepts the same body the proxy already receives — no format translation. Installing a new SDK adds unnecessary complexity and bundle size.
- **Re-buffering the full Anthropic response before parsing:** Doubles memory use on large streaming responses. Parse incrementally as chunks arrive (write to client first, then parse the already-decoded text).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gemini token extraction from streaming | Custom SSE parser for Gemini | Reuse `processStreamAndSettle()` | Gemini OpenAI-compat returns identical SSE format — `usage.prompt_tokens`/`usage.completion_tokens` in final chunk when `stream_options.include_usage: true` is set |
| Retry on Gemini 429/5xx | Custom retry loop for Gemini | `forwardWithRetry()` | Already handles transient error classification, exponential backoff, jitter, and hold settle-at-zero on retry exhaustion |
| Budget settle after Anthropic stream | Inline settle inside stream loop | `budgetSettle()` after `writer.close()` | Hold/Settle contract requires settle only after complete response; partial settle mid-stream is not atomic |

**Key insight:** Both changes are internal rewrites of existing stubs — the integration seams are already designed. The planner should not add abstractions or helper modules; the change is filling in two function bodies in an existing file.

---

## Common Pitfalls

### Pitfall 1: `message_delta.output_tokens` Is Cumulative, Not a Delta

**What goes wrong:** Developer sums all `message_delta.usage.output_tokens` values across the stream. For a response with 5 `message_delta` events, the settle records 5x the actual token count.

**Why it happens:** The field name says "delta" (change), but the usage values inside are cumulative totals. Real-world bug: reported in Cline issue #4346 and LangChain issue #10249 — this is a frequently-made mistake.

**How to avoid:** Use `outputTokens = evt.usage?.output_tokens ?? outputTokens` (overwrite pattern) rather than `outputTokens += evt.usage?.output_tokens ?? 0` (sum pattern).

**Warning signs:** Anthropic streaming costs appear 3-10x higher than non-streaming for the same prompt — a classic sign of summing cumulative values.

### Pitfall 2: `message_start.usage.output_tokens` Is Not the Final Count

**What goes wrong:** Developer uses `message_start.message.usage.output_tokens` as the output token count and ignores `message_delta` events. The settle records 1 output token for every streaming request.

**Why it happens:** `message_start` contains a `usage` object that includes both `input_tokens` (correct) and `output_tokens: 1` (placeholder for the pre-stream estimate). Anthropic emits this before generation, so the value is not meaningful.

**How to avoid:** Extract `input_tokens` from `message_start`; extract `output_tokens` from `message_delta` (last occurrence). Never use `message_start.message.usage.output_tokens`.

### Pitfall 3: Gemini `stream_options` Support Is Medium Confidence

**What goes wrong:** `stream_options: { include_usage: true }` is silently ignored by the Gemini OpenAI-compat layer in some configurations. The final SSE chunk carries no `usage` field. `processStreamAndSettle()` records 0 tokens (same bug as Anthropic streaming v1.0).

**Why it happens:** Gemini's OpenAI-compat endpoint does not officially document `stream_options` support. Community reports confirm it works for some models (gemini-2.0-flash) but behavior may vary by model or region.

**How to avoid:** Write a streaming integration test that:
1. Sends a `gemini-*` streaming request with `stream_options: { include_usage: true }`
2. Asserts `promptTokens > 0` and `completionTokens > 0` in the settle audit event

If the test fails (tokens remain 0), the plan for PROV-01 streaming must fall back to using Gemini non-streaming for token counts (fetch non-streaming response for token extraction, then re-stream from cache — complex) or document the limitation and settle at estimated tokens using the hold amount.

**Warning signs:** Audit log shows Gemini streaming costs of exactly $0 despite successful responses.

### Pitfall 4: SSE Chunk Boundary Splits an Event Across Two Reads

**What goes wrong:** An SSE event like `event: message_start\ndata: {...}\n\n` arrives split across two chunk reads: chunk 1 has `event: message_start\n` and chunk 2 has `data: {...}\n\n`. The parser in chunk 1 sets `currentEvent = 'message_start'` but immediately tries to parse the `data:` line which isn't there yet. When chunk 2 arrives, `currentEvent` may have been reset by another `event:` line.

**Why it happens:** TCP/HTTP chunking does not align to SSE event boundaries. Large chunks may contain multiple events; small chunks may split a single event.

**How to avoid:** Use the buffer pattern: accumulate decoded text in a `buffer` string, split on `\n` to get complete lines, keep the last potentially-incomplete line in `buffer` for the next chunk. The `currentEvent` variable persists across lines within a chunk, and across chunks, until a new `event:` line updates it. The implementation pattern in Pattern 2 above handles this correctly.

### Pitfall 5: Forgetting `GEMINI_API_KEY` in index.node.ts

**What goes wrong:** `GEMINI_API_KEY` is added to `wrangler.jsonc` and `ForwardEnv` and `index.ts`, but the Docker entry point `index.node.ts` is missed. Gemini requests in local Docker Compose development return 503 despite the key being set in the environment.

**Why it happens:** There are two entry points for Workers vs Node — changes to the env mapping must be applied in both.

**How to avoid:** Treat the `GEMINI_API_KEY` wiring as a three-file atomic change: `wrangler.jsonc` + `index.ts` + `index.node.ts` are committed together.

---

## Code Examples

### Anthropic SSE Event Sequence (Official Format)

```
event: message_start
data: {"type":"message_start","message":{"id":"msg_...","usage":{"input_tokens":25,"output_tokens":1}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":15}}

event: message_stop
data: {"type":"message_stop"}
```

Token extraction: `input_tokens = 25` (from `message_start`), `output_tokens = 15` (from `message_delta`, final occurrence). The `output_tokens: 1` in `message_start` is a placeholder — discard it.

Source: Anthropic Streaming Messages API docs (https://docs.anthropic.com/en/api/messages-streaming) — HIGH confidence.

### Gemini OpenAI-Compat Endpoint

```
POST https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
Authorization: Bearer $GEMINI_API_KEY
Content-Type: application/json

{
  "model": "gemini-2.0-flash",
  "messages": [...],
  "stream": true,
  "stream_options": { "include_usage": true }
}
```

Response SSE format matches OpenAI: final chunk contains `"usage":{"prompt_tokens":N,"completion_tokens":M}`.

Source: Gemini API OpenAI Compatibility docs (https://ai.google.dev/gemini-api/docs/openai) — MEDIUM confidence (endpoint URL verified; `stream_options` support community-confirmed, not officially documented).

### GEMINI_API_KEY in ForwardEnv

```typescript
// Source: forward.ts lines 24-29 (existing interface, extend in place)
export interface ForwardEnv {
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;       // ADD: Phase 5
  AGENTGOV_MAX_RETRIES?: string;
  AGENTGOV_RETRY_BASE_MS?: string;
}
```

### GEMINI_API_KEY in index.ts forwardToLlm call

```typescript
// Source: index.ts line ~192 (existing call, extend)
const llmResponse = await forwardToLlm(body, holdId, agentId, db, {
  OPENAI_API_KEY: c.env?.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: c.env?.ANTHROPIC_API_KEY,
  GEMINI_API_KEY: c.env?.GEMINI_API_KEY,   // ADD: Phase 5
});
```

### GEMINI_API_KEY in index.node.ts env map

```typescript
// Source: index.node.ts lines 59-73 (existing middleware, add one line)
env['GEMINI_API_KEY'] = process.env['GEMINI_API_KEY'] ?? '';   // ADD: Phase 5
```

### GEMINI_API_KEY in wrangler.jsonc

```jsonc
// Source: wrangler.jsonc lines 20-38 (existing vars block, add one entry)
"GEMINI_API_KEY": "",   // ADD: Phase 5 — set actual value in .dev.vars or wrangler secret
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `pipeAndSettle()` — Anthropic streaming settles 0 tokens | `processAnthropicStreamAndSettle()` — parse `message_start`/`message_delta` for real tokens | Phase 5 | Eliminates silent zero-cost bug for all streaming Claude calls |
| Gemini `provider === 'google'` → 503 stub | `forwardToGemini()` → actual Gemini API forwarding | Phase 5 | Gemini becomes a functional provider in the proxy |
| Anthropic SSE parsed with OpenAI-style `data:`-only parser | Event-type-aware parser tracking `event:` lines before `data:` lines | Phase 5 | Correct token extraction from named SSE events |

**Deprecated/outdated:**
- `pipeAndSettle()`: replaced by `processAnthropicStreamAndSettle()`. Can be removed after PROV-03 is implemented. It's only called in one place.

---

## Open Questions

1. **Gemini `stream_options.include_usage` reliability**
   - What we know: Community reports confirm it works for `gemini-2.0-flash`; no official documentation
   - What's unclear: Whether all Gemini models in `pricing.json` support it; whether it varies by region
   - Recommendation: Integration test must assert `promptTokens > 0` after a real Gemini streaming call. If tokens are 0, escalate to STATE.md as a blocker before declaring PROV-01 complete.

2. **New Gemini model pricing entries**
   - What we know: `pricing.json` has `gemini-1.5-pro`, `gemini-1.5-flash`, `gemini-2.0-flash` — the three models that were current at v1.0
   - What's unclear: Whether `gemini-2.0-pro` or `gemini-2.5-pro` should be added for Phase 5
   - Recommendation: Phase 5 plan should include a task to audit current Gemini pricing and add any models that have launched since 2026-03-13. Unknown models already fail closed (422 from `estimateCost`), so this is not blocking but should be addressed.

3. **`pipeAndSettle()` removal timing**
   - What we know: `pipeAndSettle()` will be unused after PROV-03 is implemented
   - What's unclear: Whether it should be removed in the same plan as PROV-03 or a separate cleanup
   - Recommendation: Remove it in the same commit as PROV-03 — unused functions are dead code, and the TODO comment is fulfilled.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest v2 (pinned — v4 requires vite@6, workspace has vite@5) |
| Config file (Workers pool) | `packages/proxy/vitest.config.ts` — runs `src/**/*.test.ts` |
| Config file (Node.js) | `packages/proxy/vitest.config.node.ts` — runs specified test files |
| Quick run command | `pnpm --filter @agentgov/proxy exec vitest run --config vitest.config.ts` |
| Full suite command | `pnpm --filter @agentgov/proxy exec vitest run --config vitest.config.ts && pnpm --filter @agentgov/proxy exec vitest run --config vitest.config.node.ts` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROV-01 | `gemini-*` non-streaming: returns 200 with real LLM response | integration (mock fetch) | `pnpm --filter @agentgov/proxy exec vitest run --config vitest.config.ts src/passthrough/forward.test.ts -t "Gemini non-streaming"` | ❌ Wave 0 |
| PROV-01 | `gemini-*` streaming: final SSE chunk has usage, settle is non-zero | integration (mock fetch) | `pnpm --filter @agentgov/proxy exec vitest run --config vitest.config.ts src/passthrough/forward.test.ts -t "Gemini streaming"` | ❌ Wave 0 |
| PROV-01 | `gemini-*` streaming `stream_options.include_usage` is injected | unit | same file | ❌ Wave 0 |
| PROV-02 | `gemini-*` with `GEMINI_API_KEY` absent returns 503 with error message | unit | `pnpm --filter @agentgov/proxy exec vitest run --config vitest.config.ts src/passthrough/forward.test.ts -t "Gemini missing key"` | ❌ Wave 0 |
| PROV-03 | Anthropic streaming: `message_start` extracts `input_tokens` | unit | `pnpm --filter @agentgov/proxy exec vitest run --config vitest.config.ts src/passthrough/forward.test.ts -t "Anthropic SSE"` | ❌ Wave 0 |
| PROV-03 | Anthropic streaming: last `message_delta` extracts `output_tokens` (not summed) | unit | same file | ❌ Wave 0 |
| PROV-03 | Anthropic streaming: settle called with `promptTokens > 0` and `completionTokens > 0` | unit | same file | ❌ Wave 0 |
| PROV-03 | Anthropic streaming: no `message_delta` → settle with 0 tokens (safe degradation) | unit | same file | ❌ Wave 0 |
| PROV-03 | `pipeAndSettle()` no longer called (Anthropic streaming path) | unit/smoke | same file | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter @agentgov/proxy exec vitest run --config vitest.config.ts src/passthrough/forward.test.ts`
- **Per wave merge:** `pnpm --filter @agentgov/proxy exec vitest run --config vitest.config.ts && pnpm --filter @agentgov/proxy exec vitest run --config vitest.config.node.ts`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/proxy/src/passthrough/forward.test.ts` — new test file covering PROV-01, PROV-02, PROV-03 (no test file exists for `forward.ts` currently)

Note: `forward.test.ts` must be added to `vitest.config.node.ts`'s exclude list (since it has Workers-runtime dependencies) OR run exclusively under `vitest.config.ts` (Workers pool). Given `forward.ts` uses `fetch`, `TransformStream`, `TextDecoder` — all Workers/Web APIs — the Workers pool config (`vitest.config.ts`) is the correct runner. The file is already included via `src/**/*.test.ts` glob.

---

## Sources

### Primary (HIGH confidence)

- Codebase: `packages/proxy/src/passthrough/forward.ts` — read directly; exact function signatures, TODOs, and implementation hooks verified
- Codebase: `packages/proxy/src/index.ts` lines 191-194 — `forwardToLlm()` call with env passthrough
- Codebase: `packages/proxy/src/index.node.ts` lines 59-73 — env mapping middleware
- Codebase: `packages/proxy/wrangler.jsonc` lines 20-38 — vars block
- Codebase: `packages/proxy/pricing.json` — confirmed `gemini-1.5-pro`, `gemini-1.5-flash`, `gemini-2.0-flash` entries
- [Anthropic Streaming Messages API](https://docs.anthropic.com/en/api/messages-streaming) — `message_start`/`message_delta`/`message_stop` event structure and usage field locations
- `.planning/research/FEATURES.md` sections on Gemini Provider and Anthropic Streaming Settle — full analysis of both features
- `.planning/research/ARCHITECTURE.md` sections on Feature 1 (Gemini) and Feature 2 (Anthropic Streaming) — integration patterns and data flow diagrams
- `.planning/STATE.md` decisions — `Anthropic SSE parser must track message_start (input_tokens) AND message_delta (output_tokens) — do not sum message_delta values (they are cumulative)` locked decision

### Secondary (MEDIUM confidence)

- [Gemini API OpenAI Compatibility](https://ai.google.dev/gemini-api/docs/openai) — endpoint URL `https://generativelanguage.googleapis.com/v1beta/openai/`, Authorization header format
- [Gemini stream_options forum discussion](https://discuss.ai.google.dev/t/gemini-openai-compatibility-does-it-support-the-stream-options-parameter/92785) — community-confirmed `stream_options` support; not official docs

### Tertiary (LOW confidence)

- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; reuses existing functions verified in codebase
- Architecture: HIGH — exact file locations, line numbers, and function signatures read from live code
- Anthropic SSE format: HIGH — official docs + real-world bug reports from Cline and LangChain confirming cumulative vs delta behavior
- Gemini streaming token support: MEDIUM — community-confirmed, needs integration test to validate
- Pitfalls: HIGH — PROV-03 pitfalls (cumulative token counting) verified against documented real-world bugs

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable APIs; Gemini compat endpoint format may change faster)
