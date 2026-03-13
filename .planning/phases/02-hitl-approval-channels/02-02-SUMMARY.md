---
phase: 02-hitl-approval-channels
plan: "02"
subsystem: hitl
tags: [cloudflare-workflows, hitl, slack-block-kit, hono, web-crypto, hmac-sha256]

requires:
  - phase: 02-hitl-approval-channels/02-01
    provides: "HitlWorkflow, classifyAction, createTicket/getTicket/transitionStatus, notifyChannels, HITL_WORKFLOW Workflow binding in Env"
  - phase: 01-budget-engine-proxy-foundation
    provides: "budgetGate, forwardToLlm, ChatCompletionRequest type, Hono app structure"

provides:
  - "verifySlackSignature: HMAC-SHA256 Web Crypto verification with replay attack prevention (5-min window)"
  - "hitlRoutes Hono sub-app: POST /v1/hitl/:id/approve|deny, GET /v1/hitl/:id/status, POST /v1/slack/callback"
  - "Slack callback returns 200 within 3s (waitUntil pattern for workflow resumption)"
  - "HITL classification in /v1/chat/completions pipeline: extractToolCalls + classifyToolCalls"
  - "202 HITL_PENDING response with approvalId, agentId, expiresAt when risky tool_calls detected"
  - "Budget hold maintained during HITL wait (hold created BEFORE HITL_WORKFLOW.create)"
  - "HitlWorkflow exported from index.ts (required for Cloudflare Workflow binding wiring)"
  - "ToolCall and ChatCompletionMessage types added to types.ts"

affects:
  - "SDK polling pattern (HitlPending.approvalId can poll GET /v1/hitl/:id/status)"
  - "Future phases: approve/deny webhook integration, HITL resumption to LLM forwarding"

tech-stack:
  added: []
  patterns:
    - "waitUntil-for-3s: Slack callback pushes workflow resumption to executionCtx.waitUntil to return 200 within Slack's 3s window"
    - "constant-time-comparison: XOR charCode diff for HMAC signature comparison (timing attack prevention)"
    - "HITL-after-budget-gate: extractToolCalls runs after budgetGate passes, hold maintained throughout approval wait"
    - "try-catch-executionCtx: executionCtx.waitUntil wrapped in try/catch for Node.js test env compatibility"
    - "cloudflare-workers-mock: vi.mock('cloudflare:workers') in Node.js integration tests for WorkflowEntrypoint import"

key-files:
  created:
    - packages/proxy/src/hitl/slack.ts
    - packages/proxy/src/hitl/routes.ts
    - packages/proxy/src/hitl/routes.test.ts
    - packages/proxy/src/hitl/hitl-integration.test.ts
  modified:
    - packages/proxy/src/index.ts
    - packages/proxy/src/index.test.ts
    - packages/proxy/src/types.ts
    - packages/proxy/src/budget/calculator.ts
    - packages/proxy/src/passthrough/forward.ts
    - packages/proxy/vitest.config.node.ts
    - packages/proxy/vitest.config.ts

key-decisions:
  - "HITL_WORKFLOW.get() returns Promise<WorkflowInstance> — must be awaited (not synchronous get)"
  - "extractToolCalls uses 'tool_call:<function_name>' prefix format matching classifier RISK_TABLE keys"
  - "classifyToolCalls returns first risky action found — simplest approach, avoids ordering complexity"
  - "hitl-integration.test.ts uses vi.doMock for budget gate + DB — allows 202 HITL testing in Node.js"
  - "cloudflare:workers mocked in Node.js test env — WorkflowEntrypoint import won't resolve in Node.js"

patterns-established:
  - "waitUntil-for-3s: push long-running work to waitUntil before returning 200 for Slack callbacks"
  - "constant-time-HMAC: XOR-based comparison to prevent timing attacks on signature verification"

requirements-completed:
  - HITL-01
  - HITL-02
  - HITL-03
  - HITL-04
  - HITL-05

duration: 9min
completed: 2026-03-14
---

# Phase 2 Plan 02: HITL Approval Channels Summary

**Slack HMAC-SHA256 signature verification, Hono approve/deny/status/callback routes, HITL classification wired into proxy pipeline returning 202 HITL_PENDING for risky tool_calls**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-13T22:06:07Z
- **Completed:** 2026-03-13T22:15:31Z
- **Tasks:** 2 (5 commits using TDD RED/GREEN)
- **Files modified:** 11

## Accomplishments

- Complete HITL loop: risky tool_calls → 202 HITL_PENDING → human approve/deny via Slack buttons or webhook → workflow resumes
- Slack signature verification with HMAC-SHA256 (Web Crypto API), constant-time comparison, replay attack prevention
- Budget hold created before HITL check (hold maintained throughout approval wait per locked decision)
- 122 total tests passing across Workers pool (7), Node.js (89), and SDK (26) packages

## Task Commits

Each task was committed atomically using TDD (RED then GREEN):

1. **Task 1 RED: HITL routes and Slack signature tests** - `0711ebc` (test)
2. **Task 1 GREEN: slack.ts + routes.ts** - `4614736` (feat)
3. **Task 2 RED: HITL pipeline integration tests** - `ad791e2` (test)
4. **Task 2 GREEN: index.ts HITL classification + route mounting** - `3d9381a` (feat)

_Note: TDD tasks have two commits each (test → feat)_

## Files Created/Modified

- `packages/proxy/src/hitl/slack.ts` - verifySlackSignature: HMAC-SHA256 via Web Crypto, constant-time comparison, 5-min replay window
- `packages/proxy/src/hitl/routes.ts` - hitlRoutes: approve/deny/status endpoints + Slack callback (waitUntil for 3s constraint)
- `packages/proxy/src/hitl/routes.test.ts` - 12 unit tests: verifySlackSignature (5 cases) + all 4 route handlers
- `packages/proxy/src/hitl/hitl-integration.test.ts` - 4 integration tests: 202 HITL_PENDING, reversible passthrough, backward compat, budget-before-HITL ordering
- `packages/proxy/src/index.ts` - HITL classification (Step 4.5), hitlRoutes mount, HitlWorkflow export, extractToolCalls/classifyToolCalls helpers
- `packages/proxy/src/index.test.ts` - Route accessibility tests, reversible tool_calls backward compat test
- `packages/proxy/src/types.ts` - ToolCall, ChatCompletionMessage interfaces; ChatCompletionRequest updated
- `packages/proxy/src/budget/calculator.ts` - estimateInputTokens: null-safe content access (msg.content?.length ?? 0)
- `packages/proxy/src/passthrough/forward.ts` - extractAnthropicMessages: null-safe content handling for tool_call messages
- `packages/proxy/vitest.config.node.ts` - Added routes.test.ts and hitl-integration.test.ts
- `packages/proxy/vitest.config.ts` - Excluded routes.test.ts and hitl-integration.test.ts from Workers pool

## Decisions Made

- `HITL_WORKFLOW.get()` returns `Promise<WorkflowInstance>` — must be awaited (TS2339 caught during tsc, not at test time)
- `extractToolCalls` uses `tool_call:<function_name>` prefix format — matches classifier RISK_TABLE key format exactly
- `classifyToolCalls` returns first risky action found — simplest safe approach
- HITL integration tests moved to Node.js config using `vi.doMock` for budget gate mocking — Workers pool can't mock modules
- `cloudflare:workers` mocked via `vi.mock` in Node.js tests — WorkflowEntrypoint import not available in Node.js runtime

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Null-safe content access in estimateInputTokens**
- **Found during:** Task 2 (TypeScript compilation check)
- **Issue:** `ChatCompletionMessage.content` is now `string | null` (tool_call messages have null content), but `estimateInputTokens` did `msg.content.length` — would throw at runtime for any request with tool_calls
- **Fix:** Changed to `msg.content?.length ?? 0`
- **Files modified:** `packages/proxy/src/budget/calculator.ts`
- **Verification:** tsc --noEmit passes; calculator.test.ts 15 tests pass
- **Committed in:** `3d9381a` (Task 2 feat commit)

**2. [Rule 2 - Missing Critical] Null-safe content handling in extractAnthropicMessages**
- **Found during:** Task 2 (TypeScript compilation check)
- **Issue:** `forward.ts` extractAnthropicMessages used `msg.content` as `string` but content is now `string | null` — TS2322 and would fail at runtime
- **Fix:** `system = msg.content ?? undefined` and `content: msg.content ?? ''`
- **Files modified:** `packages/proxy/src/passthrough/forward.ts`
- **Verification:** tsc --noEmit passes (except pre-existing writer.test.ts errors)
- **Committed in:** `3d9381a` (Task 2 feat commit)

**3. [Rule 1 - Bug] routes.ts needed await on HITL_WORKFLOW.get()**
- **Found during:** Task 2 (TypeScript compilation check after implementation)
- **Issue:** `HITL_WORKFLOW.get()` returns `Promise<WorkflowInstance>`, not `WorkflowInstance` — `sendEvent` call was on a Promise
- **Fix:** Added `await` to all three `c.env.HITL_WORKFLOW.get(ticketId)` calls in routes.ts
- **Files modified:** `packages/proxy/src/hitl/routes.ts`
- **Verification:** tsc --noEmit passes; routes.test.ts 12 tests pass
- **Committed in:** `3d9381a` (Task 2 feat commit)

**4. [Rule 3 - Blocking] executionCtx.waitUntil throws in Node.js test env**
- **Found during:** Task 1 GREEN (routes.test.ts) and Task 2 GREEN (hitl-integration.test.ts)
- **Issue:** Hono's `c.executionCtx` getter throws "This context has no ExecutionContext" in Node.js env — caused 500 responses in tests
- **Fix:** Wrapped `executionCtx.waitUntil` access in try/catch in both routes.ts and index.ts
- **Files modified:** `packages/proxy/src/hitl/routes.ts`, `packages/proxy/src/index.ts`
- **Verification:** All Node.js tests pass; Cloudflare Workers behavior unaffected (try/catch only catches the getter error)
- **Committed in:** `4614736` (routes), `3d9381a` (index.ts)

---

**Total deviations:** 4 auto-fixed (2 Rule 2 missing critical, 1 Rule 1 bug, 1 Rule 3 blocking)
**Impact on plan:** All auto-fixes required for correctness and TypeScript compliance. No scope creep.

## Issues Encountered

- `vi.doMock` approach for Workers pool HITL test failed — budget gate requires real DB calls when TURSO env is provided. Resolved by moving HITL pipeline integration tests to `hitl-integration.test.ts` with proper module mocking in Node.js env.
- Pre-existing TypeScript errors in `src/audit/writer.test.ts` (TS2352 cast errors) — confirmed pre-existing from Phase 1, out of scope, not fixed.

## User Setup Required

None — routes are wired in but require SLACK_SIGNING_SECRET, SLACK_BOT_TOKEN, SLACK_CHANNEL_ID env vars (documented in wrangler.jsonc) for Slack functionality. Webhook approve/deny works without Slack credentials.

## Next Phase Readiness

- HITL loop is complete: risky tool_calls → 202 → approve/deny → workflow resumes
- `HitlWorkflow` exported from `index.ts` — Cloudflare Workflows binding is wired
- SDK `HitlPending` error class (from Phase 01) can now poll `GET /v1/hitl/:id/status` for approval status
- Phase 2 is fully complete — Phase 3 ready

## Self-Check: PASSED

- slack.ts: FOUND
- routes.ts: FOUND
- routes.test.ts: FOUND
- hitl-integration.test.ts: FOUND
- 02-02-SUMMARY.md: FOUND
- Commits 0711ebc, 4614736, ad791e2, 3d9381a: ALL FOUND
- hitlRoutes imported and mounted in index.ts: CONFIRMED (2 matches)
- HitlWorkflow exported from index.ts: CONFIRMED (2 matches)

---
*Phase: 02-hitl-approval-channels*
*Completed: 2026-03-14*
