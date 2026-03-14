# Roadmap: Agent Governance Platform (agentgov)

## Overview

agentgov is built in four phases that follow the architecture's dependency chain: durable budget state must exist before HITL queue can write to it, which must exist before error handler escalation paths can use it. Phase 1 proves the core thesis (deterministic cost enforcement) and produces the only artifact users will install on Day 1. Phases 2-3 layer governance depth. Phase 4 broadens distribution. The research-suggested Phase 6 (Cloudflare Workers cloud deployment) is deferred to v2 — validate self-host adoption first.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Budget Engine + Proxy Foundation** - OpenAI-compatible proxy with Hold/Settle cost enforcement and append-only audit log (completed 2026-03-13)
- [x] **Phase 2: HITL + Approval Channels** - Risk-graded human approval with async pause/resume and webhook/Slack routing (completed 2026-03-13)
- [x] **Phase 3: Error Handling + Production Hardening** - Error classification, finite retry, stuck/loop detection, timeout watchdog (completed 2026-03-14)
- [ ] **Phase 4: Dashboard + Python SDK + Self-Host** - Read-only cost dashboard, Python SDK, and Docker Compose self-host packaging

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
- [ ] 03-01-PLAN.md — Error classifier (transient vs permanent), finite retry engine with exponential backoff + jitter, structured error reporter, AgentError SDK class (ERR-01, ERR-02, ERR-04)
- [ ] 03-02-PLAN.md — Stuck/loop detector (2-failure-stop rule, per-request in-memory state), pipeline integration (ERR-03)

### Phase 4: Dashboard + Python SDK + Self-Host
**Goal**: Non-TypeScript teams can adopt agentgov, and all users can observe their governance state through a dashboard — with a self-host path for enterprise environments
**Depends on**: Phase 1 (can begin after Phase 1; does not require Phase 2 or 3)
**Requirements**: SDK-02, SDK-04, SDK-05
**Success Criteria** (what must be TRUE):
  1. A Python developer can call `agentgov.wrap(client)` on an Anthropic or OpenAI Python client and have requests intercepted by the proxy with the same governance behavior as the TypeScript SDK
  2. A developer running `docker compose up` has a fully working agentgov stack (proxy + database + dashboard) within 5 minutes, with no external service dependencies
  3. The dashboard shows current budget balance, session cost breakdown, enforcement events, and the approval queue — all updated from live audit log queries without requiring a page reload workflow

**Plans**: TBD

Plans:
- [ ] 04-01: Python SDK (httpx transport override, agentgov.wrap, BudgetExceeded/HitlPending exceptions, PyPI packaging) (SDK-02)
- [ ] 04-02: Docker Compose self-host stack (proxy via @hono/node-server, embedded libSQL, static dashboard bundle) (SDK-04)
- [ ] 04-03: Dashboard SPA (React 19 + Vite 6, budget gauges, enforcement events, approval queue) (SDK-05)

## Progress

**Execution Order:**
Phases 1 → 2 → 3 are a strict dependency chain. Phase 4 can begin in parallel after Phase 1 completes. Recommended: start Phase 4 in parallel with Phase 2.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Budget Engine + Proxy Foundation | 3/3 | Complete    | 2026-03-13 |
| 2. HITL + Approval Channels | 2/2 | Complete   | 2026-03-13 |
| 3. Error Handling + Production Hardening | 2/2 | Complete   | 2026-03-14 |
| 4. Dashboard + Python SDK + Self-Host | 0/3 | Not started | - |
