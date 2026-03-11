# Roadmap: AllNew App Store Portfolio Recovery

## Overview

This brownfield operations roadmap moves the 9-app portfolio from fragmented blockers to evidence-backed submission-ready packets by sequencing portfolio control, legal-host migration, live ASC audit, metadata and claim lock, creative refresh, and final readiness gating. The ordering front-loads shared blockers and proof collection so later app waves reuse the same operating pattern instead of repeating ad hoc remediation.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Portfolio Intake and Wave Control** - Create the single source of truth for app inventory, wave order, and evidence-linked ownership.
- [ ] **Phase 2: Legal URL Baseline and Cloudflare Publish** - Standardize legal/support hosting on `apps.allnew.work` and verify the public cutover surface.
- [ ] **Phase 3: ASC Live Audit and Rejection RCA** - Pull live ASC state, collect browser-only evidence, and classify rejected apps from verified facts.
- [ ] **Phase 4: Remediation and Metadata Lock** - Replace legacy store-facing URLs, attach submission prerequisites, and freeze truthful metadata before creative work.
- [ ] **Phase 5: Creative Production and ASC Asset Refresh** - Create storyboards and final screenshots/previews, upload them, and verify ASC read-back.
- [ ] **Phase 6: Submission-Ready Gate and Reuse Hardening** - Produce PASS/BLOCK decisions, submission packets, and reusable runbooks for later waves.

## Phase Details

### Phase 1: Portfolio Intake and Wave Control
**Goal**: Establish the portfolio control plane for all 9 apps so later phases operate from one roster, one wave policy, and proof-linked ownership.
**Depends on**: Nothing (first phase)
**Requirements**: [PORT-01, PORT-02, PORT-03]
**Success Criteria** (what must be TRUE):
  1. Operator can open a single inventory for all 9 target apps showing repo path, public site slug, ASC status, and current blocker state.
  2. Rejected apps are explicitly prioritized into remediation waves and each app has a visible state of `not_started`, `in_progress`, `blocked`, or `submission_ready`.
  3. Every app record links to an owner, next action, and evidence artifacts so status is derived from proof rather than chat notes.
**Plans**: 2 plans

Plans:
- [ ] 01-01: Build the portfolio inventory registry and target-app identity map.
- [ ] 01-02: Define wave priority, ownership fields, and evidence-linked tracker rules.

### Phase 2: Legal URL Baseline and Cloudflare Publish
**Goal**: Replace legacy legal/support hosting with a verified Cloudflare pattern and prove the public destination surface is ready for cutover.
**Depends on**: Phase 1
**Requirements**: [LEGAL-01, LEGAL-02]
**Success Criteria** (what must be TRUE):
  1. A verified matrix exists for every app showing current legal/support/marketing URLs and the target `apps.allnew.work` URLs.
  2. Each app's legal/support documents are published on Cloudflare and the final custom-domain URLs return the correct app content.
  3. A cutover-ready record exists for every app showing which verified Cloudflare URLs are safe to promote into store-facing references.
**Plans**: 2 plans

Plans:
- [ ] 02-01: Capture the current-versus-target URL matrix and the reusable Cloudflare hosting template.
- [ ] 02-02: Publish, verify, and record the final custom-domain legal/support endpoints and cutover-ready URL set for each app.

### Phase 3: ASC Live Audit and Rejection RCA
**Goal**: Build a live, evidence-backed view of ASC status and blocked-app root causes before any final readiness claim is made.
**Depends on**: Phase 2
**Requirements**: [ASC-01, ASC-02, ASC-03]
**Success Criteria** (what must be TRUE):
  1. A current ASC snapshot exists for each app covering version, build, localization, screenshot/preview presence, and review status.
  2. Browser-only ASC submission checks have evidence for each app, or an explicit blocker is recorded for every missing item.
  3. Every rejected app has a root-cause packet that links rejection reason, affected layers, planned fix, and required retest proof.
**Plans**: 2 plans

Plans:
- [ ] 03-01: Pull live ASC truth and collect browser-only submission evidence across the portfolio.
- [ ] 03-02: Produce rejected-app RCA packets and the remediation backlog from verified ASC findings.

### Phase 4: Remediation and Metadata Lock
**Goal**: Apply the verified pre-creative fixes so every app points at the correct public URLs, has the right ASC prerequisites, and exposes truthful store claims.
**Depends on**: Phase 3
**Requirements**: [LEGAL-03, ASC-04, META-01]
**Success Criteria** (what must be TRUE):
  1. Each app's store-facing legal/support references use only verified Cloudflare URLs and no legacy GitHub Pages URLs remain in the intended submission set.
  2. Each app is tied to the correct build and submission prerequisites, or is explicitly blocked with the missing prerequisite called out.
  3. Approved localized App Store metadata drafts and claim sets exist for each app and match the actual behavior of that app.
**Plans**: 2 plans

Plans:
- [ ] 04-01: Replace legacy store-facing URLs and attach build/submission prerequisites from the audit backlog.
- [ ] 04-02: Lock approved metadata and claims from verified post-remediation runtime truth.

### Phase 5: Creative Production and ASC Asset Refresh
**Goal**: Turn approved claims into production-ready creative assets and confirm ASC reflects the intended upload state.
**Depends on**: Phase 4
**Requirements**: [CRTV-01, CRTV-02, CRTV-03, CRTV-04]
**Success Criteria** (what must be TRUE):
  1. A screenshot or preview storyboard exists for each in-scope app, grounded in approved claims, runtime evidence, and target locale.
  2. Final screenshot sets exist in the required device-size and locale mapping for every in-scope app.
  3. Preview video assets exist for apps where previews are part of scope, and non-preview apps have an explicit scope decision recorded.
  4. Refreshed screenshots and previews are uploaded to ASC, and live read-back matches the intended app, locale, and device set.
**Plans**: 2 plans

Plans:
- [ ] 05-01: Create per-app storyboards and generate localized screenshot and preview bundles with QA evidence.
- [ ] 05-02: Upload refreshed assets to ASC and verify live read-back integrity.

### Phase 6: Submission-Ready Gate and Reuse Hardening
**Goal**: Decide readiness from evidence, package each app for human approval, and capture reusable operating assets for later waves.
**Depends on**: Phase 5
**Requirements**: [READY-01, READY-02, READY-03]
**Success Criteria** (what must be TRUE):
  1. Every app has a PASS/BLOCK submission-readiness decision computed from legal URLs, ASC checks, build state, metadata, creative assets, and rejection evidence.
  2. Every app has a submission packet that includes blockers, verified URLs, asset status, build state, ASC read-back, and the next human approval step.
  3. Reusable templates, checklists, and runbooks from the first remediation wave are published and referenced for later-app rollout.
**Plans**: 2 plans

Plans:
- [ ] 06-01: Compute readiness decisions and assemble per-app submission packets.
- [ ] 06-02: Publish reusable runbooks, checklists, and templates for later waves.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Portfolio Intake and Wave Control | 0/2 | Not started | - |
| 2. Legal URL Baseline and Cloudflare Publish | 0/2 | Not started | - |
| 3. ASC Live Audit and Rejection RCA | 0/2 | Not started | - |
| 4. Remediation and Metadata Lock | 0/2 | Not started | - |
| 5. Creative Production and ASC Asset Refresh | 0/2 | Not started | - |
| 6. Submission-Ready Gate and Reuse Hardening | 0/2 | Not started | - |
