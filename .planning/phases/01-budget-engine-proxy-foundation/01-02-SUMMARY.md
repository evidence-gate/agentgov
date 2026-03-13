---
phase: 01-budget-engine-proxy-foundation
plan: "02"
subsystem: api
tags: [cost-estimation, hold-settle, budget-gate, audit-log, sha256, drizzle-orm, vitest, web-crypto, pricing]

# Dependency graph
requires:
  - phase: 01-budget-engine-proxy-foundation
    plan: "01"
    provides: "Hono app entry, Drizzle schema (budget_ledger/holds/audit_log), createDbClient, shared types"
provides:
  - pricing.json: 11 models (OpenAI, Anthropic, Google) with last_updated field
  - pricing.ts: loadPricing() with staleness check, getPriceForModel() throws on unknown model
  - calculator.ts: estimateCost/settleCost (throws on unknown model), estimateInputTokens (chars/4 heuristic)
  - audit/writer.ts: appendAuditEvent with SHA-256 hash chain (Web Crypto), genesis sentinel, non-throwing error handling
  - budget/ledger.ts: ensureAgent (INSERT OR IGNORE), createHold (Hold/Settle pattern), settleHold, getBudget
  - budget/gate.ts: budgetGate (blocks unknown models + exceeded budget, appends audit on every branch), budgetSettle
  - index.ts: X-Agent-Id header required, budget gate wired in, 422 unknown model, 429 budget exceeded, dev passthrough
affects:
  - 01-03-sdk-alert-webhook: uses budgetGate result (holdId), calls budgetSettle after LLM response
  - all future proxy phases: budget enforcement is live in /v1/chat/completions handler

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hold/Settle budget gate: pessimistic reservation before LLM forward, settled after response"
    - "Fail-closed on unknown models: estimateCost throws, gate returns block (never passes unknown model with zero cost)"
    - "Web Crypto SHA-256 hash chain: crypto.subtle.digest compatible with both Workers and Node.js 20+"
    - "Genesis sentinel hash: 64 zeros for first audit_log row (consistent with Bitcoin convention)"
    - "Non-throwing audit writer: appendAuditEvent catches all errors, logs to console.error, never rethrows"
    - "Dev passthrough: missing TURSO bindings → skip enforcement, warn to console (local dev usability)"
    - "Default $10 USD per-agent budget limit (TODO: replace with config lookup in later plan)"

key-files:
  created:
    - packages/proxy/pricing.json
    - packages/proxy/src/budget/pricing.ts
    - packages/proxy/src/budget/calculator.ts
    - packages/proxy/src/budget/ledger.ts
    - packages/proxy/src/budget/gate.ts
    - packages/proxy/src/audit/writer.ts
    - packages/proxy/src/budget/calculator.test.ts
    - packages/proxy/src/audit/writer.test.ts
    - packages/proxy/src/budget/gate.test.ts
  modified:
    - packages/proxy/src/index.ts
    - packages/proxy/src/index.test.ts
    - packages/proxy/vitest.config.ts
    - packages/proxy/vitest.config.node.ts

key-decisions:
  - "estimateCost throws (not returns 0) for unknown models — fail closed prevents budget bypass"
  - "loadPricing() accepts optional {forceStale} param for testing staleness logic without mocking file I/O"
  - "appendAuditEvent never throws — failed audit must not abort a budget enforcement decision"
  - "createHold NOT wrapped in a DB transaction (Turso HTTP does not support interactive transactions) — documented as known race condition; Phase 2 Durable Objects mitigate per-agent"
  - "Default $10.00 USD budget limit hardcoded in gate.ts — replace with config lookup in a later plan"
  - "budgetSettle NOT called in stub 200 path — will be called after real LLM response in 01-03"
  - "index.test.ts updated: now tests X-Agent-Id missing → 400, not stub 200 behavior"

patterns-established:
  - "Gate mock pattern: fluent Drizzle mock with select().from().where().limit() chain, insert().values().onConflictDoNothing()"
  - "vi.mock('../audit/writer') pattern for gate tests — prevents real DB writes in unit tests"
  - "Two vitest configs: Workers pool (vitest.config.ts) + Node.js (vitest.config.node.ts) — budget/audit tests added to Node.js config"

requirements-completed:
  - COST-01
  - COST-02
  - COST-03
  - COST-04

# Metrics
duration: 7min
completed: 2026-03-13
---

# Phase 01 Plan 02: Cost Engine Hold/Settle Summary

**Hold/Settle budget gate with SHA-256 hash-chained audit log, per-model cost estimation (fails closed on unknown models), and 422/429 enforcement responses wired into /v1/chat/completions**

## Performance

- **Duration:** 7 min 2 sec
- **Started:** 2026-03-13T08:57:05Z
- **Completed:** 2026-03-13T09:04:08Z
- **Tasks:** 2
- **Files modified:** 9 created, 4 modified

## Accomplishments

- Pricing table: 11 models across OpenAI (gpt-4o $2.50/$10.00/1M), Anthropic (claude-3-5-sonnet $3.00/$15.00/1M), Google (gemini-2.0-flash $0.10/$0.40/1M) with `last_updated` staleness check (>30 days → console.warn)
- Hold/Settle gate: `createHold` does primary read → check (spentUsd + reservedUsd + estimatedCost) > limitUsd → if OK inserts hold row + increments reservedUsd atomically (two statements, not transaction — known race condition caveat, Phase 2 Durable Objects mitigation documented)
- Audit writer: `appendAuditEvent` uses `crypto.subtle.digest('SHA-256')` (Web Crypto API, compatible with Workers and Node.js 20+), chains hash using genesis sentinel `0000...0000` for first row; never throws on DB failure
- 44 tests passing (4 Workers pool + 40 Node.js): all TDD RED confirmed before GREEN implemented

## Pricing Table Reference

| Model | Input $/1M | Output $/1M |
|-------|-----------|------------|
| gpt-4o | 2.50 | 10.00 |
| gpt-4o-mini | 0.15 | 0.60 |
| gpt-4-turbo | 10.00 | 30.00 |
| gpt-3.5-turbo | 0.50 | 1.50 |
| claude-3-5-sonnet-20241022 | 3.00 | 15.00 |
| claude-3-5-haiku-20241022 | 0.80 | 4.00 |
| claude-3-opus-20240229 | 15.00 | 75.00 |
| gemini-1.5-pro | 1.25 | 5.00 |
| gemini-1.5-flash | 0.075 | 0.30 |
| gemini-2.0-flash | 0.10 | 0.40 |

File: `packages/proxy/pricing.json`

## Key Implementation Details

**Token estimation heuristic:**
`estimateInputTokens` = sum of all message content character lengths ÷ 4, rounded up (Math.ceil). Pessimistic output estimate uses `request.max_tokens ?? 4096` for hold sizing.

**Hold/Settle transaction pattern:**
Steps in `createHold` are executed sequentially (not in a DB transaction) because Turso HTTP does not support interactive transactions. The sequence is:
1. SELECT budget_ledger (primary read — PITFALLS.md #8)
2. Check projected total vs limit
3. INSERT hold row
4. UPDATE budget_ledger.reservedUsd

Known race condition at high concurrency: two simultaneous reads before either INSERT can both see sufficient budget. Documented in ledger.ts comment. Phase 2 Durable Objects (one per agent) serialize access, eliminating this race.

**Default budget limit:**
`DEFAULT_BUDGET_LIMIT_USD = 10.0` in `packages/proxy/src/budget/gate.ts` line ~16.
TODO comment: "replace with config lookup in a later plan (per-agent configurable limits via API)".

**Audit writer hash algorithm:**
SHA-256 via `crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))`. Hex-encoded (64 char string).
Genesis sentinel: `'0000000000000000000000000000000000000000000000000000000000000000'` (64 zeros).
Each row's payload = `JSON.stringify({ ...event, prevHash, ts: Date.now() })`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pricing table, cost calculator, audit writer** - `47da9da` (feat)
2. **Task 2: Budget ledger, Hold/Settle gate, wire into /v1/chat/completions** - `011a8f5` (feat)

**Plan metadata:** (see below — docs commit)

_Note: TDD tasks — RED (failing) confirmed before GREEN (implementation) for both tasks._

## Files Created/Modified

- `packages/proxy/pricing.json` - 11 model pricing entries with last_updated field
- `packages/proxy/src/budget/pricing.ts` - loadPricing() with optional forceStale param, PRICING_STALENESS_DAYS=30, getPriceForModel() throws on unknown
- `packages/proxy/src/budget/calculator.ts` - estimateCost/settleCost (throws on unknown), estimateInputTokens (chars/4)
- `packages/proxy/src/budget/ledger.ts` - ensureAgent, getBudget, createHold, settleHold with PITFALLS.md #8 comment
- `packages/proxy/src/budget/gate.ts` - budgetGate, budgetSettle; DEFAULT_BUDGET_LIMIT_USD=10.0
- `packages/proxy/src/audit/writer.ts` - appendAuditEvent with Web Crypto SHA-256 hash chain
- `packages/proxy/src/budget/calculator.test.ts` - 15 tests for pricing/calculator/staleness
- `packages/proxy/src/audit/writer.test.ts` - 5 tests with fluent mock DbClient
- `packages/proxy/src/budget/gate.test.ts` - 13 tests (budgetGate, ensureAgent, createHold, settleHold)
- `packages/proxy/src/index.ts` - Updated: X-Agent-Id header required, budget gate wired, 422/429 enforcement
- `packages/proxy/src/index.test.ts` - Updated: tests X-Agent-Id missing → 400; dev passthrough → 200
- `packages/proxy/vitest.config.ts` - Added exclusions for calculator/audit/gate tests
- `packages/proxy/vitest.config.node.ts` - Added calculator/audit/gate test inclusions

## Decisions Made

1. **estimateCost throws on unknown model**: Never returns zero — returning 0 would allow budget bypass by using any model name. Fail closed is the correct behavior for a security enforcement component.
2. **loadPricing() forceStale option for testing**: Rather than mocking `fs` or the module timestamp, the function accepts `{ forceStale?: boolean }` which tests can pass to trigger or suppress the staleness warning. Clean, no need for file mocking.
3. **appendAuditEvent never throws**: A failed audit write must not abort a budget enforcement decision. The `try/catch` logs to `console.error` for monitoring but swallows the error.
4. **createHold sequential (not transactional)**: Turso HTTP API does not support interactive transactions. Sequential INSERT + UPDATE creates a known race condition, but this is the best available option until Phase 2 Durable Objects.
5. **budgetSettle not called in stub path**: 01-03 will add real LLM forwarding; budgetSettle requires actual token counts from the response which don't exist in the stub path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed existing index.test.ts broken by new X-Agent-Id requirement**
- **Found during:** Task 2 (wiring budget gate into index.ts)
- **Issue:** Old tests sent requests without X-Agent-Id header, which now return 400. Test for stub 200 response needed the header, and the "missing header" behavior needed a new test.
- **Fix:** Updated index.test.ts to include `X-Agent-Id: test-agent-01` header in passing tests; renamed test to reflect dev-passthrough behavior; added explicit test for 400 when header is missing.
- **Files modified:** `packages/proxy/src/index.test.ts`
- **Verification:** Workers pool tests pass (4 passing)
- **Committed in:** `011a8f5` (Task 2 commit)

**2. [Rule 1 - Bug] Fixed gate.test.ts mock's circular JSON.stringify error**
- **Found during:** Task 2 (RED phase gate test run)
- **Issue:** Initial mock used `JSON.stringify(drizzleTable)` to capture table name for debugging, causing `TypeError: Converting circular structure to JSON` because Drizzle table objects have circular references.
- **Fix:** Removed JSON.stringify from mock; used simple string push without table inspection.
- **Files modified:** `packages/proxy/src/budget/gate.test.ts`
- **Verification:** Gate tests pass (13 passing)
- **Committed in:** `011a8f5` (Task 2 commit)

**3. [Rule 1 - Bug] Fixed gate.test.ts mock's Drizzle insert chain order**
- **Found during:** Task 2 (gate test first GREEN run)
- **Issue:** Initial mock had `insert().onConflictDoNothing().values()` but Drizzle's actual API is `insert(table).values(row).onConflictDoNothing()`. `onConflictDoNothing` is not a function on the return value of `values()` in the mock.
- **Fix:** Restructured mock to `insert().values(row)` returns object with `onConflictDoNothing()` method.
- **Files modified:** `packages/proxy/src/budget/gate.test.ts`
- **Verification:** Gate tests pass (13 passing)
- **Committed in:** `011a8f5` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3x Rule 1 - Bug)
**Impact on plan:** All fixes necessary for correctness. No scope creep. Tests pass correctly.

## Issues Encountered

- Drizzle ORM fluent mock requires careful chain matching (`.insert(table).values(row).onConflictDoNothing()`). Future plan mocks should start from the correct chain order.
- vitest.config.node.ts initially only included `src/db/schema.test.ts` — needed to add new test files. Workers pool config needed exclusions added.

## User Setup Required

None — no new external service configuration required. All implementation runs in test mode. For live enforcement:
- `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` must be set in `.dev.vars` (already documented in 01-01 SUMMARY)

## Next Phase Readiness

- Budget gate is live in `/v1/chat/completions` — requests are blocked/allowed before any forwarding
- `budgetGate` returns `holdId` for the pass case — 01-03 must call `budgetSettle(db, holdId, actualUsage)` after the LLM response arrives
- `pricingData` is imported at module load time (bundled by Wrangler) — no runtime file I/O in Workers
- 44 tests stable baseline for 01-03 to build on

## Self-Check: PASSED

All created files exist on disk. Both task commits verified in git history.

- `47da9da` — feat(01-02): pricing table, cost calculator, audit writer
- `011a8f5` — feat(01-02): budget ledger, hold/settle gate, wire into /v1/chat/completions

---
*Phase: 01-budget-engine-proxy-foundation*
*Completed: 2026-03-13*
