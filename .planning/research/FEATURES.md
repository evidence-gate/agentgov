# Feature Research

**Domain:** Agent Governance Platform — v1.1 Production Readiness (5 target features)
**Researched:** 2026-03-15
**Confidence:** HIGH (verified against official docs and codebase inspection)

---

## Overview: What v1.1 Is Doing

v1.0 shipped with stubs and known gaps. v1.1 closes five specific gaps:

1. **Gemini provider** — proxy routes `gemini-*` to 503 stub; needs real Gemini API forwarding
2. **Anthropic streaming settle** — streaming settles at 0 tokens; needs SSE usage extraction
3. **Python async SDK** — sync-only `AgentgovTransport`; needs `AsyncBaseTransport`
4. **Cloudflare Workers deploy** — local Docker Compose only; needs production wrangler config
5. **Per-agent budget UI** — `$10` hardcoded; needs dashboard CRUD to set per-agent limits

---

## Feature 1: Gemini Provider

### What Gemini API Actually Is

Gemini exposes two surfaces:
- **OpenAI-compatible layer**: `https://generativelanguage.googleapis.com/v1beta/openai/` — accepts standard `chat/completions` format, Authorization header with Gemini API key, responds with OpenAI-shaped JSON (MEDIUM confidence — WebSearch verified)
- **Native Gemini API**: `generateContent` endpoint with `usageMetadata.promptTokenCount` / `candidatesTokenCount` fields (not OpenAI-style `usage.prompt_tokens`)

The OpenAI-compatible surface is the correct target for agentgov because the proxy already receives OpenAI-format requests and needs only to forward them to a different URL with a different key header — no format translation needed.

**Key difference from Anthropic path:** Anthropic requires format translation (`system` field separation, `max_tokens` injection, `input_tokens`/`output_tokens` field remapping). Gemini OpenAI-compat layer requires only URL change and key swap.

**Streaming token usage:** Gemini OpenAI-compat supports `stream_options: { include_usage: true }` — the same pattern already working for OpenAI. Final SSE chunk carries `usage.prompt_tokens` and `usage.completion_tokens` (MEDIUM confidence — forum discussion confirms `stream_options` supported, but exact field name should be tested).

**Key format gotchas:**
- Model names are `gemini-1.5-pro`, `gemini-1.5-flash`, `gemini-2.0-flash` — prefix routing already exists in `resolveProvider()` via `model.startsWith('gemini-')`
- Pricing table already has three Gemini models; adding new models requires `pricing.json` update
- `GEMINI_API_KEY` is a separate env var — not `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Forward `gemini-*` requests to Gemini API | Gemini is a top-3 LLM provider; 503 stub is a blocking gap for Gemini users | LOW | URL swap + key header only; reuse `forwardWithRetry` pattern |
| Non-streaming token settle (accurate) | Budget enforcement meaningless without accurate cost | LOW | Gemini compat returns `usage.prompt_tokens` / `usage.completion_tokens` — same as OpenAI |
| Streaming token settle (accurate) | Streaming is common usage; 0-token settle is an unacceptable bug | MEDIUM | Use `stream_options: { include_usage: true }` — same pattern as OpenAI path, reuse `processStreamAndSettle` |
| `GEMINI_API_KEY` env binding | API key must not be committed; needs wrangler secret | LOW | Add to `wrangler.jsonc` vars (empty default) and `ForwardEnv` interface |
| Gemini model pricing entries | Unknown model fails closed — need current Gemini model prices | LOW | `pricing.json` already has `gemini-1.5-pro`, `gemini-1.5-flash`, `gemini-2.0-flash`; add `gemini-2.0-pro` etc. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Transparent provider routing (no SDK change) | Agent code using `agentgov.wrap()` works unchanged for Gemini as for OpenAI | LOW | Already implemented in `resolveProvider()`; Gemini is the missing branch |
| Gemini-specific retry semantics | Gemini returns different rate limit codes than OpenAI | MEDIUM | Verify Gemini 429 vs 503 retry behavior; extend `forwardWithRetry` if needed |

### Anti-Features (Avoid)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Vertex AI / service account auth | Gemini-on-GCP uses OAuth2 service accounts not API keys | Adds GCP IAM complexity; out of scope for self-host positioning | Use `generativelanguage.googleapis.com` with API key; document Vertex as future work |
| Native Gemini format (generateContent) | More capabilities (vision, grounding) | Requires full request/response format translation; breaks OpenAI-compat surface | Use Gemini's OpenAI-compat layer; extend later if needed |

### Edge Cases

- `gemini-*` model not in pricing table already fails closed with 422 (existing behavior, correct)
- `GEMINI_API_KEY` not set should return 503 with clear error (same pattern as OpenAI/Anthropic)
- Gemini streaming: if `stream_options` is ignored by the compat layer, fallback to non-streaming settle needed — verify in integration test

### Existing Code Hooks

- `resolveProvider()` in `forward.ts` already returns `'google'` for `gemini-*` but hits the 503 stub
- `forwardWithRetry` is provider-agnostic — can be reused directly
- `processStreamAndSettle` expects `usage.prompt_tokens` / `usage.completion_tokens` — matches Gemini compat format

---

## Feature 2: Anthropic Streaming Settle

### What the Current Bug Is

`pipeAndSettle()` in `forward.ts` pipes the Anthropic SSE stream but calls `budgetSettle(0, 0)` — all streaming Claude calls cost $0 in the ledger. This means every streaming Claude request runs "free" until the hold expires.

### How Anthropic Streaming SSE Works

Anthropic sends named SSE event types in sequence (HIGH confidence — official docs):

```
event: message_start
data: {"type":"message_start","message":{"id":"msg_...","usage":{"input_tokens":25,"output_tokens":1}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta    (many)
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":15}}

event: message_stop
data: {"type":"message_stop"}
```

**Token extraction strategy:**
- `message_start.message.usage.input_tokens` = prompt tokens (appears once, at start)
- `message_delta.usage.output_tokens` = cumulative output tokens at that point (appears in last `message_delta`)
- `message_stop` carries no usage data

**Critical pitfall:** `message_delta.usage.output_tokens` is cumulative, not a delta. If there are multiple `message_delta` events (extended thinking), take the last one, not a sum. The `message_start.usage.output_tokens` is always 1 (partial) — do not use it for final settle.

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Extract `input_tokens` from `message_start` event | Budget enforcement accuracy; current 0-settle is a known bug | MEDIUM | Parse SSE lines, detect `event: message_start`, JSON parse data field |
| Extract final `output_tokens` from last `message_delta` | Streaming settle must use actual completion tokens | MEDIUM | Track last seen `message_delta.usage.output_tokens`; overwrite on each occurrence |
| Replace `pipeAndSettle` with usage-aware version | Prerequisite for correct budget tracking | MEDIUM | New function `anthropicStreamAndSettle`; drop-in replacement for `pipeAndSettle` |
| Pass both token counts to `budgetSettle` | Settle maps `input_tokens` to `promptTokens`, `output_tokens` to `completionTokens` | LOW | Field rename only; `budgetSettle` signature already accepts `{promptTokens, completionTokens}` |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Cache token awareness | Anthropic prompt caching gives 90% discount on cached input; counting cached tokens as full price overstates cost | HIGH | `message_start.usage` may include `cache_read_input_tokens`, `cache_creation_input_tokens`; out of scope for v1.1 |
| Extended thinking token handling | Thinking tokens billed at different rate | HIGH | Defer to v1.2 |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Re-parse entire response body | Seems safer | Doubles memory use on large responses; Cloudflare Workers memory constrained | Parse SSE incrementally as chunks arrive (existing pattern in `processStreamAndSettle`) |
| Sum all `message_delta.usage.output_tokens` | Seems correct for multi-turn | Wrong — values are cumulative not incremental, summing causes double-count | Take the last `message_delta.usage.output_tokens` value |

### Edge Cases

- `message_start` arrives in a partial chunk boundary — TextDecoder must use `{ stream: true }` (already the case in `processStreamAndSettle`)
- No `message_delta` event (error mid-stream) — settle with 0 tokens (safe degradation; audit log records actual cost as 0)
- Extended thinking: additional `message_delta` events with thinking tokens — use only the final one

### Existing Code Hooks

- `pipeAndSettle()` function is the replacement target — remove it after `anthropicStreamAndSettle` is complete
- `processStreamAndSettle` (OpenAI version) is the reference implementation — follow same pattern
- `convertToAnthropicFormat()` correctly passes `stream: true` when streaming

---

## Feature 3: Python Async SDK

### What the Current State Is

`AgentgovTransport` extends `httpx.BaseTransport` (sync). The Python SDK `wrap()` function creates `httpx.Client(transport=...)` and patches `client._client`. Async OpenAI/Anthropic SDK clients use `httpx.AsyncClient` internally and require `httpx.AsyncBaseTransport`.

### How AsyncBaseTransport Works

The pattern mirrors sync exactly, with three changes (HIGH confidence — httpx official docs):

```python
class AgentgovAsyncTransport(httpx.AsyncBaseTransport):
    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        ...

    async def aclose(self) -> None:
        await self._inner.aclose()
```

Key API differences from sync version:
- Method: `handle_async_request` (not `handle_request`)
- Lifecycle: `aclose()` (not `close()`)
- Inner transport: `httpx.AsyncHTTPTransport` (not `httpx.HTTPTransport`)
- Client: `httpx.AsyncClient(transport=...)` (not `httpx.Client`)

The `request.content` read is synchronous even in async context — httpx pre-reads request body before calling the transport method. No `await` needed for request body access.

Response reading: `response.read()` is sync in httpx even for async transports when used with `httpx.Response(content=...)` construction. For agentgov's use case (inspect full body for governance codes), the sync `response.read()` works after constructing from content.

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `AgentgovAsyncTransport(httpx.AsyncBaseTransport)` class | `openai.AsyncOpenAI` and `anthropic.AsyncAnthropic` use async httpx clients; sync transport silently hangs | LOW | Parallel class to `AgentgovTransport`; same logic, async method signatures |
| `async def handle_async_request` method | Required by httpx async transport protocol | LOW | Same URL rewrite + header inject + error inspect logic as sync version |
| `async def aclose` method | Resource cleanup; production async code uses context managers | LOW | `await self._inner.aclose()` |
| `wrap_async()` function (or async-capable `wrap()`) | Developers using `AsyncOpenAI` need a drop-in equivalent | LOW | Either overload `wrap()` to detect async client, or add `wrap_async()` |
| Export `AgentgovAsyncTransport` from `__init__.py` | SDK consistency; users should be able to inject transport manually | LOW | Add to `__all__` |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Auto-detect sync vs async client in `wrap()` | Single API surface; no need to remember `wrap()` vs `wrap_async()` | LOW | Check `isinstance(client, openai.AsyncOpenAI)` or check `hasattr(client, '_async_http_client')` |
| Streaming response pass-through for async | Async streaming returns `httpx.Response` with streaming body; governance codes are in sync headers | MEDIUM | Governance codes (429, 202, 502) arrive before body; inspect status + headers only for streaming, not body |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Single transport class for both sync and async | Reduces code duplication | httpx does not support duck-typed transport; sync and async transports are separate class hierarchies | Two classes sharing a helper function for the shared logic (URL rewrite, header inject, error parse) |
| Trio / AnyIO support | Some frameworks use Trio | Adds `anyio` dependency; scope creep | httpx's built-in AsyncHTTPTransport is asyncio-native; document asyncio requirement |

### Edge Cases

- `openai.AsyncOpenAI` stores its httpx client as `_async_http_client` (not `_client`) — verify attribute name before patching
- `anthropic.AsyncAnthropic` may use a different attribute — inspect at implementation time
- Python 3.8 compatibility: `async def` and `await` are supported; no issue

### Existing Code Hooks

- `AgentgovTransport` in `_transport.py` is the reference implementation — extract shared logic to `_base.py` helper
- `_exceptions.py` is shared — no changes needed
- `tests/` directory exists — add async test using `httpx.MockTransport` or `pytest-asyncio`

---

## Feature 4: Cloudflare Workers Production Deploy

### What "Deploy" Actually Means Here

Current `docker-compose.yml` runs proxy + dashboard on a local machine. "Cloudflare Workers deploy" means:
- proxy moves to Cloudflare Worker (already runs on Workers in dev with `wrangler dev`)
- Turso local replaces with Turso cloud instance
- Secrets (API keys, DB credentials) move to `wrangler secret put`
- Static dashboard deploys to Cloudflare Pages or bundled into Worker as static assets

The `wrangler.jsonc` already exists with Workflows binding; this feature is primarily about production environment configuration and deployment documentation/automation.

### What wrangler.toml Production Config Requires

Key sections needed (HIGH confidence — Cloudflare official docs):

```toml
name = "agentgov-proxy"
main = "src/index.ts"
compatibility_date = "2025-01-01"

[[workflows]]
name = "agentgov-hitl"
binding = "HITL_WORKFLOW"
class_name = "HitlWorkflow"

[env.production]
name = "agentgov-proxy"
# No vars here — all secrets via wrangler secret put
```

Secrets (never in wrangler config):
- `TURSO_DATABASE_URL` — `wrangler secret put TURSO_DATABASE_URL --env production`
- `TURSO_AUTH_TOKEN`
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`
- `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`

**Turso cloud vs local:** `@libsql/client/web` already used (required for Workers). Turso cloud connection string format: `libsql://[db-name].turso.io`. Auth token from Turso dashboard. Schema migrations must run against cloud DB before first deploy.

**Workflows compatibility:** `compatibility_date = "2024-10-22"` minimum for Workflows binding (already set to `"2025-01-01"` — no change needed).

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `[env.production]` section in `wrangler.jsonc` | Production deploy should not share dev config | LOW | Separate `name`, route, and environment-specific vars |
| All secrets via `wrangler secret put` (not vars) | Security requirement; keys must not appear in version control | LOW | Document the exact `wrangler secret put` commands for each required secret |
| Turso cloud schema migration step | DB must match schema before first deploy | MEDIUM | Document `turso db shell` migration; or provide a migration script |
| Dashboard deploy path | Users need to access the React dashboard | MEDIUM | Cloudflare Pages is simpler than bundling static assets into the Worker |
| `GEMINI_API_KEY` in wrangler config vars (empty default) | Pattern already established for other keys | LOW | Add `"GEMINI_API_KEY": ""` to `vars` block and `ForwardEnv` interface |
| Deploy documentation | Self-host users need step-by-step | LOW | `DEPLOY.md` or updated README section |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| GitHub Actions workflow for `wrangler deploy` | One-command CI/CD deploy | LOW | Use `cloudflare/wrangler-action`; secrets injected as GitHub secrets |
| Staged deploy (staging env then production) | Catch regressions before production | MEDIUM | `[env.staging]` + separate Turso DB; adds operational complexity |
| Custom domain + `routes` config | Production URL branding | LOW | Add `routes` array to `[env.production]` |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Docker in production | Existing self-host works with Docker | Cloudflare Workers cannot run Docker; Docker is for local dev only | Keep Docker Compose for local/self-host; Workers for cloud |
| D1 instead of Turso | Native Cloudflare DB, no external dependency | D1 does not support `libsql://` protocol; codebase uses Drizzle + `@libsql/client/web` which targets Turso | Stay with Turso; add Turso DB provisioning step to deploy docs |
| Durable Objects for DB | True Workers-native storage | Requires full DB layer rewrite; not compatible with Drizzle schema | Keep Turso; Durable Objects are for HITL state machine (already planned separately) |

### Edge Cases

- `wrangler.jsonc` (not `.toml`) — Cloudflare supports JSONC format; no change needed, but some docs use `.toml` syntax which requires translation
- Workflows binding requires the Worker to export the `HitlWorkflow` class — already done in `index.ts`
- `@libsql/client/web` may require `nodejs_compat` or a specific compatibility flag — verify with current `compatibility_date`
- Dashboard VITE_API_URL must point to the deployed Worker URL, not localhost — build-time env var injection

### Existing Code Hooks

- `wrangler.jsonc` already has all bindings defined; production env section is the missing piece
- `createDbClient(url, authToken)` already uses `@libsql/client/web` — no changes needed
- `index.ts` already exports `HitlWorkflow` class — Workflows binding already wired

---

## Feature 5: Per-Agent Budget UI

### What the Current State Is

`budgetGate()` calls `ensureAgent(db, agentId, DEFAULT_BUDGET_LIMIT_USD)` where `DEFAULT_BUDGET_LIMIT_USD = 10.0` is hardcoded. There is no API to update a specific agent's limit. The dashboard `Costs` page is read-only (displays `limitUsd`, `spentUsd`, `reservedUsd`).

`budget_ledger` table schema: `agentId TEXT PK`, `limitUsd REAL`, `spentUsd REAL`, `reservedUsd REAL`, `updatedAt INTEGER`.

### What CRUD Operations Are Needed

The feature is not a full CRUD — "Create" is implicit on first request via `ensureAgent`. Required operations:

- **Read** (already exists): `/api/v1/dashboard/budgets` returns all agent budget rows
- **Update**: `PUT /api/v1/budget/:agentId` with `{ limitUsd: number }` — update `limitUsd` for existing agent
- **Create** (explicit): `POST /api/v1/budget` with `{ agentId: string, limitUsd: number }` — pre-provision an agent before first request
- **Reset**: `POST /api/v1/budget/:agentId/reset` — set `spentUsd = 0` and `reservedUsd = 0` (for testing/manual correction)

**Validation rules:**
- `limitUsd >= 0` (0 = effectively disabled / blocked immediately)
- `limitUsd` must be a number, not NaN or Infinity
- Cannot lower `limitUsd` below `spentUsd + reservedUsd` without explicit override (or warn user)
- `agentId` must be non-empty string

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `PUT /api/v1/budget/:agentId` proxy API endpoint | Update limit without redeploying; core purpose of the feature | LOW | Drizzle UPDATE on `budget_ledger` where `agentId`; return updated row |
| Inline edit in Costs page | Row-level "Edit" button to input field to Save | MEDIUM | React 19 state; no form library needed for this level of complexity |
| Validation: `limitUsd >= 0`, numeric | Prevent nonsense limits | LOW | Client-side + server-side validation |
| Optimistic UI update after save | Avoid stale display | LOW | React Query `invalidateQueries(['budgets'])` after successful PUT |
| Error display on save failure | Show validation error inline | LOW | Local state `error` field per row |
| `POST /api/v1/budget` create-agent endpoint | Pre-provision agents not yet active | LOW | Calls `ensureAgent` with specified limit; 409 if already exists (or upsert) |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Budget utilization bar in row | Visual % used (spent + reserved / limit) | LOW | Pure CSS bar; high visual signal without extra API calls |
| "Reset spent" action in UI | Testing/monthly reset without SQL | MEDIUM | Add reset endpoint + confirmation modal; careful: resets audit history context |
| Bulk limit update | Set same limit for multiple agents | MEDIUM | Checkbox selection + bulk PUT; useful for enterprise onboarding |
| Budget limit history in audit log | When was limit changed, by whom | MEDIUM | Append `budget_limit_changed` audit event on every PUT; display in audit page |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Per-model budget limits within an agent | Fine-grained cost control | Adds nested configuration UI and database complexity; banto's multi-tier budget was a known over-engineering trap | Document that agents can be named `agent-id:gpt-4o` for model-level tracking |
| Budget templates / inheritance | Set a global default then override per agent | Complex config hierarchy; banto's multi-layer budget design proved overly complex | Simple per-agent flat limit; configure default via `DEFAULT_BUDGET_LIMIT_USD` env var |
| Automatic budget top-up | Recurring budget refresh | Requires cron + payment integration; out of scope for governance layer | Document manual reset endpoint; budget renewal is a business process |
| Delete agent | Remove agent from ledger | Dangerous — audit history is append-only and references agentId | Soft-disable via setting `limitUsd = 0` |

### Edge Cases

- Agent with active holds when limit is lowered — hold reservation is already deducted from available budget; lowering limit below `spentUsd + reservedUsd` makes `available < 0` but does not cancel active holds. Warn user, but allow the update (holds settle normally).
- Setting `limitUsd = 0` effectively blocks agent on next request — document this as "pause agent" pattern
- Concurrent UI + direct API update races — `updatedAt` timestamp in response enables conflict detection; not critical for v1.1

### Existing Code Hooks

- `getBudget()` in `ledger.ts` reads current state — add `updateBudgetLimit(db, agentId, limitUsd)` function alongside it
- Dashboard routes in proxy are at `/api/v1/dashboard/*` — new budget write endpoints follow same mounting pattern
- `useBudgets()` React Query hook already polls `/api/v1/dashboard/budgets` — reuse for invalidation
- `BudgetRow` interface in `useDashboard.ts` already has `limitUsd` — extend for write operations

---

## Feature Dependencies

```
Gemini Provider
    requires──> GEMINI_API_KEY env binding (Cloudflare Workers deploy feature)
    requires──> Gemini pricing entries in pricing.json (already present)
    enhances──> accurate streaming settle (Feature 2 pattern reused)

Anthropic Streaming Settle
    requires──> existing pipeAndSettle() removal (self-replacement)
    enhances──> budget accuracy for all streaming Claude calls

Python Async SDK
    requires──> AgentgovTransport sync version (reference implementation, already built)
    mirrors──> TypeScript SDK wrap() pattern

Cloudflare Workers Deploy
    requires──> GEMINI_API_KEY var added to wrangler.jsonc (Feature 1)
    requires──> Turso cloud DB provisioned externally
    enables──> per-agent budget UI (UI needs deployed API URL for production)

Per-Agent Budget UI
    requires──> PUT /api/v1/budget/:agentId proxy endpoint (new)
    requires──> deployed proxy URL for VITE_API_URL (Feature 4, for production)
    enhances──> Costs page (extends existing read-only table)
```

### Dependency Notes

- **Gemini and Cloudflare deploy are coupled**: `GEMINI_API_KEY` must be a wrangler secret before Gemini works in production; these should land in the same phase
- **Anthropic streaming is independent**: No other feature depends on it; can land in any phase
- **Python async is independent**: No proxy changes; SDK-only change; can be tested without a deployed proxy
- **Per-agent budget UI is partially blocked by deploy in production**: The React app needs `VITE_API_URL` pointed at a real proxy; but local dev (Docker Compose) can be used for development and testing

---

## MVP Definition for v1.1

### Must Ship (v1.1 Core)

- [ ] Gemini provider forwarding (non-streaming + streaming with accurate settle)
- [ ] Anthropic streaming settle (replace 0-token settle with SSE parse)
- [ ] `GEMINI_API_KEY` wrangler binding
- [ ] `PUT /api/v1/budget/:agentId` API endpoint
- [ ] Inline edit in dashboard Costs page

### Can Slip to v1.1.x

- [ ] Python async SDK (`wrap_async()`) — developers can use sync SDK while waiting; no proxy dependency
- [ ] Full Cloudflare Workers production deploy config — Docker Compose continues to work for self-host; cloud deploy is a distribution improvement not a functionality gap
- [ ] `POST /api/v1/budget` (create agent endpoint) — agents auto-create on first request; explicit create is convenience
- [ ] GitHub Actions CI/CD for wrangler deploy

### Defer to v1.2

- [ ] Budget limit change audit log events
- [ ] Budget utilization bar visualization
- [ ] Cache token awareness for Anthropic (prompt caching cost accuracy)
- [ ] Vertex AI / service account auth for Gemini enterprise users
- [ ] Extended thinking token settle for Anthropic

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Gemini provider (non-streaming) | HIGH — top-3 LLM provider, currently 503 | LOW — URL swap + key | P1 |
| Gemini provider (streaming settle) | HIGH — streaming common; 0-cost is a bug | MEDIUM — reuse existing pattern | P1 |
| Anthropic streaming settle | HIGH — silent 0-cost bug affects all streaming Claude | MEDIUM — SSE parse | P1 |
| Per-agent budget API (PUT endpoint) | HIGH — $10 hardcoded is table-stakes blocker | LOW — Drizzle UPDATE | P1 |
| Per-agent budget UI (inline edit) | HIGH — dashboard is the user-facing surface | MEDIUM — React state + form | P1 |
| GEMINI_API_KEY wrangler binding | HIGH — prerequisite for Gemini in production | LOW — config addition | P1 |
| Python async SDK | MEDIUM — affects async Python users specifically | LOW — parallel class | P2 |
| Cloudflare Workers production deploy config | MEDIUM — cloud deploy, not functionality | LOW — config + docs | P2 |
| Cloudflare Workers deploy documentation | MEDIUM — self-host users need this | LOW — documentation | P2 |
| Budget create explicit endpoint | LOW — auto-create on first request covers most cases | LOW | P3 |
| GitHub Actions CI/CD workflow | LOW — can deploy manually via wrangler | LOW | P3 |

**Priority key:**
- P1: Must have for v1.1 launch
- P2: Should have, add when core is complete
- P3: Nice to have, defer to v1.1.x

---

## Complexity Notes by Feature

| Feature | Overall Complexity | Dominant Risk |
|---------|-------------------|---------------|
| Gemini provider | LOW-MEDIUM | `stream_options` support on compat layer needs verification; test before shipping |
| Anthropic streaming settle | MEDIUM | Cumulative vs delta token bug if `message_delta` is misread; easy to get wrong |
| Python async SDK | LOW | Attribute name `_async_http_client` vs `_client` may differ by SDK version |
| Cloudflare Workers deploy | LOW | Turso cloud migration step needs explicit documentation; `@libsql/client/web` compat flag |
| Per-agent budget UI | MEDIUM | Concurrent edit / optimistic update edge case; lowering limit below active holds |

---

## Sources

- [Gemini OpenAI Compatibility Docs](https://ai.google.dev/gemini-api/docs/openai) — MEDIUM confidence (URL pattern and API key format verified via WebSearch)
- [Gemini stream_options forum discussion](https://discuss.ai.google.dev/t/gemini-openai-compatibility-does-it-support-the-stream-options-parameter/92785) — MEDIUM confidence (community-reported, not official docs)
- [Anthropic Streaming Messages Docs](https://docs.anthropic.com/en/api/messages-streaming) — HIGH confidence (SSE event structure verified via multiple sources)
- [Cline issue #4346](https://github.com/cline/cline/issues/4346) — cumulative token counting bug in `message_delta` confirmed in real-world implementation
- [LangChain issue #10249](https://github.com/langchain-ai/langchainjs/issues/10249) — double-count bug confirmed from summing message_delta values
- [httpx Transports Docs](https://www.python-httpx.org/advanced/transports/) — HIGH confidence (AsyncBaseTransport interface verified)
- [httpx Async Docs](https://www.python-httpx.org/async/) — HIGH confidence
- [Cloudflare Workers Secrets Docs](https://developers.cloudflare.com/workers/configuration/secrets/) — HIGH confidence
- [Cloudflare Workflows Workers API](https://developers.cloudflare.com/workflows/build/workers-api/) — HIGH confidence (binding config verified)
- [Cloudflare Turso Workers Tutorial](https://developers.cloudflare.com/workers/tutorials/connect-to-turso-using-workers/) — HIGH confidence
- Codebase inspection: `packages/proxy/src/passthrough/forward.ts`, `packages/sdk-python/src/agentgov/_transport.py`, `packages/proxy/wrangler.jsonc`, `packages/proxy/pricing.json`, `packages/dashboard/src/hooks/useDashboard.ts`, `packages/proxy/src/budget/ledger.ts`, `packages/proxy/src/budget/gate.ts`

---

*Feature research for: agentgov v1.1 Production Readiness (5 target features)*
*Researched: 2026-03-15*
