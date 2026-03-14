---
phase: 04
slug: dashboard-python-sdk-self-host
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (TS)** | vitest v2 (existing) |
| **Framework (Python)** | pytest + pytest-httpx (new) |
| **Config (TS)** | `vitest.config.ts` + `vitest.config.node.ts` |
| **Config (Python)** | `packages/sdk-python/pyproject.toml` |
| **Quick run (TS)** | `pnpm --filter @agentgov/proxy test:node` |
| **Quick run (Python)** | `cd packages/sdk-python && pytest tests/ -x` |
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
| 04-01-01 | 01 | 1 | SDK-02 | unit (pytest) | `cd packages/sdk-python && pytest tests/ -x` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 1 | SDK-04 | smoke | `node packages/proxy/dist/index.node.js` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 1 | SDK-04 | integration | `docker compose -f docker/compose.yml up -d && curl localhost:8787/health` | ❌ W0 | ⬜ pending |
| 04-03-01 | 03 | 2 | SDK-05 | unit | `pnpm --filter @agentgov/proxy test:node` (dashboard routes) | ❌ W0 | ⬜ pending |
| 04-03-02 | 03 | 2 | SDK-05 | manual | Visual check — dashboard renders budget balance | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/sdk-python/pyproject.toml` — Python package setup
- [ ] `packages/sdk-python/tests/test_wrap.py` — SDK-02 test stubs
- [ ] `packages/proxy/src/dashboard/routes.test.ts` — SDK-05 test stubs
- [ ] `packages/proxy/src/index.node.ts` — Node.js entry point
- [ ] `docker/compose.yml` — Docker Compose stack

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dashboard SPA renders correctly | SDK-05 | Visual UI rendering | Open browser to localhost, verify budget gauges and tables |
| Docker Compose 5-min setup | SDK-04 | End-to-end timing | Fresh clone, `docker compose up`, time to first health check |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
