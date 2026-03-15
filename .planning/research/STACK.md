# Stack Research

**Domain:** Agent Governance Platform (proxy-layer cost enforcement, HITL, audit logging)
**Researched:** 2026-03-15 (v1.1 additions appended to 2026-03-13 v1.0 research)
**Confidence:** HIGH (core stack verified via official docs; version numbers from npm/PyPI; v1.1 additions verified via WebSearch + existing codebase inspection)

---

## Existing Validated Stack (v1.0 — DO NOT RE-RESEARCH)

The following are already installed and validated. v1.1 work integrates with these; no changes needed.

| Technology | Version | Status |
|------------|---------|--------|
| Hono | ^4.12.7 | Installed in `packages/proxy` |
| Wrangler | ^4 (4.73.0 latest) | Installed in `packages/proxy` devDeps |
| @cloudflare/vitest-pool-workers | latest | Installed |
| drizzle-orm | ^0.45.1 | Installed |
| drizzle-kit | ^0.31.9 | Installed |
| @libsql/client | ^0.14.0 | Installed |
| @hono/node-server | ^1.19.11 | Installed |
| React | ^19 | Installed in `packages/dashboard` |
| @tanstack/react-query | ^5 | Installed in `packages/dashboard` |
| Vite | ^6 | Installed in `packages/dashboard` |
| vitest | ^2 | Installed |
| httpx | >=0.24.0 | Installed in `packages/sdk-python` |

---

## v1.1 Stack Additions

### 1. Gemini Provider (packages/proxy)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@google/genai` | `^1.45.0` | Google Gemini API client — request format conversion + streaming with usage extraction | Official Google-authored SDK (googleapis/js-genai). GA since May 2025. Single package covers both Gemini Developer API and Vertex AI. Replaces the deprecated `@google/generative-ai`. Targets the Web Fetch API only — no Node.js built-ins — so it runs in Cloudflare Workers without polyfills or compat flags. |

**Install:**

```bash
# packages/proxy
pnpm add @google/genai
```

**Key API surface used in `forward.ts`:**

```typescript
import { GoogleGenAI } from '@google/genai';

// Gemini Developer API (API key)
const ai = new GoogleGenAI({ apiKey: env.GOOGLE_API_KEY });

// Vertex AI (service account / workload identity)
// const ai = new GoogleGenAI({ vertexai: true, project: env.GOOGLE_PROJECT, location: 'us-central1' });

// Non-streaming
const result = await ai.models.generateContent({ model, contents, generationConfig });
const inputTokens  = result.usageMetadata?.promptTokenCount ?? 0;
const outputTokens = result.usageMetadata?.candidatesTokenCount ?? 0;

// Streaming — usage is on the final chunk
for await (const chunk of await ai.models.generateContentStream({ model, contents, generationConfig })) {
  if (chunk.usageMetadata) {
    inputTokens  = chunk.usageMetadata.promptTokenCount ?? 0;
    outputTokens = chunk.usageMetadata.candidatesTokenCount ?? 0;
  }
}
```

**OpenAI → Gemini format conversion** (required in `forwardToGoogle` in `forward.ts`):

| OpenAI field | Gemini native field |
|---|---|
| `messages[].role === "system"` | Top-level `system_instruction: { parts: [{ text }] }` |
| `messages[].role === "user"\|"assistant"` | `contents[].role === "user"\|"model"` |
| `messages[].content` | `contents[].parts[{ text }]` |
| `max_tokens` | `generationConfig.maxOutputTokens` |
| `stream: true` | Use `generateContentStream()` instead of `generateContent()` |

**wrangler.toml addition needed:**

```toml
# packages/proxy/wrangler.toml — add to [vars] or inject as secret
# GOOGLE_API_KEY is a secret: wrangler secret put GOOGLE_API_KEY
```

Also add `GOOGLE_API_KEY?: string` to the `ForwardEnv` interface in `forward.ts`.

---

### 2. Anthropic Streaming SSE — Usage Extraction (packages/proxy)

**No new npm package needed.** The existing raw `fetch()` call to `api.anthropic.com/v1/messages` is correct. The `pipeAndSettle()` function in `forward.ts` needs to be replaced with a usage-extracting SSE parser.

**Anthropic SSE event sequence (HIGH confidence — official API docs):**

```
event: message_start
data: {"type":"message_start","message":{"usage":{"input_tokens":N,"output_tokens":0},...}}

event: content_block_start
event: content_block_delta       ← repeated for each text chunk
data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}
event: content_block_stop

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":M}}

event: message_stop
data: {"type":"message_stop"}
```

Key facts:
- `message_start.message.usage.input_tokens` — set once at stream open, does NOT change
- `message_delta.usage.output_tokens` — **cumulative** count, use the last occurrence
- No separate `usage_delta` event exists in Anthropic's SSE format (unlike OpenAI's `stream_options`)

**Implementation pattern** (no new dep — pure `TextDecoder` + line splitting, same pattern as OpenAI streaming in `forward.ts`):

```typescript
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

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      await writer.write(value);                    // pipe to client first
      buffer += decoder.decode(value, { stream: true });

      // Parse complete SSE lines
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.type === 'message_start') {
            inputTokens = evt.message?.usage?.input_tokens ?? 0;
          }
          if (evt.type === 'message_delta') {
            outputTokens = evt.usage?.output_tokens ?? outputTokens;
          }
        } catch { /* skip malformed */ }
      }
    }
  } finally {
    await writer.close();
  }

  budgetSettle(db, holdId, { promptTokens: inputTokens, completionTokens: outputTokens }, model, agentId)
    .catch(err => console.error('Anthropic SSE settle failed:', err));
}
```

**Integration:** Replace `pipeAndSettle()` call in `forwardToAnthropic()` with `processAnthropicStreamAndSettle()`.

---

### 3. Python SDK — Async Transport (packages/sdk-python)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `httpx` | `>=0.28.0` (bump from `>=0.24.0`) | Async HTTP transport base class | 0.28 is the current stable release. Removes the deprecated `proxies=` and `app=` kwargs that caused warnings when wrapping OpenAI/Anthropic SDKs. `AsyncBaseTransport.handle_async_request()` API is stable in 0.28. |
| `pytest-asyncio` | `^1.3.0` | Async test execution | Official pytest plugin for asyncio. Required for testing `AsyncAgentgovTransport`. Latest is 1.3.0. `asyncio_mode = "auto"` eliminates per-test decorator noise. |
| `anyio` | `>=4.0.0` | Async fixture support in tests | Used by httpx internally; explicit dev dep ensures consistent async fixture behavior in `pytest-asyncio`. |

**pyproject.toml changes:**

```toml
[project]
dependencies = [
    "httpx>=0.28.0",   # was >=0.24.0 — bump for stable AsyncBaseTransport API
]

[project.optional-dependencies]
dev = [
    "pytest>=7.0.0",
    "pytest-httpx>=0.21.0",
    "pytest-asyncio>=1.3.0",   # NEW — async test execution
    "anyio>=4.0.0",             # NEW — async fixture support
]

[tool.pytest.ini_options]
testpaths   = ["tests"]
asyncio_mode = "auto"          # NEW — avoids @pytest.mark.asyncio on every test
```

**`AsyncAgentgovTransport` pattern** — mirrors existing `AgentgovTransport(httpx.BaseTransport)` in `_transport.py`:

```python
import httpx
from typing import Optional, Any
from ._exceptions import AgentError, BudgetExceeded, HitlPending
import json


class AsyncAgentgovTransport(httpx.AsyncBaseTransport):
    """
    Async mirror of AgentgovTransport.

    Differences from the sync version:
    - Subclasses httpx.AsyncBaseTransport (not BaseTransport)
    - Overrides handle_async_request (not handle_request)
    - Uses httpx.AsyncHTTPTransport internally (not HTTPTransport)
    - close() becomes async aclose()
    """

    def __init__(
        self,
        proxy_url: str,
        agent_id: str,
        _inner: Optional[httpx.AsyncBaseTransport] = None,
        **kwargs: Any,
    ) -> None:
        self._proxy_url = proxy_url.rstrip("/")
        self._agent_id = agent_id
        self._inner = _inner if _inner is not None else httpx.AsyncHTTPTransport(**kwargs)

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        # URL rewriting — identical logic to sync version
        original_url = request.url
        proxy_base = httpx.URL(self._proxy_url)
        new_url = httpx.URL(
            scheme=proxy_base.scheme,
            host=proxy_base.host,
            port=proxy_base.port,
            path=original_url.path,
            query=original_url.query if original_url.query else b"",
        )
        headers = dict(request.headers)
        headers["x-agent-id"] = self._agent_id
        rewritten = httpx.Request(
            method=request.method,
            url=new_url,
            headers=headers,
            content=request.content,
        )

        response = await self._inner.handle_async_request(rewritten)
        await response.aread()
        content = response.content
        status  = response.status_code

        if status in (202, 429, 502):
            try:
                body = json.loads(content)
                error_dict = body.get("error") if isinstance(body, dict) else None
                if isinstance(error_dict, dict):
                    code = error_dict.get("code")
                    if status == 429 and code == "BUDGET_EXCEEDED":
                        raise BudgetExceeded(error_dict)
                    if status == 202 and code == "HITL_PENDING":
                        raise HitlPending(error_dict)
                    if status == 502 and code == "AGENT_ERROR":
                        raise AgentError(error_dict)
            except (json.JSONDecodeError, KeyError):
                pass

        return httpx.Response(
            status_code=response.status_code,
            headers=response.headers,
            content=content,
        )

    async def aclose(self) -> None:
        await self._inner.aclose()
```

**Public `__init__.py` addition** — expose `AsyncAgentgovTransport` alongside the sync version:

```python
# src/agentgov/__init__.py
from ._transport import AgentgovTransport
from ._transport_async import AsyncAgentgovTransport  # NEW file
```

**Test pattern** with `pytest-asyncio`:

```python
import pytest
import httpx
from agentgov import AsyncAgentgovTransport

@pytest.fixture
def mock_transport():
    # pytest-httpx provides MockTransport for async too
    ...

async def test_budget_exceeded_async(mock_transport):
    transport = AsyncAgentgovTransport(
        proxy_url="http://proxy",
        agent_id="test-agent",
        _inner=mock_transport,
    )
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(BudgetExceeded):
            await client.post("/v1/chat/completions", json={...})
```

---

### 4. Cloudflare Workers Deploy (packages/proxy)

**No new npm packages needed.** Wrangler `^4` is already in `devDependencies`. Current latest: **4.73.0**.

**`wrangler.toml` additions needed** (Turso cloud secrets + Workflows + GOOGLE_API_KEY):

```toml
name              = "agentgov-proxy"
main              = "src/index.ts"
compatibility_date = "2024-10-22"   # REQUIRED for Workflows binding; bump from current value

# Cloudflare Workflows binding for HITL durable approval (v1.1)
[[workflows]]
binding    = "HITL_WORKFLOW"
name       = "hitl-approval"
class_name = "HitlApprovalWorkflow"

# Turso cloud credentials are secrets — NOT in wrangler.toml
# Set via: wrangler secret put LIBSQL_DB_URL
#          wrangler secret put LIBSQL_DB_AUTH_TOKEN
#          wrangler secret put OPENAI_API_KEY
#          wrangler secret put ANTHROPIC_API_KEY
#          wrangler secret put GOOGLE_API_KEY   ← NEW for v1.1

[env.production]
name = "agentgov-proxy"

[env.staging]
name = "agentgov-proxy-staging"
```

**`@libsql/client` import** (already installed at `^0.14.0`; no version change needed):

```typescript
// MUST use /web subpath in Workers — default import uses Node.js `net` module
import { createClient } from '@libsql/client/web';
```

**Workflows class** (new file: `src/hitl/workflow.ts`):

```typescript
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';

interface HitlParams { requestId: string; agentId: string; action: string; }

export class HitlApprovalWorkflow extends WorkflowEntrypoint<Env, HitlParams> {
  async run(event: WorkflowEvent<HitlParams>, step: WorkflowStep) {
    const result = await step.waitForEvent<{ approved: boolean }>('approval', {
      timeout: '24h',
    });
    return { approved: result.payload.approved };
  }
}
```

**After any `wrangler.toml` change**, run:

```bash
pnpm --filter @agentgov/proxy run types   # regenerates worker-configuration.d.ts
```

**Deploy commands** (existing scripts in `package.json` already have these):

```bash
wrangler secret put GOOGLE_API_KEY        # new for v1.1
wrangler secret put LIBSQL_DB_URL         # Turso cloud URL
wrangler secret put LIBSQL_DB_AUTH_TOKEN  # Turso auth token
wrangler deploy                           # production
```

---

### 5. Per-Agent Budget UI — React Mutation Patterns (packages/dashboard)

**No new npm packages needed.** React 19 + `@tanstack/react-query ^5` are already installed.

**Recommended mutation pattern** for the budget CRUD form:

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';

function useBudgetUpdate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (vars: { agentId: string; limitCents: number }) =>
      fetch(`/api/agents/${vars.agentId}/budget`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit_cents: vars.limitCents }),
      }).then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); }),

    // Optimistic update: show new value immediately
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ['agents'] });
      const previous = queryClient.getQueryData(['agents']);
      queryClient.setQueryData(['agents'], (old: Agent[] | undefined) =>
        (old ?? []).map(a =>
          a.id === vars.agentId ? { ...a, budget_limit_cents: vars.limitCents } : a
        )
      );
      return { previous };
    },

    // Rollback on error
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(['agents'], ctx?.previous);
    },

    // Always sync with server state after settle
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}
```

**Form state** — use React 19's built-in `useActionState` (replaces the deprecated `useFormState`). No `react-hook-form` or Zod needed for a single-field form:

```typescript
import { useActionState } from 'react';

function BudgetForm({ agentId }: { agentId: string }) {
  const mutation = useBudgetUpdate();
  const [state, formAction, isPending] = useActionState(
    async (_prev: unknown, formData: FormData) => {
      const cents = parseInt(formData.get('limit_dollars') as string) * 100;
      await mutation.mutateAsync({ agentId, limitCents: cents });
      return { ok: true };
    },
    null
  );

  return (
    <form action={formAction}>
      <input name="limit_dollars" type="number" min="1" step="1" required />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Saving…' : 'Set Budget'}
      </button>
      {state?.ok && <span>Saved</span>}
    </form>
  );
}
```

**Proxy API route needed** (`PATCH /api/agents/:id/budget` in Hono router):

```typescript
// packages/proxy/src/dashboard/routes.ts
app.patch('/api/agents/:id/budget', async (c) => {
  const { id } = c.req.param();
  const { limit_cents } = await c.req.json<{ limit_cents: number }>();
  // validate limit_cents > 0
  const updated = await db.update(agents)
    .set({ budget_limit_cents: limit_cents })
    .where(eq(agents.id, id))
    .returning();
  return c.json(updated[0]);
});
```

---

## Updated Installation Summary

### Proxy (new additions only)

```bash
# packages/proxy
pnpm add @google/genai
# wrangler ^4 already installed — no change
# @libsql/client ^0.14.0 already installed — no change
```

### Python SDK (version bumps + new dev deps)

```bash
# packages/sdk-python — update pyproject.toml, then:
pip install -e ".[dev]"
# Changes: httpx >=0.24.0 → >=0.28.0; add pytest-asyncio>=1.3.0; anyio>=4.0.0
```

### Dashboard — no new packages

React 19 `useActionState` and TanStack Query v5 `useMutation` are already installed.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `@google/genai` (native Gemini SDK) | OpenAI-compatible Gemini endpoint (`generativelanguage.googleapis.com/v1beta/openai/`) | Only if zero format conversion code is desired. The OpenAI-compat endpoint lacks reliable `usageMetadata` on streaming chunks — output token count is unavailable mid-stream, making accurate budget settle impossible. |
| Raw `fetch()` + `TextDecoder` for Anthropic SSE | `@anthropic-ai/sdk` stream helpers (`client.messages.stream().finalMessage()`) | Only if agentgov becomes a Node-only proxy. In Cloudflare Workers, the Anthropic SDK's stream helpers add dependency surface and a Node-specific event emitter model. Raw SSE parsing is 20 lines and has no deps. |
| `pytest-asyncio` | `anyio` pytest plugin | Only if the codebase needs to run on trio (not just asyncio). No practical advantage for this use case — asyncio is what httpx and the OpenAI/Anthropic Python SDKs use. |
| `useActionState` + uncontrolled form | `react-hook-form` + zod | Only if the budget form grows to 5+ fields with complex cross-field validation. A single numeric input does not justify the 25KB+ dependency cost. |
| Cloudflare Workflows for HITL | Durable Objects with explicit state polling | If HITL approval timeouts consistently exceed 24 hours. Workflows has a configurable step timeout; Durable Objects require building the entire wait/resume loop manually. |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@google/generative-ai` (old package) | Deprecated. Will not receive Gemini 2.0+ features. Last significant update was pre-GA. Confusingly similar name to `@google/genai`. | `@google/genai ^1.45.0` |
| `@anthropic-ai/sdk` in the proxy | Adds Node.js-targeted code to the Workers bundle. The existing raw-fetch approach is already correct for Anthropic non-streaming. SSE parsing via TextDecoder has no Workers compatibility risk. | Raw `fetch()` + `TextDecoder` SSE parsing |
| `react-hook-form` or `zod` in dashboard | Per-agent budget UI has one numeric input. Adding 25KB+ of form library for this use case is over-engineering. React 19 `useActionState` + native HTML validation is sufficient. | `useActionState` built into React 19 |
| `httpx<0.28` for async transport | Pre-0.28 versions have deprecated `proxies=` and `app=` kwargs that emit warnings when wrapping the OpenAI/Anthropic Python SDKs. The `AsyncBaseTransport.handle_async_request` signature is fully stable only from 0.28 onward. | `httpx>=0.28.0` |
| `@libsql/client` default import in Workers | The default import path uses Node.js `net` module, which crashes in the Workers runtime at deploy time. | `import { createClient } from '@libsql/client/web'` |

---

## Version Compatibility (v1.1 additions)

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@google/genai@^1.45.0` | Wrangler `^4`, TypeScript `^5`, `compatibility_date >= "2024-09-23"` | Uses Web Fetch API only — no Node built-ins. Works in Workers without compat flags beyond the date requirement. |
| `@libsql/client@^0.14.0` (no change) | Workers runtime (web import only) | Must use `/web` subpath. Default import breaks at deploy time. No version change needed. |
| `httpx>=0.28.0` | Python 3.8+, openai `>=1.0.0`, anthropic `>=0.20.0` | 0.28 removes deprecated kwargs — clean interface for custom transports. No breaking changes to `AsyncBaseTransport` API. |
| `pytest-asyncio@^1.3.0` | `pytest>=7.0.0`, `httpx>=0.24` | Use `asyncio_mode = "auto"` in `pyproject.toml` to avoid decorator noise. |
| Cloudflare Workflows binding | `compatibility_date >= "2024-10-22"`, Wrangler v4+ | GA since April 2025. Workers Paid plan required for > 1,000 steps. Free plan supports basic Workflows with step limits. |
| React 19 `useActionState` | `@tanstack/react-query ^5` | `useActionState` is built into React 19 — no extra install. `useMutation.mutateAsync()` is awaitable from within an action. |

---

## Recommended Core Technologies (v1.0, retained for reference)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Hono | 4.12.7 | HTTP framework for Workers + SDK API server | Edge-native, zero cold-start overhead. Runs identically on Workers and Node.js for Docker Compose. |
| Cloudflare Workers | Runtime (Wrangler 4.x) | Cloud compute + routing | Edge routing at 300+ PoPs, <1ms cold start. |
| Cloudflare Workflows | — (Workers runtime) | HITL approval state machine | GA April 2025. `step.waitForEvent()` pauses for human approval. |
| Turso (libSQL) | @libsql/client 0.14.x | Operational database | SQLite-compatible, edge-replicated. Import as `/web` in Workers. |
| Drizzle ORM | 0.45.x | Type-safe SQL | Lightest ORM with Workers compatibility, no connection pool required. |
| TypeScript | 5.x | Language | `wrangler types` generates env types from workerd directly. |

---

## Sources

**v1.1 additions:**
- [@google/genai npm](https://www.npmjs.com/package/@google/genai) — version 1.45.0 confirmed via WebSearch (2 days ago as of 2026-03-15). HIGH confidence.
- [googleapis/js-genai GitHub](https://github.com/googleapis/js-genai) — SDK structure, Vertex AI support, Web Fetch API usage. HIGH confidence.
- [Gemini API — OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai) — OpenAI-compat endpoint streaming usage limitations. MEDIUM confidence.
- [Anthropic Messages Streaming API docs](https://docs.anthropic.com/en/api/messages-streaming) — `message_start`/`message_delta` event structure and usage fields confirmed. HIGH confidence.
- [httpx Transports docs](https://www.python-httpx.org/advanced/transports/) — `AsyncBaseTransport.handle_async_request` pattern confirmed. HIGH confidence.
- [httpx 0.28 release notes](https://newreleases.io/project/pypi/httpx/release/0.28.0) — deprecated kwargs removed in 0.28. MEDIUM confidence.
- [pytest-asyncio 1.3.0 docs](https://pytest-asyncio.readthedocs.io/) — latest version, `asyncio_mode` option. HIGH confidence.
- [Cloudflare Workers — Turso integration](https://developers.cloudflare.com/workers/databases/third-party-integrations/turso/) — `/web` import requirement, secrets-based config. HIGH confidence.
- [Cloudflare Workflows GA announcement](https://developers.cloudflare.com/changelog/post/2025-04-07-workflows-ga/) — GA April 2025, wiring pattern. HIGH confidence.
- [Cloudflare Workflows Workers API](https://developers.cloudflare.com/workflows/build/workers-api/) — `[[workflows]]` binding syntax, `waitForEvent`. HIGH confidence.
- [Wrangler v4 changelog](https://developers.cloudflare.com/changelog/post/2025-03-13-wrangler-v4/) — v4.0 March 2025; current latest 4.73.0 confirmed. HIGH confidence.
- [TanStack Query v5 — Mutations guide](https://tanstack.com/query/v5/docs/framework/react/guides/mutations) — `useMutation` onMutate/onError/onSettled pattern. HIGH confidence.
- [TanStack Query v5 — Optimistic Updates](https://tanstack.com/query/v5/docs/react/guides/optimistic-updates) — `setQueryData` + `invalidateQueries` pattern. HIGH confidence.

**v1.0 sources (retained):**
- [hono/releases (GitHub)](https://github.com/honojs/hono/releases) — v4.12.7. HIGH confidence.
- [Cloudflare Workflows GA](https://developers.cloudflare.com/changelog/post/2025-04-07-workflows-ga/) — `waitForEvent` API. HIGH confidence.
- [Drizzle ORM: Turso Cloud](https://orm.drizzle.team/docs/connect-turso) — drizzle + libSQL integration. HIGH confidence.

---
*Stack research for: agentgov v1.1 — Gemini provider, Anthropic SSE settle, Python async SDK, CF Workers deploy, per-agent budget UI*
*Researched: 2026-03-15*
