# Phase 2: HITL + Approval Channels — Research

**Researched:** 2026-03-14
**Domain:** Human-in-the-Loop approval queue — Cloudflare Workflows, Turso/Drizzle, Slack Block Kit, Hono middleware
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- HITL pause/resume uses Cloudflare Workflows `waitForEvent` (NOT Turso polling)
- Action classifier is a static risk tier table — pure function, no DB dependency
- Budget hold maintained during HITL suspend (TTL synchronized with hold expiry)
- SDK gets `HitlPending` error class parallel to existing `BudgetExceeded` pattern
- Approval channels: webhook (required in Phase 2) + Slack Block Kit (included in Phase 2)
- Proxy returns HTTP 202 + `{ approvalId }` to agent when HITL is triggered
- `appendAuditEvent` is reused for all HITL audit events (never throw pattern preserved)
- New DB tables: `hitl_queue` (Turso), risk_classification as static in-code config

### Claude's Discretion
- TTL default value for unanswered approvals (CONTEXT.md recommends reasonable value)
- Exact schema for `hitl_queue` columns beyond the minimum set in CONTEXT.md
- Error type/HTTP status for timeout transitions (recommend 408 or 422)
- Drizzle schema approach for hitl_queue vs separate migration file

### Deferred Ideas (OUT OF SCOPE)
- `approver_config` table (Phase 2.x — who gets notified per agent/risk tier)
- Durable Objects mitigation for Turso race conditions (mentioned as future, not Phase 2)
- Python SDK `HitlPending` (Phase 4)
- Multi-channel email/SMS (Phase 3+)
- MCP Elicitation (`elicitInput`) pattern — not relevant to this stack
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HITL-01 | Approval request routing to external channel (webhook) | Webhook POST pattern already established by `checkAndFireAlerts` in Phase 1; Slack Block Kit message delivery via `chat.postMessage` API |
| HITL-02 | Approve/deny response path that feeds decision back to agent context | Cloudflare Workflows `instance.sendEvent()` resumes paused `waitForEvent`; callback endpoint `POST /v1/hitl/:id/approve` or `deny` |
| HITL-03 | Async approval — agent pauses and resumes without blocking (non-blocking wait) | `step.waitForEvent()` with configurable timeout (1s–365d); instances in `waiting` state don't count toward concurrency limits |
| HITL-04 | Timeout and escalation handling for unanswered approval requests | `waitForEvent` throws on timeout → catch block writes `hitl_expired` to audit_log and transitions `hitl_queue` row to `expired`; default 24h |
| HITL-05 | Approval history / audit trail with actor, timestamp, and action taken | Existing `appendAuditEvent` receives new event types: `hitl_suspended`, `hitl_approved`, `hitl_denied`, `hitl_expired`; `hitl_queue` table persists full decision record |
</phase_requirements>

---

## Summary

Phase 2 introduces durable HITL approval suspension using Cloudflare Workflows `step.waitForEvent`, with approval state persisted to Turso before any channel notification is sent. The Cloudflare Workflows binding is added to `wrangler.jsonc` in the existing `@agentgov/proxy` package — no new Worker or service is needed. A `HitlWorkflow` class extends `WorkflowEntrypoint`, exported from the same `src/index.ts` alongside the Hono `app` default export.

The critical architecture decision (already locked in CONTEXT.md): Cloudflare Workflows is the HITL state machine, not a polling loop against Turso. Workflows instances in `waiting` state consume no CPU and do not count toward the 10,000 concurrent instance limit. `waitForEvent` supports timeouts from 1 second to 365 days; default is 24 hours. On timeout it throws, which the workflow catches to write `hitl_expired` and transition status.

Phase 1's `appendAuditEvent`, `checkAndFireAlerts` webhook POST, and `BudgetExceeded` SDK error pattern all have direct analogs in Phase 2. The planner should treat Phase 1 implementations as authoritative templates.

**Primary recommendation:** Add the Workflows binding to `wrangler.jsonc`, create `src/hitl/` module with classifier + queue + workflow class, add `hitl_queue` migration, add `HitlPending` SDK error, and add `POST /v1/hitl/:id/{approve,deny}` + Slack interactivity callback endpoint.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `cloudflare:workers` | built-in (Workers runtime) | `WorkflowEntrypoint`, `WorkflowStep`, `WorkflowEvent` | Native Cloudflare Workflows runtime types — no npm install needed |
| `hono` | `^4.12.7` (already installed) | New HITL routes on existing Hono app | Already the project's web framework |
| `drizzle-orm` | `^0.45.1` (already installed) | `hitl_queue` schema + queries | Already the project's ORM |
| `@libsql/client/web` | `^0.14.0` (already installed) | Turso HTTP access from Workers | Already in use — use same sub-path |
| `drizzle-kit` | already installed | Schema migration generation | Already the project's migration tool |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Web Crypto API | built-in | Slack HMAC-SHA256 signature verification | Used for `verifySlackRequest` middleware — same `crypto.subtle` already used in `sha256Hex` in audit writer |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Cloudflare Workflows `waitForEvent` | Turso polling loop (cron + SELECT WHERE status='pending') | Polling requires a cron Worker, burns CPU, adds latency, can't survive proxy restarts atomically. Workflows are the correct primitive. |
| Static risk tier table in code | `risk_classification` DB table | DB table adds migration complexity with no benefit — risk tiers change infrequently, code is the right place for deterministic policy |
| Slack Block Kit interactive buttons | Webhook-only approval | Slack is a v2 differentiator (HITL-09) but CONTEXT.md locks it into Phase 2 |

**Installation:** No new npm packages required. `cloudflare:workers` is a runtime built-in. All other dependencies are already installed.

---

## Architecture Patterns

### Recommended Project Structure

```
packages/proxy/src/
├── hitl/
│   ├── classifier.ts       # pure function: action → RiskTier
│   ├── queue.ts            # Turso: createTicket, getTicket, transitionStatus
│   ├── notify.ts           # webhook POST + Slack Block Kit postMessage
│   ├── workflow.ts         # HitlWorkflow extends WorkflowEntrypoint
│   └── hitl.test.ts        # unit tests for classifier + queue logic
├── db/
│   └── schema.ts           # ADD hitl_queue table definition here
└── index.ts                # ADD: export { HitlWorkflow } from './hitl/workflow'
                            #      ADD: POST /v1/hitl/:id/approve|deny routes
                            #      ADD: POST /v1/slack/callback route
packages/sdk-typescript/src/
├── errors.ts               # ADD HitlPending class (same pattern as BudgetExceeded)
└── interceptor.ts          # ADD 202 detection → throw HitlPending
migrations/
└── 0001_hitl_queue.sql     # New migration
```

### Pattern 1: Cloudflare Workflows waitForEvent (HITL Suspend/Resume)

**What:** The proxy creates a Workflow instance per HITL request. The workflow suspends at `step.waitForEvent`, persisting state durably. When approve/deny arrives via callback, `instance.sendEvent()` resumes the workflow.

**When to use:** Any HITL approval ticket. Single workflow instance per approval ticket.

```typescript
// Source: https://developers.cloudflare.com/workflows/build/events-and-parameters/
import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

interface HitlParams {
  ticketId: string;
  agentId: string;
  requestPayload: unknown;
  ttlSeconds: number;
}

interface ApprovalEvent {
  decision: 'approved' | 'denied';
  actor: string;
  reason?: string;
}

export class HitlWorkflow extends WorkflowEntrypoint<Env, HitlParams> {
  async run(event: WorkflowEvent<HitlParams>, step: WorkflowStep): Promise<void> {
    const { ticketId, agentId, requestPayload, ttlSeconds } = event.payload;

    // Step 1: Persist ticket BEFORE notifying channels
    await step.do('persist-ticket', async () => {
      // write hitl_queue row with status='pending'
    });

    // Step 2: Notify channels (webhook + Slack)
    await step.do('notify-channels', async () => {
      // POST to webhook URL, post Slack Block Kit message
    });

    // Step 3: Wait for human decision
    let approvalEvent: ApprovalEvent | null = null;
    try {
      const result = await step.waitForEvent<ApprovalEvent>('wait-for-approval', {
        type: 'hitl-decision',
        timeout: `${ttlSeconds} seconds`,
      });
      approvalEvent = result.payload as ApprovalEvent;
    } catch {
      // Timeout — auto-deny
      approvalEvent = { decision: 'denied', actor: 'system', reason: 'TTL expired' };
    }

    // Step 4: Transition ticket status + write audit_log
    await step.do('record-decision', async () => {
      // UPDATE hitl_queue SET status = approvalEvent.decision
      // appendAuditEvent(..., { eventType: 'hitl_approved' | 'hitl_denied' | 'hitl_expired' })
    });
  }
}
```

### Pattern 2: wrangler.jsonc Workflow Binding

**What:** Add `workflows` array to existing `wrangler.jsonc`. The same Worker that handles HTTP routes creates and sends events to Workflow instances.

```jsonc
// Source: https://developers.cloudflare.com/workflows/build/trigger-workflows/
{
  "name": "agentgov-proxy",
  "compatibility_date": "2025-01-01",
  "main": "src/index.ts",
  "workflows": [
    {
      "name": "agentgov-hitl",
      "binding": "HITL_WORKFLOW",
      "class_name": "HitlWorkflow"
    }
  ],
  "vars": { /* existing vars unchanged */ }
}
```

Also update `worker-configuration.d.ts` via `wrangler types` after editing `wrangler.jsonc`.

### Pattern 3: Callback Endpoint — Resume Paused Workflow

**What:** `POST /v1/hitl/:id/approve` and `POST /v1/hitl/:id/deny` call `instance.sendEvent()` to resume the waiting Workflow.

```typescript
// Source: https://developers.cloudflare.com/workflows/build/workers-api/
app.post('/v1/hitl/:id/approve', async (c) => {
  const ticketId = c.req.param('id');
  const { actor, reason } = await c.req.json();

  // Retrieve the Workflow instance by ticketId (used as instance ID)
  const instance = await c.env.HITL_WORKFLOW.get(ticketId);

  await instance.sendEvent({
    type: 'hitl-decision',
    payload: { decision: 'approved', actor, reason },
  });

  return c.json({ ok: true });
});
```

### Pattern 4: Slack Block Kit Interactive Message + Callback

**What:** Post a Block Kit message with Approve/Deny buttons. Slack POSTs `block_actions` payload to the interactivity request URL within 3 seconds. The handler must respond HTTP 200 immediately (acknowledgment), then call `instance.sendEvent()`.

```typescript
// Source: https://docs.slack.dev/interactivity/handling-user-interaction/
// POST https://slack.com/api/chat.postMessage
const slackMessage = {
  channel: channelId,
  blocks: [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Approval Required*\nAgent: ${agentId}\nAction: ${actionDescription}` },
    },
    {
      type: 'actions',
      block_id: `hitl-${ticketId}`,
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Approve' },
          action_id: 'approve',
          style: 'primary',
          value: ticketId,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Deny' },
          action_id: 'deny',
          style: 'danger',
          value: ticketId,
        },
      ],
    },
  ],
};
```

**Slack callback handler — MUST respond 200 within 3 seconds:**

```typescript
app.post('/v1/slack/callback', async (c) => {
  // 1. Verify Slack signature FIRST (uses raw body before any parsing)
  const rawBody = await c.req.text();
  const isValid = await verifySlackSignature(c.req.raw, rawBody, c.env.SLACK_SIGNING_SECRET);
  if (!isValid) return c.json({ error: 'invalid signature' }, 401);

  // 2. Parse form-encoded payload
  const params = new URLSearchParams(rawBody);
  const payload = JSON.parse(params.get('payload') ?? '{}');

  const action = payload.actions?.[0];
  const ticketId = action?.value;        // ticket ID was in button value
  const actionId = action?.action_id;    // 'approve' | 'deny'
  const actor = payload.user?.username;

  // 3. Acknowledge immediately (3s constraint)
  // Use c.executionCtx.waitUntil for the actual work
  const workPromise = (async () => {
    const instance = await c.env.HITL_WORKFLOW.get(ticketId);
    await instance.sendEvent({
      type: 'hitl-decision',
      payload: { decision: actionId === 'approve' ? 'approved' : 'denied', actor },
    });
  })();

  if (c.executionCtx?.waitUntil) {
    c.executionCtx.waitUntil(workPromise);
  }

  // Return 200 immediately to Slack
  return c.json({ ok: true });
});
```

### Pattern 5: Slack Signature Verification (Web Crypto API)

Uses `crypto.subtle` — same API already used in `sha256Hex` in `audit/writer.ts`.

```typescript
// Source: https://docs.slack.dev/authentication/verifying-requests-from-slack/
async function verifySlackSignature(
  request: Request,
  rawBody: string,
  signingSecret: string,
): Promise<boolean> {
  const timestamp = request.headers.get('x-slack-request-timestamp');
  const slackSig = request.headers.get('x-slack-signature');
  if (!timestamp || !slackSig) return false;

  // Replay attack prevention: reject if > 5 minutes old
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) return false;

  const baseString = `v0:${timestamp}:${rawBody}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(signingSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(baseString));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  const computed = `v0=${hex}`;

  // Constant-time comparison
  if (computed.length !== slackSig.length) return false;
  let result = 0;
  for (let i = 0; i < computed.length; i++) {
    result |= computed.charCodeAt(i) ^ slackSig.charCodeAt(i);
  }
  return result === 0;
}
```

### Pattern 6: HitlPending SDK Error (mirrors BudgetExceeded)

```typescript
// Pattern mirrors src/errors.ts BudgetExceeded exactly
export interface HitlPendingBody {
  error: {
    code: 'HITL_PENDING';
    message: string;
    approvalId: string;
    agentId: string;
    expiresAt: number; // Unix ms
  };
}

export class HitlPending extends Error {
  readonly code = 'HITL_PENDING' as const;
  readonly approvalId: string;
  readonly agentId: string;
  readonly expiresAt: number;
  constructor(message: string, body: HitlPendingBody) {
    super(message);
    this.name = 'HitlPending';
    this.approvalId = body.error.approvalId;
    this.agentId = body.error.agentId;
    this.expiresAt = body.error.expiresAt;
  }
}
```

Detection in interceptor: proxy returns HTTP 202 with `{ error: { code: 'HITL_PENDING', ... } }` → interceptor detects 202 + code → throws `HitlPending`.

### Anti-Patterns to Avoid

- **Notify before persist:** Always write the `hitl_queue` row to Turso BEFORE sending the Slack/webhook notification. If notification fails, the ticket still exists for retry. If DB write fails, no orphan notification.
- **Hold the HTTP thread open for approval:** Never await the approval decision synchronously on the HTTP request. Return 202 immediately; Workflow handles the wait.
- **Using `step.sleep()` for TTL:** Use `step.waitForEvent(... { timeout: "..." })` not `step.sleep()`. Sleep cannot be interrupted by an incoming event.
- **Sending large request payloads in Workflow state:** Each workflow step's state is capped at 1 MiB. Store request body in Turso `hitl_queue.request_payload` (TEXT), pass only `ticketId` in workflow params.
- **`event_type` with periods:** `waitForEvent` type parameter only supports letters, digits, `-`, and `_`. Use `hitl-decision` not `hitl.decision`.
- **Parsing Slack payload from raw body before verification:** Slack signature verification requires the exact raw body bytes. Read body as text first, verify, then parse.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Durable suspend/resume state machine | Custom polling loop with cron | Cloudflare Workflows `step.waitForEvent` | Cron polling can miss events, can't survive restarts atomically, burns CPU on sleeping instances |
| HMAC signature verification for Slack | Custom crypto implementation | `crypto.subtle` (Web Crypto API) | Already used in project; correct timing-safe comparison is subtle to implement |
| Slack message formatting | Raw JSON construction | Block Kit JSON structure (documented pattern) | Slack has strict schema; documented structure with `type`, `block_id`, `elements` is required |
| Approval decision persistence | In-memory Map or KV | Turso `hitl_queue` table | KV doesn't give querying; in-memory is lost on restart; need `WHERE status='pending'` for TTL sweeper |

**Key insight:** Cloudflare Workflows was purpose-built for durable HITL patterns. The `waitForEvent` API eliminates the most complex part of HITL (reliable pause/resume surviving restarts) with a single function call.

---

## Common Pitfalls

### Pitfall 1: Workflow instance ID collision
**What goes wrong:** Two HITL requests for the same ticket ID create a conflict if `env.HITL_WORKFLOW.create({ id: ticketId })` is called twice.
**Why it happens:** `create()` with a duplicate ID throws if the instance already exists.
**How to avoid:** Use `ticketId` (a UUID generated before calling `create`) as the workflow instance ID. UUIDs generated with `crypto.randomUUID()` have negligible collision probability.
**Warning signs:** 409 / conflict error from Workflows `create()`.

### Pitfall 2: Reading Slack payload body twice
**What goes wrong:** Calling `c.req.json()` or `c.req.text()` twice on a Request — the body stream is consumed on first read.
**Why it happens:** The Web `Request` body is a readable stream; it can only be read once.
**How to avoid:** Read body as text once (`rawBody = await c.req.text()`), verify signature against it, then `JSON.parse(new URLSearchParams(rawBody).get('payload') ?? '{}')`.
**Warning signs:** Empty body / JSON parse error on second read.

### Pitfall 3: Turso HTTP does not support interactive transactions
**What goes wrong:** Trying to wrap hitl_queue insert + budget_ledger update in a single atomic DB transaction.
**Why it happens:** `@libsql/client/web` (Turso HTTP) does not support interactive (multi-statement) transactions. This is already documented in Phase 1 `ledger.ts` comments.
**How to avoid:** Accept the same documented race condition as Phase 1. The Workflow's step-level persistence (Cloudflare's side) is durable even if the Turso write of the final status races. Keep the two writes sequential and document them.
**Warning signs:** "interactive transactions not supported" error from libsql.

### Pitfall 4: waitForEvent timeout throws, not returns null
**What goes wrong:** Expecting `waitForEvent` to return `null` or `undefined` on timeout.
**Why it happens:** The API throws an exception on timeout — it does NOT return a sentinel value.
**How to avoid:** Always wrap `step.waitForEvent` in `try/catch`. The catch block is the TTL-expired code path.
**Warning signs:** Unhandled promise rejection in workflow; workflow transitions to `errored` state instead of `expired`.

### Pitfall 5: Slack 3-second response window
**What goes wrong:** Performing DB writes or API calls synchronously before returning 200 to Slack; Slack shows the user an error.
**Why it happens:** Slack requires HTTP 200 within 3 seconds of the interaction payload.
**How to avoid:** Return `c.json({ ok: true })` immediately; push actual work to `c.executionCtx.waitUntil()` (same pattern as `checkAndFireAlerts` in Phase 1).
**Warning signs:** Slack users see "This app is not responding" or timeout errors.

### Pitfall 6: Workflow state retention limit (30 days on Paid plan)
**What goes wrong:** A HITL ticket that sits pending for more than 30 days has its Workflow state purged.
**Why it happens:** Cloudflare Workflows retains state for 3 days (Free) or 30 days (Paid) after instance completion.
**How to avoid:** Turso `hitl_queue` is the authoritative persistent record — Workflow state is just the live execution vehicle. If Workflow state is purged, the `hitl_queue` row survives. Set max TTL well under 30 days (recommend 72h default).
**Warning signs:** Workflow instance not found after long idle period.

### Pitfall 7: waitForEvent type parameter restrictions
**What goes wrong:** Using a type string with periods (e.g., `hitl.decision`) causes a `workflow.invalid_event_type` error.
**Why it happens:** `waitForEvent` type only allows letters, digits, `-`, and `_`.
**How to avoid:** Use `hitl-decision` (hyphen not period).
**Warning signs:** `workflow.invalid_event_type` error at runtime.

### Pitfall 8: Workflow binding requires `wrangler types` regeneration
**What goes wrong:** TypeScript errors on `c.env.HITL_WORKFLOW` because `worker-configuration.d.ts` is stale.
**Why it happens:** `wrangler types` must be re-run after any change to `wrangler.jsonc` bindings.
**How to avoid:** Run `pnpm --filter @agentgov/proxy types` (or `wrangler types`) after editing `wrangler.jsonc`.
**Warning signs:** TypeScript: `Property 'HITL_WORKFLOW' does not exist on type 'Env'`.

---

## Code Examples

### hitl_queue Drizzle Schema

```typescript
// Source: drizzle-orm/sqlite-core — mirrors existing schema.ts patterns
import { integer, text, sqliteTable } from 'drizzle-orm/sqlite-core';

export const hitlQueue = sqliteTable('hitl_queue', {
  id: text('id').primaryKey(),                      // UUID, also Workflow instance ID
  agentId: text('agent_id').notNull(),
  status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'denied' | 'expired'
  riskTier: text('risk_tier').notNull(),            // 'reversible' | 'semi-reversible' | 'irreversible' | 'external'
  actionName: text('action_name').notNull(),        // classifier input e.g. 'tool_call:send_email'
  requestPayload: text('request_payload'),          // JSON of the full request (stored here, NOT in Workflow state)
  approver: text('approver'),                       // actor who approved/denied; null if pending/expired
  approverReason: text('approver_reason'),          // optional human note
  holdId: text('hold_id'),                          // FK to holds.id — budget hold maintained during HITL
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),       // ms; TTL for auto-deny
  decidedAt: integer('decided_at'),                 // null until decision
});
```

### Action Classifier (pure function)

```typescript
// classifier.ts — no DB dependency, pure function
export type RiskTier = 'reversible' | 'semi-reversible' | 'irreversible' | 'external';
export type HitlRequired = { required: true; tier: RiskTier } | { required: false };

// Static risk tier table — this is the ONLY place tier policy lives
const RISK_TABLE: Record<string, RiskTier> = {
  // External I/O — always requires approval
  'tool_call:send_email': 'external',
  'tool_call:post_slack_message': 'external',
  'tool_call:http_post': 'external',
  // Irreversible mutations
  'tool_call:delete_file': 'irreversible',
  'tool_call:drop_table': 'irreversible',
  // Semi-reversible
  'tool_call:update_record': 'semi-reversible',
  // Reversible reads — never requires approval
  'tool_call:read_file': 'reversible',
  'tool_call:list_files': 'reversible',
};

const REQUIRES_HITL: Set<RiskTier> = new Set(['external', 'irreversible', 'semi-reversible']);

export function classifyAction(actionName: string): HitlRequired {
  const tier = RISK_TABLE[actionName];
  if (!tier) return { required: false }; // unknown action — allow through (open by default for non-classified)
  if (REQUIRES_HITL.has(tier)) return { required: true, tier };
  return { required: false };
}
```

### Migration 0001_hitl_queue.sql

```sql
-- Generated by drizzle-kit, customized for hitl_queue
CREATE TABLE `hitl_queue` (
  `id` text PRIMARY KEY NOT NULL,
  `agent_id` text NOT NULL,
  `status` text NOT NULL DEFAULT 'pending',
  `risk_tier` text NOT NULL,
  `action_name` text NOT NULL,
  `request_payload` text,
  `approver` text,
  `approver_reason` text,
  `hold_id` text,
  `created_at` integer NOT NULL,
  `expires_at` integer NOT NULL,
  `decided_at` integer
);
--> statement-breakpoint
CREATE INDEX `hitl_queue_status_idx` ON `hitl_queue` (`status`);
--> statement-breakpoint
CREATE INDEX `hitl_queue_agent_idx` ON `hitl_queue` (`agent_id`);
```

### New AuditEventType values (types.ts extension)

```typescript
// Add to existing AuditEventType union in types.ts
export type AuditEventType =
  | 'budget_hold'
  | 'budget_settle'
  | 'budget_blocked'
  | 'request_forwarded'
  | 'alert_fired'
  | 'hitl_suspended'    // NEW
  | 'hitl_approved'     // NEW
  | 'hitl_denied'       // NEW
  | 'hitl_expired';     // NEW
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Polling loop + cron for async waits | `step.waitForEvent` with up to 365-day timeout | Cloudflare Workflows GA (April 2025) | Zero-CPU waiting; surviving restarts natively |
| Durable Objects for per-entity state machines | Workflows for multi-step flows, DOs for per-entity serialization | 2024 onward | Workflows are simpler for linear approval flows |
| Step timeout = CPU timeout | Wall clock time per step is now unlimited | Jan 2025 changelog | Long-running HITL steps are safe |

**Deprecated/outdated:**
- Turso polling for HITL state (no longer necessary given Workflows `waitForEvent`)
- Manual state machine in Worker code (replaced by Workflows durable execution)

---

## Open Questions

1. **Action classification granularity: tool_call name vs request structure**
   - What we know: CONTEXT.md says "tool_call名のみか、requestの構造も見るか" is open
   - What's unclear: Whether the classifier should inspect `messages[].tool_calls[].function.name` parsed from the chat request body, or just a request-level annotation
   - Recommendation: Phase 2 — classify on tool_call function name extracted from the request body (deterministic, no LLM). Phase 3+ add structural inspection if needed.

2. **SDK polling vs push notification for HitlPending resolution**
   - What we know: The agent gets a 202 + approvalId; SDK throws `HitlPending`. CONTEXT.md leaves the agent-side resolution strategy open.
   - What's unclear: Should the SDK expose a `waitForApproval(approvalId)` that polls `GET /v1/hitl/:id/status`, or should the caller catch `HitlPending` and retry later?
   - Recommendation: Phase 2 — catch-and-retry by the agent (minimal SDK complexity). Expose `GET /v1/hitl/:id/status` endpoint for polling. SSE/webhook push to the agent is Phase 3+.

3. **Default TTL value**
   - What we know: Cloudflare Workflows supports 1s–365d; state retention cap is 30 days (Paid plan)
   - Recommendation: Default to 72 hours (259200 seconds). Configurable via `AGENTGOV_HITL_TTL_SECONDS` env var. Well under the 30-day state retention limit.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest v2 (pinned — see Phase 1 decision) |
| Config file | `vitest.config.ts` (Workers pool) + `vitest.config.node.ts` (Node.js) |
| Quick run command | `pnpm --filter @agentgov/proxy test:node` |
| Full suite command | `pnpm --filter @agentgov/proxy test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HITL-01 | `notify.ts` posts webhook on new ticket | unit | `pnpm --filter @agentgov/proxy test:node` (hitl.test.ts) | Wave 0 |
| HITL-01 | `notify.ts` posts Slack Block Kit message | unit (mock fetch) | `pnpm --filter @agentgov/proxy test:node` | Wave 0 |
| HITL-02 | `POST /v1/hitl/:id/approve` calls `sendEvent` | integration (Workers pool) | `pnpm --filter @agentgov/proxy test:workers` | Wave 0 |
| HITL-02 | `POST /v1/hitl/:id/deny` calls `sendEvent` | integration (Workers pool) | `pnpm --filter @agentgov/proxy test:workers` | Wave 0 |
| HITL-03 | `classifyAction` returns correct tier for known actions | unit | `pnpm --filter @agentgov/proxy test:node` | Wave 0 |
| HITL-03 | Proxy returns 202 + approvalId when HITL triggered | integration | `pnpm --filter @agentgov/proxy test:workers` | Wave 0 |
| HITL-04 | TTL timeout path in workflow transitions to `expired` | unit (try/catch test) | `pnpm --filter @agentgov/proxy test:node` | Wave 0 |
| HITL-05 | `appendAuditEvent` called with `hitl_suspended` | unit (vi.mock) | `pnpm --filter @agentgov/proxy test:node` | Wave 0 |
| HITL-05 | `appendAuditEvent` called with `hitl_approved` | unit (vi.mock) | `pnpm --filter @agentgov/proxy test:node` | Wave 0 |
| HITL-05 | `appendAuditEvent` called with `hitl_denied` | unit (vi.mock) | `pnpm --filter @agentgov/proxy test:node` | Wave 0 |
| HITL-05 | `appendAuditEvent` called with `hitl_expired` | unit (vi.mock) | `pnpm --filter @agentgov/proxy test:node` | Wave 0 |
| SDK | `HitlPending` thrown on 202 + HITL_PENDING code | unit | `pnpm --filter @agentgov/sdk-typescript test` | Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter @agentgov/proxy test:node`
- **Per wave merge:** `pnpm --filter @agentgov/proxy test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/proxy/src/hitl/hitl.test.ts` — covers HITL-01 through HITL-05
- [ ] `packages/sdk-typescript/src/hitl.test.ts` (or extend wrap.test.ts) — covers SDK HitlPending detection
- [ ] `packages/proxy/migrations/0001_hitl_queue.sql` — schema migration

---

## Sources

### Primary (HIGH confidence)

- [developers.cloudflare.com/workflows/build/events-and-parameters/](https://developers.cloudflare.com/workflows/build/events-and-parameters/) — `waitForEvent` API, timeout range (1s–365d), default 24h, throw-on-timeout behavior, `sendEvent` resume
- [developers.cloudflare.com/workflows/reference/limits/](https://developers.cloudflare.com/workflows/reference/limits/) — Full limits table: 10,000 concurrent instances (Paid), 1MiB state per step, 30-day state retention (Paid), waiting instances excluded from concurrency limits
- [developers.cloudflare.com/workflows/build/trigger-workflows/](https://developers.cloudflare.com/workflows/build/trigger-workflows/) — `wrangler.jsonc` binding syntax, `env.MY_WORKFLOW.create()`, `env.MY_WORKFLOW.get()`, `instance.sendEvent()`
- [developers.cloudflare.com/workflows/get-started/guide/](https://developers.cloudflare.com/workflows/get-started/guide/) — `WorkflowEntrypoint` class, `run(event, step)` pattern, dual export from `src/index.ts`
- [docs.slack.dev/interactivity/handling-user-interaction/](https://docs.slack.dev/interactivity/handling-user-interaction/) — 3-second HTTP 200 requirement, `response_url` usage, `block_actions` payload structure
- [docs.slack.dev/authentication/verifying-requests-from-slack/](https://docs.slack.dev/authentication/verifying-requests-from-slack/) — HMAC-SHA256 with `X-Slack-Signature`, base string format `v0:{ts}:{body}`, 5-minute replay window

### Secondary (MEDIUM confidence)

- [developers.cloudflare.com/agents/concepts/human-in-the-loop/](https://developers.cloudflare.com/agents/concepts/human-in-the-loop/) — Cloudflare's own HITL pattern documentation; confirms Workflows as recommended approach for durable approval flows
- [developers.cloudflare.com/workflows/examples/wait-for-event/](https://developers.cloudflare.com/workflows/examples/wait-for-event/) — Official HITL image-tagging example using `step.waitForEvent`; confirms `payload` typing pattern
- [docs.slack.dev/reference/interaction-payloads/block_actions-payload/](https://docs.slack.dev/reference/interaction-payloads/block_actions-payload/) — `block_actions` payload: `actions[0].action_id`, `actions[0].value`, `user.username`, `response_url`

### Tertiary (LOW confidence)

- None. All critical claims are sourced from official Cloudflare or Slack documentation.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in project; Workflows is official Cloudflare primitive verified against GA docs
- Architecture: HIGH — `waitForEvent` pattern, wrangler binding syntax, Slack callback pattern all verified from official docs
- Pitfalls: HIGH — TTL throw behavior, body-stream consumption, transaction limitation all verified from official docs or existing codebase comments

**Research date:** 2026-03-14
**Valid until:** 2026-06-14 (90 days — Cloudflare Workflows is GA, stable API; Slack Block Kit API is stable)
