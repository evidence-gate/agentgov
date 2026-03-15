# Architecture Research

**Domain:** Agent Governance Platform — v1.1 Integration Architecture
**Researched:** 2026-03-15
**Confidence:** HIGH (existing codebase read directly; Anthropic/Gemini API formats verified via official documentation search)

## Overview: What Changes vs. What Stays the Same

v1.1 adds 5 features to an already-complete platform. The core request pipeline (`index.ts` → `budgetGate` → `classifyAction` → `forwardToLlm` → `budgetSettle`) is untouched. All 5 features are surgical additions that integrate at well-defined seams.

### Change Classification

| Feature | Scope | Files Changed | New Files |
|---------|-------|---------------|-----------|
| Gemini provider | `forward.ts` only | 1 | 0 |
| Anthropic streaming settle | `forward.ts` only | 1 | 0 |
| Python async SDK | `sdk-python/` only | 0 | 1 |
| Cloudflare deploy | `wrangler.jsonc`, `index.ts` env | 1-2 | 0 |
| Budget CRUD UI | `dashboard/routes.ts`, `useDashboard.ts`, new page | 1 existing + 2 new | 1 route file |

Zero changes to: `index.ts` main pipeline, `budget/gate.ts`, `budget/ledger.ts`, `db/schema.ts`, `audit/writer.ts`, `hitl/*`, `error/*`, `sdk-typescript/*`.

---

## Feature 1: Gemini Provider (forward.ts)

### Current State

`forward.ts` line 94-104: Gemini hits a 503 stub. The routing logic (`resolveProvider`) already returns `'google'` for `gemini-*` models. `pricing.json` already has entries for `gemini-1.5-pro`, `gemini-1.5-flash`, and `gemini-2.0-flash`.

### Integration Point

The Gemini API offers an OpenAI-compatible endpoint at `https://generativelanguage.googleapis.com/v1beta/openai/`. This endpoint accepts the standard `/chat/completions` request format with `Authorization: Bearer $GEMINI_API_KEY`. No request body conversion is needed — the Gemini OpenAI-compat layer handles it server-side.

**What changes in `forward.ts`:**
1. Add `GEMINI_API_KEY` to `ForwardEnv` interface
2. Replace the 503 stub block for `provider === 'google'` with a `forwardToGemini()` function
3. `forwardToGemini()` is structurally identical to `forwardToOpenAI()` — same streaming path, same `stream_options: { include_usage: true }` injection, same `processStreamAndSettle()` reuse

**Streaming settle:** Gemini's OpenAI-compat layer returns SSE in OpenAI format, including the final usage chunk when `stream_options.include_usage: true` is set. The existing `processStreamAndSettle()` function used for OpenAI can be reused without modification.

**Authentication difference:** OpenAI uses `Authorization: Bearer $KEY`. Gemini OpenAI-compat also uses `Authorization: Bearer $GEMINI_API_KEY`. No header change required.

**What does NOT change:** `budgetGate`, `pricing.ts`, `resolveProvider()`. The `gemini-*` prefix routing is already in place.

### Data Flow Delta

```
Before: resolveProvider('gemini-*') → 'google' → 503 stub
After:  resolveProvider('gemini-*') → 'google' → forwardToGemini()
                                                   → fetch generativelanguage.googleapis.com
                                                   → processStreamAndSettle() [reused]
                                                   → budgetSettle()
```

### wrangler.jsonc addition

```jsonc
"GEMINI_API_KEY": ""   // Add to vars block; set real value in .dev.vars / wrangler secrets
```

---

## Feature 2: Anthropic Streaming Settle (forward.ts)

### Current State

`forward.ts` lines 360-375: Anthropic streaming uses `pipeAndSettle()`, which pipes the stream through without parsing, then calls `budgetSettle(0, 0)`. The code comment says "TODO: parse Anthropic SSE usage events in a later plan."

### Anthropic SSE Format

Anthropic's streaming SSE event sequence (verified from official docs):
1. `event: message_start` — contains `usage: { input_tokens: N }` (prompt token count)
2. `event: content_block_start`, `content_block_delta`, `content_block_stop` — content chunks
3. `event: message_delta` — contains `usage: { output_tokens: N }` (completion token count, cumulative)
4. `event: message_stop` — no usage data

The two events to parse: `message_start` (for `input_tokens`) and `message_delta` (for `output_tokens`).

### Integration Point

Replace `pipeAndSettle()` with a new `processAnthropicStreamAndSettle()` function in `forward.ts`. The function mirrors `processStreamAndSettle()` but parses Anthropic SSE event names.

**What changes in `forward.ts`:**
1. Replace the call to `pipeAndSettle()` in `forwardToAnthropic()` streaming branch with `processAnthropicStreamAndSettle()`
2. Add `processAnthropicStreamAndSettle()` function that:
   - Reads chunks, forwards each to writer (same pipe logic)
   - Decodes text, splits on `\n`
   - Tracks `event:` lines to know which event type the next `data:` line belongs to
   - On `event: message_start`, extracts `data.message.usage.input_tokens`
   - On `event: message_delta`, extracts `data.usage.output_tokens`
   - After stream ends, calls `budgetSettle(db, holdId, { promptTokens, completionTokens }, model, agentId)`

**SSE parsing note:** Anthropic SSE uses named events (`event: message_start\ndata: {...}\n\n`), unlike OpenAI which uses only `data:` lines. The parser must track the most recently seen `event:` line before parsing the `data:` line.

**What does NOT change:** `forwardToAnthropic()` non-streaming path (already correct — extracts `input_tokens`/`output_tokens` from the response JSON). `budgetSettle()` signature is unchanged.

### Data Flow Delta

```
Before: Anthropic stream → pipeAndSettle() → budgetSettle(0, 0)
After:  Anthropic stream → processAnthropicStreamAndSettle()
                           → parse message_start → input_tokens
                           → parse message_delta → output_tokens
                           → budgetSettle(promptTokens, completionTokens)
```

---

## Feature 3: Python Async SDK (sdk-python)

### Current State

`packages/sdk-python/src/agentgov/_transport.py`: `AgentgovTransport` subclasses `httpx.BaseTransport` (sync) and implements `handle_request()`. The file comment says "Phase 4 MVP: SYNC only. AsyncBaseTransport is deferred."

### Integration Point

Add `AgentgovAsyncTransport` as a parallel class in a new file `_async_transport.py` (or inline in `_transport.py`). The class subclasses `httpx.AsyncBaseTransport` and implements `async def handle_async_request(request: httpx.Request) -> httpx.Response`.

**Interface contract (from httpx docs, HIGH confidence):**
- Subclass `httpx.AsyncBaseTransport`
- Implement `async def handle_async_request(self, request: httpx.Request) -> httpx.Response`
- Implement `async def aclose(self) -> None`
- Inner transport: use `httpx.AsyncHTTPTransport` as the default inner transport

**What changes:**
- New file: `packages/sdk-python/src/agentgov/_async_transport.py` (or new class in `_transport.py`)
- Update `packages/sdk-python/src/agentgov/__init__.py` to export `AgentgovAsyncTransport`

**Logic is identical to sync version, just awaited:**
- URL rewrite: same logic (synchronous URL manipulation, no await needed)
- Header injection: same logic
- Forward: `await self._inner.handle_async_request(rewritten)` instead of `self._inner.handle_request(rewritten)`
- Response reading: `await response.aread()` instead of `response.read()`
- Exception raising: same logic (synchronous inspection of already-read content)

**Usage pattern:**
```python
async with httpx.AsyncClient(transport=AgentgovAsyncTransport(proxy_url=..., agent_id=...)) as client:
    response = await client.post(...)
```

**What does NOT change:** `AgentgovTransport` (sync class unchanged), `__init__.py` exports (add, don't remove), `_exceptions.py` (shared between sync and async).

---

## Feature 4: Cloudflare Workers Deploy (wrangler.jsonc + env mapping)

### Current State

`wrangler.jsonc` exists but uses `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` as empty vars. The `createDbClient()` in `db/client.ts` already uses `@libsql/client/web` (the Workers-compatible import). `index.ts` already checks for `c.env.TURSO_DATABASE_URL` and `c.env.TURSO_AUTH_TOKEN` before initializing the DB.

`index.ts` line 192: `forwardToLlm` receives only `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` from env. Gemini key is not yet passed through.

### Integration Points

**wrangler.jsonc additions:**
1. Add `GEMINI_API_KEY: ""` to vars block
2. No new bindings needed — `HITL_WORKFLOW` binding already exists

**`index.ts` changes (minimal):**
1. Pass `GEMINI_API_KEY: c.env?.GEMINI_API_KEY` to `forwardToLlm()` (line ~192)

**`forward.ts` `ForwardEnv` interface:**
1. Add `GEMINI_API_KEY?: string`

**`index.node.ts` (Docker entry):**
1. Add `env['GEMINI_API_KEY'] = process.env['GEMINI_API_KEY'] ?? ''` to the env mapping middleware

**Turso cloud setup (operational, not code):**
The proxy already works with Turso via `@libsql/client/web`. Cloudflare Workers deploy requires:
- A Turso cloud database (not embedded file — Workers have no persistent filesystem)
- `wrangler secret put TURSO_DATABASE_URL` and `wrangler secret put TURSO_AUTH_TOKEN`
- `wrangler secret put OPENAI_API_KEY` (and Anthropic/Gemini keys)

The `@libsql/client/web` import in `db/client.ts` is already the correct Workers-compatible import path. No code change needed there.

**Migrations:** `db/client.node.ts` runs migrations via `runMigrations()`. For Workers deploy, migrations must be run separately against the Turso cloud DB (e.g., via a local `drizzle-kit push` or a one-off migration script). The Workers runtime does not run migrations on startup.

**HITL_WORKFLOW binding:** Already declared in `wrangler.jsonc` and `HitlWorkflow` already exported from `index.ts`. No change needed.

### Data Flow Delta

```
Before: Deploy only via Docker (index.node.ts + embedded libSQL)
After:  Also deploy via: wrangler deploy → index.ts → Turso cloud libSQL
                         Same pipeline, same DB schema, same code
                         Env vars from wrangler secrets instead of process.env
```

---

## Feature 5: Budget CRUD UI (dashboard + proxy)

### Current State

`dashboard/routes.ts`: Three read-only `GET` endpoints (`/budgets`, `/audit`, `/approvals`). The file comment says "SELECT-only. No POST/PUT/DELETE — hard constraint."

`budget/ledger.ts`: Has `ensureAgent()` (INSERT OR IGNORE with hardcoded `$10` default), `getBudget()`, `createHold()`, `settleHold()`. No update-limit function exists.

`budget/gate.ts` line 66: `await ensureAgent(db, agentId, DEFAULT_BUDGET_LIMIT_USD)` with `DEFAULT_BUDGET_LIMIT_USD = 10.0` hardcoded.

`dashboard/src/pages/costs.tsx`: Renders budget table read-only. No mutation UI.

### Integration Points

**New proxy route: `PATCH /api/v1/dashboard/budgets/:agentId`**

Add to `dashboard/routes.ts` (or a new `dashboard/budget-crud.ts` mounted alongside):
- Body: `{ limitUsd: number }`
- Validates: `limitUsd > 0`, finite number
- Operation: `UPDATE budget_ledger SET limit_usd = ?, updated_at = ? WHERE agent_id = ?`
- Returns: updated row

**New proxy route: `POST /api/v1/dashboard/budgets`**

- Body: `{ agentId: string, limitUsd: number }`
- Operation: INSERT with `onConflictDoUpdate` — create new agent or update limit
- Returns: created/updated row

**New proxy route: `DELETE /api/v1/dashboard/budgets/:agentId`** (optional for MVP — can defer)

**`budget/ledger.ts` additions:**
- `updateBudgetLimit(db, agentId, limitUsd)` — `UPDATE budget_ledger SET limit_usd = ?, updated_at = ? WHERE agent_id = ?`
- `upsertAgent(db, agentId, limitUsd)` — `INSERT ... ON CONFLICT DO UPDATE SET limit_usd = ?` (replaces hardcoded `ensureAgent` for dashboard use)

**`index.node.ts` change (Docker):**
The `createDashboardRoutes(db)` call already mounts dashboard routes. The CRUD routes use the same `DockerDbClient` type.

**`index.ts` change (Workers):**
Dashboard routes are Node.js only (mounted in `index.node.ts`). For Workers deploy, dashboard CRUD endpoints need to be mounted in `index.ts` using the Workers DB client. This creates a structural question: currently the dashboard routes are in a separate file that accepts `DockerDbClient`. They need to accept the abstract `DbClient` type.

**Correct approach:** Refactor `createDashboardRoutes()` to accept `DbClient` (abstract type from `db/client.ts`) instead of `DockerDbClient`. The `DrizzleORM` operations used (`select`, `update`, `insert`) are identical between both client types.

**Dashboard SPA additions:**
- `useDashboard.ts`: Add `useMutation` hooks for `patchBudgetLimit` (TanStack Query `useMutation` with `onSuccess: () => queryClient.invalidateQueries(['budgets'])`)
- New `pages/budget-edit.tsx` or inline edit in `costs.tsx`: Input field + Save button per row

### Data Flow Delta

```
Before: Dashboard → GET /api/v1/dashboard/budgets → read-only display
After:  Dashboard → GET /api/v1/dashboard/budgets → display
        User edits limit → PATCH /api/v1/dashboard/budgets/:agentId
                         → updateBudgetLimit(db, agentId, newLimit)
                         → invalidate ['budgets'] query → re-fetch
```

---

## Revised System Overview (v1.1)

```
┌─────────────────────────────────────────────────────────────────────┐
│                          AGENT PROCESS                              │
│  SDK-TS: createAgentgovFetch() / wrap()  [unchanged]                │
│  SDK-Python sync: AgentgovTransport      [unchanged]                │
│  SDK-Python async: AgentgovAsyncTransport [NEW]                     │
└─────────────────────────────┬───────────────────────────────────────┘
                              │ HTTPS
┌─────────────────────────────▼───────────────────────────────────────┐
│                PROXY (index.ts / index.node.ts)                     │
│                                                                     │
│  Request Pipeline [unchanged]:                                      │
│  Auth → budgetGate → classifyAction → HITL check → loopDetect       │
│                                                                     │
│  forwardToLlm() [forward.ts — 2 changes]:                          │
│  ├── OpenAI  → processStreamAndSettle()  [unchanged]               │
│  ├── Anthropic non-stream → extract input/output_tokens [unchanged] │
│  ├── Anthropic stream → processAnthropicStreamAndSettle() [NEW]    │
│  └── Gemini  → forwardToGemini() → processStreamAndSettle() [NEW]  │
│                                                                     │
│  Dashboard Routes [dashboard/routes.ts — expanded]:                 │
│  ├── GET  /api/v1/dashboard/budgets       [unchanged]               │
│  ├── PATCH /api/v1/dashboard/budgets/:id  [NEW]                    │
│  ├── POST  /api/v1/dashboard/budgets      [NEW]                    │
│  ├── GET  /api/v1/dashboard/audit         [unchanged]               │
│  └── GET  /api/v1/dashboard/approvals     [unchanged]               │
└──────────────┬──────────────────────────────────┬───────────────────┘
               │                                  │
┌──────────────▼──────┐                ┌──────────▼─────────────────┐
│  LLM Providers      │                │  Turso / libSQL             │
│  OpenAI [exists]    │                │  budget_ledger              │
│  Anthropic [exists] │                │  holds                      │
│  Gemini API [NEW]   │                │  audit_log                  │
│                     │                │  hitl_queue                 │
└─────────────────────┘                └────────────────────────────┘

Deploy targets:
- Docker (index.node.ts + embedded libSQL) [exists]
- Cloudflare Workers (index.ts + Turso cloud) [v1.1 NEW: fully wire env + wrangler secrets]
```

---

## Component Responsibilities (v1.1 delta)

| Component | v1.0 State | v1.1 Change |
|-----------|-----------|-------------|
| `forward.ts` | OpenAI stream, Anthropic non-stream, Anthropic stream (0-token settle), Gemini 503 stub | Add `forwardToGemini()`, add `processAnthropicStreamAndSettle()` |
| `dashboard/routes.ts` | 3 GET endpoints, accepts `DockerDbClient` | Add PATCH + POST endpoints, accept abstract `DbClient` |
| `budget/ledger.ts` | `ensureAgent` (hardcoded $10), `getBudget`, `createHold`, `settleHold` | Add `updateBudgetLimit()`, `upsertAgent()` |
| `sdk-python/_transport.py` | Sync `AgentgovTransport` only | Unchanged |
| `sdk-python/_async_transport.py` | Does not exist | New file: `AgentgovAsyncTransport(httpx.AsyncBaseTransport)` |
| `sdk-python/__init__.py` | Exports sync transport | Add export for async transport |
| `wrangler.jsonc` | Missing `GEMINI_API_KEY` | Add `GEMINI_API_KEY: ""` var |
| `index.ts` | Passes `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` to `forwardToLlm` | Add `GEMINI_API_KEY` passthrough |
| `index.node.ts` | Maps 9 env vars | Add `GEMINI_API_KEY` mapping |
| `dashboard/src/hooks/useDashboard.ts` | 3 `useQuery` hooks, read-only | Add `useMutation` hooks for budget CRUD |
| `dashboard/src/pages/costs.tsx` | Read-only table | Add inline edit controls |

---

## Recommended Project Structure (v1.1 additions only)

```
packages/
├── proxy/
│   ├── src/
│   │   ├── passthrough/
│   │   │   └── forward.ts              # MODIFY: add forwardToGemini(), processAnthropicStreamAndSettle()
│   │   ├── budget/
│   │   │   └── ledger.ts               # MODIFY: add updateBudgetLimit(), upsertAgent()
│   │   ├── dashboard/
│   │   │   └── routes.ts               # MODIFY: add PATCH/POST endpoints, change DbClient type
│   │   ├── index.ts                    # MODIFY: add GEMINI_API_KEY passthrough
│   │   └── index.node.ts               # MODIFY: add GEMINI_API_KEY env mapping
│   └── wrangler.jsonc                  # MODIFY: add GEMINI_API_KEY var
│
├── sdk-python/
│   └── src/agentgov/
│       ├── _async_transport.py         # NEW: AgentgovAsyncTransport
│       ├── _transport.py               # unchanged
│       └── __init__.py                 # MODIFY: export AgentgovAsyncTransport
│
└── dashboard/
    └── src/
        ├── hooks/
        │   └── useDashboard.ts         # MODIFY: add useMutation hooks
        └── pages/
            └── costs.tsx               # MODIFY: add inline edit controls
```

---

## Architectural Patterns (v1.1)

### Pattern 1: Provider Router Extension (Gemini)

**What:** `resolveProvider()` already returns `'google'` for `gemini-*` models. The extension point is already designed — adding Gemini is filling in the stub, not adding a new routing layer.

**When to use:** Each new LLM provider follows this pattern: add model prefix to `resolveProvider()`, add API key check, add `forwardToProvider()` function.

**Trade-offs:** No abstraction layer between providers. Each provider function is ~40-60 lines of straightforward fetch logic. This is intentional — provider APIs differ enough that a "generic provider" abstraction adds complexity without reducing code.

**Critical note:** Gemini's OpenAI-compat endpoint (`generativelanguage.googleapis.com/v1beta/openai/`) accepts the same body as OpenAI and returns the same SSE format. The existing `processStreamAndSettle()` can be reused directly. This is the key insight that makes Gemini a trivial addition.

### Pattern 2: SSE Event-Type Tracking (Anthropic Streaming)

**What:** Anthropic SSE uses named events (`event: message_start\ndata: {...}`). The parser must track the last seen `event:` line to know how to interpret the following `data:` line.

**When to use:** Only for Anthropic streaming. OpenAI SSE uses only `data:` lines (no named events).

**Example:**
```typescript
let currentEvent = '';
for (const line of lines) {
  if (line.startsWith('event: ')) {
    currentEvent = line.slice(7).trim();
  } else if (line.startsWith('data: ')) {
    const data = line.slice(6).trim();
    if (currentEvent === 'message_start') {
      // data contains: { type, message: { usage: { input_tokens } } }
    } else if (currentEvent === 'message_delta') {
      // data contains: { type, delta, usage: { output_tokens } }
    }
  }
}
```

### Pattern 3: Async Transport Mirror (Python SDK)

**What:** `AgentgovAsyncTransport` mirrors `AgentgovTransport` exactly, with `async def handle_async_request` instead of `def handle_request`, and `await response.aread()` instead of `response.read()`.

**When to use:** When the caller uses `httpx.AsyncClient` with `await client.post(...)`.

**Trade-offs:** Code duplication between sync and async classes. The alternative (single class with dual mode) is more complex. For ~60 lines of logic, duplication is the correct tradeoff. Exception classes are shared.

### Pattern 4: DbClient Abstraction for Dashboard Routes

**What:** Refactor `createDashboardRoutes()` to accept `DbClient` (the Drizzle/libSQL abstract type) instead of `DockerDbClient`. Both are the return type of `drizzle(client, { schema })` — they have the same API.

**When to use:** Whenever a route module needs to work in both Workers (Turso cloud) and Docker (embedded libSQL) contexts.

**Example:**
```typescript
// Before: accepts DockerDbClient (Docker-only)
export function createDashboardRoutes(db: DockerDbClient): Hono

// After: accepts DbClient (works in both Workers and Docker)
export function createDashboardRoutes(db: DbClient): Hono
```

---

## Data Flow Changes

### Anthropic Streaming Settle Flow (v1.1)

```
Anthropic SSE stream
    ↓
processAnthropicStreamAndSettle()
    ├── chunk → decode → split lines
    ├── line "event: message_start"     → set currentEvent
    │   next line "data: {...}"         → extract input_tokens
    ├── line "event: content_block_*"   → forward, ignore for tokens
    ├── line "event: message_delta"     → set currentEvent
    │   next line "data: {...}"         → extract output_tokens (cumulative)
    └── stream done → budgetSettle(promptTokens, completionTokens)
```

### Budget CRUD Flow (v1.1)

```
Dashboard UI: user changes limit field → clicks Save
    ↓
useMutation: PATCH /api/v1/dashboard/budgets/:agentId { limitUsd }
    ↓
dashboard/routes.ts: PATCH handler
    ↓
updateBudgetLimit(db, agentId, limitUsd) [new ledger function]
    ↓ UPDATE budget_ledger SET limit_usd = ? WHERE agent_id = ?
    ↓
onSuccess: queryClient.invalidateQueries(['budgets'])
    ↓
useBudgets() re-fetches → table updates
```

### Gemini Provider Flow (v1.1)

```
Request: model = "gemini-2.0-flash"
    ↓ (resolveProvider already returns 'google')
budgetGate: pricing.json has gemini entries → hold created [unchanged]
    ↓
forwardToGemini() [NEW]
    → fetch https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
      headers: Authorization: Bearer $GEMINI_API_KEY
      body: same OpenAI-format body (Gemini compat layer handles translation)
    ↓
processStreamAndSettle() [REUSED — Gemini returns OpenAI SSE format]
    → extract usage.prompt_tokens / usage.completion_tokens from final chunk
    → budgetSettle()
```

---

## Integration Points

### External Services (v1.1 additions)

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Gemini API (new) | `POST https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` with `Authorization: Bearer $GEMINI_API_KEY` | OpenAI-compat endpoint. Returns OpenAI SSE format. `processStreamAndSettle()` reused unchanged. |
| Anthropic streaming (fix) | Same endpoint as v1.0 (`api.anthropic.com/v1/messages`) | Parse named SSE events: `message_start` for `input_tokens`, `message_delta` for `output_tokens`. |

### Internal Boundaries (v1.1 changes)

| Boundary | v1.0 | v1.1 Change |
|----------|------|-------------|
| `forwardToLlm()` env | Accepts `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | Add `GEMINI_API_KEY` to `ForwardEnv` interface |
| `dashboard/routes.ts` DB type | `DockerDbClient` (Docker-only) | Change to `DbClient` (abstract, works in Workers) |
| Dashboard API contract | GET-only | Add PATCH + POST for budget mutations |
| Python SDK public API | `AgentgovTransport` | Add `AgentgovAsyncTransport` |

---

## Build Order

Dependencies between the 5 features are minimal. The suggested order optimizes for: (1) independent work first, (2) shared dependency (DbClient refactor) before features that use it.

```
Step 1 [no dependencies, highest value]:
  ├── Anthropic streaming settle (forward.ts only — zero risk change)
  └── Gemini provider (forward.ts only — depends only on pricing.json already having gemini entries)

Step 2 [no dependencies on Step 1]:
  └── Python async SDK (sdk-python only — fully isolated from proxy)

Step 3 [depends on: budget/ledger.ts changes, DbClient type change]:
  └── Budget CRUD UI
      ├── 3a: Add updateBudgetLimit() + upsertAgent() to ledger.ts
      ├── 3b: Refactor createDashboardRoutes() to accept DbClient
      ├── 3c: Add PATCH/POST endpoints to dashboard/routes.ts
      └── 3d: Add useMutation hooks + edit UI to dashboard

Step 4 [depends on Steps 1 + 3b]:
  └── Cloudflare Workers deploy
      ├── Add GEMINI_API_KEY to wrangler.jsonc + index.ts + index.node.ts
      ├── Run migrations against Turso cloud DB
      └── wrangler deploy + set secrets
```

Steps 1 and 2 can be done in parallel. Step 3 can begin in parallel with Steps 1-2 since it touches different files. Step 4 must come last (validates that everything works on Workers).

### Rationale for This Order

- Steps 1+2 are pure additions to isolated files — no shared state, no risk of breaking existing behavior
- Step 3 includes the one slightly risky refactor (DbClient type change in `createDashboardRoutes`) — do this before attempting Workers deploy to validate the abstraction works
- Step 4 (Workers deploy) is integration validation: it exercises the full prod path and will surface any env/binding issues. Do it last when all features are in.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Adding a Provider Abstraction Layer

**What people do:** Create a `providers/` module with a `LlmProvider` interface and implementations for each provider, replacing the function-per-provider pattern.

**Why it's wrong:** The three providers have meaningfully different auth headers, request formats (OpenAI vs Anthropic), and SSE formats (OpenAI/Gemini vs Anthropic named events). A generic interface requires enough escape hatches that the abstraction provides no actual simplification. For 3 providers at ~60 lines each, functions are correct.

**Do this instead:** Keep `forwardToOpenAI`, `forwardToAnthropic`, `forwardToGemini` as separate functions. Share `processStreamAndSettle()` for providers that return OpenAI SSE format (OpenAI + Gemini). Use a separate parser function for Anthropic.

### Anti-Pattern 2: Migrating to Drizzle Transactions for Budget CRUD

**What people do:** Wrap the `updateBudgetLimit` UPDATE in a DB transaction to be "safe."

**Why it's wrong:** The Turso HTTP client does not support interactive transactions (documented in `ledger.ts` comments). Attempting to use transactions will fail at runtime on the Turso cloud client. The single UPDATE for `limit_usd` is already atomic at the SQL level — no transaction needed.

**Do this instead:** Single `UPDATE budget_ledger SET limit_usd = ?, updated_at = ?` statement. If the update fails, return an error. No transaction wrapping.

### Anti-Pattern 3: Putting Dashboard CRUD Routes in index.ts Main Pipeline

**What people do:** Add the budget PATCH/POST endpoints directly to `index.ts` alongside `/v1/chat/completions`.

**Why it's wrong:** Dashboard routes are observability/management endpoints, not the governance pipeline. Mixing them in `index.ts` makes the main pipeline file harder to read and creates a risk of accidentally applying governance middleware (budget gate, HITL check) to management endpoints.

**Do this instead:** Keep dashboard routes in `dashboard/routes.ts`, mounted via `app.route('/')` in both `index.ts` (Workers) and `index.node.ts` (Docker). The dashboard router is self-contained.

### Anti-Pattern 4: Duplicating Exception Logic in Async Python Transport

**What people do:** Copy the exception-raising logic from `_transport.py` into `_async_transport.py`.

**Why it's wrong (sort of):** The exceptions themselves (`BudgetExceeded`, `HitlPending`, `AgentError`) live in `_exceptions.py` and are shared. The inspection logic (read content, check status code, check error.code) is ~20 lines. Acceptable to duplicate since the alternative (shared helper function) requires careful design for the different sync vs async response types.

**Do this instead:** Import exceptions from `_exceptions.py` in both transport files. Duplicate only the ~20 lines of inspection logic. Keep it readable.

---

## Scaling Considerations

These 5 features do not change the scaling profile of the system. The existing bottlenecks (hold table write contention, audit log growth) are unchanged. Specific notes:

| Feature | Scaling Impact |
|---------|---------------|
| Gemini provider | Same as other providers — one hold + one settle per request |
| Anthropic streaming settle | No impact — replaces 0-cost settle with accurate settle (reduces over-reservation edge cases) |
| Python async SDK | Client-side only — no server load change |
| Cloudflare Workers deploy | Enables edge deployment with global latency reduction — improves not degrades scale |
| Budget CRUD | PATCH/POST on `budget_ledger` are low-frequency admin operations — negligible |

---

## Sources

- Codebase read directly: `/Users/masa/gsd-workspace/packages/proxy/src/passthrough/forward.ts`, `budget/gate.ts`, `budget/ledger.ts`, `db/schema.ts`, `db/client.ts`, `dashboard/routes.ts`, `index.ts`, `index.node.ts`, `wrangler.jsonc`
- Codebase read directly: `/Users/masa/gsd-workspace/packages/sdk-python/src/agentgov/_transport.py`
- Codebase read directly: `/Users/masa/gsd-workspace/packages/dashboard/src/hooks/useDashboard.ts`
- [Anthropic Streaming Messages API](https://docs.anthropic.com/en/api/messages-streaming) — SSE event sequence: `message_start` (input_tokens), `message_delta` (output_tokens) — MEDIUM confidence (WebSearch verified; official source)
- [Gemini API OpenAI Compatibility](https://ai.google.dev/gemini-api/docs/openai) — Base URL `https://generativelanguage.googleapis.com/v1beta/openai/`, `Authorization: Bearer $GEMINI_API_KEY` — MEDIUM confidence (WebSearch verified; official source)
- [HTTPX AsyncBaseTransport](https://www.python-httpx.org/advanced/transports/) — `handle_async_request` method signature for async transports — HIGH confidence (official docs)
- [Cloudflare Workers + Turso](https://developers.cloudflare.com/workers/databases/third-party-integrations/turso/) — `@libsql/client/web` required import path — HIGH confidence (official Cloudflare docs)
- [TanStack Query useMutation](https://tanstack.com/query/latest/docs/framework/react/reference/useMutation) — `onSuccess: queryClient.invalidateQueries` pattern — HIGH confidence (official docs)

---

*Architecture research for: agentgov v1.1 integration*
*Researched: 2026-03-15*
