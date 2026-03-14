---
phase: 03-error-handling-production-hardening
plan: "02"
subsystem: api
tags: [sha256, fingerprinting, loop-detection, stuck-agent, proxy, vitest, tdd]

# Dependency graph
requires:
  - phase: 03-01
    provides: "reporter.ts buildAgentErrorResponse, budgetSettle, appendAuditEvent, AuditEventType stuck_detected reserved"

provides:
  - "fingerprintAction: deterministic SHA-256 fingerprint of tool_call (action + sorted args)"
  - "createLoopDetector / recordAction: per-request 2-failure-stop loop detection"
  - "Stuck agent halted before LLM forward with 502 AGENT_ERROR stuck_detected"
  - "stuck_detected audit event logged with fingerprint, timestamps, remediation"
  - "Budget hold settled at 0 cost on stuck halt (no LLM tokens consumed)"

affects:
  - 04-dashboard-and-observability
  - sdk-typescript

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-request in-memory loop detection (Map<fingerprint, ActionRecord>) — no DB required"
    - "SHA-256 with sorted JSON keys for deterministic fingerprinting across key-order variants"
    - "appendAuditEvent called fire-and-forget (no await) to honor never-throw contract"
    - "budgetSettle at 0 cost on any pre-LLM halt path — consistent with error path invariant from 03-01"

key-files:
  created:
    - packages/proxy/src/error/loop-detector.ts
    - packages/proxy/src/error/loop-detector.test.ts
  modified:
    - packages/proxy/src/index.ts
    - packages/proxy/src/hitl/hitl-integration.test.ts
    - packages/proxy/vitest.config.node.ts
    - packages/proxy/vitest.config.ts

key-decisions:
  - "Loop detection is per-request (not per-session) — scans all messages in a single request for repeated identical tool_calls"
  - "2-failure-stop: second identical fingerprint (same function + same args) within one request triggers stuck detection"
  - "appendAuditEvent called fire-and-forget (not awaited) in stuck halt path — never-throw contract means no try/catch needed"
  - "sortKeysReplacer normalizes object key order before SHA-256 — prevents false negatives from key-order divergence"
  - "buildAgentErrorResponse called with class: 'unknown' for stuck_detected — governance halt is not transient or permanent"

patterns-established:
  - "Step 4.75 in proxy pipeline: stuck detection runs after HITL, before forwardToLlm"
  - "Any pre-LLM halt path settles budget hold at 0 cost (consistent with 03-01 retry engine invariant)"

requirements-completed: [ERR-03]

# Metrics
duration: 12min
completed: 2026-03-15
---

# Phase 3 Plan 02: Loop Detector Summary

**Per-request SHA-256 fingerprint loop detector halts stuck agents with 2-failure-stop before forwarding to LLM, logging stuck_detected audit events and settling budget at 0 cost**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-15T00:23:00Z
- **Completed:** 2026-03-15T00:35:00Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 6

## Accomplishments

- `loop-detector.ts` module: `fingerprintAction` (SHA-256 + key-order normalization), `createLoopDetector` (Map-based state), `recordAction` (2-failure-stop rule)
- 12 unit tests covering determinism, key-order normalization, false-positive prevention, multi-occurrence timestamps
- Loop detector wired into proxy pipeline as Step 4.75 — intercepts repeated tool_calls before LLM forward
- 3 new integration tests: stuck 502 detection, unique tool_calls pass-through, no tool_calls pass-through
- Total test count: 148 (proxy) + 37 (SDK) = 185 — zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Loop detector module with fingerprinting and 2-failure-stop** - `0783f13` (feat)
2. **Task 2: Wire loop detector into proxy pipeline** - `d62e8b2` (feat)

**Plan metadata:** (docs commit follows)

_Note: Both tasks used TDD — tests written first (RED), then implementation (GREEN)_

## Files Created/Modified

- `packages/proxy/src/error/loop-detector.ts` - Per-request loop detection: `fingerprintAction`, `createLoopDetector`, `recordAction`, `LoopDetectorState`, `StuckResult`, `ActionRecord`
- `packages/proxy/src/error/loop-detector.test.ts` - 12 unit tests for fingerprinting, key-order normalization, stuck detection
- `packages/proxy/src/index.ts` - Added Step 4.75 loop detection between HITL check and forwardToLlm; added imports for loop-detector, reporter, audit/writer, budgetSettle
- `packages/proxy/src/hitl/hitl-integration.test.ts` - 3 new loop detection integration tests
- `packages/proxy/vitest.config.node.ts` - Added `src/error/loop-detector.test.ts` to include list
- `packages/proxy/vitest.config.ts` - Added `src/error/loop-detector.test.ts` to exclude list (Workers pool)

## Decisions Made

- Loop detection is per-request only: scans all messages in a single incoming request, not across successive requests from the same agent. Simpler implementation, no session state needed.
- `sortKeysReplacer` in `JSON.stringify` normalizes nested object key order recursively — prevents false negatives when agent sends same args with different key serialization order.
- `appendAuditEvent` is called without `await` (fire-and-forget) in the stuck halt path to honor its never-throw contract while keeping the audit write attempt.
- `buildAgentErrorResponse` called with `class: 'unknown'` for stuck_detected — the governance halt is not a transient or permanent upstream error.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

TypeScript compile errors in `retry.test.ts` and `audit/writer.test.ts` are pre-existing (confirmed by running tsc before any changes). No new TypeScript errors introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 3 is now complete (both plans executed):
- Plan 01: error classifier + retry engine + AgentError SDK
- Plan 02: loop detector wired into proxy pipeline

Phase 4 (Dashboard + Python SDK + Self-Host) can begin. The `stuck_detected` audit event type and loop detection infrastructure are ready for dashboard visualization.

---
*Phase: 03-error-handling-production-hardening*
*Completed: 2026-03-15*
