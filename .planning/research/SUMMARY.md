# Project Research Summary

**Project:** agentgov v1.1 — Production Readiness
**Domain:** Agent Governance Platform (LLM proxy, cost enforcement, HITL, audit)
**Researched:** 2026-03-15
**Confidence:** HIGH

## Executive Summary

agentgov v1.1 is a surgical completion sprint on a platform that already works. v1.0 shipped the full governance pipeline — budget hold/settle, HITL risk classification, audit logging, TypeScript SDK, sync Python SDK — but left five explicit gaps: Gemini support returns 503, Anthropic streaming settles at 0 tokens, Python has no async transport, there is no Cloudflare Workers production config, and the per-agent budget limit is hardcoded at $10. These five features are the entire scope of v1.1. Nothing architectural changes; the core request pipeline (`index.ts` → `budgetGate` → `classifyAction` → `forwardToLlm` → `budgetSettle`) is untouched.

The recommended approach for all five features is minimal-diff integration at well-defined seams. Gemini forwarding reuses the existing `processStreamAndSettle()` function by targeting Gemini's OpenAI-compatible endpoint — no format conversion required. Anthropic streaming requires a new SSE parser (`processAnthropicStreamAndSettle`) that tracks named event types (`message_start` for input tokens, `message_delta` for cumulative output tokens) across chunk boundaries; this replaces the existing `pipeAndSettle()` TODO stub. The Python async transport is a parallel class (`AsyncAgentgovTransport`) that mirrors the sync version with awaited method signatures. Production deploy is primarily operational config: `wrangler secret put` for API keys, `[env.production]` section with non-inheritable bindings redeclared, and a `drizzle-kit push` run against Turso cloud before first deploy. The budget CRUD feature adds one `PATCH` endpoint to `dashboard/routes.ts`, one `updateBudgetLimit()` function to `ledger.ts`, and inline edit controls to the Costs page using TanStack Query `useMutation` with optimistic update and `onSettled` invalidation.

The key risk area is not implementation complexity — all five features are LOW to MEDIUM complexity — but integration correctness. The two highest-confidence pitfalls are: (1) Anthropic SSE token splitting across two named events rather than a single final chunk, which silently undercharges if the parser only reads `message_delta`; and (2) the two-entry-point architecture (`index.ts` for Workers, `index.node.ts` for Docker) requiring every new env var to be wired in both places or Docker self-host silently degrades. The production deploy phase also has a non-obvious security trap: Cloudflare Workflows bindings are non-inheritable and must be redeclared in `[env.production]` or HITL approvals crash at runtime with `TypeError: Cannot read properties of undefined (reading 'create')`.

## Key Findings

### Recommended Stack

The v1.0 stack is already installed and validated. v1.1 adds only one new npm package (`@google/genai ^1.45.0`) and two Python dev dependencies (`pytest-asyncio ^1.3.0`, `anyio >=4.0.0`). No other package changes are needed.

**Core technologies (existing, unchanged):**
- **Hono ^4.12.7:** HTTP proxy framework — edge-native, runs on Workers and Node.js, zero-overhead middleware chain
- **Cloudflare Workers + Wrangler ^4:** Production runtime target; Workflows binding (GA April 2025) handles HITL durable state via `step.waitForEvent('approval', { timeout: '24h' })`
- **Turso / @libsql/client ^0.14.0:** Edge-replicated SQLite; MUST use `/web` subpath import in Workers — default import crashes on deploy
- **Drizzle ORM ^0.45.1:** Type-safe SQL, Workers-compatible, no connection pool required
- **React 19 + TanStack Query ^5 + Vite ^6:** Dashboard SPA; `useActionState` built into React 19 replaces deprecated `useFormState`

**v1.1 additions only:**
- **@google/genai ^1.45.0:** Official Google SDK; uses Web Fetch API only (no Node.js built-ins, runs in Workers without polyfills); replaces deprecated `@google/generative-ai`
- **pytest-asyncio ^1.3.0:** Required for async Python SDK tests; `asyncio_mode = "auto"` in `pyproject.toml` is mandatory — without it, async tests silently pass without running
- **httpx >=0.28.0 (bump from >=0.24.0):** Removes deprecated kwargs; `AsyncBaseTransport.handle_async_request()` API stable from 0.28

**What NOT to add:**
- `@anthropic-ai/sdk` in the proxy (Node.js targeted; breaks Workers bundle)
- `react-hook-form` or `zod` for the budget form (single numeric input; React 19 `useActionState` suffices)
- `@google/generative-ai` (deprecated; Gemini 2.0+ features only in `@google/genai`)
- `@libsql/client` without the `/web` subpath in any Workers-deployed file (crashes at runtime)

### Expected Features

**Must have for v1.1 (P1 — all must ship):**
- Gemini provider forwarding (non-streaming + streaming with accurate settle) — top-3 LLM provider; 503 stub is blocking for Gemini users
- Anthropic streaming settle (replace 0-token settle with SSE parse) — silent financial accuracy bug affecting all streaming Claude calls
- `GEMINI_API_KEY` wrangler secret binding — prerequisite for Gemini in production
- `PATCH /api/v1/dashboard/budgets/:agentId` API endpoint — $10 hardcoded limit is a table-stakes blocker
- Inline budget edit in dashboard Costs page — dashboard is the primary user-facing surface for operators

**Should have (P2 — add when P1 core is complete):**
- Python async SDK (`AsyncAgentgovTransport`) — affects async Python users; no proxy dependency; can be developed independently
- Cloudflare Workers production deploy config — Docker Compose continues to work for self-host; cloud deploy is a distribution improvement not a functionality gap
- Deploy documentation (`DEPLOY.md`) — self-host users need step-by-step

**Defer to v1.2:**
- Budget limit change audit log events
- Budget utilization bar visualization
- Anthropic prompt caching token awareness (`cache_read_input_tokens` at 90% discount)
- Vertex AI / service account auth for Gemini enterprise users
- Extended thinking token settle for Anthropic
- Per-model budget limits within an agent (known over-engineering trap from prior art)
- Budget templates / inheritance (proven overly complex in comparable systems)
- Automatic budget top-up (requires cron + payment integration; out of scope)

### Architecture Approach

All five v1.1 features are surgical additions at well-defined seams. The core request pipeline is untouched. The complete change scope: `forward.ts` (2 new functions), `dashboard/routes.ts` (2 new endpoints + DbClient type abstraction), `budget/ledger.ts` (2 new functions), `wrangler.jsonc` (1 new var), `index.ts` + `index.node.ts` (1-line env passthrough each), and a new `_async_transport.py` in the Python SDK. Zero changes to `budget/gate.ts`, `db/schema.ts`, `audit/writer.ts`, `hitl/*`, or the TypeScript SDK.

**Major components changed in v1.1:**
1. **`forward.ts` (proxy)** — Add `forwardToGemini()` (fills existing 503 stub; reuses `processStreamAndSettle` since Gemini compat layer returns OpenAI SSE format) and `processAnthropicStreamAndSettle()` (buffered SSE parser tracking named event types; replaces `pipeAndSettle()` TODO stub at 0 tokens)
2. **`dashboard/routes.ts` + `budget/ledger.ts`** — Refactor `createDashboardRoutes()` to accept abstract `DbClient` (enables both Workers and Docker entry points); add `PATCH` + `POST` budget endpoints; add `updateBudgetLimit()` to ledger (only updates `limit_usd` — NEVER touches `spent_usd` to avoid race conditions with concurrent hold settlements)
3. **`sdk-python/_async_transport.py`** — New file: `AsyncAgentgovTransport(httpx.AsyncBaseTransport)` mirrors sync class with `async def handle_async_request` and `await response.aread()`; exception logic shared via `_exceptions.py`

**Key patterns to follow:**
- **Provider Router Extension:** `resolveProvider()` already returns `'google'` for `gemini-*`; Gemini fills the existing stub — no new routing layer needed
- **SSE Event-Type Tracking:** Anthropic SSE uses named events requiring stateful buffered parsing; split on `\n\n` for event boundaries, maintain `currentEventType` across lines within each event block
- **DbClient Abstraction:** `createDashboardRoutes(db: DbClient)` (abstract type) replaces `DockerDbClient` — use same pattern for any future route module needing dual-runtime support
- **Two-Entry-Point Discipline:** Every new env var in `ForwardEnv` must be wired in both `index.ts` and `index.node.ts` — grep `ForwardEnv` construction sites after each change

### Critical Pitfalls

1. **Anthropic SSE token split across two named events** — `message_start` contains `input_tokens`; `message_delta` contains cumulative `output_tokens`. A parser that only reads the last `usage` field gets 0 input tokens and undercharges by the full prompt cost. Additionally, chunks may split across `event:` / `data:` lines, so the parser must buffer across chunks and track `currentEventType` as state. Use `\n\n` to identify complete event boundaries. Validated by real-world bugs in Cline and LangChain.

2. **Gemini safety blocks return HTTP 200, not 4xx** — `candidates[0].finishReason: "SAFETY"` arrives with status 200. Passing this through as success causes agent retry loops. After any Gemini 200, inspect `finishReason`; if safety-blocked, settle hold at 0 tokens and return `AgentError`. Do NOT retry — safety blocks are permanent for that content.

3. **Cloudflare Workers bindings are non-inheritable** — Adding `[env.production]` to `wrangler.jsonc` does NOT inherit `[[workflows]]` binding from the top-level config. `c.env.HITL_WORKFLOW` will be `undefined` at runtime, crashing HITL approval triggers with a TypeError. Redeclare all bindings (workflows, vars) in each `[env.X]` block. Verify with `wrangler types --env production`.

4. **Two-entry-point env var gap** — `GEMINI_API_KEY` added to `ForwardEnv` and `wrangler.jsonc` must also be extracted from `process.env` in `index.node.ts`. Missing this means Docker self-host Gemini returns 503 while Workers works. After every env var addition, grep for all `ForwardEnv` construction sites.

5. **Budget CRUD must only update `limit_usd`** — A full-row `UPDATE ... SET limit_usd = $new, spent_usd = $spent` races with concurrent hold settlements. Turso HTTP does not support interactive transactions. The dashboard `PATCH` endpoint must only set `limit_usd` and `updated_at` — `spent_usd` and `reserved_usd` are exclusively owned by the Hold/Settle machinery.

6. **Python async transport must not inject sync into async client** — `agentgov.wrap(AsyncOpenAI())` with the current sync `AgentgovTransport` causes `RuntimeError: This event loop is already running` on first await. `AsyncAgentgovTransport` must subclass `httpx.AsyncBaseTransport` (not `BaseTransport`). Never use `asyncio.run()` inside `handle_async_request`.

7. **API keys in wrangler.jsonc committed to source control** — `wrangler.jsonc vars` must only contain `""` (empty string placeholder) for secret values. Real secrets are set via `wrangler secret put GEMINI_API_KEY`. Local dev uses `.dev.vars` (never committed). Verify `.gitignore` includes `.dev.vars` before adding Gemini key.

## Implications for Roadmap

Features group naturally into 3 phases based on the build-order analysis in ARCHITECTURE.md. The single critical constraint: the DbClient abstraction (Phase 2 prerequisite) must be validated locally before the Workers production deploy (Phase 3 validation). Steps 1 and 2 can be parallelized across developers (different files, no conflicts). Step 3 is serial — depends on both 1 and 2 being complete and tested.

### Phase 1: Core Provider Fixes (forward.ts only)

**Rationale:** The two proxy-layer bug fixes touch only `forward.ts` — zero risk to other components, no shared state, no dependencies on other v1.1 work. Gemini unblocks an entire category of users immediately. Anthropic streaming settle fixes a silent financial accuracy bug. These are the highest value / lowest risk changes in the entire v1.1 scope.

**Delivers:** Accurate budget enforcement for all three major LLM providers (OpenAI existing, Anthropic streaming fixed, Gemini new); Gemini provider fully functional end-to-end.

**Features from FEATURES.md (all P1):**
- Gemini provider forwarding — non-streaming and streaming with accurate settle
- Anthropic streaming settle — replace `pipeAndSettle()` TODO with `processAnthropicStreamAndSettle()`
- `GEMINI_API_KEY` added to `ForwardEnv`, `wrangler.jsonc`, `index.ts`, and `index.node.ts`

**Pitfalls to avoid:**
- Pitfall 11: Gemini field name mismatch — use OpenAI-compat endpoint (Gemini returns OpenAI field names; `processStreamAndSettle` reuses without changes)
- Pitfall 12: Gemini safety block 200 — inspect `finishReason` after HTTP 200; settle at 0 and return `AgentError`
- Pitfall 13: Gemini function calling format — use OpenAI-compat endpoint; no format conversion code; HITL classifier already handles OpenAI-format tool_calls
- Pitfall 14: Anthropic two-event token split — parse `message_start` for `input_tokens` AND `message_delta` for `output_tokens`; do not sum `message_delta` values (they are cumulative)
- Pitfall 15: Anthropic chunk boundary — buffer text across reads, split on `\n\n` for event boundaries, maintain `currentEventType` state across lines
- Pitfall 23: Two-entry-point gap — after adding `GEMINI_API_KEY` to `ForwardEnv`, verify both `index.ts` and `index.node.ts` pass it through

**Research flag:** STANDARD PATTERNS — Anthropic SSE format and Gemini OpenAI-compat endpoint are HIGH confidence from official docs. Implementation patterns documented in full in STACK.md.

---

### Phase 2: Budget CRUD + Python Async SDK

**Rationale:** These two features are independent of Phase 1 and of each other, but should land together before Phase 3. The budget CRUD feature includes the one mildly risky refactor (`createDashboardRoutes` DbClient type change) which must be validated in Docker Compose before the Workers deploy. The Python async SDK is entirely isolated in `packages/sdk-python` and can be developed in parallel with budget CRUD.

**Delivers:** Dashboard operators can set per-agent budget limits without redeploying; Python async agent developers (using `AsyncOpenAI` / `AsyncAnthropic`) get governance enforcement.

**Features from FEATURES.md (P1 + P2):**
- `PATCH /api/v1/dashboard/budgets/:agentId` endpoint + `updateBudgetLimit()` in ledger (only sets `limit_usd`)
- `POST /api/v1/dashboard/budgets` explicit agent create endpoint
- Inline budget edit in dashboard Costs page — TanStack Query `useMutation` with optimistic update + `onSettled` invalidation
- `AsyncAgentgovTransport(httpx.AsyncBaseTransport)` in new `_async_transport.py`
- Export `AsyncAgentgovTransport` from `__init__.py`; add `wrap_async()` or async-capable `wrap()`
- `asyncio_mode = "auto"` in `pyproject.toml` and `pytest-asyncio ^1.3.0` in dev deps

**Architecture sub-steps (budget CRUD):**
- 2a: Add `updateBudgetLimit()` + `upsertAgent()` to `budget/ledger.ts`
- 2b: Refactor `createDashboardRoutes(db: DbClient)` — abstract type, prerequisite for Phase 3
- 2c: Add `PATCH` + `POST` endpoints to `dashboard/routes.ts`
- 2d: Add `useMutation` hooks + inline edit UI to dashboard
- 2e (parallel): Python async transport — new file `_async_transport.py`

**Pitfalls to avoid:**
- Pitfall 16: Sync transport in async client — `AsyncAgentgovTransport` subclasses `httpx.AsyncBaseTransport`; never inject `httpx.Client` into `AsyncOpenAI`
- Pitfall 17: pytest-asyncio silent pass — configure `asyncio_mode = "auto"` before writing any async tests; verify with a deliberately failing async canary test
- Pitfall 21: Budget CRUD clobbers `spent_usd` — dashboard `PATCH` only updates `limit_usd` and `updated_at`; `spent_usd` is exclusively owned by Hold/Settle
- Pitfall 22: Stale cache after save — use `onSettled` (not `onSuccess`) for `queryClient.invalidateQueries`; use `onMutate` for optimistic update; disable Save button while `mutation.isPending`

**Research flag:** STANDARD PATTERNS. TanStack Query mutation + optimistic update pattern is HIGH confidence. Python `AsyncBaseTransport` is HIGH confidence from httpx official docs.

---

### Phase 3: Cloudflare Workers Production Deploy

**Rationale:** Production deploy is integration validation of all v1.1 features running on the Workers runtime with Turso cloud. It must come last. The DbClient abstraction from Phase 2 must be in place so dashboard CRUD routes work in both entry points. All env vars from Phase 1 must be wired. This phase is primarily operational (config + secrets + migration documentation) with minimal code changes.

**Delivers:** agentgov proxy deployable to Cloudflare Workers edge (300+ PoPs, <1ms cold start) as an alternative to Docker Compose self-host; Turso cloud DB replaces embedded file DB for the cloud variant.

**Features from FEATURES.md (P2):**
- `[env.production]` section in `wrangler.jsonc` with ALL bindings redeclared (non-inheritable)
- All secrets via `wrangler secret put` — never in config file; `.dev.vars` for local only
- Turso cloud schema migration — `drizzle-kit push` against Turso cloud DB before first `wrangler deploy`
- Dashboard deploy target decision (Cloudflare Pages vs static assets bundled in Worker)
- Deploy documentation (`DEPLOY.md`) — exact command sequence for secrets, migration, deploy
- GitHub Actions `wrangler deploy` workflow (P3, optional)

**Pitfalls to avoid:**
- Pitfall 18: `GEMINI_API_KEY` in `vars` committed — use `wrangler secret put GEMINI_API_KEY`; verify with `git log --all -S "AIza"` before first deploy
- Pitfall 19: Workflow binding non-inheritable — redeclare `[[workflows]]` and all vars in `[env.production]`; verify with `wrangler types --env production`
- Pitfall 20: `@libsql/client` without `/web` — enforce with CI grep: `grep -r "@libsql/client'" packages/proxy/src/` must return 0 results
- Pitfall 23: Two-entry-point verification — run full test suite against both `wrangler dev` and Docker Compose before declaring Phase 3 complete

**Research flag:** NEEDS VERIFICATION — confirm `@libsql/client/web` compat flag behavior with current `compatibility_date` under Wrangler 4.73.0; test `wrangler dev --env production` before writing the deploy runbook. Also confirm dashboard deploy target (Pages vs bundled) before beginning Phase 3 work.

---

### Phase Ordering Rationale

- **Phase 1 first:** Highest user value, lowest risk, zero dependencies. Single-file changes with no shared state.
- **Phase 2 before Phase 3:** DbClient abstraction must be validated in Docker Compose before being tested on Workers. Budget CRUD endpoints need to work in both runtimes before production deploy exercises them.
- **Phase 3 last:** Workers deploy is the integration validation step — all code must work in Docker Compose first, then the deploy confirms they work in Workers with Turso cloud.
- **Phases 1 and 2 can be parallelized** — different file ownership, no edit conflicts. Recommended if multiple developers are available.

### Research Flags

Phases needing verification during planning:
- **Phase 1 (Gemini streaming `stream_options`):** MEDIUM confidence that Gemini's OpenAI-compat endpoint supports `stream_options: { include_usage: true }`. Write an integration test against the real Gemini API before shipping. If not supported, implement non-streaming settle fallback.
- **Phase 3 (Workers deploy):** Verify `compatibility_date` is sufficient for Workflows binding with Wrangler 4.73.0; confirm `@libsql/client/web` compat flag behavior; decide dashboard deploy target (Pages vs bundled).

Phases with standard patterns (no additional research needed):
- **Phase 1 (Anthropic SSE):** Event sequence documented in STACK.md with full implementation example; HIGH confidence from official Anthropic docs.
- **Phase 2 (Python async transport):** `AsyncBaseTransport` interface is HIGH confidence from httpx official docs; mirrors existing sync class exactly.
- **Phase 2 (TanStack Query mutation):** Optimistic update + `onSettled` invalidation pattern is HIGH confidence and documented in full in STACK.md.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All v1.1 additions verified via official docs and npm/PyPI. One new package (`@google/genai`). Existing stack fully validated via direct codebase inspection. |
| Features | HIGH | Five features derived from explicit v1.0 gaps and TODO comments in the codebase. Scope is well-bounded. P1 vs P2/P3 prioritization is unambiguous. |
| Architecture | HIGH | Based on direct codebase inspection of all affected files. Change scope is precisely defined at the file level. Build order has clear dependency rationale from ARCHITECTURE.md. |
| Pitfalls | HIGH (23 pitfalls documented); MEDIUM (Gemini `stream_options` streaming usage) | v1.0 pitfalls verified via load testing evidence and real-world issue reports (Cline, LangChain). Gemini `stream_options` support is MEDIUM — community-reported, not official docs. All other v1.1 pitfalls verified against official docs and codebase. |

**Overall confidence:** HIGH

### Gaps to Address

- **Gemini `stream_options` streaming usage support:** MEDIUM confidence that Gemini's OpenAI-compat endpoint supports `stream_options: { include_usage: true }`. If not supported, the streaming settle will produce 0 tokens (reproducing the Anthropic bug). Mitigation: integration test against real Gemini API in Phase 1 before shipping; if `stream_options` is unsupported, implement detection and non-streaming settle fallback.

- **`AsyncOpenAI` internal attribute name:** FEATURES.md flags that `AsyncOpenAI` may store its httpx client as `_async_http_client` (not `_client`). The exact attribute name must be verified at implementation time by inspecting the installed SDK version. Getting this wrong causes `wrap_async()` to silently not inject the transport.

- **Turso cloud migration workflow:** Workers runtime does not run `runMigrations()` on startup (only `index.node.ts` does). Phase 3 must document the exact `drizzle-kit push` or `turso db shell` commands for the Turso cloud DB before first deploy. This is an operational gap, not a code gap.

- **Dashboard deploy target:** Cloudflare Pages vs static assets bundled in Worker. Either works; the decision affects `VITE_API_URL` injection timing (Pages: build-time env var; bundled: runtime configuration endpoint). Must be decided before starting Phase 3 implementation.

- **Gemini 2.5 Flash Lite token underreporting:** A documented 2025 bug in `candidatesTokenCount` underreports output tokens by ~8.5x vs actual billing. This is a Gemini-side bug that cannot be fixed in agentgov but should be noted in `pricing.json` comments so operators understand why Gemini cost estimates may be lower than the Gemini invoice.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `packages/proxy/src/passthrough/forward.ts`, `budget/gate.ts`, `budget/ledger.ts`, `db/schema.ts`, `db/client.ts`, `dashboard/routes.ts`, `index.ts`, `index.node.ts`, `wrangler.jsonc`
- Direct codebase inspection: `packages/sdk-python/src/agentgov/_transport.py`, `packages/dashboard/src/hooks/useDashboard.ts`
- [Anthropic Messages Streaming API](https://docs.anthropic.com/en/api/messages-streaming) — SSE event sequence, `message_start`/`message_delta` field structure verified
- [httpx AsyncBaseTransport docs](https://www.python-httpx.org/advanced/transports/) — `handle_async_request` method signature
- [Cloudflare Workflows Workers API](https://developers.cloudflare.com/workflows/build/workers-api/) — `[[workflows]]` binding syntax, GA April 2025
- [Cloudflare Workers + Turso integration](https://developers.cloudflare.com/workers/databases/third-party-integrations/turso/) — `/web` import requirement
- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/) — secrets vs vars distinction; non-inheritable bindings
- [TanStack Query v5 Mutations](https://tanstack.com/query/v5/docs/framework/react/guides/mutations) — `onMutate`/`onError`/`onSettled` pattern
- [@google/genai npm](https://www.npmjs.com/package/@google/genai) + [googleapis/js-genai](https://github.com/googleapis/js-genai) — Web Fetch API usage, Workers compatibility, v1.45.0 confirmed
- [pytest-asyncio docs](https://pytest-asyncio.readthedocs.io/) — `asyncio_mode = "auto"` configuration; strict mode default since 0.21
- [Wrangler v4 changelog](https://developers.cloudflare.com/changelog/post/2025-03-13-wrangler-v4/) — current latest 4.73.0 confirmed

### Secondary (MEDIUM confidence)
- [Gemini API OpenAI Compatibility](https://ai.google.dev/gemini-api/docs/openai) — base URL, API key format (WebSearch verified)
- [Gemini `stream_options` forum discussion](https://discuss.ai.google.dev/t/gemini-openai-compatibility-does-it-support-the-stream-options-parameter/92785) — community-reported streaming usage support; needs integration test verification
- [httpx 0.28 release notes](https://newreleases.io/project/pypi/httpx/release/0.28.0) — deprecated `proxies=` and `app=` kwargs removed

### Tertiary (referenced for pitfall validation)
- [Cline issue #4346](https://github.com/cline/cline/issues/4346) — real-world confirmation of cumulative token counting bug in Anthropic `message_delta`
- [LangChain issue #10249](https://github.com/langchain-ai/langchainjs/issues/10249) — double-count bug from summing `message_delta` values confirmed in production
- Gemini 2.5 Flash Lite `candidatesTokenCount` underreporting bug (~8.5x vs billing) — noted as pricing.json comment recommendation

---
*Research completed: 2026-03-15*
*Ready for roadmap: yes*
