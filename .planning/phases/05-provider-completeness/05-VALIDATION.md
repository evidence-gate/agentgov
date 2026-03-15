---
phase: 5
slug: provider-completeness
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest v2 (pinned per v1.0 decision) |
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
| 05-01-01 | 01 | 1 | PROV-01, PROV-02 | unit | `pnpm --filter @agentgov/proxy test:node` (forward.test.ts — Gemini routing) | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | PROV-03 | unit | `pnpm --filter @agentgov/proxy test:node` (forward.test.ts — Anthropic SSE parsing) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/proxy/src/passthrough/forward.test.ts` — test stubs for Gemini routing and Anthropic SSE parsing

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Gemini streaming `stream_options` support | PROV-01 | Requires live Gemini API key | Send streaming request to gemini-2.0-flash, verify non-zero token counts in settle |
| Anthropic streaming with real API | PROV-03 | Requires live Anthropic API key | Send streaming request to claude-3.5-sonnet, verify ledger shows non-zero tokens |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
