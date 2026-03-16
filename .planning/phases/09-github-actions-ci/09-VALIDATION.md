---
phase: 9
slug: github-actions-ci
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-17
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | GitHub Actions (workflow YAML validation) |
| **Config file** | .github/workflows/ci.yml |
| **Quick run command** | `test -f .github/workflows/ci.yml && echo "PASS"` |
| **Full suite command** | `act --list 2>/dev/null || cat .github/workflows/ci.yml` |
| **Estimated runtime** | ~1 second (local validation) |

---

## Sampling Rate

- **After every task commit:** Run `test -f .github/workflows/ci.yml`
- **After every plan wave:** Verify workflow YAML is valid
- **Before `/gsd:verify-work`:** Push to GitHub and confirm Actions run
- **Max feedback latency:** 1 second

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | CI-01, CI-02 | file + content | `test -f .github/workflows/ci.yml && grep -q "npm run lint" .github/workflows/ci.yml && grep -q "npm test" .github/workflows/ci.yml` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No test framework needed — this is a CI configuration phase.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CI triggers on push/PR | CI-01, CI-02 | Requires GitHub Actions runtime | Push commit, verify Actions tab shows run |
| Failing lint/test reports failure | CI-01, CI-02 | Requires actual CI failure scenario | Introduce intentional failure, verify red status |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 1s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-17
