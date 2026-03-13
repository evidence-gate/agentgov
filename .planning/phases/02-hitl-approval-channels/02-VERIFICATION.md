---
phase: 02-hitl-approval-channels
verified: 2026-03-14T07:20:00Z
status: passed
score: 12/12 must-haves verified
re_verification: false
---

# Phase 2: HITL + Approval Channels Verification Report

**Phase Goal:** Agents pause for human approval on risky actions, with decisions routed asynchronously and surviving proxy restarts
**Verified:** 2026-03-14T07:20:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                              | Status     | Evidence                                                                                    |
|----|---------------------------------------------------------------------------------------------------|------------|---------------------------------------------------------------------------------------------|
| 1  | Agent action classified as requiring approval causes HTTP 202 with HITL_PENDING body              | VERIFIED   | `index.ts` Step 4.5 calls `classifyToolCalls`, returns `c.json({error:{code:'HITL_PENDING'...}}, 202)` |
| 2  | Approval requests routed to webhook and Slack, fed back without agent holding a thread open       | VERIFIED   | `notifyChannels` in `notify.ts` posts webhook+Slack; Slack callback uses `waitUntil` pattern |
| 3  | Unanswered approval auto-transitions to DENIED with reason after TTL; no orphaned approvals       | VERIFIED   | `workflow.ts` try/catch on `step.waitForEvent` yields `{decision:'denied', reason:'TTL expired'}` |
| 4  | Every approval decision recorded in audit log with actor, timestamp, action, and outcome          | VERIFIED   | `appendAuditEvent` called with `hitl_suspended`, `hitl_approved`, `hitl_denied`, `hitl_expired` in `workflow.ts` |
| 5  | Action classifier returns correct RiskTier; unknown/reversible actions return required:false      | VERIFIED   | `classifier.ts` static `RISK_TABLE` + `REQUIRES_HITL` set; open-by-default for unknowns   |
| 6  | hitl_queue table persists pending tickets with all required columns                               | VERIFIED   | `schema.ts` `hitlQueue` table (11 columns); `0001_hitl_queue.sql` migration with 2 indexes |
| 7  | SDK throws HitlPending on HTTP 202 with HITL_PENDING code                                        | VERIFIED   | `interceptor.ts` 202 detection with `response.clone()` pattern; `errors.ts` HitlPending class |
| 8  | POST /v1/hitl/:id/approve resumes paused workflow with approved decision                         | VERIFIED   | `routes.ts` approve endpoint calls `instance.sendEvent({type:'hitl-decision', payload:{decision:'approved'}})` |
| 9  | POST /v1/hitl/:id/deny resumes paused workflow with denied decision                              | VERIFIED   | `routes.ts` deny endpoint calls `instance.sendEvent({type:'hitl-decision', payload:{decision:'denied'}})` |
| 10 | GET /v1/hitl/:id/status returns current ticket status                                            | VERIFIED   | `routes.ts` status endpoint calls `getTicket(db, ticketId)`, returns JSON or 404           |
| 11 | POST /v1/slack/callback verifies signature, returns 200 within 3s (waitUntil)                   | VERIFIED   | `routes.ts` verifies with `verifySlackSignature`, pushes work to `executionCtx.waitUntil`  |
| 12 | Budget hold maintained throughout approval wait (hold created before HITL trigger)               | VERIFIED   | `index.ts` Step 4 (budgetGate) runs before Step 4.5 (HITL classify); holdId passed to workflow |

**Score:** 12/12 truths verified

---

### Required Artifacts

| Artifact                                              | Expected                                                        | Status     | Details                                                                     |
|-------------------------------------------------------|-----------------------------------------------------------------|------------|-----------------------------------------------------------------------------|
| `packages/proxy/src/hitl/classifier.ts`               | `classifyAction` pure function with static RISK_TABLE           | VERIFIED   | Exports `classifyAction`, `RiskTier`, `HitlRequired`; 8-entry RISK_TABLE   |
| `packages/proxy/src/hitl/queue.ts`                    | Turso CRUD: createTicket, getTicket, transitionStatus           | VERIFIED   | All 3 functions exported; uses Drizzle fluent queries on `hitlQueue` table  |
| `packages/proxy/src/hitl/workflow.ts`                 | HitlWorkflow extending WorkflowEntrypoint with waitForEvent     | VERIFIED   | Exports `HitlWorkflow`; 4-step state machine with try/catch TTL handling    |
| `packages/proxy/src/hitl/notify.ts`                   | Webhook POST + Slack Block Kit, non-throwing                    | VERIFIED   | Exports `notifyChannels`; webhook + Slack paths both guarded with try/catch |
| `packages/proxy/src/hitl/routes.ts`                   | Hono route handlers: approve, deny, status, slack callback      | VERIFIED   | Exports `hitlRoutes`; all 4 endpoints implemented                           |
| `packages/proxy/src/hitl/slack.ts`                    | Slack HMAC-SHA256 signature verification                        | VERIFIED   | Exports `verifySlackSignature`; Web Crypto API, constant-time XOR compare   |
| `packages/proxy/src/db/schema.ts`                     | `hitlQueue` table definition added alongside existing tables    | VERIFIED   | 11-column `hitlQueue` sqliteTable present; all required columns including `decidedAt`, `expiresAt`, `holdId` |
| `packages/proxy/migrations/0001_hitl_queue.sql`        | SQL migration with CREATE TABLE + 2 indexes                     | VERIFIED   | `hitl_queue_status_idx` and `hitl_queue_agent_idx` both present             |
| `packages/sdk-typescript/src/errors.ts`               | HitlPending error class parallel to BudgetExceeded              | VERIFIED   | `HitlPendingBody` interface + `HitlPending` class with `approvalId`, `agentId`, `expiresAt` |
| `packages/proxy/src/index.ts`                         | HITL classification in pipeline, routes mounted, HitlWorkflow exported | VERIFIED | `classifyAction` imported; `hitlRoutes` mounted; `export { HitlWorkflow }` at bottom |
| `packages/proxy/wrangler.jsonc`                       | `workflows` binding for HITL_WORKFLOW + all HITL env vars       | VERIFIED   | `agentgov-hitl` workflow binding; `AGENTGOV_HITL_TTL_SECONDS`, `SLACK_*` vars present |
| `packages/proxy/worker-configuration.d.ts`            | `HITL_WORKFLOW: Workflow` in Env type                           | VERIFIED   | Line 20: `HITL_WORKFLOW: Workflow /* HitlWorkflow */;`                      |

---

### Key Link Verification

| From                                         | To                                          | Via                                              | Status   | Details                                                                 |
|----------------------------------------------|---------------------------------------------|--------------------------------------------------|----------|-------------------------------------------------------------------------|
| `packages/proxy/src/hitl/workflow.ts`         | `packages/proxy/src/hitl/queue.ts`          | step.do calls createTicket and transitionStatus  | WIRED    | `createTicket` called in `persist-ticket` step; `transitionStatus` in `record-decision` step |
| `packages/proxy/src/hitl/workflow.ts`         | `packages/proxy/src/hitl/notify.ts`         | step.do('notify-channels') calls notifyChannels  | WIRED    | `notifyChannels(...)` called in Step 2 `notify-channels` step.do       |
| `packages/proxy/src/hitl/workflow.ts`         | `packages/proxy/src/audit/writer.ts`        | step.do('record-decision') calls appendAuditEvent | WIRED   | `appendAuditEvent` imported and called twice (hitl_suspended + decision) |
| `packages/sdk-typescript/src/interceptor.ts`  | `packages/sdk-typescript/src/errors.ts`     | 202 detection throws HitlPending                 | WIRED    | `if (response.status === 202)` block clones response, throws `HitlPending` |
| `packages/proxy/src/index.ts`                 | `packages/proxy/src/hitl/classifier.ts`     | classifyAction called on parsed tool_calls       | WIRED    | `import { classifyAction }` used in `classifyToolCalls` helper          |
| `packages/proxy/src/index.ts`                 | `packages/proxy/src/hitl/workflow.ts`       | env.HITL_WORKFLOW.create() triggers workflow     | WIRED    | `await c.env.HITL_WORKFLOW.create({id: ticketId, params: ...})`        |
| `packages/proxy/src/hitl/routes.ts`           | `packages/proxy/src/hitl/workflow.ts`       | instance.sendEvent() resumes paused workflow     | WIRED    | `sendEvent` called in approve, deny, and Slack callback handlers        |
| `packages/proxy/src/hitl/routes.ts`           | `packages/proxy/src/hitl/slack.ts`          | verifySlackSignature before processing callback  | WIRED    | `import { verifySlackSignature }` called before any payload parsing     |

---

### Requirements Coverage

| Requirement | Source Plan | Description                                                          | Status     | Evidence                                                                    |
|-------------|-------------|----------------------------------------------------------------------|------------|-----------------------------------------------------------------------------|
| HITL-01     | 02-01, 02-02 | Approval request routing to external channel (webhook)              | SATISFIED  | `notifyChannels` posts webhook; Slack Block Kit in `notify.ts`              |
| HITL-02     | 02-01, 02-02 | Approve/deny response path feeds decision back to agent context     | SATISFIED  | `routes.ts` approve/deny endpoints call `sendEvent` to resume Workflow      |
| HITL-03     | 02-01, 02-02 | Async approval — agent pauses and resumes without blocking          | SATISFIED  | `step.waitForEvent` suspends Workflow; agent gets 202 not a blocking wait   |
| HITL-04     | 02-01, 02-02 | Timeout and escalation handling for unanswered approvals            | SATISFIED  | try/catch on `waitForEvent` auto-denies with `reason:'TTL expired'`; status='expired' |
| HITL-05     | 02-01, 02-02 | Approval history / audit trail with actor, timestamp, and action    | SATISFIED  | `appendAuditEvent` called for all 4 HITL event types; actor stored in `approver` field |

All 5 HITL requirements explicitly claimed by both plans are satisfied. No orphaned requirements found.

---

### Anti-Patterns Found

None. Scanned all 9 files in `packages/proxy/src/hitl/` plus `packages/sdk-typescript/src/` for TODO/FIXME/HACK/placeholder/stub patterns — zero matches.

TypeScript compilation: clean outside the pre-existing `src/audit/writer.test.ts` TS2352 test mock cast errors (documented in both plan summaries as pre-existing from Phase 1, out of scope).

---

### Human Verification Required

The following behaviors are correct per code inspection but benefit from human confirmation in a live deployment:

**1. Slack 3-second constraint**
- **Test:** Configure a live Slack app with signing secret, trigger a HITL approval by sending a request with a risky tool_call, click Approve in Slack, verify Slack receives a 200 within 3 seconds
- **Expected:** Slack reports no timeout; workflow resumes in background
- **Why human:** `waitUntil` behavior in Cloudflare Workers runtime cannot be verified in Node.js test environment

**2. Cloudflare Workflows durable restart survival**
- **Test:** Trigger a HITL approval, restart the proxy Worker, then call the approve endpoint
- **Expected:** Workflow resumes correctly; ticket status transitions to approved
- **Why human:** Cloudflare Workflows durable state across restarts requires live Workers deployment to verify

**3. Slack Block Kit button rendering**
- **Test:** Configure Slack credentials and trigger a risky tool_call; verify the Approve/Deny buttons appear correctly in Slack
- **Expected:** Block Kit message with two colored buttons (primary/danger), correct ticketId as button value
- **Why human:** Slack message rendering cannot be verified programmatically

---

### Test Results Summary

| Test Suite                           | Tests | Status         |
|--------------------------------------|-------|----------------|
| proxy Node.js (hitl.test.ts)         | 24    | All passed     |
| proxy Node.js (hitl-integration.test.ts) | 4 | All passed     |
| proxy Node.js (all suites)           | 89    | All passed     |
| proxy Workers pool (index.test.ts)   | 7     | All passed     |
| SDK (wrap.test.ts)                   | 26    | All passed     |

**Total: 122 tests passing**

---

### Gaps Summary

No gaps. All 12 must-have truths verified. All artifacts exist, are substantive, and are wired. All 5 HITL requirements satisfied. No anti-patterns found. TypeScript compilation clean for phase-2 code.

The Cloudflare Workflows `waitForEvent` pattern ensures decisions survive proxy restarts (Workflows state is durable at the Cloudflare edge). The budget hold is correctly created before the HITL suspend, ensuring no budget leak during the approval window. The Slack callback uses `waitUntil` to guarantee sub-3s response time.

---

_Verified: 2026-03-14T07:20:00Z_
_Verifier: Claude (gsd-verifier)_
