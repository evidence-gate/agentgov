---
phase: 02
slug: hitl-approval-channels
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest v2 (pinned — see Phase 1 decision) |
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
| 02-01-01 | 01 | 1 | HITL-03 | unit | `pnpm --filter @agentgov/proxy test:node` (classifier.test.ts) | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | HITL-03, HITL-05 | unit + integration | `pnpm --filter @agentgov/proxy test:node` (hitl.test.ts) | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | HITL-01 | unit (mock fetch) | `pnpm --filter @agentgov/proxy test:node` (notify.test.ts) | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | HITL-02, HITL-04 | integration | `pnpm --filter @agentgov/proxy test:workers` (callback.test.ts) | ❌ W0 | ⬜ pending |
| SDK | 02 | 1 | HITL-02 | unit | `pnpm --filter @agentgov/sdk-typescript test` (hitl.test.ts) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/proxy/src/hitl/classifier.test.ts` — stubs for HITL-03 (action classification)
- [ ] `packages/proxy/src/hitl/hitl.test.ts` — stubs for HITL-01, HITL-03, HITL-04, HITL-05
- [ ] `packages/proxy/src/hitl/notify.test.ts` — stubs for HITL-01 (webhook + Slack routing)
- [ ] `packages/sdk-typescript/src/hitl.test.ts` — stubs for HITL-02 (HitlPending detection)
- [ ] `packages/proxy/migrations/0001_hitl_queue.sql` — schema migration

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Slack Block Kit message renders correctly | HITL-01 | Visual rendering in Slack client | Send test approval request, verify button layout in Slack |
| Real Cloudflare Workflow waitForEvent timeout | HITL-04 | Requires deployed Worker + real time passage | Deploy to staging, create approval, wait for TTL |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
