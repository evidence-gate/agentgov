# Architecture Research

**Domain:** Agent Governance Platform (proxy-based, OSS)
**Researched:** 2026-03-13
**Confidence:** HIGH (proxy pattern is well-established; agentgov-specific design principles from PROJECT.md are incorporated as-is)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          AGENT PROCESS                              │
│  ┌──────────────┐    ┌──────────────────────────────────────────┐   │
│  │  Agent Code  │───▶│  agentgov SDK  (TypeScript / Python)     │   │
│  │  (user app)  │    │  agentgov.wrap(client)                   │   │
│  └──────────────┘    │  - Rewrites base_url → Proxy             │   │
│                      │  - Injects agent-id header               │   │
│                      │  - Surfaces budget errors as exceptions  │   │
│                      └──────────────┬───────────────────────────┘   │
└─────────────────────────────────────│───────────────────────────────┘
                                      │ HTTPS (OpenAI-compat. format)
┌─────────────────────────────────────▼───────────────────────────────┐
│                        PROXY LAYER (control plane)                  │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Request Ingress  (Hono router, OpenAI-compatible endpoint)  │    │
│  └────────────────────────┬────────────────────────────────────┘    │
│                           │                                         │
│  ┌────────────────────────▼────────────────────────────────────┐    │
│  │  Auth & Agent Identity  (API key → agent-id mapping)        │    │
│  └────────────────────────┬────────────────────────────────────┘    │
│                           │                                         │
│  ┌────────────────────────▼────────────────────────────────────┐    │
│  │  Budget Gate  (deterministic, pre-request)                   │    │
│  │  Hold/Settle pattern: pessimistic reservation               │    │
│  │  global → provider → model hierarchy                        │    │
│  │  Graceful degradation: expensive → cheaper model            │    │
│  └──────────┬─────────────────────────┬───────────────────────┘    │
│   PASS       │                 BLOCK   │                            │
│  ┌───────────▼─────────┐  ┌──────────▼──────────────────────┐      │
│  │  Action Classifier  │  │  Budget Exceeded Response       │      │
│  │  Reversible /       │  │  (deterministic 429 / graceful  │      │
│  │  Semi-Reversible /  │  │   fallback to cheaper model)    │      │
│  │  Irreversible /     │  └─────────────────────────────────┘      │
│  │  External           │                                            │
│  └──────────┬──────────┘                                            │
│  AUTO-PASS  │   HITL-REQUIRED                                       │
│  ┌──────────▼──────┐  ┌──────────────────────────────────────┐      │
│  │  LLM Passthrough│  │  HITL Queue  (async suspend/resume)  │      │
│  │  (forward req)  │  │  pending_approval state persisted    │      │
│  └──────────┬──────┘  └─────────────┬────────────────────────┘      │
│             │                       │                               │
│  ┌──────────▼───────────────────────▼────────────────────────┐      │
│  │  Error Classifier + Timeout Watchdog                       │      │
│  │  3-tier: soft-warn → idle-detect → hard-stop              │      │
│  │  Stuck detection: bounded retry (2 failures → halt)       │      │
│  └──────────────────────────┬───────────────────────────────┘      │
│                              │                                      │
│  ┌───────────────────────────▼──────────────────────────────┐       │
│  │  Audit Log Writer  (append-only, tamper-evident)          │       │
│  │  Writes: budget decision, action class, HITL outcome,    │       │
│  │          error type, timeout events                       │       │
│  └──────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
┌─────────────▼──┐  ┌─────────▼───────┐  ┌───▼───────────────────┐
│  LLM Provider  │  │  Approval        │  │  Dashboard            │
│  (OpenAI,      │  │  Channels        │  │  (read-only)          │
│   Anthropic,   │  │  Slack / Webhook │  │  Cost, budget,        │
│   etc.)        │  │  ── notify →     │  │  approval queue       │
│                │  │  ← approve/deny  │  │  Real-time from DB    │
└────────────────┘  └─────────────────┘  └───────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Owns |
|-----------|----------------|------|
| **SDK (TS/Python)** | Intercept LLM client at construction time; rewrite `base_url`; inject `agent-id`; surface `BudgetExceeded` / `HitlPending` exceptions | Zero persistent state |
| **Proxy / Request Ingress** | OpenAI-compatible HTTP endpoint; validate inbound format; route to internal pipeline | Request lifetime |
| **Auth & Agent Identity** | Map API key → agent-id; enforce key validity; capability scope (what budgets/models this agent may use) | Agent credential store |
| **Budget Gate** | Pre-request hold (pessimistic reservation); post-response settle (actual token cost); hierarchy enforcement (global > provider > model); graceful fallback logic | Budget ledger (Turso/libSQL) |
| **Action Classifier** | Static, deterministic mapping of requested action → risk tier (Reversible / Semi-Reversible / Irreversible / External); HITL trigger decision is code, not LLM | Static rule table |
| **HITL Queue** | Async suspend: persist pending request; notify approval channels; expose resume endpoint; timeout the pending approval | Approval state store |
| **Error Classifier + Timeout Watchdog** | Categorize errors by type; route to typed handler; track retry count per agent/session; enforce 3-tier timeout (soft → idle → hard); detect stuck loops | Per-session error state |
| **Audit Log Writer** | Append-only writes (never update/delete); timestamp + hash chain for tamper evidence; EU AI Act Article 12/14 traceability | Append-only log table |
| **Approval Channels** | Slack bot (interactive messages) + generic Webhook; async notify → receive approve/deny callback; correlate back to HITL Queue | External integrations |
| **Dashboard** | Read-only query of audit log + budget ledger; cost summary, budget remaining, approval queue, error rates | No write path |

## Recommended Project Structure

```
agentgov/
├── packages/
│   ├── sdk-typescript/          # npm: @agentgov/sdk
│   │   ├── src/
│   │   │   ├── wrap.ts          # agentgov.wrap(client) entry point
│   │   │   ├── interceptor.ts   # base_url rewrite + header injection
│   │   │   ├── errors.ts        # BudgetExceeded, HitlPending, AgentError
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── sdk-python/              # PyPI: agentgov
│   │   ├── agentgov/
│   │   │   ├── wrap.py          # agentgov.wrap(client)
│   │   │   ├── interceptor.py   # httpx transport override
│   │   │   ├── errors.py        # BudgetExceeded, HitlPending
│   │   │   └── __init__.py
│   │   └── pyproject.toml
│   │
│   └── proxy/                   # Cloudflare Worker (primary) + Docker (self-host)
│       ├── src/
│       │   ├── index.ts         # Hono app entry; route /v1/chat/completions
│       │   ├── auth/
│       │   │   └── agent-identity.ts   # API key → agent-id resolution
│       │   ├── budget/
│       │   │   ├── gate.ts      # hold/settle logic (deterministic)
│       │   │   ├── ledger.ts    # Turso DB read/write for budget state
│       │   │   ├── hierarchy.ts # global > provider > model enforcement
│       │   │   └── fallback.ts  # graceful degradation (cheaper model)
│       │   ├── hitl/
│       │   │   ├── classifier.ts  # static risk-tier mapping
│       │   │   ├── queue.ts       # suspend / persist / resume
│       │   │   └── channels/
│       │   │       ├── slack.ts   # Slack interactive message + callback
│       │   │       └── webhook.ts # generic outbound + inbound callback
│       │   ├── errors/
│       │   │   ├── classifier.ts  # error type → handler routing
│       │   │   ├── timeout.ts     # 3-tier timeout watchdog
│       │   │   └── stuck.ts       # bounded retry + loop detection
│       │   ├── audit/
│       │   │   └── writer.ts      # append-only log writes
│       │   ├── passthrough/
│       │   │   └── forward.ts     # proxy approved request to LLM provider
│       │   └── types.ts           # shared TypeScript types
│       ├── wrangler.toml          # Cloudflare Workers config
│       └── docker-compose.yml     # Self-hosted deployment
│
├── dashboard/                     # Read-only web UI
│   ├── src/
│   │   ├── pages/
│   │   │   ├── costs.tsx          # Cost summary + budget remaining
│   │   │   ├── approvals.tsx      # Pending HITL queue
│   │   │   └── audit.tsx          # Audit log viewer
│   │   └── api/                   # Read-only query endpoints
│   └── package.json
│
├── docker/
│   ├── docker-compose.yml         # Full self-hosted stack
│   ├── proxy/Dockerfile
│   └── dashboard/Dockerfile
│
└── docs/                          # OSS documentation
```

### Structure Rationale

- **packages/sdk-typescript/ and sdk-python/:** Separate npm + PyPI packages. SDK has zero server dependencies — it only rewrites the `base_url` and injects headers. This keeps the SDK trivially small and auditable.
- **packages/proxy/src/budget/:** Budget logic is isolated from routing logic. The `gate.ts` module is deterministic code with no LLM calls — consistent with the "LLM does judgment, code does deterministic" principle.
- **packages/proxy/src/hitl/:** HITL queue is separate from the action classifier. Classifier is a pure function (action → risk tier). Queue handles the stateful suspend/resume lifecycle.
- **packages/proxy/src/audit/:** Writer-only module. Dashboard reads directly from DB. No write path in dashboard prevents accidental mutation.
- **dashboard/:** Separate deployable. Can be omitted in minimal deployments. Reads only — no write path into budget or audit tables.

## Architectural Patterns

### Pattern 1: Hold/Settle Budget Reservation

**What:** Before forwarding a request to the LLM provider, the Budget Gate reserves (holds) the estimated token cost pessimistically. After the response arrives, it settles to the actual token cost and releases the over-estimate.

**When to use:** All LLM requests. This is the core budget enforcement mechanism. Non-negotiable — without the hold, a budget check at request time is a race condition under concurrent agents.

**Trade-offs:** Slightly over-blocks near budget limits (hold is pessimistic). Tradeoff is correct: under-blocking causes cost overruns, which is the primary user problem to solve.

**Example:**
```typescript
// budget/gate.ts
async function budgetGate(ctx: RequestContext): Promise<GateResult> {
  const estimated = estimateInputTokens(ctx.request); // deterministic, tiktoken
  const hold = await ledger.hold(ctx.agentId, estimated, ctx.model);

  if (!hold.approved) {
    // Budget exceeded — check if graceful fallback applies
    const fallback = hierarchy.findCheaperModel(ctx.model, hold.remaining);
    if (fallback) return { action: 'fallback', model: fallback, holdId: null };
    return { action: 'block', reason: 'budget_exceeded' };
  }

  return { action: 'pass', holdId: hold.id };
}

async function budgetSettle(holdId: string, actualUsage: TokenUsage): Promise<void> {
  // Called after LLM response received. Settles to actual cost.
  await ledger.settle(holdId, actualUsage);
  // Writes to audit log automatically
}
```

### Pattern 2: Static Action Classification (Risk-Graded)

**What:** A lookup table maps requested tool/action names (or inferred from request content) to a risk tier. The tier determines whether the request auto-passes or enters the HITL queue. No LLM inference involved in this decision.

**When to use:** Every request that invokes a tool action. For pure text completion with no tool calls, classification is Reversible and auto-passes.

**Trade-offs:** Static table requires upfront configuration and periodic review. Avoids the instability of LLM-based HITL triggering (non-deterministic, prompt-injection vulnerable). Correct tradeoff given the security model (agent as untrusted contractor).

**Example:**
```typescript
// hitl/classifier.ts
const RISK_TABLE: Record<string, RiskTier> = {
  'read_file':        RiskTier.Reversible,
  'write_file':       RiskTier.SemiReversible,
  'delete_file':      RiskTier.Irreversible,
  'send_email':       RiskTier.External,
  'call_payment_api': RiskTier.External,
  // default for unknown actions:
  '*':                RiskTier.Irreversible,
};

function classifyAction(action: string): RiskTier {
  return RISK_TABLE[action] ?? RISK_TABLE['*'];
}

function requiresHitl(tier: RiskTier, policy: HitlPolicy): boolean {
  // policy is per-agent config (e.g., "require HITL for Irreversible+")
  return tier >= policy.minimumTierForHitl;
}
```

### Pattern 3: Async HITL Suspend/Resume

**What:** When an action requires human approval, the proxy persists the full request context (serialized), responds to the SDK with `HitlPending` (202 status + approval-id), notifies approval channels (Slack/Webhook), and waits. When the approver responds, a callback endpoint resumes the pending request.

**When to use:** Whenever `classifyAction()` + `requiresHitl()` returns true. The resume can happen seconds or hours later — the pending state survives proxy restarts because it is stored in the DB.

**Trade-offs:** Increases latency for HITL-gated actions (by design). Adds complexity in the SDK (caller must handle 202 + poll or receive callback). Resume endpoint must be idempotent (Slack retries webhooks).

**Example:**
```typescript
// hitl/queue.ts
async function suspendForHitl(ctx: RequestContext): Promise<HitlTicket> {
  const ticket = await db.insert('hitl_queue', {
    id: crypto.randomUUID(),
    agentId: ctx.agentId,
    requestPayload: JSON.stringify(ctx.request),
    status: 'pending',
    expiresAt: Date.now() + HITL_TIMEOUT_MS,
    createdAt: Date.now(),
  });

  await channels.notify(ticket);  // Slack + Webhook, non-blocking
  auditLog.write({ event: 'hitl_suspended', ticketId: ticket.id, ...ctx });

  return ticket;
}

// POST /v1/hitl/:ticketId/approve  (called by Slack callback or webhook)
async function resumeApproved(ticketId: string, approver: string): Promise<void> {
  const ticket = await db.get('hitl_queue', ticketId);
  if (ticket.status !== 'pending') return; // idempotent

  await db.update('hitl_queue', ticketId, { status: 'approved', approver });
  auditLog.write({ event: 'hitl_approved', ticketId, approver });
  await forward.resume(ticket); // forward original request to LLM provider
}
```

### Pattern 4: Append-Only Audit Log with Hash Chain

**What:** Every budget decision, action classification, HITL event, error, and timeout is written as an immutable row. No UPDATE or DELETE on the audit table. Each row includes a hash of the previous row's hash + current content, creating a tamper-evident chain detectable by sequential verification.

**When to use:** All governance events. Not optional — this is the EU AI Act Article 12/14 compliance backbone and the primary value artifact for enterprise buyers.

**Trade-offs:** Slightly more complex writes (must read previous hash to compute chain). No correction path for erroneous entries — append a correction record instead. Storage grows indefinitely (partition by month for archival).

**Example:**
```typescript
// audit/writer.ts
async function appendAuditEvent(event: AuditEvent): Promise<void> {
  const prev = await db.queryOne('SELECT hash FROM audit_log ORDER BY seq DESC LIMIT 1');
  const prevHash = prev?.hash ?? GENESIS_HASH;
  const payload = JSON.stringify({ ...event, prevHash });
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(payload));

  await db.insert('audit_log', {
    seq: await nextSeq(),
    event_type: event.type,
    agent_id: event.agentId,
    payload,
    hash: bufferToHex(hash),
    ts: Date.now(),
  });
  // Never UPDATE or DELETE this table
}
```

### Pattern 5: 3-Tier Timeout Watchdog

**What:** Three escalating timeout signals per agent session. Soft warning at T1 (log + notify). Idle detection at T2 (if no progress since last check). Hard stop at T3 (terminate session, release all holds, write audit event).

**When to use:** All long-running agent sessions. Prevents runaway agents from holding budget reservations open indefinitely and causing false budget exhaustion.

**Trade-offs:** Requires per-session state tracking. T1/T2/T3 thresholds must be configurable per agent (batch jobs vs. interactive agents have very different profiles).

```
T1 (soft warning):  30s of no LLM calls → log + optional Slack ping
T2 (idle detect):   60s of no LLM calls → mark session idle, alert
T3 (hard stop):    120s of no LLM calls → terminate, settle all holds at $0
```

## Data Flow

### Request Flow (Auto-Pass Path)

```
Agent Code
  │  openai.chat.completions.create(...)
  ▼
SDK (wrap)
  │  rewrites base_url → proxy URL
  │  injects X-Agent-Id header
  ▼
Proxy: Ingress (Hono /v1/chat/completions)
  │  validates request format
  ▼
Auth & Agent Identity
  │  resolves API key → agent-id + capability scope
  ▼
Budget Gate
  │  holds estimated input tokens
  │  checks: global budget ≥ hold? provider budget ≥ hold? model budget ≥ hold?
  │  YES → hold placed, returns hold-id
  ▼
Action Classifier
  │  maps action/tool → RiskTier
  │  checks policy: requiresHitl? → NO (auto-pass path)
  ▼
LLM Passthrough (forward to provider)
  │  forwards original request headers + body with real API key
  │  streams response back to SDK
  ▼
Budget Settle (post-response)
  │  extracts actual token usage from response
  │  settles hold → actual cost
  ▼
Audit Log Write
  │  appends: budget_decision, action_class, response_tokens, latency_ms
  ▼
SDK
  │  returns response to agent code
  ▼
Agent Code
```

### Request Flow (HITL Path)

```
[... Auth & Agent Identity ... Budget Gate ...] (same as above)
  ▼
Action Classifier → RiskTier.Irreversible → requiresHitl? YES
  ▼
HITL Queue: suspendForHitl()
  │  persists full request context to DB (status: pending)
  │  notifies Slack / Webhook channels (async, non-blocking)
  │  returns 202 + { approvalId } to SDK
  ▼
SDK: raises HitlPending exception to agent code
  │  agent code can poll GET /v1/hitl/:id/status
  │  or register a callback URL for push notification

[Human receives Slack message / webhook]
  │  clicks Approve or Deny
  ▼
Slack callback → POST /v1/hitl/:id/approve or /deny
  ▼
HITL Queue: resumeApproved() or resumeDenied()
  │  updates DB status
  │  audit log write: hitl_approved / hitl_denied
  │  if approved: forward original request to LLM provider → settle budget
  │  if denied:   release hold, audit write, return error to SDK
```

### Request Flow (Budget Blocked Path)

```
[... Auth & Agent Identity ...]
  ▼
Budget Gate: hold fails (budget exhausted)
  │  checks graceful fallback: cheaper model available within remaining budget?
  │  YES → rewrite model in request, retry hold → proceed as auto-pass
  │  NO  → return 429 with BudgetExceeded error body
  ▼
Audit Log Write: budget_blocked event
  ▼
SDK: raises BudgetExceeded exception
  ▼
Agent Code: handles exception (terminate / alert / escalate)
```

### State Management

```
Budget Ledger (Turso/libSQL)
  ├── agent_budgets: global/provider/model limits per agent
  ├── holds: active pessimistic reservations (holdId, agentId, amount, expiresAt)
  └── usage_log: settled actual costs (append-friendly, drives dashboard)

HITL State (Turso/libSQL)
  ├── hitl_queue: pending / approved / denied / expired tickets
  └── approver_config: who gets notified for which agent / risk tier

Audit Log (Turso/libSQL — append-only table)
  └── audit_log: seq, event_type, agent_id, payload, hash, ts

Session State (Durable Objects / in-memory for self-host)
  └── timeout_watchdog: last_activity_ts, retry_counts per session
```

## Component Boundaries and Build Order

Build order is constrained by dependencies between components. Each layer depends only on what is listed below it.

```
Layer 0 (foundation, no dependencies):
  ├── Audit Log Writer (append-only DB writes)
  ├── Budget Ledger (DB schema + hold/settle)
  └── Shared Types (TypeScript types package)

Layer 1 (depends on Layer 0):
  ├── Auth & Agent Identity (reads agent_budgets)
  ├── Budget Gate (reads/writes holds + ledger)
  └── Error Classifier + Timeout Watchdog (writes audit log)

Layer 2 (depends on Layer 1):
  ├── Action Classifier (pure function, no DB dependency)
  ├── HITL Queue (reads budget state, writes HITL state, writes audit log)
  └── LLM Passthrough (depends on Budget Gate settle)

Layer 3 (depends on Layer 2):
  ├── Approval Channels — Slack, Webhook (depends on HITL Queue)
  ├── Proxy Ingress / Hono Router (orchestrates Layers 0-2)
  └── SDK TypeScript + Python (depends on Proxy contract only)

Layer 4 (depends on Layer 0, read-only):
  └── Dashboard (queries audit log + budget ledger)
```

**Recommended build sequence for phases:**
1. Budget Gate + Audit Log (core value, prove hold/settle works)
2. Proxy Ingress + SDK (wire it together, `agentgov.wrap(client)` works end-to-end)
3. Action Classifier + HITL Queue + Slack channel (HITL path operational)
4. Error Classifier + Timeout Watchdog (production hardening)
5. Dashboard (observability layer)
6. Webhook channel + Python SDK (ecosystem coverage)
7. Docker Compose self-host packaging (OSS distribution)
8. Cloudflare Workers deployment (edge/cloud distribution)

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k agents | Single Cloudflare Worker instance; Turso free tier; no Redis. Durable Objects for session state. |
| 1k-10k agents | Turso read replicas (embedded replica on each Worker); hold table indexed by (agentId, status). Monitor hold table size — expired holds must be reaped. |
| 10k-100k agents | Shard budget ledger by agentId prefix. Separate Durable Object per high-throughput agent for session state isolation. Audit log partitioned by month. HITL queue on dedicated table with TTL cleanup job. |
| 100k+ agents | Budget ledger becomes the bottleneck (high-write, strongly-consistent holds). At this scale: evaluate replacing Turso holds with a Redis-backed counter with Lua scripting for atomic hold/check/deduct. Audit log → object storage (R2) with SQLite index. |

### Scaling Priorities

1. **First bottleneck: hold table write contention.** Every LLM request needs an atomic hold. At scale, concurrent holds from the same agent (parallel tool calls) must be serialized. Solution: Durable Object per agent acts as a single-writer lock for that agent's budget state.
2. **Second bottleneck: audit log table size.** Audit log is append-only and grows without bound. Solution: monthly partitioning + archival to R2/S3, keeping only the last 90 days in hot storage.
3. **Third bottleneck: HITL queue polling.** If many approvals are pending, the approver dashboard must paginate efficiently. Solution: indexed query on (status='pending', createdAt DESC).

## Anti-Patterns

### Anti-Pattern 1: LLM-Based HITL Triggering

**What people do:** Use an LLM to decide whether an action "seems risky" and should require human approval.

**Why it's wrong:** LLM judgment is non-deterministic, prompt-injectable, and adds latency + cost to every request. An adversarial agent can craft a prompt that convinces the LLM the action is safe. The HITL trigger is a security control — it must not be LLM-mediated.

**Do this instead:** Static action classification table (Pattern 2 above). Risk tier is a property of the action type, not the content. If content-based classification is needed, require it to be explicitly whitelisted and audited by humans, not auto-decided by LLM.

### Anti-Pattern 2: Post-Request Budget Checking

**What people do:** Forward the LLM request first, then check if the cost exceeded the budget after the response arrives.

**Why it's wrong:** The cost has already been incurred. Post-request checking is accounting, not enforcement. An agent can exhaust $1000 in budget with a single parallel burst before any check fires.

**Do this instead:** Pre-request hold (pessimistic reservation) before forwarding. Post-request settle to actual cost. The hold is the enforcement; the settle is the accounting.

### Anti-Pattern 3: Mutable Audit Log

**What people do:** Update or delete audit log rows to correct errors or remove PII.

**Why it's wrong:** Any mutation breaks the hash chain, making tamper-evidence unverifiable. EU AI Act Article 12 requires tamper-resistant logging. Legal defensibility of audit trails depends on immutability.

**Do this instead:** Append a correction record ("This row corrects row #X. Corrected value: Y. Reason: Z."). For PII, pseudonymize at write time (store agent-id, not PII). If GDPR erasure is required, store PII in a separate table that can be deleted, referenced by agent-id in the audit log.

### Anti-Pattern 4: SDK-Embedded Budget Logic

**What people do:** Put budget enforcement in the SDK client library (client-side checks).

**Why it's wrong:** The agent process is "untrusted contractor" — it could be compromised, patched, or simply use a different SDK. Client-side enforcement is trivially bypassed.

**Do this instead:** All enforcement at the proxy layer (server-side). SDK is a convenience layer only — it rewrites URLs and surfaces errors. It cannot and should not be the enforcement boundary.

### Anti-Pattern 5: Synchronous HITL (Blocking Wait)

**What people do:** Block the HTTP request thread while waiting for human approval (synchronous wait with long timeout).

**Why it's wrong:** Human approvals can take minutes or hours. Holding an HTTP connection open wastes resources, hits gateway timeouts (Cloudflare Workers has a 30s CPU limit, 30min wall-clock limit per Durable Object), and provides no recovery path if the connection drops.

**Do this instead:** Async suspend/resume pattern (Pattern 3 above). Return 202 immediately, store pending state in DB, resume on callback. The agent SDK polls status or receives a push notification.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| OpenAI | Reverse proxy: forward request, stream response back. Use `X-Request-Id` for correlation. | Extract token usage from `stream_options: {include_usage: true}` in streaming responses. |
| Anthropic | Same reverse proxy pattern. Different auth header (`x-api-key` vs `Authorization: Bearer`). | Token counting: use Anthropic's token count endpoint for pre-request estimation, or tiktoken approximation. |
| Slack | Outbound: POST to `chat.postMessage` with interactive button. Inbound: `interactivity_request_url` callback to proxy. | Slack enforces 3-second acknowledgment — return 200 immediately, process async. Verify `X-Slack-Signature` HMAC. |
| Generic Webhook | Outbound: POST approval request. Inbound: callback endpoint with approve/deny decision. | Caller provides callback URL at agent registration time. Idempotency key on all webhook events. |
| Turso (libSQL) | libSQL HTTP client from Cloudflare Workers (no native SQLite driver in Workers). Embedded replica for self-hosted Docker. | Use `@libsql/client` npm package. In Cloudflare Workers, use HTTP mode (not embedded). |
| Cloudflare Durable Objects | Per-agent session state (timeout watchdog, retry counters). One DO per active agent session. | DO enforces single-writer concurrency per agent — eliminates hold table race condition. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| SDK ↔ Proxy | HTTPS, OpenAI-compatible JSON. Extra headers: `X-Agent-Id`, `X-Agentgov-Version`. Responses: standard OpenAI format + `X-Hold-Id` header for traceability. | SDK must not know proxy internals. Contract is the HTTP interface only. |
| Proxy ↔ Budget Gate | In-process function call (same Worker). No network hop. | Budget Gate is a module, not a service. Keeps latency under 5ms for the budget decision. |
| Budget Gate ↔ Turso | HTTP (libSQL HTTP client). Atomic hold operation must be a single SQL transaction: `SELECT remaining; INSERT hold; UPDATE remaining`. | In Cloudflare: use DO to serialize concurrent holds from the same agent. |
| Proxy ↔ HITL Queue | In-process. HITL Queue writes to Turso and invokes Approval Channels async. | Approval Channels are fire-and-forget from the proxy's perspective — audit log captures the notification event. |
| HITL Queue ↔ Approval Channels | Outbound HTTP (Slack API, arbitrary webhook URL). Inbound: callback endpoint on proxy (`POST /v1/hitl/:id/approve`). | Callback endpoint must verify caller authenticity (Slack HMAC, webhook secret). |
| Proxy ↔ Audit Log Writer | In-process function call. Every pipeline step calls `auditLog.write()` before returning. | Writer is synchronous within the request — audit write failure is a fatal error (do not silently drop). |
| Dashboard ↔ Turso | Read-only HTTP queries. No write path from Dashboard to governance tables. | Dashboard uses a separate DB user/token with SELECT-only permissions on audit_log, usage_log, hitl_queue. |

## Sources

- [LiteLLM Proxy Architecture — Life of a Request](https://docs.litellm.ai/docs/proxy/architecture) — reference for proxy pipeline stage ordering
- [LiteLLM Budget Routing](https://docs.litellm.ai/docs/proxy/provider_budget_routing) — provider-level budget patterns
- [Cloudflare Durable Objects — What Are Durable Objects?](https://developers.cloudflare.com/durable-objects/concepts/what-are-durable-objects/) — stateful session management
- [Cloudflare Workflows GA](https://blog.cloudflare.com/workflows-ga-production-ready-durable-execution/) — durable execution patterns
- [Cloudflare Human-in-the-Loop (Agents SDK)](https://developers.cloudflare.com/agents/concepts/human-in-the-loop/) — HITL suspend/resume pattern
- [Microsoft Agent Framework — Human-in-the-Loop Workflows](https://learn.microsoft.com/en-us/agent-framework/workflows/human-in-the-loop) — async approval pattern
- [Human-in-the-Loop Architecture — Agent Patterns](https://www.agentpatterns.tech/en/architecture/human-in-the-loop-architecture) — async HITL architectural patterns
- [EU AI Act Article 14 — Human Oversight](https://artificialintelligenceact.eu/article/14/) — compliance requirements for HITL
- [EU AI Act Article 12 — Logging](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-14) — tamper-resistant audit log requirements
- [Turso / libSQL — Change Data Capture](https://turso.tech/blog/introducing-change-data-capture-in-turso-sqlite-rewrite) — append-only audit pattern
- [Distributed SQLite: libSQL and Turso in 2026](https://dev.to/dataformathub/distributed-sqlite-why-libsql-and-turso-are-the-new-standard-in-2026-58fk) — stack validation
- [AI Agent Governance Architecture Paper (arxiv 2603.07191)](https://arxiv.org/html/2603.07191) — governance framework academic reference
- [Hardening Best Practices: Sandboxing, Least Privilege](https://skywork.ai/blog/ai-agent/hardening-best-practices-sandboxing-least-privilege-data-exfiltration/) — capability-based security patterns
- [SHIELDA: Structured Exception Handling in LLM Agents](https://arxiv.org/html/2508.07935v1) — error taxonomy reference
- [Partnership on AI — Real-Time Failure Detection in AI Agents](https://partnershiponai.org/wp-content/uploads/2025/09/agents-real-time-failure-detection.pdf) — stuck detection and bounded retry patterns
- [Building an AI Gateway (LLM Proxies/Routers)](https://medium.com/@adnanmasood/primer-on-ai-gateways-llm-proxies-routers-definition-usage-and-purpose-9b714d544f8c) — AI gateway architecture primer
- [Langfuse / Braintrust observability patterns](https://www.braintrust.dev/articles/best-ai-observability-tools-2026) — dashboard architecture reference
- [Token Usage with OpenAI Streams](https://openmeter.io/blog/token-usage-with-openai-streams-and-nextjs) — streaming token counting pattern

---
*Architecture research for: Agent Governance Platform (agentgov)*
*Researched: 2026-03-13*
