---
phase: 01-budget-engine-proxy-foundation
plan: "03"
subsystem: api
tags: [typescript-sdk, openai-sdk, proxy-passthrough, streaming, sse, webhook, budget-alerts, tsup, vitest, transform-stream]

# Dependency graph
requires:
  - phase: 01-budget-engine-proxy-foundation
    plan: "01"
    provides: "Hono app entry, Drizzle schema, createDbClient, shared types"
  - phase: 01-budget-engine-proxy-foundation
    plan: "02"
    provides: "budgetGate, budgetSettle, audit writer, ledger operations"
provides:
  - "@agentgov/sdk v0.1.0: wrap(client, options) one-liner for OpenAI-compatible client routing"
  - "BudgetExceeded error class with code/spent/limit/budgetId fields"
  - "createAgentgovFetch: URL rewriter + X-Agent-Id injector + 429 BudgetExceeded detector"
  - "buildProxyBaseUrl: trailing-slash normalization"
  - "forwardToLlm: streaming LLM passthrough with post-response budgetSettle (OpenAI + Anthropic)"
  - "checkAndFireAlerts: idempotent webhook alerts at configurable thresholds (80%/100% default)"
  - "End-to-end path: SDK → proxy → LLM → budgetSettle → SDK caller"
affects:
  - 02-hitl-approval: SDK is the agent-side integration surface; BudgetExceeded shape must be preserved
  - 03-cli-dashboard: alert webhook payload shape (budget_alert event) used for dashboard integration
  - 04-python-sdk: BudgetExceeded exception shape documented here for Python parity

# Tech tracking
tech-stack:
  added:
    - "@agentgov/sdk (new workspace package packages/sdk-typescript)"
    - "tsup@8.5.1 (ESM+CJS dual build, dts generation)"
    - "vitest@2.1.9 (SDK test runner — pinned to v2 for vite@5 workspace compatibility)"
    - "openai (peerDependency — not bundled)"
  patterns:
    - "SDK wrap() pattern: patches client.fetch and client.baseURL post-construction in-place"
    - "BudgetExceeded detection: clone response, JSON.parse, check error.code, re-throw if BudgetExceeded"
    - "Streaming passthrough: TransformStream pipe (no buffering); stream_options.include_usage for usage extraction"
    - "Streaming usage settle: processStreamAndSettle reads SSE lines, finds final usage chunk, calls budgetSettle"
    - "Alert idempotency: audit_log query with json_extract(payload, '$.threshold') before firing"
    - "Fire-and-forget alerts: executionCtx.waitUntil() if available, else background promise"
    - "Provider routing table: gpt-/o1-/o3- → OpenAI, claude- → Anthropic, gemini- → 503 (Phase 1)"
    - "vitest pinned to v2 in SDK package: v4 requires vite@6 but workspace uses vite@5"

key-files:
  created:
    - packages/sdk-typescript/package.json
    - packages/sdk-typescript/tsconfig.json
    - packages/sdk-typescript/tsup.config.ts
    - packages/sdk-typescript/src/errors.ts
    - packages/sdk-typescript/src/interceptor.ts
    - packages/sdk-typescript/src/wrap.ts
    - packages/sdk-typescript/src/index.ts
    - packages/sdk-typescript/src/wrap.test.ts
    - packages/proxy/src/passthrough/forward.ts
    - packages/proxy/src/budget/alerts.ts
    - packages/proxy/src/budget/alerts.test.ts
    - .gitignore
  modified:
    - packages/proxy/src/index.ts
    - packages/proxy/vitest.config.ts
    - packages/proxy/vitest.config.node.ts
    - packages/proxy/wrangler.jsonc
    - packages/proxy/worker-configuration.d.ts

key-decisions:
  - "vitest pinned to v2 in SDK package — v4 requires vite@6 but monorepo uses vite@5 (proxy pinned to v2 earlier); using v2 across workspace"
  - "BudgetExceeded detection clones the response before JSON.parse — original response preserved for non-matching 429s"
  - "Google/Gemini returns 503 in Phase 1 — GEMINI_API_KEY support deferred to later plan"
  - "Anthropic streaming uses pipeAndSettle with 0-token settle — Anthropic SSE usage parsing deferred"
  - "checkAndFireAlerts uses audit_log json_extract for idempotency — avoids a separate 'alerts_fired' table"
  - "exports map: types condition placed first (before import/require) per esbuild/Node 16+ best practice"
  - ".gitignore created at repo root — .dev.vars exclusion is critical since real API keys go there"

patterns-established:
  - "SDK peerDependency pattern: openai in peerDependencies + devDependencies, not bundled"
  - "Response clone pattern for 429 detection: response.clone() before .json() so original stream is preserved"
  - "Fire-and-forget background work: executionCtx.waitUntil if available, .catch(console.error) otherwise"
  - "Dual vitest config preserved: Workers pool excludes new test files; Node.js config includes them"

requirements-completed:
  - SDK-01
  - COST-05

# Metrics
duration: 6min
completed: 2026-03-13
---

# Phase 01 Plan 03: SDK + Alert Webhook Summary

**@agentgov/sdk v0.1.0 wrap() one-liner, TransformStream LLM passthrough with budgetSettle, and idempotent 80%/100% alert webhooks closing the end-to-end SDK → proxy → LLM → settle loop**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-13T09:08:02Z
- **Completed:** 2026-03-13T09:14:27Z
- **Tasks:** 2
- **Files modified:** 12 created, 5 modified

## Accomplishments

- `@agentgov/sdk` package (v0.1.0): `wrap(client, options)` patches `client.fetch` and `client.baseURL` in-place on any OpenAI-compatible client; `BudgetExceeded` extends Error with typed `code`/`spent`/`limit`/`budgetId`; `createAgentgovFetch` rewrites URLs, injects `X-Agent-Id`, and throws `BudgetExceeded` on 429 with matching code — returning original response for all other 429s
- `forwardToLlm`: routes by model prefix to OpenAI or Anthropic, pipes streaming responses via `TransformStream` without buffering, adds `stream_options: { include_usage: true }` to streaming OpenAI requests, calls `budgetSettle` with actual token counts after stream completes
- `checkAndFireAlerts`: fires POST webhook at 80%/100% thresholds, idempotent via `audit_log` query (`json_extract(payload, '$.threshold')`), records `alert_fired` audit events, catches and logs webhook failures without propagating
- tsup build produces `dist/index.js` (ESM), `dist/index.cjs` (CJS), `dist/index.d.ts` (types); 71 tests total (18 SDK + 49 proxy + 4 Workers pool), all passing

## SDK Package Details

**Package:** `@agentgov/sdk` at `packages/sdk-typescript/`
**Version:** `0.1.0`
**npm publish:** not yet — can be published to npm in Phase 4

**BudgetExceeded shape (for Python SDK parity in Phase 4):**
```typescript
class BudgetExceeded extends Error {
  readonly code = 'BUDGET_EXCEEDED'  // always this literal
  readonly spent: number             // USD spent
  readonly limit: number             // USD limit
  readonly budgetId: string          // agent ID
  name = 'BudgetExceeded'           // error name (not 'Error')
}
```

**wrap() implementation:**
- Patches `client['fetch']` with `createAgentgovFetch({ proxyUrl, agentId })`
- Patches `client['baseURL']` with `proxyUrl.replace(/\/$/, '') + '/v1'`
- Returns same client instance (mutates in-place, TypeScript type preserved)

## Streaming Passthrough Technique

**Pattern:** `TransformStream<Uint8Array, Uint8Array>` pipe

For OpenAI streaming:
1. Add `stream_options: { include_usage: true }` to forwarded body
2. Create `TransformStream`, get `readable` and `writable`
3. Return `new Response(readable, ...)` immediately (no buffering)
4. `processStreamAndSettle` reads SSE chunks in background, writes to `writer`, parses lines for `data: {..., "usage": {...}}` pattern, calls `budgetSettle` after `[DONE]`

## Alert Threshold Configuration

**Defaults:** 80% and 100% (`AGENTGOV_ALERT_THRESHOLDS=0.80,1.00`)
**Override:** Set `AGENTGOV_ALERT_THRESHOLDS` in wrangler vars or `.dev.vars` as comma-separated ratios
**Webhook:** Set `AGENTGOV_ALERT_WEBHOOK_URL` env var; if empty/absent, alerts are silently skipped

**Alert payload shape:**
```json
{
  "event": "budget_alert",
  "agentId": "my-agent",
  "threshold": 0.80,
  "spent": 8.0,
  "limit": 10.0,
  "timestamp": "2026-03-13T09:14:00.000Z"
}
```

## Provider Routing Table

| Model prefix | Provider | URL | API Key env var |
|---|---|---|---|
| `gpt-`, `o1-`, `o3-` | OpenAI | `https://api.openai.com/v1/chat/completions` | `OPENAI_API_KEY` |
| `claude-` | Anthropic | `https://api.anthropic.com/v1/messages` | `ANTHROPIC_API_KEY` |
| `gemini-` | Google | — (503 in Phase 1) | — |
| other | — | 422 `cannot determine LLM provider` | — |

## Task Commits

Each task was committed atomically:

1. **Task 1: TypeScript SDK — wrap(), BudgetExceeded, base URL interceptor** - `817aad1` (feat)
2. **Task 2: LLM passthrough, streaming settle, budget alert webhook** - `de6d502` (feat)

**Plan metadata:** (see below — docs commit)

_Note: TDD tasks — RED (failing) confirmed before GREEN (implementation) for both tasks._

## Files Created/Modified

- `packages/sdk-typescript/src/errors.ts` - BudgetExceeded extends Error with code/spent/limit/budgetId
- `packages/sdk-typescript/src/interceptor.ts` - createAgentgovFetch (URL rewrite + header inject + 429 detect), buildProxyBaseUrl
- `packages/sdk-typescript/src/wrap.ts` - wrap() patches client.fetch and client.baseURL in-place
- `packages/sdk-typescript/src/index.ts` - Re-exports all public symbols with JSDoc quick-start examples
- `packages/sdk-typescript/src/wrap.test.ts` - 18 vitest tests covering all behavior cases
- `packages/sdk-typescript/package.json` - @agentgov/sdk v0.1.0, openai peerDep, tsup+vitest@2 devDeps
- `packages/sdk-typescript/tsconfig.json` - ES2022, Bundler moduleResolution, strict, DOM lib
- `packages/sdk-typescript/tsup.config.ts` - ESM+CJS+DTS, openai external
- `packages/proxy/src/passthrough/forward.ts` - forwardToLlm with TransformStream streaming, provider routing, budgetSettle
- `packages/proxy/src/budget/alerts.ts` - checkAndFireAlerts with idempotency via audit_log, webhook POST
- `packages/proxy/src/budget/alerts.test.ts` - 9 vitest tests (idempotency, webhook failure, threshold firing)
- `packages/proxy/src/index.ts` - Updated: forwardToLlm replaces stub; checkAndFireAlerts via waitUntil
- `packages/proxy/vitest.config.ts` - Added alerts.test.ts to exclusions
- `packages/proxy/vitest.config.node.ts` - Added alerts.test.ts to Node.js inclusions
- `packages/proxy/wrangler.jsonc` - Added OPENAI_API_KEY, ANTHROPIC_API_KEY, AGENTGOV_ALERT_WEBHOOK_URL, AGENTGOV_ALERT_THRESHOLDS
- `packages/proxy/worker-configuration.d.ts` - Regenerated with new Env bindings
- `.gitignore` - Created at repo root: node_modules, dist, .wrangler, .dev.vars, .env*

## Decisions Made

1. **vitest v2 in SDK package**: v4 requires vite@6 but the monorepo has vite@5 (installed by proxy package). Downgraded SDK devDependency to `"vitest": "^2"` for compatibility. All tests pass.
2. **Response clone before 429 JSON.parse**: `response.clone()` is necessary before calling `.json()` — consuming the body once makes the original response unusable. The clone is used for parsing; the original is returned if it's not a BudgetExceeded.
3. **Google/Gemini returns 503 in Phase 1**: GEMINI_API_KEY support is not wired — returns 503 with same error message as missing API key. Deferred to a later plan.
4. **Anthropic streaming settle with 0 tokens**: Anthropic SSE format differs from OpenAI. Parsing usage from Anthropic SSE chunks is deferred; settle is called with 0 tokens to release the hold. This means actual spend is not recorded accurately for Anthropic streaming — a known limitation documented in forward.ts comment.
5. **checkAndFireAlerts uses json_extract for idempotency**: Rather than adding a new `alerts_fired` table, the idempotency check queries `audit_log` using SQLite's `json_extract(payload, '$.threshold')`. Keeps schema minimal; audit_log already exists.
6. **exports map `types` first**: Placed `"types"` before `"import"` and `"require"` in package.json exports. This follows Node.js 16+ and TypeScript 5.x convention — tools that resolve types look for `"types"` first, so it must appear before runtime conditions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] vitest v4 incompatible with workspace vite@5**
- **Found during:** Task 1 (installing SDK package dependencies)
- **Issue:** Plan specified `"vitest": "^4"` in devDependencies. vitest@4 requires vite@6, but the workspace vite@5 is installed as a dependency of @cloudflare/vitest-pool-workers. Running vitest produced `ERR_PACKAGE_PATH_NOT_EXPORTED: vite/module-runner not exported by vite@5`.
- **Fix:** Downgraded SDK devDependency to `"vitest": "^2"` to match the proxy package version. All 18 tests pass correctly.
- **Files modified:** `packages/sdk-typescript/package.json`
- **Verification:** `npx vitest run` succeeds with v2.1.9
- **Committed in:** `817aad1` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Created root .gitignore with .dev.vars exclusion**
- **Found during:** Task 1 (post-test verification)
- **Issue:** No `.gitignore` existed at the repo root. The `.dev.vars` file (which holds real LLM API keys and Turso credentials) would be committed if not excluded. This is a critical security issue.
- **Fix:** Created `.gitignore` at repo root excluding `node_modules/`, `dist/`, `.wrangler/`, `.dev.vars`, `*.dev.vars`, `.env*`, logs, and `.DS_Store`.
- **Files modified:** `.gitignore` (created)
- **Verification:** `grep ".dev.vars" .gitignore` confirms exclusion
- **Committed in:** `817aad1` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1x Rule 3 - Blocking, 1x Rule 2 - Missing Critical)
**Impact on plan:** Both fixes necessary for correctness and security. No scope creep. Tests pass correctly.

## Issues Encountered

- The plan's exports map in package.json had `"types"` after `"import"` and `"require"`, causing an esbuild/tsup advisory warning. Reordered to `types → import → require` per Node.js 16+ convention. No functional impact but silences the build warning.

## User Setup Required

Before using forwardToLlm for real LLM calls, create `packages/proxy/.dev.vars`:
```
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-token
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
AGENTGOV_ALERT_WEBHOOK_URL=https://your-server/webhook  # optional
AGENTGOV_ALERT_THRESHOLDS=0.80,1.00                      # optional, these are defaults
```
This file is gitignored (verified in `.gitignore`). Do NOT commit it.

## Next Phase Readiness

- End-to-end path closed: SDK wraps OpenAI client → proxy enforces budget → forwardToLlm streams to real LLM → budgetSettle records actual cost
- `@agentgov/sdk` ready for integration tests and eventual npm publish (Phase 4)
- Budget alerts operational — any agent exceeding 80% or 100% triggers a configurable webhook
- Phase 2 (HITL approval) can reference BudgetExceeded shape documented in this summary
- Known limitation: Anthropic streaming budget settle uses 0 tokens — to fix in later plan

## Self-Check: PASSED

All created files exist on disk. Both task commits verified in git history.

- `817aad1` — feat(01-03): TypeScript SDK — wrap(), BudgetExceeded, base URL interceptor
- `de6d502` — feat(01-03): LLM passthrough, streaming settle, budget alert webhook

---
*Phase: 01-budget-engine-proxy-foundation*
*Completed: 2026-03-13*
