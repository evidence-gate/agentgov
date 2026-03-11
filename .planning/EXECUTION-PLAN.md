# Execution Plan: AllNew App Store Portfolio Recovery

## Objective

Move the 9-app portfolio from fragmented blockers to evidence-backed submission-ready packets by executing the remaining work in roadmap order, with rejected apps leading the first remediation wave and reusable operating assets captured for later rollout.

This plan is the cross-phase coordination layer for Phases 1 through 6. It assumes detailed phase plans now exist for each roadmap phase and keeps the project aligned to the approved scope: submission-ready preparation, not actual App Review submission or release publication.

## Critical Path

1. Phase 1 establishes the single source of truth for app identity, ownership, wave order, and evidence linkage.
2. Phase 2 replaces legal/support hosting uncertainty with verified `apps.allnew.work` endpoints.
3. Phase 3 collects live ASC truth and rejected-app root-cause evidence from the verified app roster.
4. Phase 4 applies required corrective changes and locks truthful metadata/claims against verified URLs and ASC prerequisites.
5. Phase 5 produces and uploads creative assets only after claims, runtime truth, and scope are locked.
6. Phase 6 computes PASS/BLOCK readiness decisions, assembles submission packets, and publishes reusable runbooks.

Parallelism is allowed inside a phase by app wave, but no app moves to the next phase until the current phase's exit deliverables are present for that app.

## Per-Phase Deliverables

### Phase 1: Portfolio Intake and Wave Control
**Objective:** Create the control plane for all 9 apps.

**Deliverables:**
- Portfolio inventory registry with repo path, app identity, ASC identity, slug, locale, and blocker state
- Wave order with rejected apps first
- Ownership, next-action, and evidence-link rules for every app

**Exit condition:** Every app can be tracked from one inventory and has a wave, owner, state, and evidence location.

### Phase 2: Legal URL Baseline and Cloudflare Publish
**Objective:** Standardize legal/support hosting and verify the public destination surface.

**Deliverables:**
- Current-versus-target legal/support URL matrix for all apps
- Reusable Cloudflare hosting template derived from BOTTO
- Verified `apps.allnew.work` endpoints for each app, recorded as cutover-ready URLs

**Exit condition:** Each app has verified Cloudflare legal/support URLs that are safe to reference in store-facing surfaces.

### Phase 3: ASC Live Audit and Rejection RCA
**Objective:** Build a live, evidence-backed picture of ASC status and blocked-app root causes.

**Deliverables:**
- Per-app ASC snapshot covering version, build, localization, asset presence, and review state
- Browser-only ASC checklist evidence or explicit blockers
- RCA packet for each rejected app with rejection text, affected layer, planned fix, and retest proof needs

**Exit condition:** The portfolio has verified ASC truth, and every rejected app has an evidence-backed remediation target.

### Phase 4: Remediation and Metadata Lock
**Objective:** Apply verified pre-creative fixes and freeze truthful store-facing claims.

**Deliverables:**
- Store-facing legal/support references updated to verified Cloudflare URLs
- Correct build and submission prerequisites attached, or explicit prerequisite blockers recorded
- Approved localized metadata drafts and claim sets aligned to actual app behavior

**Exit condition:** Each app is either ready for creative production with locked claims/build state or explicitly blocked with owner and proof.

### Phase 5: Creative Production and ASC Asset Refresh
**Objective:** Turn approved claims into production-ready assets and verify live ASC upload state.

**Deliverables:**
- Per-app storyboard tied to approved claims, runtime evidence, locale, and preview scope
- Final screenshot bundles in required device-size and locale mappings
- Preview video bundles where in scope, or an explicit no-preview decision
- ASC upload confirmation and live read-back evidence for screenshots/previews

**Exit condition:** ASC reflects the intended asset set for each in-scope app and the evidence package proves the read-back state.

### Phase 6: Submission-Ready Gate and Reuse Hardening
**Objective:** Decide readiness from evidence, package each app for approval, and preserve the reusable operating model.

**Deliverables:**
- PASS/BLOCK readiness decision for every app
- Per-app submission packet with blockers, URLs, build state, metadata, asset status, and next approval step
- Reusable runbooks, checklists, and templates captured from the first remediation wave

**Exit condition:** The project can hand off complete submission-ready packets without performing the high-risk submission action itself.

## Cross-Phase Dependencies

- Phase 1 inventory is the identity source for all later URL, ASC, creative, and readiness records.
- Phase 2 verified Cloudflare URLs are required before Phase 4 metadata lock and Phase 6 readiness can claim legal/support completeness.
- Phase 3 live ASC audit determines Phase 4 remediation scope and Phase 5 preview/storyboard scope.
- Phase 4 claim lock and build/prerequisite attachment are mandatory inputs to Phase 5 creative production.
- Phase 5 live ASC read-back is mandatory evidence for Phase 6 PASS/BLOCK decisions.
- Phase 6 reuse assets must be extracted from real execution patterns proven during Phases 2 through 5, not from hypothetical workflow notes.

## Blocker Policy

- Treat missing verified Cloudflare URLs, missing browser-only ASC evidence, unresolved rejection RCA, missing build attachment, and unlocked metadata/claims as hard blockers.
- Shared blockers stop downstream work for all impacted apps until an owner, evidence, next action, and unblock condition are recorded.
- App-specific blockers do not stop unaffected apps if current-phase inputs are frozen and evidence remains valid for the apps that continue.
- Do not claim progress from partial mechanics alone. Uploaded assets, edited metadata, or draft URLs are not considered complete until live verification exists.
- Actual submission, release publication, and other high-risk external actions remain outside scope unless separately approved.

## Definition of Finished State

The project is finished when all 9 apps have reached one of two evidence-backed outcomes:

- `PASS`: submission packet complete, verified Cloudflare URLs in place, ASC prerequisites attached, truthful metadata locked, creative assets uploaded and confirmed by ASC read-back.
- `BLOCK`: submission packet complete enough to explain why the app cannot advance yet, including blocker evidence, owner, next action, and retest requirement.

In both cases, the portfolio-level runbooks, templates, and checklists from the first completed wave must be published so later reuse does not depend on rediscovery.
