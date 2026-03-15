---
phase: 6
slug: python-async-sdk-budget-crud
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (Python)** | pytest + pytest-asyncio + pytest-httpx |
| **Framework (TS)** | vitest v2 (pinned) |
| **Config (Python)** | `packages/sdk-python/pyproject.toml` |
| **Config (TS)** | `vitest.config.ts` + `vitest.config.node.ts` |
| **Quick run (Python)** | `cd packages/sdk-python && pytest tests/ -x` |
| **Quick run (TS)** | `pnpm --filter @agentgov/proxy test:node` |
| **Full suite** | `pnpm test && cd packages/sdk-python && pytest` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run relevant package test command
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | SDK-06, SDK-07 | unit (pytest) | `cd packages/sdk-python && pytest tests/ -x` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 1 | BUDGET-01, BUDGET-02 | unit (vitest) | `pnpm --filter @agentgov/proxy test:node` (dashboard/routes.test.ts) | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 1 | BUDGET-01 | integration | Dashboard inline edit visual check | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/sdk-python/tests/test_async.py` — stubs for async transport, wrap_async, exceptions
- [ ] `packages/proxy/src/dashboard/routes.test.ts` — stubs for PATCH /budget/:agentId

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dashboard inline budget edit UX | BUDGET-01 | Visual rendering | Open dashboard, click budget value, edit, verify update |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
