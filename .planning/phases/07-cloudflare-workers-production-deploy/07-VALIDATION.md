---
phase: 7
slug: cloudflare-workers-production-deploy
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest v2 + @cloudflare/vitest-pool-workers ^0.12.21 |
| **Config file** | `packages/proxy/vitest.config.ts` (Workers pool) + `vitest.config.node.ts` (Node.js) |
| **Quick run command** | `pnpm --filter @agentgov/proxy test` |
| **Full suite command** | `pnpm --filter @agentgov/proxy test && cd packages/proxy && tsc --noEmit` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @agentgov/proxy test`
- **After every plan wave:** Run full suite + `tsc --noEmit`
- **Before `/gsd:verify-work`:** Full suite must be green + `wrangler deploy --env production --dry-run` succeeds
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | DEPLOY-01, DEPLOY-02 | build + static | `pnpm --filter @agentgov/proxy test && cd packages/proxy && tsc --noEmit` | ✅ | ⬜ pending |
| 07-01-02 | 01 | 1 | DEPLOY-02 | static analysis | `grep -E '"[A-Z_]+_KEY":\s*"[^"]+"' packages/proxy/wrangler.jsonc` (must return no non-empty secrets) | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Run `cd packages/proxy && npx wrangler types` — regenerate `worker-configuration.d.ts` to include `GEMINI_API_KEY`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `wrangler deploy --env production` succeeds | DEPLOY-01 | Requires Cloudflare account + Turso cloud DB | Run `wrangler deploy --env production`, verify no errors |
| Gemini request returns 200 (not 503) | DEPLOY-01 | Requires live API keys set via `wrangler secret put` | curl POST to deployed Worker with `model: gemini-2.0-flash` |
| HITL workflow triggers on risky action | DEPLOY-01 | Requires live HITL_WORKFLOW binding | curl POST with tool_call, verify 202 HITL_PENDING |
| All secrets set via `wrangler secret put` | DEPLOY-02 | Interactive CLI required | Run all 10 `wrangler secret put --env production` commands |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
