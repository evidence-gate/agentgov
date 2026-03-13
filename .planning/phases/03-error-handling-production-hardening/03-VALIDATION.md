---
phase: 03
slug: error-handling-production-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest v2 (pinned per Phase 01-03 decision) |
| **Config file** | `vitest.config.ts` (Workers pool) + `vitest.config.node.ts` (Node.js) |
| **Quick run command** | `pnpm --filter @agentgov/proxy test:node` |
| **Full suite command** | `pnpm --filter @agentgov/proxy test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @agentgov/proxy test:node`
- **After every plan wave:** Run `pnpm --filter @agentgov/proxy test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | ERR-01, ERR-02, ERR-04 | unit | `pnpm --filter @agentgov/proxy test:node` (classifier.test.ts, retry.test.ts, reporter.test.ts) | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | ERR-04 | unit | `pnpm --filter @agentgov/sdk-typescript test` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 2 | ERR-03 | unit | `pnpm --filter @agentgov/proxy test:node` (loop-detector.test.ts) | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 2 | ERR-01, ERR-02, ERR-03 | integration | `pnpm --filter @agentgov/proxy test:node && pnpm --filter @agentgov/proxy test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/proxy/src/error/classifier.test.ts` — stubs for ERR-01
- [ ] `packages/proxy/src/error/retry.test.ts` — stubs for ERR-02
- [ ] `packages/proxy/src/error/loop-detector.test.ts` — stubs for ERR-03
- [ ] `packages/proxy/src/error/reporter.test.ts` — stubs for ERR-04
- [ ] `packages/proxy/vitest.config.node.ts` — update include list for error/*.test.ts

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real LLM 429 retry with Retry-After | ERR-02 | Requires live LLM API rate limit trigger | Send rapid requests to exhaust rate limit, verify backoff timing |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
