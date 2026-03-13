---
phase: 02-hitl-approval-channels
plan: "01"
subsystem: hitl
tags: [cloudflare-workflows, hitl, drizzle-orm, turso, slack-block-kit, sdk]

requires:
  - phase: 01-budget-engine-proxy-foundation
    provides: "appendAuditEvent, DbClient, AuditEventType, BudgetExceeded SDK pattern, fetch+POST webhook pattern"

provides:
  - "classifyAction pure function with static RISK_TABLE (8 action entries)"
  - "hitlQueue Drizzle schema table + 0001_hitl_queue.sql migration"
  - "createTicket/getTicket/transitionStatus Turso CRUD in queue.ts"
  - "notifyChannels webhook POST + Slack Block Kit non-throwing notify"
  - "HitlWorkflow extends WorkflowEntrypoint with step.waitForEvent try/catch TTL"
  - "HitlPending SDK error class parallel to BudgetExceeded"
  - "202 detection in createAgentgovFetch interceptor"
  - "4 new AuditEventType values: hitl_suspended, hitl_approved, hitl_denied, hitl_expired"
  - "HITL_WORKFLOW Workflow binding in wrangler.jsonc + worker-configuration.d.ts"

affects:
  - 02-hitl-approval-channels/02-02 (HTTP routes for approve/deny/Slack callback)

tech-stack:
  added: []
  patterns:
    - "persist-before-notify: hitl_queue row written to Turso BEFORE webhook/Slack notification"
    - "WorkflowEntrypoint: DB client created fresh inside each step.do (connections don't survive step boundaries)"
    - "waitForEvent try/catch: TTL expiry is caught as exception, auto-denied with actor=system"
    - "hitl-decision event type: hyphens required, not periods (Cloudflare Workflows constraint)"
    - "clone pattern for 202 detection: response.clone() before JSON.parse, same as 429 BudgetExceeded"

key-files:
  created:
    - packages/proxy/src/hitl/classifier.ts
    - packages/proxy/src/hitl/queue.ts
    - packages/proxy/src/hitl/notify.ts
    - packages/proxy/src/hitl/workflow.ts
    - packages/proxy/src/hitl/hitl.test.ts
    - packages/proxy/migrations/0001_hitl_queue.sql
  modified:
    - packages/proxy/src/types.ts
    - packages/proxy/src/db/schema.ts
    - packages/proxy/wrangler.jsonc
    - packages/proxy/worker-configuration.d.ts
    - packages/proxy/vitest.config.node.ts
    - packages/proxy/vitest.config.ts
    - packages/sdk-typescript/src/errors.ts
    - packages/sdk-typescript/src/interceptor.ts
    - packages/sdk-typescript/src/index.ts

key-decisions:
  - "waitForEvent type='hitl-decision' (hyphens, not periods) — Cloudflare Workflows rejects dots in event types"
  - "DB client created inside each step.do callback — Workflows serialize state between steps, connections don't survive"
  - "HITL_WORKFLOW Workflow binding must be exported from src/index.ts alongside Hono app for Cloudflare to wire it"
  - "Default TTL 72h (259200s) — well under 30-day Workflows state retention limit on Paid plan"
  - "Unknown actions return required:false (open by default) — fail-open for unclassified actions prevents over-blocking"

patterns-established:
  - "persist-before-notify: Turso write before channel notification to prevent orphan notifications"
  - "never-throw pattern for notifyChannels: mirrors appendAuditEvent error handling"

requirements-completed:
  - HITL-01
  - HITL-03
  - HITL-04
  - HITL-05

duration: 6min
completed: 2026-03-13
---

# Phase 2 Plan 01: HITL Queue Infrastructure Summary

**Cloudflare Workflows HITL state machine — action classifier, hitl_queue schema, durable waitForEvent suspend/resume, webhook+Slack Block Kit notifications, SDK HitlPending error on 202**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-13T21:56:48Z
- **Completed:** 2026-03-13T22:03:05Z
- **Tasks:** 2 (4 commits using TDD RED/GREEN)
- **Files modified:** 14

## Accomplishments

- HITL queue infrastructure — classifier, schema, CRUD, notifications, Workflows state machine — all built and tested
- Cloudflare Workflows binding added to wrangler.jsonc; worker-configuration.d.ts regenerated with HITL_WORKFLOW in Env
- SDK HitlPending error class with 202 detection in createAgentgovFetch (mirrors BudgetExceeded pattern exactly)
- 73 proxy tests + 26 SDK tests all passing; 4 new HITL AuditEventType values in types.ts

## Task Commits

Each task was committed atomically using TDD (RED then GREEN):

1. **Task 1 RED: HITL test suite** - `bc9d5cf` (test)
2. **Task 1 GREEN: HITL schema, classifier, queue, notify, workflow** - `41613bd` (feat)
3. **Task 2 RED: SDK HitlPending tests** - `e631e4e` (test)
4. **Task 2 GREEN: SDK HitlPending + 202 detection** - `4c35f25` (feat)

_Note: TDD tasks have two commits each (test → feat)_

## Files Created/Modified

- `packages/proxy/src/hitl/classifier.ts` - Pure classifyAction() with static RISK_TABLE, open-by-default for unknowns
- `packages/proxy/src/hitl/queue.ts` - createTicket/getTicket/transitionStatus Drizzle CRUD on hitlQueue table
- `packages/proxy/src/hitl/notify.ts` - notifyChannels(): webhook POST + Slack Block Kit, never-throw pattern
- `packages/proxy/src/hitl/workflow.ts` - HitlWorkflow extends WorkflowEntrypoint, step.waitForEvent with try/catch TTL
- `packages/proxy/src/hitl/hitl.test.ts` - 24 unit tests covering all HITL modules
- `packages/proxy/migrations/0001_hitl_queue.sql` - CREATE TABLE hitl_queue + status/agent indexes
- `packages/proxy/src/types.ts` - Added hitl_suspended/approved/denied/expired to AuditEventType union
- `packages/proxy/src/db/schema.ts` - Added hitlQueue table (11 columns) alongside existing tables
- `packages/proxy/wrangler.jsonc` - Workflows binding + HITL env vars (TTL, webhook, Slack)
- `packages/proxy/worker-configuration.d.ts` - Regenerated; HITL_WORKFLOW: Workflow in Env
- `packages/proxy/vitest.config.node.ts` - Added hitl/hitl.test.ts to Node.js test includes
- `packages/proxy/vitest.config.ts` - Excluded hitl/hitl.test.ts from Workers pool
- `packages/sdk-typescript/src/errors.ts` - HitlPendingBody interface + HitlPending class
- `packages/sdk-typescript/src/interceptor.ts` - 202 detection with clone pattern, throws HitlPending
- `packages/sdk-typescript/src/index.ts` - Re-exports HitlPending and HitlPendingBody

## Decisions Made

- `waitForEvent` type uses `'hitl-decision'` (hyphens not periods) — Cloudflare Workflows enforces this constraint at runtime
- DB client created fresh inside each `step.do` callback — Workflows serializes state between steps; connections don't survive
- Unknown actions return `{ required: false }` (open by default) — prevents over-blocking unclassified tool calls
- Default TTL 72h (259200s) configurable via `AGENTGOV_HITL_TTL_SECONDS` env var
- `HitlWorkflow` class exported from `workflow.ts` — Plan 02 will add the `export { HitlWorkflow }` to `src/index.ts`

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- Pre-existing TypeScript errors in `src/audit/writer.test.ts` (TS2352 cast errors in test mocks) — confirmed pre-existing before this plan, out of scope, logged as deferred item.

## User Setup Required

None — no external service configuration required for the infrastructure layer built here. Slack/webhook credentials are optional and configured via env vars documented in wrangler.jsonc.

## Next Phase Readiness

- Plan 02 (HTTP routes) can now wire `POST /v1/hitl/:id/approve|deny` and `POST /v1/slack/callback` routes
- `HitlWorkflow` must be exported from `packages/proxy/src/index.ts` in Plan 02 (required for Cloudflare to wire the Workflow binding)
- `HITL_WORKFLOW.create({ id: ticketId })` call in the proxy route handler will use the ticketId from `createTicket()`

---
*Phase: 02-hitl-approval-channels*
*Completed: 2026-03-13*
