---
phase: 01-budget-engine-proxy-foundation
plan: "01"
subsystem: infra
tags: [hono, cloudflare-workers, drizzle-orm, libsql, turso, vitest, wrangler, typescript, pnpm]

# Dependency graph
requires: []
provides:
  - pnpm workspace monorepo scaffold at repo root
  - Hono app with GET /health and POST /v1/chat/completions stub (Cloudflare Workers entry point)
  - Shared TypeScript types (ChatCompletionRequest, BudgetHold, AuditEvent, GateResult, BudgetExceededErrorBody)
  - Drizzle schema: budget_ledger, holds, audit_log with correct column types
  - Migration SQL 0000_initial.sql with three CREATE TABLE and two anti-mutation triggers
  - createDbClient using @libsql/client/web (Cloudflare Workers compatible)
  - Vitest configured for both Workers runtime (index.test.ts) and Node.js (schema.test.ts)
affects:
  - 01-02-cost-engine-hold-settle: uses budget_ledger/holds/audit_log schema and createDbClient
  - 01-03-sdk-alert-webhook: uses ChatCompletionRequest, GateResult, BudgetExceededErrorBody types
  - all future proxy phases: depend on Hono app entry point and DB schema

# Tech tracking
tech-stack:
  added:
    - hono@4.12.7 (HTTP framework, Cloudflare Workers native)
    - drizzle-orm@0.45.x (type-safe SQLite ORM)
    - drizzle-kit (schema migration generation)
    - "@libsql/client@0.14.x (Turso libSQL client)"
    - "@cloudflare/vitest-pool-workers (Workers runtime test execution)"
    - wrangler@4.x (local dev, type generation)
    - vitest@2.x (test runner)
    - typescript@5.x
    - pnpm@10 workspace
  patterns:
    - Hono app exported as default (Cloudflare Workers entry convention)
    - "@libsql/client/web import (mandatory sub-path for Cloudflare Workers — bare @libsql/client fails at runtime)"
    - Two vitest configs: Workers pool (vitest.config.ts) + Node.js (vitest.config.node.ts)
    - DB-level anti-mutation triggers on audit_log (BEFORE UPDATE and BEFORE DELETE)
    - TDD: RED (failing test first) then GREEN (implementation)

key-files:
  created:
    - packages/proxy/src/index.ts
    - packages/proxy/src/types.ts
    - packages/proxy/src/db/schema.ts
    - packages/proxy/src/db/client.ts
    - packages/proxy/src/index.test.ts
    - packages/proxy/src/db/schema.test.ts
    - packages/proxy/migrations/0000_initial.sql
    - packages/proxy/wrangler.jsonc
    - packages/proxy/tsconfig.json
    - packages/proxy/drizzle.config.ts
    - packages/proxy/vitest.config.ts
    - packages/proxy/vitest.config.node.ts
    - packages/proxy/worker-configuration.d.ts
    - package.json (root)
    - pnpm-workspace.yaml
  modified: []

key-decisions:
  - "Use @libsql/client/web (not bare @libsql/client) — mandatory sub-path for Cloudflare Workers runtime"
  - "Two separate vitest configs: Workers pool for route tests, Node.js for schema/migration file tests"
  - "DB-level triggers (not application-level) enforce audit_log immutability — cannot be bypassed by application code"
  - "Migration file manually renamed from drizzle-kit random name to 0000_initial.sql for predictability"
  - "wrangler types used (not @cloudflare/workers-types npm package) per stack decision"

patterns-established:
  - "Hono app default export pattern: export default app from src/index.ts"
  - "@libsql/client/web import pattern: always use /web sub-path in Workers"
  - "Audit log triggers pattern: BEFORE UPDATE + BEFORE DELETE on audit_log table"
  - "TDD split: Workers tests in vitest.config.ts, Node.js filesystem tests in vitest.config.node.ts"

requirements-completed:
  - SDK-03

# Metrics
duration: 5min
completed: 2026-03-13
---

# Phase 01 Plan 01: Proxy Scaffold Summary

**Hono proxy stub + Drizzle schema (budget_ledger, holds, audit_log) with DB-level append-only triggers on audit_log, running in Cloudflare Workers via wrangler with 10 passing Vitest tests**

## Performance

- **Duration:** 5 min 10 sec
- **Started:** 2026-03-13T08:49:11Z
- **Completed:** 2026-03-13T08:54:21Z
- **Tasks:** 2
- **Files modified:** 15 created, 0 modified

## Accomplishments

- Bootstrap pnpm monorepo with packages/proxy package; wrangler generates worker-configuration.d.ts cleanly
- Hono app with GET /health (200 JSON) and POST /v1/chat/completions (stub 200 or 400 invalid JSON); all routes tested in actual workerd runtime via @cloudflare/vitest-pool-workers
- Drizzle schema for budget_ledger (per-agent limits), holds (Hold/Settle reservations), and audit_log (append-only with prevHash/hash chain); migration SQL includes two DB-level triggers that RAISE(ABORT) on any UPDATE or DELETE against audit_log

## Task Commits

Each task was committed atomically:

1. **Task 1: Monorepo scaffold, Hono proxy entry, wrangler config** - `00388dd` (feat)
2. **Task 2: Drizzle schema — budget_ledger, holds, audit_log** - `1687bcd` (feat)

**Plan metadata:** (see below — docs commit)

_Note: TDD tasks — RED phase (failing imports) confirmed before GREEN phase (implementation). Both tasks committed after GREEN pass._

## Files Created/Modified

- `packages/proxy/src/index.ts` - Hono app with /health and /v1/chat/completions stub, exported as default
- `packages/proxy/src/types.ts` - Shared types: AgentId, HoldId, ChatCompletionRequest, BudgetHold, AuditEventType, AuditEvent, GateResult, BudgetExceededErrorBody
- `packages/proxy/src/db/schema.ts` - Drizzle table definitions for budget_ledger, holds, auditLog
- `packages/proxy/src/db/client.ts` - createDbClient using @libsql/client/web for Cloudflare Workers
- `packages/proxy/src/index.test.ts` - Workers runtime tests: health, stub response, invalid JSON 400
- `packages/proxy/src/db/schema.test.ts` - Node.js tests: schema exports, table name, migration file + trigger presence
- `packages/proxy/migrations/0000_initial.sql` - Generated SQL + manually added anti-mutation triggers
- `packages/proxy/wrangler.jsonc` - Worker config with TURSO vars placeholders (JSONC with comments)
- `packages/proxy/drizzle.config.ts` - Drizzle kit config (sqlite dialect, ./src/db/schema.ts)
- `packages/proxy/tsconfig.json` - ES2022, Bundler module resolution, strict, no @cloudflare/workers-types
- `packages/proxy/vitest.config.ts` - Workers pool config (excludes schema.test.ts)
- `packages/proxy/vitest.config.node.ts` - Node.js config for schema tests
- `packages/proxy/worker-configuration.d.ts` - Generated by wrangler types (TURSO_DATABASE_URL, TURSO_AUTH_TOKEN)
- `package.json` - pnpm workspace root (private, onlyBuiltDependencies for workerd/esbuild)
- `pnpm-workspace.yaml` - packages: ["packages/*"]

## Decisions Made

1. **@libsql/client/web sub-path**: Mandatory for Cloudflare Workers — bare @libsql/client fails at runtime. Documented in client.ts as critical note.
2. **Two vitest configs**: Workers pool cannot run Node.js fs tests. Schema migration verification (reading 0000_initial.sql) runs via vitest.config.node.ts (Node env). Route tests run via vitest.config.ts (Workers pool).
3. **DB-level triggers on audit_log**: Application-level guards can be bypassed by DB admin or bugs. BEFORE UPDATE/DELETE triggers enforced at DB engine level — cannot be bypassed from application code. Required for EU AI Act Article 12/14 audit trail integrity.
4. **Migration file renaming**: drizzle-kit generates random names (0000_lively_nomad.sql). Renamed to 0000_initial.sql and updated _journal.json tag for predictability and human readability.
5. **pnpm onlyBuiltDependencies**: Added `workerd`, `esbuild`, `sharp` to allow build scripts. Without this, @cloudflare/vitest-pool-workers silently fails to run Worker tests.

## Deviations from Plan

None — plan executed exactly as written. Minor implementation details:

- drizzle-kit generated random filename `0000_lively_nomad.sql` rather than `0000_initial.sql` — renamed per plan spec
- `wrangler dev --dry-run` is not a valid Wrangler 4 flag — TypeScript type-check (`npx tsc --noEmit`) used instead to verify no TS errors; plan noted "or equivalent"

## Issues Encountered

- pnpm initially blocked workerd build scripts (`workerd` is a native binary). Added `pnpm.onlyBuiltDependencies` to root package.json to allow workerd/esbuild/sharp build scripts. Without this, `@cloudflare/vitest-pool-workers` would silently fail.
- `pnpm` was not installed in the volta environment. Installed via `volta install pnpm`. No impact on plan execution.

## User Setup Required

None - no external service configuration required for this scaffold phase.

Local dev note: Before running `wrangler dev`, create `packages/proxy/.dev.vars` with:
```
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-token
```
This file is gitignored (do NOT commit it).

## Next Phase Readiness

- Schema contract is established — Phase 01-02 (cost engine, Hold/Settle) can proceed
- All three table definitions and migration are checked in and stable
- Hono app entry point ready to receive budget middleware in 01-02
- createDbClient in src/db/client.ts ready for use in budget gate logic

---
*Phase: 01-budget-engine-proxy-foundation*
*Completed: 2026-03-13*
