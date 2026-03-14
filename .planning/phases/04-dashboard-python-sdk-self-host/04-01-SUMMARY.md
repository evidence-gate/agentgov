---
phase: 04-dashboard-python-sdk-self-host
plan: "01"
subsystem: sdk
tags: [python, httpx, agentgov, openai, anthropic, sdk, transport, exceptions]

# Dependency graph
requires:
  - phase: 01-budget-engine-proxy-foundation
    provides: TypeScript SDK error shapes (BudgetExceeded, HitlPending, AgentError) and HTTP contract (429/202/502 governance codes)
provides:
  - packages/sdk-python/ — installable Python package agentgov==0.1.0
  - agentgov.wrap(client, proxy_url=..., agent_id=...) — one-liner client patching
  - BudgetExceeded, HitlPending, AgentError — Python exception classes matching TypeScript field contracts
  - AgentgovTransport(httpx.BaseTransport) — URL rewrite + header injection + governance exception raising
affects: [04-02-self-host, 04-03-dashboard]

# Tech tracking
tech-stack:
  added: [httpx>=0.24.0, hatchling, pytest, pytest-httpx]
  patterns:
    - httpx.BaseTransport subclass for transparent proxy intercept
    - snake_case field names mapping TypeScript camelCase contracts (budgetId -> budget_id)
    - wrap() uses client._client private attribute mutation (documented limitation)
    - Body must be read with response.read() before inspection; reconstruct response with content= to pass through

key-files:
  created:
    - packages/sdk-python/pyproject.toml
    - packages/sdk-python/src/agentgov/__init__.py
    - packages/sdk-python/src/agentgov/_exceptions.py
    - packages/sdk-python/src/agentgov/_transport.py
    - packages/sdk-python/tests/conftest.py
    - packages/sdk-python/tests/test_wrap.py
    - packages/sdk-python/README.md
  modified: []

key-decisions:
  - "Python SDK uses httpx.BaseTransport (sync only) — AsyncBaseTransport deferred per MVP scope"
  - "snake_case field mapping: budgetId->budget_id, approvalId->approval_id, agentId->agent_id, expiresAt->expires_at, suggestedRemediation->suggested_remediation"
  - "wrap() mutates client._client private attribute — both openai.OpenAI and anthropic.Anthropic store httpx.Client as _client"
  - "response.read() consumed before inspection; non-exception responses reconstructed with httpx.Response(content=already_read_bytes)"
  - "httpx.URL.query is already bytes in Python — do not call .encode() on it"

patterns-established:
  - "Transport test pattern: MockTransport returns predetermined responses; AgentgovTransport wraps it via _inner= param"
  - "Exception constructor accepts inner error dict (response_body['error']) not outer wrapper"

requirements-completed: [SDK-02]

# Metrics
duration: 2min
completed: 2026-03-14
---

# Phase 4 Plan 01: Python SDK Summary

**httpx.BaseTransport Python SDK with wrap(), URL rewriting, X-Agent-Id injection, and governance exceptions matching TypeScript SDK field contracts exactly**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-14T23:43:26Z
- **Completed:** 2026-03-14T23:45:49Z
- **Tasks:** 1 (TDD: 2 commits — test RED + feat GREEN)
- **Files modified:** 7

## Accomplishments

- Python SDK package (`agentgov==0.1.0`) installable via `pip install -e ".[openai,anthropic]"` with hatchling build backend
- `agentgov.wrap(client, proxy_url=..., agent_id=...)` one-liner patches OpenAI/Anthropic clients via `_client` attribute mutation
- `AgentgovTransport` transparently rewrites request URLs to proxy host, injects `X-Agent-Id` header, raises governance exceptions on matching status codes
- `BudgetExceeded` (429), `HitlPending` (202), `AgentError` (502) match TypeScript SDK field contracts with snake_case field names
- Non-governance 429/202/502 responses pass through without raising exceptions
- 18 pytest tests — all pass

## Task Commits

TDD flow (two commits per task):

1. **RED — failing tests** - `87018b4` (test: add failing tests for Python SDK)
2. **GREEN — implementation** - `3e6af2c` (feat: Python SDK — AgentgovTransport, exception classes, wrap())

## Files Created/Modified

- `packages/sdk-python/pyproject.toml` — hatchling build, name=agentgov, version=0.1.0, pytest testpaths
- `packages/sdk-python/src/agentgov/__init__.py` — wrap(), re-exports BudgetExceeded/HitlPending/AgentError/AgentgovTransport
- `packages/sdk-python/src/agentgov/_exceptions.py` — BudgetExceeded, HitlPending, AgentError with snake_case fields
- `packages/sdk-python/src/agentgov/_transport.py` — AgentgovTransport(httpx.BaseTransport): URL rewrite, header injection, governance exception raising
- `packages/sdk-python/tests/conftest.py` — minimal pytest config
- `packages/sdk-python/tests/test_wrap.py` — 18 tests covering all exception fields, URL rewriting, header injection, governance raises, and pass-through behavior
- `packages/sdk-python/README.md` — package stub (required by hatchling)

## Decisions Made

- **Sync-only transport**: `httpx.BaseTransport` (not `AsyncBaseTransport`) — Phase 4 MVP only supports sync clients per CONTEXT.md
- **snake_case mapping**: TypeScript `budgetId` → Python `budget_id`, `approvalId` → `approval_id`, `agentId` → `agent_id`, `expiresAt` → `expires_at`, `suggestedRemediation` → `suggested_remediation`
- **wrap() private mutation**: Sets `client._client = httpx.Client(transport=AgentgovTransport(...))`. Both `openai.OpenAI` and `anthropic.Anthropic` store their httpx client as `_client`. Alternative documented: construct client with `http_client=` param
- **Response reconstruction**: After `response.read()` consumes the stream, non-exception responses are reconstructed as `httpx.Response(status_code=..., headers=..., content=already_read_bytes)`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed httpx.URL.query already-bytes bug**

- **Found during:** Task 1 (GREEN phase — transport URL rewriting test)
- **Issue:** `original_url.query` in httpx is already `bytes`; calling `.encode("utf-8")` on it raised `AttributeError: 'bytes' object has no attribute 'encode'`
- **Fix:** Changed `original_url.query.encode("utf-8") if original_url.query else b""` to `original_url.query if original_url.query else b""`
- **Files modified:** `packages/sdk-python/src/agentgov/_transport.py`
- **Verification:** `test_transport_preserves_path_and_query` now passes
- **Committed in:** `3e6af2c` (GREEN phase implementation commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in httpx API assumption)
**Impact on plan:** Single-line fix, no scope change.

## Issues Encountered

- `pip install -e .` failed initially due to missing `README.md` (required by hatchling). Created a stub `README.md` to unblock installation.
- System Python 3.14 (Homebrew) is externally managed — required `--break-system-packages` flag. Tests use system pytest (9.0.2) which works correctly.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Python SDK package is ready; importable as `from agentgov import wrap, BudgetExceeded, HitlPending, AgentError`
- Transport ready for use with OpenAI/Anthropic Python clients in Phase 4 Plan 02 self-host Docker Compose examples
- Async transport deferred; if needed for Phase 4 Plan 03 dashboard, add `AsyncAgentgovTransport(httpx.AsyncBaseTransport)` following same pattern

## Self-Check: PASSED

All created files confirmed present. Both task commits (87018b4, 3e6af2c) confirmed in git log. All 18 pytest tests pass.

---
*Phase: 04-dashboard-python-sdk-self-host*
*Completed: 2026-03-14*
