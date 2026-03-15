# Roadmap: Agent Governance Platform (agentgov)

## Overview

agentgov is built in seven phases across two milestones. v1.0 (Phases 1–4) shipped the full governance pipeline: budget enforcement, HITL, error handling, TypeScript SDK, Python sync SDK, and Docker Compose self-host. v1.1 (Phases 5–7) resolves the five explicit gaps left in v1.0: Gemini returns 503, Anthropic streaming settles at 0 tokens, Python has no async transport, the per-agent budget limit is hardcoded at $10, and there is no Cloudflare Workers production config. Phases 5 and 6 are independent and can be parallelized. Phase 7 is the integration validation step and must come last.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

**v1.0 (complete):**
- [x] **Phase 1: Budget Engine + Proxy Foundation** - OpenAI-compatible proxy with Hold/Settle cost enforcement and append-only audit log (completed 2026-03-13)
- [x] **Phase 2: HITL + Approval Channels** - Risk-graded human approval with async pause/resume and webhook/Slack routing (completed 2026-03-13)
- [x] **Phase 3: Error Handling + Production Hardening** - Error classification, finite retry, stuck/loop detection, timeout watchdog (completed 2026-03-14)
- [x] **Phase 4: Dashboard + Python SDK + Self-Host** - Read-only cost dashboard, Python SDK, and Docker Compose self-host packaging (completed 2026-03-15)

**v1.1 (current milestone):**
- [ ] **Phase 5: Provider Completeness** - Gemini full implementation + Anthropic streaming settle — all three LLM providers enforced accurately
- [x] **Phase 6: Python Async SDK + Budget CRUD** - Async Python transport and operator-configurable per-agent budget limits (completed 2026-03-15)
- [ ] **Phase 7: Cloudflare Workers Production Deploy** - Edge deploy integration validation with Turso cloud and all v1.1 features verified

## Phase Details

### Phase 1: Budget Engine + Proxy Foundation
**Goal**: Developers can enforce cost budgets on AI agents with a single line of code, with hard blocking and a crash-safe audit trail
**Depends on**: Nothing (first phase)
**Requirements**: COST-01, COST-02, COST-03, COST-04, COST-05, SDK-01, SDK-03
**Success Criteria** (what must be TRUE):
  1. Developer adds `agentgov.wrap(client)` (or sets base URL to the proxy) and subsequent LLM requests are intercepted and cost-tracked without changing any other application code
  2. A request that would exceed the configured budget is blocked before it reaches the LLM — the agent receives a `BudgetExceeded` error, not a successful response
  3. Concurrent requests from the same agent never double-spend: a Hold is written before the request is forwarded and Settled to actual cost after the response, with no gap where a second request can slip through
  4. Every budget enforcement decision (allow, block, hold, settle) appears in an append-only audit log with actor, timestamp, cost delta, and running balance
  5. An unknown model name fails closed (request blocked with a warning) rather than passing through with zero cost

**Plans:** 3/3 plans complete

Plans:
- [x] 01-01-proxy-scaffold-PLAN.md — Monorepo scaffold, Hono proxy skeleton, Drizzle schema (budget_ledger + holds + audit_log), append-only DB trigger, Vitest config
- [x] 01-02-cost-engine-hold-settle-PLAN.md — Cost calculator (pricing.json, 11 models), Hold/Settle budget gate, audit writer (SHA-256 hash chain), wired into /v1/chat/completions
- [x] 01-03-sdk-alert-webhook-PLAN.md — TypeScript SDK (wrap + BudgetExceeded + base URL interceptor), LLM streaming passthrough with post-response settle, budget alert webhook

### Phase 2: HITL + Approval Channels
**Goal**: Agents pause for human approval on risky actions, with decisions routed asynchronously and surviving proxy restarts
**Depends on**: Phase 1
**Requirements**: HITL-01, HITL-02, HITL-03, HITL-04, HITL-05
**Success Criteria** (what must be TRUE):
  1. An agent action classified as requiring approval causes the agent to pause and await a decision — the agent context resumes with the approval decision attached, not a generic timeout error
  2. Approval requests are routed to a configured webhook endpoint (or Slack channel) and the approval or denial is fed back into the paused agent's execution without the agent holding a thread open
  3. An approval request that receives no response within its TTL automatically transitions to DENIED, and the agent receives a denial with a reason — no orphaned approvals exist after a proxy restart
  4. Every approval decision is recorded in the audit log with actor identity, timestamp, action classification, and outcome

**Plans:** 2/2 plans complete

Plans:
- [x] 02-01-PLAN.md — HITL queue schema (Turso), action classifier (static risk tier table), Cloudflare Workflows waitForEvent, notification channels (webhook + Slack), HitlPending SDK error
- [x] 02-02-PLAN.md — Slack signature verification, approve/deny/status callback endpoints, HITL classification wired into proxy pipeline, route mounting

### Phase 3: Error Handling + Production Hardening
**Goal**: Agents running in production fail deterministically — transient errors retry, permanent errors halt, stuck agents are detected and stopped
**Depends on**: Phase 2
**Requirements**: ERR-01, ERR-02, ERR-03, ERR-04
**Success Criteria** (what must be TRUE):
  1. A rate-limit or 5xx error from the LLM triggers automatic retry with exponential backoff and jitter, up to a configurable maximum — the agent does not need to handle retries itself
  2. An authentication or 4xx error immediately halts the agent request without retrying — no wasted budget on permanent failures
  3. An agent that calls the same action with the same inputs twice without making progress is detected and stopped with a structured error that includes the repeated action, timestamps, and suggested remediation
  4. Every error event (classification, retry attempt, halt decision) appears in the audit log with type, timestamp, agent context, and suggested remediation

**Plans:** 2/2 plans complete

Plans:
- [x] 03-01-PLAN.md — Error classifier (transient vs permanent), finite retry engine with exponential backoff + jitter, structured error reporter, AgentError SDK class (ERR-01, ERR-02, ERR-04)
- [x] 03-02-PLAN.md — Stuck/loop detector (2-failure-stop rule, per-request in-memory state), pipeline integration (ERR-03)

### Phase 4: Dashboard + Python SDK + Self-Host
**Goal**: Non-TypeScript teams can adopt agentgov, and all users can observe their governance state through a dashboard — with a self-host path for enterprise environments
**Depends on**: Phase 1 (can begin after Phase 1; does not require Phase 2 or 3)
**Requirements**: SDK-02, SDK-04, SDK-05
**Success Criteria** (what must be TRUE):
  1. A Python developer can call `agentgov.wrap(client)` on an Anthropic or OpenAI Python client and have requests intercepted by the proxy with the same governance behavior as the TypeScript SDK
  2. A developer running `docker compose up` has a fully working agentgov stack (proxy + database + dashboard) within 5 minutes, with no external service dependencies
  3. The dashboard shows current budget balance, session cost breakdown, enforcement events, and the approval queue — all updated from live audit log queries without requiring a page reload workflow

**Plans:** 3/3 plans complete

Plans:
- [x] 04-01-PLAN.md — Python SDK (httpx transport override, agentgov.wrap, BudgetExceeded/HitlPending/AgentError exceptions) (SDK-02)
- [x] 04-02-PLAN.md — Docker Compose self-host stack + dashboard API (Node.js entry point, embedded libSQL, dashboard read-only endpoints, Dockerfile) (SDK-04, SDK-05)
- [x] 04-03-PLAN.md — Dashboard SPA (React 19 + Vite 6, TanStack Query polling, costs/approvals/audit pages) (SDK-05)

### Phase 5: Provider Completeness
**Goal**: All three major LLM providers (OpenAI, Anthropic, Gemini) enforce accurate budgets — Gemini requests reach the LLM instead of returning 503, and Anthropic streaming charges actual token costs instead of zero
**Depends on**: Phase 4 (v1.0 complete)
**Requirements**: PROV-01, PROV-02, PROV-03
**Success Criteria** (what must be TRUE):
  1. A `gemini-*` model request routed through the proxy reaches the Gemini OpenAI-compatible endpoint and returns a valid response with accurate token settle for both non-streaming and streaming calls
  2. A `gemini-*` request made without `GEMINI_API_KEY` configured returns HTTP 503 with a clear error message identifying the missing key — consistent with the existing OpenAI and Anthropic unconfigured behavior
  3. An Anthropic streaming response has its `input_tokens` (from `message_start`) and `output_tokens` (from `message_delta`) both extracted and settled — the budget ledger reflects actual prompt + completion cost, not zero

**Plans:** 1/2 plans complete

Plans:
- [x] 05-01-PLAN.md — Gemini forwarding (forwardToGemini + processStreamAndSettle reuse), GEMINI_API_KEY wiring (ForwardEnv + wrangler.jsonc + index.ts + index.node.ts), 503 guard (PROV-01, PROV-02)
- [ ] 05-02-PLAN.md — Anthropic SSE parser (processAnthropicStreamAndSettle), message_start/message_delta token extraction, pipeAndSettle removal (PROV-03)

### Phase 6: Python Async SDK + Budget CRUD
**Goal**: Python async agent developers get the same governance enforcement as sync users, and operators can set per-agent budget limits from the dashboard without redeploying
**Depends on**: Phase 4 (v1.0 complete); independent of Phase 5
**Requirements**: SDK-06, SDK-07, BUDGET-01, BUDGET-02
**Success Criteria** (what must be TRUE):
  1. `agentgov.wrap(AsyncOpenAI())` and `agentgov.wrap(AsyncAnthropic())` route requests through the proxy via an async httpx transport — no `RuntimeError: This event loop is already running` on first await
  2. `BudgetExceeded`, `HitlPending`, and `AgentError` exceptions raised during async SDK calls have the same field contract as their sync counterparts
  3. A dashboard operator can change an agent's budget limit via an inline edit on the Costs page, and the new limit is reflected immediately in the budget ledger (subsequent requests are enforced against the new limit, not the old one)
  4. Every budget limit change appears in the audit log with the previous value, new value, timestamp, and actor — the change history is traceable

**Plans:** 2/2 plans complete

Plans:
- [ ] 06-01-PLAN.md — Python async SDK (AsyncAgentgovTransport, wrap_async(), pytest-asyncio tests) (SDK-06, SDK-07)
- [ ] 06-02-PLAN.md — Budget CRUD (updateBudgetLimit ledger fn, PATCH endpoint, audit event, dashboard inline edit) (BUDGET-01, BUDGET-02)

### Phase 7: Cloudflare Workers Production Deploy
**Goal**: agentgov proxy is deployable to Cloudflare Workers edge as an alternative to Docker Compose, with all v1.1 features (Gemini, Anthropic streaming, async Python SDK, budget CRUD) verified against the Workers runtime and Turso cloud
**Depends on**: Phase 5 and Phase 6 (both must be complete and validated in Docker Compose first)
**Requirements**: DEPLOY-01, DEPLOY-02
**Success Criteria** (what must be TRUE):
  1. `wrangler deploy` completes without error and the deployed Worker accepts and enforces `gemini-*` requests with accurate token settle
  2. All secrets (`GEMINI_API_KEY` and all existing provider keys) are set exclusively via `wrangler secret put` — no secrets appear in `wrangler.jsonc` committed to source control
  3. HITL approval workflow triggers and resolves correctly in the Workers runtime — `c.env.HITL_WORKFLOW` is defined, meaning `[[workflows]]` and all vars are redeclared in `[env.production]`

**Plans:** TBD

## Progress

**Execution Order:**
v1.0 complete. v1.1: Phases 5 and 6 are independent and can be parallelized. Phase 7 depends on both Phase 5 and Phase 6 being validated in Docker Compose.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Budget Engine + Proxy Foundation | 3/3 | Complete | 2026-03-13 |
| 2. HITL + Approval Channels | 2/2 | Complete | 2026-03-13 |
| 3. Error Handling + Production Hardening | 2/2 | Complete | 2026-03-14 |
| 4. Dashboard + Python SDK + Self-Host | 3/3 | Complete | 2026-03-15 |
| 5. Provider Completeness | 1/2 | In Progress | - |
| 6. Python Async SDK + Budget CRUD | 2/2 | Complete   | 2026-03-15 |
| 7. Cloudflare Workers Production Deploy | 0/? | Not started | - |
