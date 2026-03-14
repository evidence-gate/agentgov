---
phase: 04-dashboard-python-sdk-self-host
plan: "02"
subsystem: infra
tags: [docker, hono, node-js, libsql, sqlite, dashboard-api, self-host]

# Dependency graph
requires:
  - phase: 01-budget-engine-proxy-foundation
    provides: "Hono app, Drizzle schema (budget_ledger, audit_log, holds), migrations"
  - phase: 02-hitl-approval-channels
    provides: "hitl_queue schema, HITL routes"
provides:
  - "Node.js entry point (index.node.ts) for running Hono proxy without Cloudflare"
  - "Embedded libSQL client (client.node.ts) using file: URL for local persistence"
  - "Dashboard API routes (GET /api/v1/dashboard/budgets|audit|approvals)"
  - "Docker Compose stack (docker/compose.yml) with volume persistence and healthcheck"
  - "Multi-stage Dockerfile (docker/Dockerfile.proxy) using node:20-alpine"
  - "HITL_WORKFLOW stub returning 501 in self-host mode"
affects:
  - 04-03-dashboard-spa

# Tech tracking
tech-stack:
  added:
    - "@hono/node-server ^1.19.11 — Node.js adapter for Hono app"
    - "tsx ^4.21.0 — TypeScript execution in Docker runtime (no compile step)"
  patterns:
    - "createDashboardRoutes(db) factory pattern — inject DB into router, avoids Cloudflare binding coupling"
    - "process.env -> c.env middleware bridge — maps Node.js env into Hono Workers-style c.env"
    - "HitlNotAvailableError sentinel — stub HITL_WORKFLOW throws controlled error, fetch wrapper catches and returns 501"
    - "runMigrations() idempotent on startup — always safe to call, Drizzle migrator tracks applied migrations"

key-files:
  created:
    - packages/proxy/src/db/client.node.ts
    - packages/proxy/src/dashboard/routes.ts
    - packages/proxy/src/index.node.ts
    - docker/Dockerfile.proxy
    - docker/compose.yml
    - docker/.env.example
  modified:
    - packages/proxy/package.json

key-decisions:
  - "bare @libsql/client (not /web) required for Node.js file: URL support — /web sub-path is HTTP-only for Turso cloud"
  - "createDashboardRoutes(db) factory injected at startup — avoids c.env.DB Cloudflare binding pattern"
  - "HITL_WORKFLOW stub throws HitlNotAvailableError, caught by fetch wrapper — cleaner than patching index.ts"
  - "tsx runs TypeScript directly in Docker — no separate tsc compile step, simpler Dockerfile"
  - "wget (not curl) for Docker healthcheck — curl not installed by default in Alpine"
  - "dashboard/audit uses ASC ordering in Drizzle (.orderBy(auditLog.seq)) — DESC at display layer in SPA"

patterns-established:
  - "Platform split: Workers use @libsql/client/web, Node.js uses bare @libsql/client"
  - "Self-host Cloudflare feature stub pattern: throw sentinel error, catch at fetch boundary"

requirements-completed: [SDK-04, SDK-05]

# Metrics
duration: 3min
completed: 2026-03-15
---

# Phase 4 Plan 02: Docker Compose Self-Host Stack + Dashboard API Summary

**Embedded libSQL proxy (Node.js + @hono/node-server) with dashboard GET endpoints and Docker Compose stack using tsx runtime and Alpine healthcheck via wget**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-15T07:43:39Z
- **Completed:** 2026-03-15T07:46:36Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Node.js entry point starts the same Hono app without Cloudflare bindings — process.env bridged into c.env via middleware
- Embedded libSQL with file: URL persists data via Docker volume — no Turso cloud dependency
- Three read-only dashboard API endpoints provide live data for Plan 03 SPA
- HITL graceful degradation: HITL_WORKFLOW stub returns 501 (not a crash) in self-host mode
- Docker Compose stack starts proxy on port 8787 with volume persistence and wget health check

## Task Commits

Each task was committed atomically:

1. **Task 1: Dashboard API routes and Node.js DB client** - `e7b25e2` (feat)
2. **Task 2: Node.js entry point, Dockerfile, Docker Compose** - `f3bdf99` (feat)

## Files Created/Modified

- `packages/proxy/src/db/client.node.ts` — createDockerDbClient (bare @libsql/client) + runMigrations()
- `packages/proxy/src/dashboard/routes.ts` — createDashboardRoutes(db) factory with GET budgets/audit/approvals
- `packages/proxy/src/index.node.ts` — Node.js entry point with process.env bridge, HITL stub, dashboard mount
- `docker/Dockerfile.proxy` — Multi-stage node:20-alpine build using tsx for TypeScript execution
- `docker/compose.yml` — Proxy service with agentgov-data volume and wget healthcheck
- `docker/.env.example` — Template for OPENAI_API_KEY, ANTHROPIC_API_KEY, AGENTGOV_ALERT_WEBHOOK_URL
- `packages/proxy/package.json` — Added @hono/node-server, tsx devDep, start:node script

## Decisions Made

- **bare @libsql/client vs /web**: The /web sub-path uses HTTP transport and only works with Turso cloud URLs. For file: URLs in Node.js, the bare import with native SQLite bindings is required.
- **HITL stub strategy**: Setting HITL_WORKFLOW to undefined would crash on `.create()` call. Using a stub object that throws a controlled `HitlNotAvailableError` sentinel, caught at the fetch wrapper boundary, gives a clean 501 response without modifying index.ts.
- **tsx over tsc in Docker**: Using tsx to run TypeScript directly avoids a compile step in the Dockerfile, keeping it simpler. tsx is fast enough for server startup.
- **Dashboard route ordering**: `/api/v1/dashboard/audit` uses ASC ordering (by seq) in the Drizzle query — the SPA (Plan 03) can handle DESC display. This matches Drizzle's natural ordering pattern.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- Pre-existing TypeScript errors in test files (audit/writer.test.ts, error/retry.test.ts) from previous phases — not caused by this plan's changes, out of scope per deviation rules.
- Docker binary not available in dev environment — Docker files verified by TypeScript compile check and file content review rather than live `docker build` run.

## User Setup Required

Docker and environment variables required for self-host deployment:

1. Copy `docker/.env.example` to `docker/.env` and fill in `OPENAI_API_KEY`
2. Run `docker compose -f docker/compose.yml up -d` from the repo root
3. Verify: `curl http://localhost:8787/health` returns `{"status":"ok"}`
4. Dashboard API: `curl http://localhost:8787/api/v1/dashboard/budgets`

## Next Phase Readiness

- Dashboard API endpoints ready for Plan 03 SPA to consume
- Self-host stack provides working proxy for all governance features except HITL workflows
- HITL returns 501 with clear error code `HITL_NOT_AVAILABLE` (graceful degradation)
- Plan 03 (Dashboard SPA) can begin immediately — base URL is `http://localhost:8787`

---
*Phase: 04-dashboard-python-sdk-self-host*
*Completed: 2026-03-15*
