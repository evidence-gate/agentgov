---
phase: 04-dashboard-python-sdk-self-host
verified: 2026-03-15T10:30:00Z
status: passed
score: 11/11 must-haves verified
re_verification: false
---

# Phase 4: Dashboard + Python SDK + Self-Host Verification Report

**Phase Goal:** Non-TypeScript teams can adopt agentgov, and all users can observe their governance state through a dashboard -- with a self-host path for enterprise environments
**Verified:** 2026-03-15T10:30:00Z
**Status:** PASSED
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Python SDK `wrap(client, proxy_url)` rewrites base_url and routes all LLM calls through proxy | VERIFIED | `__init__.py:50-83` -- `wrap()` creates `AgentgovTransport`, sets `client._client = httpx.Client(transport=transport)` |
| 2 | X-Agent-Id header is injected on every proxied request | VERIFIED | `_transport.py:69-70` -- `headers["x-agent-id"] = self._agent_id`; tested by `test_transport_injects_agent_id` |
| 3 | BudgetExceeded exception raised on 429 + BUDGET_EXCEEDED code | VERIFIED | `_transport.py:96-97` raises `BudgetExceeded(error_dict)`; `_exceptions.py:19-33` has correct fields (code, spent, limit, budget_id) |
| 4 | HitlPending exception raised on 202 + HITL_PENDING code | VERIFIED | `_transport.py:98-99` raises `HitlPending(error_dict)`; `_exceptions.py:36-50` has correct fields (code, approval_id, agent_id, expires_at) |
| 5 | AgentError exception raised on 502 + AGENT_ERROR code | VERIFIED | `_transport.py:100-101` raises `AgentError(error_dict)`; `_exceptions.py:53-71` has correct fields (code, type, agent_id, timestamp, suggested_remediation, context) |
| 6 | Non-governance 429/502 responses pass through without raising | VERIFIED | `_transport.py:90-103` only raises when error code matches; tests `test_transport_passes_normal_429`, `test_transport_passes_normal_502`, `test_transport_passes_normal_202` |
| 7 | Node.js entry point starts Hono app without Cloudflare bindings | VERIFIED | `index.node.ts:12-17` imports `serve` from `@hono/node-server`, imports `app` from `./index`, maps `process.env` into `c.env` via middleware (lines 56-74) |
| 8 | Embedded libSQL with file: URL works for local persistence | VERIFIED | `client.node.ts:1-2` imports bare `@libsql/client` (not `/web`), `createDockerDbClient()` uses `file:` URL; `compose.yml:12` sets `DATABASE_URL: "file:/data/agentgov.db"` |
| 9 | Dashboard API returns budget/audit/approval data as JSON | VERIFIED | `dashboard/routes.ts:21-53` -- three GET endpoints with Drizzle queries against `budgetLedger`, `auditLog`, `hitlQueue` tables, all return `c.json(rows)` |
| 10 | `docker compose up` starts proxy with health check | VERIFIED | `compose.yml:1-22` defines service with port 8787, volume, healthcheck via `wget --spider`; `Dockerfile.proxy` multi-stage build with `CMD ["npx", "tsx", "src/index.node.ts"]` |
| 11 | Dashboard SPA shows budget balance, approvals, audit with auto-refresh | VERIFIED | Three pages (`costs.tsx`, `approvals.tsx`, `audit.tsx`) use TanStack Query hooks; `useDashboard.ts:53,62,70` all set `refetchInterval: 5000` (5-second polling) |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/sdk-python/src/agentgov/__init__.py` | wrap() function and public API re-exports | VERIFIED | 84 lines, exports wrap/BudgetExceeded/HitlPending/AgentError/AgentgovTransport |
| `packages/sdk-python/src/agentgov/_transport.py` | AgentgovTransport(httpx.BaseTransport) | VERIFIED | 115 lines, URL rewrite + header injection + governance exception raising |
| `packages/sdk-python/src/agentgov/_exceptions.py` | BudgetExceeded, HitlPending, AgentError | VERIFIED | 72 lines, three exception classes with correct snake_case field mappings |
| `packages/sdk-python/pyproject.toml` | Package metadata with hatchling | VERIFIED | hatchling build, agentgov 0.1.0, httpx>=0.24.0, optional openai/anthropic deps |
| `packages/sdk-python/tests/test_wrap.py` | Unit tests (min 60 lines) | VERIFIED | 273 lines, 18 tests across 7 test classes |
| `packages/proxy/src/index.node.ts` | Node.js entry point with @hono/node-server | VERIFIED | 117 lines, serve(), env bridge middleware, HITL stub, dashboard route mount |
| `packages/proxy/src/db/client.node.ts` | createDockerDbClient with bare @libsql/client | VERIFIED | 34 lines, createClient from bare @libsql/client, runMigrations() |
| `packages/proxy/src/dashboard/routes.ts` | Read-only GET endpoints for dashboard data | VERIFIED | 57 lines, createDashboardRoutes(db) factory, 3 SELECT-only endpoints |
| `docker/compose.yml` | Docker Compose service definition | VERIFIED | 22 lines, proxy service with volume, healthcheck, env vars |
| `docker/Dockerfile.proxy` | Multi-stage Docker build | VERIFIED | 16 lines, node:20-alpine, pnpm, tsx runtime |
| `docker/.env.example` | Environment variable template | VERIFIED | 3 lines, OPENAI_API_KEY, ANTHROPIC_API_KEY, AGENTGOV_ALERT_WEBHOOK_URL |
| `packages/dashboard/src/App.tsx` | SPA entry with tab navigation | VERIFIED | 57 lines, useState tab switching, renders Costs/Approvals/Audit |
| `packages/dashboard/src/hooks/useDashboard.ts` | TanStack Query hooks with polling | VERIFIED | 72 lines, useBudgets/useAuditLog/usePendingApprovals, refetchInterval: 5000 |
| `packages/dashboard/src/pages/costs.tsx` | Budget balance table | VERIFIED | 77 lines, useBudgets hook, table with Agent ID/Limit/Spent/Reserved/Available/Updated |
| `packages/dashboard/src/pages/approvals.tsx` | Approval queue table | VERIFIED | 104 lines, usePendingApprovals hook, RiskBadge with color coding per tier |
| `packages/dashboard/src/pages/audit.tsx` | Audit log table | VERIFIED | 118 lines, useAuditLog hook, EventBadge, cost delta formatting, DESC display |
| `packages/dashboard/vite.config.ts` | Vite config with dev proxy | VERIFIED | 17 lines, /api proxy to localhost:8787 |
| `packages/dashboard/src/main.tsx` | React 19 createRoot + QueryClientProvider | VERIFIED | 17 lines, StrictMode, QueryClient, createRoot |
| `packages/dashboard/index.html` | SPA entry point | VERIFIED | 12 lines, #root div, module script to main.tsx |
| `packages/dashboard/package.json` | Package with React 19 + Vite 6 + TanStack Query | VERIFIED | react@^19, @tanstack/react-query@^5, vite@^6 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `_transport.py` | `_exceptions.py` | import and raise on governance status codes | WIRED | Line 23: `from ._exceptions import AgentError, BudgetExceeded, HitlPending` |
| `__init__.py` | `_transport.py` | wrap() creates AgentgovTransport | WIRED | Lines 39, 80: import + instantiation in wrap() |
| `index.node.ts` | `client.node.ts` | import createDockerDbClient | WIRED | Lines 13, 48: imported and called |
| `index.node.ts` | `index.ts` | import app (same Hono app) | WIRED | Line 17: `import app from './index'` |
| `dashboard/routes.ts` | `db/schema.ts` | SELECT queries against tables | WIRED | Line 3: imports budgetLedger, auditLog, hitlQueue; lines 22-52: Drizzle queries |
| `compose.yml` | `Dockerfile.proxy` | build context reference | WIRED | Line 5: `dockerfile: docker/Dockerfile.proxy` |
| `useDashboard.ts` | `/api/v1/dashboard/*` | fetch in useQuery | WIRED | Lines 52, 61, 69: fetch to budgets/audit/approvals endpoints |
| `costs.tsx` | `useDashboard.ts` | import useBudgets | WIRED | Lines 1, 12: imported and called |
| `approvals.tsx` | `useDashboard.ts` | import usePendingApprovals | WIRED | Lines 1, 37: imported and called |
| `audit.tsx` | `useDashboard.ts` | import useAuditLog | WIRED | Lines 1, 40: imported and called |
| `App.tsx` | page components | route rendering | WIRED | Lines 2-4: imports; lines 51-53: conditional rendering |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SDK-02 | 04-01 | Python SDK with `wrap(client)` API | SATISFIED | `__init__.py` exports `wrap()`, `BudgetExceeded`, `HitlPending`, `AgentError`; `_transport.py` implements `AgentgovTransport(httpx.BaseTransport)` with URL rewrite + header injection; 18 pytest tests |
| SDK-04 | 04-02 | Docker Compose self-host (5-minute setup) | SATISFIED | `compose.yml` + `Dockerfile.proxy` define single-service stack; `client.node.ts` uses embedded libSQL (no external DB); `index.node.ts` bridges process.env to c.env; healthcheck configured |
| SDK-05 | 04-02, 04-03 | Dashboard -- budget status, enforcement events, approval queue | SATISFIED | Dashboard API routes (GET budgets/audit/approvals) in `routes.ts`; React SPA with three pages (`costs.tsx`, `approvals.tsx`, `audit.tsx`); TanStack Query 5-second polling for live updates |

No orphaned requirements found. All three requirements mapped to this phase (SDK-02, SDK-04, SDK-05) are covered by plans and verified in the codebase.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | - | - | - |

No TODO/FIXME/PLACEHOLDER comments found across all phase files. No empty implementations, no console.log-only handlers, no stub return values. All 6 commits verified in git history.

### Human Verification Required

### 1. Dashboard Visual Rendering

**Test:** Start proxy with `cd packages/proxy && npx tsx src/index.node.ts`, then `cd packages/dashboard && pnpm dev`, open http://localhost:5173
**Expected:** Three tabs (Costs, Approvals, Audit) are visible and clickable. Each tab renders a styled table (or empty state message). No console errors in DevTools.
**Why human:** Visual layout, table styling, tab switching animation cannot be verified programmatically.

### 2. Dashboard Auto-Refresh Behavior

**Test:** Open browser DevTools Network tab while viewing the dashboard. Wait 10+ seconds.
**Expected:** Polling requests to `/api/v1/dashboard/budgets`, `/api/v1/dashboard/audit`, and `/api/v1/dashboard/approvals` appear every 5 seconds without page reload.
**Why human:** Requires running app with network inspector to observe real polling behavior.

### 3. Docker Compose Full Stack

**Test:** Run `cp docker/.env.example docker/.env`, edit with real API key, run `docker compose -f docker/compose.yml up -d`, then `curl http://localhost:8787/health`
**Expected:** Health endpoint returns `{"status":"ok"}` within 5 minutes. Dashboard API endpoints return JSON arrays.
**Why human:** Requires Docker runtime and real API keys to test container build + startup + healthcheck.

### 4. Python SDK with Real OpenAI Client

**Test:** `pip install -e packages/sdk-python && python -c "from agentgov import wrap, BudgetExceeded; print('OK')"`
**Expected:** Import succeeds without errors. With a running proxy, `wrap(OpenAI(), proxy_url='http://localhost:8787', agent_id='test')` should route requests through the proxy.
**Why human:** Requires real SDK installation and optionally a running proxy to test end-to-end.

### Gaps Summary

No gaps found. All 11 observable truths verified. All 20 artifacts pass three-level verification (exists, substantive, wired). All 11 key links confirmed wired. All 3 requirements (SDK-02, SDK-04, SDK-05) satisfied. No anti-patterns detected. All 6 git commits verified.

The phase goal -- "Non-TypeScript teams can adopt agentgov, and all users can observe their governance state through a dashboard -- with a self-host path for enterprise environments" -- is achieved:

1. **Python SDK** (`agentgov` package): `wrap(client, proxy_url, agent_id)` rewrites URLs via httpx transport, injects X-Agent-Id header, raises governance exceptions (BudgetExceeded/HitlPending/AgentError) matching TypeScript SDK field contracts. 18 pytest tests cover all behaviors.

2. **Self-host stack** (Docker Compose): Single `docker compose up` starts proxy with embedded libSQL (no external DB), process.env bridge to Hono c.env, HITL graceful degradation (501), and wget healthcheck.

3. **Dashboard SPA** (React 19 + Vite 6): Three read-only pages (costs, approvals, audit) consuming dashboard API endpoints with TanStack Query 5-second polling. Budget table shows available balance calculation. Risk tier badges with color coding. Event type badges on audit log. All pages handle loading/error/empty states.

4 human verification items remain (visual rendering, auto-refresh behavior, Docker stack, real SDK integration) -- all require running the application, which cannot be done in static analysis.

---

_Verified: 2026-03-15T10:30:00Z_
_Verifier: Claude (gsd-verifier)_
