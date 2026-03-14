---
phase: 03-error-handling-production-hardening
plan: "01"
subsystem: error-handling
tags: [retry, exponential-backoff, error-classifier, agent-error, audit-log, sdk]

# Dependency graph
requires:
  - phase: 01-budget-engine-proxy-foundation
    provides: budgetSettle, appendAuditEvent, AuditEvent types, forwardToLlm
  - phase: 02-hitl-approval-channels
    provides: AuditEventType union, proxy request handler
provides:
  - error/classifier.ts — classifyHttpError: HTTP status -> transient | permanent | unknown
  - error/retry.ts — forwardWithRetry with exponential backoff, jitter, Retry-After support
  - error/reporter.ts — buildAgentErrorResponse returns 502 AgentErrorResponseBody JSON
  - AgentError SDK class with type, agentId, timestamp, suggestedRemediation, context
  - AuditEventType extended with error_classified, retry_attempt, retry_exhausted, permanent_error, stuck_detected
  - forwardToLlm now uses forwardWithRetry for both OpenAI and Anthropic paths
affects:
  - 03-02 (loop detector plan uses same error event types)
  - 04 (dashboard will surface error_classified, retry_exhausted, permanent_error events)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Full-jitter exponential backoff: Math.random() * min(cap, base * 2^attempt)"
    - "Retry-After header takes precedence over computed backoff delay"
    - "Proxy returns 502 for all structured governance errors (not original upstream status)"
    - "sleepFn injectable parameter pattern for deterministic tests without real delays"
    - "AgentError follows BudgetExceeded/HitlPending pattern exactly (code, name, body constructor)"

key-files:
  created:
    - packages/proxy/src/error/classifier.ts
    - packages/proxy/src/error/classifier.test.ts
    - packages/proxy/src/error/reporter.ts
    - packages/proxy/src/error/reporter.test.ts
    - packages/proxy/src/error/retry.ts
    - packages/proxy/src/error/retry.test.ts
  modified:
    - packages/proxy/src/types.ts
    - packages/proxy/src/passthrough/forward.ts
    - packages/proxy/vitest.config.node.ts
    - packages/proxy/vitest.config.ts
    - packages/sdk-typescript/src/errors.ts
    - packages/sdk-typescript/src/interceptor.ts
    - packages/sdk-typescript/src/index.ts
    - packages/sdk-typescript/src/wrap.test.ts

key-decisions:
  - "Proxy always returns 502 for structured governance errors (not original 4xx/5xx) — originalStatus preserved in context field for debugging"
  - "forwardWithRetry is on the hot path (awaited), NOT in waitUntil() — caller needs the response"
  - "sleepFn injectable as optional parameter with real sleep default — enables deterministic tests"
  - "budgetSettle called on every error halt path inside forwardWithRetry — not in forward.ts caller"
  - "AuditEventType extended with 5 new event types (error_classified, retry_attempt, retry_exhausted, permanent_error, stuck_detected) — stuck_detected reserved for Plan 02 loop detector"

patterns-established:
  - "Error classifier: pure function, no I/O, Set.has() for O(1) status lookup"
  - "Retry engine: attempt loop 0..maxRetries inclusive (maxRetries+1 total attempts)"
  - "Full-jitter backoff: Math.floor(Math.random() * Math.min(capMs, baseDelayMs * 2^attempt))"
  - "Error response shape: { error: { code, type, message, agentId, timestamp, context, suggestedRemediation } }"

requirements-completed: [ERR-01, ERR-02, ERR-04]

# Metrics
duration: 15min
completed: 2026-03-14
---

# Phase 03 Plan 01: Error Classifier and Retry Engine Summary

**HTTP error classifier (transient/permanent/unknown), full-jitter exponential backoff retry engine, AgentError SDK class, and forwardToLlm integration — 429/5xx auto-retried, 4xx halts immediately, budget hold settled at 0 cost on all error paths**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-13T22:45:14Z
- **Completed:** 2026-03-14T23:13:42Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Error classifier with O(1) Set lookups for 5 transient statuses (429/500/502/503/504) and 5 permanent statuses (400/401/403/404/422) with specific remediation messages per status
- Retry engine with full-jitter exponential backoff, Retry-After header support, and deterministic test injection via sleepFn parameter
- Budget hold settled at 0 cost on every error halt path (permanent_error and retry_exhausted)
- All error decisions audit-logged (error_classified, retry_attempt, retry_exhausted, permanent_error)
- AgentError SDK class following BudgetExceeded/HitlPending pattern; SDK interceptor detects 502 AGENT_ERROR and throws AgentError
- forwardToOpenAI and forwardToAnthropic now use forwardWithRetry — removed old "return as-is" error path
- 133 total tests pass (up from 110 before this plan)

## Task Commits

Each task was committed atomically:

1. **Task 1: Error classifier, reporter, AgentError SDK class, and type extensions** - `aa927ab` (feat)
2. **Task 2: Retry engine and forwardToLlm integration** - `eb74d77` (feat)

_Note: TDD tasks — both used RED (test) then GREEN (impl) pattern_

## Files Created/Modified
- `packages/proxy/src/error/classifier.ts` - Pure classifyHttpError function; TRANSIENT_STATUSES and PERMANENT_STATUSES Sets; per-status remediation messages
- `packages/proxy/src/error/classifier.test.ts` - 15 tests covering all transient/permanent/unknown statuses and remediation content
- `packages/proxy/src/error/reporter.ts` - buildAgentErrorResponse returns 502 Response with AgentErrorResponseBody JSON; originalStatus preserved in context
- `packages/proxy/src/error/reporter.test.ts` - 6 tests verifying 502 status, Content-Type, all body fields
- `packages/proxy/src/error/retry.ts` - forwardWithRetry, calcBackoffMs, parseRetryConfig, RetryConfig; sleepFn injectable
- `packages/proxy/src/error/retry.test.ts` - 23 tests covering backoff ranges, config parsing, retry behavior, audit events, budget settle
- `packages/proxy/src/types.ts` - AuditEventType union extended with 5 new error event types
- `packages/proxy/src/passthrough/forward.ts` - forwardToOpenAI and forwardToAnthropic now use forwardWithRetry; ForwardEnv extended with retry env vars
- `packages/proxy/vitest.config.node.ts` - Added 3 new error test files to Node.js pool include list
- `packages/proxy/vitest.config.ts` - Added 3 new error test files to Workers pool exclude list
- `packages/sdk-typescript/src/errors.ts` - AgentErrorBody interface and AgentError class added before existing errors
- `packages/sdk-typescript/src/interceptor.ts` - 502 AGENT_ERROR detection block added after HitlPending detection
- `packages/sdk-typescript/src/index.ts` - AgentError and AgentErrorBody re-exported
- `packages/sdk-typescript/src/wrap.test.ts` - 11 new tests for AgentError class and 502 detection

## Decisions Made
- Proxy always returns 502 for structured governance errors (not the original upstream status). The 502 signals "proxy made a governance decision" as distinct from proxying the raw upstream error. The `context.originalStatus` field preserves the upstream status for debugging.
- `forwardWithRetry` is on the hot path (awaited), NOT in `waitUntil()`. The caller needs the response — if the retry engine ran in waitUntil() the response would be lost.
- `budgetSettle` is called inside `forwardWithRetry` on every halt path, not in `forward.ts`. This keeps the "error path = settle at 0" invariant colocated with the error decision.
- `sleepFn` injectable as optional parameter with real `sleep` as default. Tests inject `vi.fn().mockResolvedValue(undefined)` to avoid real delays while still verifying the sleep was called with the correct delay value.
- `AuditEventType` extended with `stuck_detected` even though Plan 01 only produces `error_classified`, `retry_attempt`, `retry_exhausted`, and `permanent_error`. The `stuck_detected` type is reserved for the Plan 02 loop detector — done here once to avoid a second types.ts edit.

## Deviations from Plan

None — plan executed exactly as written. The vitest.config updates were included in Task 1 per plan instructions (adding all 3 test files at once). AgentError tests were added to the existing `wrap.test.ts` file (per plan instruction "create test files") rather than a separate file since the SDK package has no vitest config filter and the existing file already tests all other error classes.

## Issues Encountered
- Pre-existing TypeScript errors in `src/audit/writer.test.ts` (TS2352 type overlap) were present before this plan and are out of scope per deviation rules. Logged as pre-existing, not fixed.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Error classifier, retry engine, and reporter are complete and tested
- AuditEventType includes `stuck_detected` — ready for Plan 02 loop detector
- All error events audit-logged and budget holds properly settled
- forwardToLlm integration complete for both OpenAI and Anthropic paths
- Plan 02 (loop detector) can import `forwardWithRetry` and add stuck detection on top

## Self-Check: PASSED

All files verified present:
- packages/proxy/src/error/classifier.ts: FOUND
- packages/proxy/src/error/retry.ts: FOUND
- packages/proxy/src/error/reporter.ts: FOUND
- .planning/phases/03-error-handling-production-hardening/03-01-SUMMARY.md: FOUND

All commits verified:
- aa927ab (Task 1 — error classifier, reporter, AgentError): FOUND
- eb74d77 (Task 2 — retry engine, forwardToLlm): FOUND

---
*Phase: 03-error-handling-production-hardening*
*Completed: 2026-03-14*
