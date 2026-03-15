---
phase: 05-provider-completeness
plan: "01"
subsystem: api
tags: [gemini, google, llm-forwarding, proxy, vitest, workers-pool]

requires:
  - phase: 01-03
    provides: "forwardToLlm, forwardToOpenAI, processStreamAndSettle — reference implementation Gemini reuses"

provides:
  - "forwardToGemini() function in forward.ts — Gemini OpenAI-compat endpoint routing"
  - "GEMINI_API_KEY wired in ForwardEnv, wrangler.jsonc, index.ts, index.node.ts"
  - "12 tests for Gemini non-streaming, streaming, and missing key paths"
  - "vitest-pool-workers pinned to ^0.12.21 — fixes broken Workers pool test suite"

affects:
  - 05-02
  - 07-integration-validation

tech-stack:
  added: []
  patterns:
    - "Gemini OpenAI-compat endpoint reuses processStreamAndSettle unchanged — stream format is identical"
    - "forwardToGemini structurally mirrors forwardToOpenAI — same fetch/settle pattern, different URL and key"
    - "vi.stubGlobal('fetch', mockFetch) pattern for Workers pool tests — works without Workers-specific mocking APIs"

key-files:
  created:
    - packages/proxy/src/passthrough/forward.test.ts
  modified:
    - packages/proxy/src/passthrough/forward.ts
    - packages/proxy/src/index.ts
    - packages/proxy/src/index.node.ts
    - packages/proxy/wrangler.jsonc
    - packages/proxy/package.json

key-decisions:
  - "@cloudflare/vitest-pool-workers pinned to ^0.12.21 — 0.13.0 dropped ./config export, breaking defineWorkersConfig import with vitest v2"
  - "Gemini streaming uses processStreamAndSettle without modification — Gemini OpenAI-compat returns identical SSE format"
  - "retryEnv definition moved before provider validation blocks — needed for all three provider branches"

patterns-established:
  - "New LLM provider: add key to ForwardEnv, add missing-key guard, add forwardToProvider() function mirroring forwardToOpenAI pattern"
  - "New env var: must appear in ForwardEnv (forward.ts), index.ts forwardToLlm call, index.node.ts env mapping, wrangler.jsonc vars"

requirements-completed: [PROV-01, PROV-02]

duration: 12min
completed: 2026-03-15
---

# Phase 5 Plan 01: Provider Completeness (Gemini) Summary

**Google Gemini provider forwarding via OpenAI-compat endpoint with streaming token settle, 503 key guard, and 12-test coverage — plus vitest-pool-workers version fix**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-03-15T10:24:00Z
- **Completed:** 2026-03-15T10:36:46Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- `forwardToGemini()` function routes `gemini-*` model requests to `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`
- Streaming path injects `stream_options: { include_usage: true }` and reuses `processStreamAndSettle` for accurate token settle
- Non-streaming path extracts `usage.prompt_tokens` / `usage.completion_tokens` and calls `budgetSettle`
- Missing `GEMINI_API_KEY` returns HTTP 503 with clear error message identifying the missing key
- `GEMINI_API_KEY` wired in all four required locations: `ForwardEnv`, `wrangler.jsonc`, `index.ts`, `index.node.ts`
- Workers pool test suite restored by pinning `@cloudflare/vitest-pool-workers` to `^0.12.21`

## Task Commits

1. **Task 1: Test scaffold + Gemini forwarding implementation** - `18823a0` (feat)
2. **Task 2: Wire GEMINI_API_KEY across entry points** - `09c663c` (feat)

## Files Created/Modified

- `packages/proxy/src/passthrough/forward.test.ts` - 12 tests: Gemini non-streaming (URL, auth header, status, budget settle), streaming (stream_options injection, 200 response, token settle, pipe), missing key (503 x2, GEMINI_API_KEY in error, fetch not called)
- `packages/proxy/src/passthrough/forward.ts` - Added `GEMINI_API_KEY` to `ForwardEnv`, replaced google 503 stub with proper key guard, added `forwardToGemini()` function, moved `retryEnv` definition before provider blocks
- `packages/proxy/src/index.ts` - Added `GEMINI_API_KEY: c.env?.GEMINI_API_KEY` to `forwardToLlm` call
- `packages/proxy/src/index.node.ts` - Added `env['GEMINI_API_KEY'] = process.env['GEMINI_API_KEY'] ?? ''`
- `packages/proxy/wrangler.jsonc` - Added `"GEMINI_API_KEY": ""` to vars block
- `packages/proxy/package.json` - Pinned `@cloudflare/vitest-pool-workers` from `latest` to `^0.12.21`

## Decisions Made

- **vitest-pool-workers pinned to ^0.12.21:** v0.13.0 changed the package structure, removing the `./config` export that `defineWorkersConfig` was imported from. v0.12.21 is the last version compatible with vitest v2 (which is pinned per prior project decision from Phase 01-03).
- **processStreamAndSettle reuse:** Gemini's OpenAI-compat endpoint returns identical SSE format to OpenAI's — no modification needed for the stream parser.
- **retryEnv moved before provider blocks:** The original code defined `retryEnv` after the provider validation section, preventing it from being passed to new provider functions. Moved it earlier so all three providers (openai, google, anthropic) can use it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed broken vitest-pool-workers import**
- **Found during:** Task 1 (attempting to run Workers pool tests)
- **Issue:** `@cloudflare/vitest-pool-workers` resolved to v0.13.0 (from `latest`) which removed the `./config` export that `defineWorkersConfig` is imported from. The Workers pool test suite was completely broken — no tests could run.
- **Fix:** Pinned `@cloudflare/vitest-pool-workers` to `^0.12.21` in `package.json`; ran `pnpm install`. v0.12.21 has the `./config` export and is compatible with vitest v2.
- **Files modified:** `packages/proxy/package.json`, `pnpm-lock.yaml`
- **Verification:** Workers pool tests ran successfully (12/12 passing)
- **Committed in:** `18823a0` (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking issue)
**Impact on plan:** Version pin was necessary to restore test execution capability. No scope creep.

## Issues Encountered

- Workers pool test suite was broken before this plan executed (vitest-pool-workers 0.13.0 breaking change). Fixed as part of Task 1 via Rule 3 auto-fix.

## User Setup Required

None - no external service configuration required for the code changes. To use Gemini in production, set `GEMINI_API_KEY` as a Wrangler secret (`wrangler secret put GEMINI_API_KEY`).

## Next Phase Readiness

- Gemini non-streaming and streaming paths are fully implemented and tested
- Phase 05-02 (Anthropic streaming settle) can proceed — it follows the same pattern and the codebase is now in clean state
- Integration test (live Gemini API call) is noted as medium confidence for `stream_options` streaming usage support — recommend running integration test in Phase 7

---
*Phase: 05-provider-completeness*
*Completed: 2026-03-15*

## Self-Check: PASSED

- FOUND: packages/proxy/src/passthrough/forward.ts
- FOUND: packages/proxy/src/passthrough/forward.test.ts
- FOUND: .planning/phases/05-provider-completeness/05-01-SUMMARY.md
- FOUND: commit 18823a0 (Task 1: Gemini forwarding + tests)
- FOUND: commit 09c663c (Task 2: GEMINI_API_KEY wiring)
- FOUND: GEMINI_API_KEY in all four required files (verified via grep)
