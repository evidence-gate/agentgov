# Requirements: AllNew App Store Portfolio Recovery

**Defined:** 2026-03-11
**Core Value:** 各アプリを、法務・クリエイティブ・審査指摘の3点で止まらない状態にそろえ、App Review に再投入できる提出準備完了状態まで持っていくこと。

## v1 Requirements

### Portfolio Control

- [ ] **PORT-01**: Operator can view a single inventory of all 9 target apps with repo path, public site slug, ASC status, and current blocker state.
- [ ] **PORT-02**: Operator can assign wave priority with rejected apps first and track each app as `not_started`, `in_progress`, `blocked`, or `submission_ready`.
- [ ] **PORT-03**: Operator can link each app record to its owner, next action, and evidence artifacts so status is derived from proof instead of chat notes.

### Legal Hosting

- [ ] **LEGAL-01**: Operator can capture the current legal/support/marketing URL set and the target `apps.allnew.work` URL set for each app in one verified matrix.
- [ ] **LEGAL-02**: Operator can publish app-specific legal/support documents on Cloudflare under `apps.allnew.work` and verify the final custom-domain URLs return the correct app content.
- [ ] **LEGAL-03**: Operator can update each app's store-facing references to use only verified Cloudflare legal/support URLs, never legacy GitHub Pages URLs.

### ASC Audit And Rejection Handling

- [ ] **ASC-01**: Operator can pull live ASC state for each app, including version, build, localization, screenshot/preview presence, and current review status.
- [ ] **ASC-02**: Operator can record evidence for the browser-only ASC checks required for submission readiness, including privacy labels, tax, age rating, review contact, marketing URL, and license agreement.
- [ ] **ASC-03**: Operator can create a root-cause packet for each rejected app that captures the rejection reason, affected layers, planned fix, and required retest proof.
- [ ] **ASC-04**: Operator can confirm that the correct build and submission prerequisites are attached for each app, or explicitly block the app if they are not.

### Metadata And Creative Production

- [ ] **META-01**: Operator can produce updated localized App Store metadata and approved claims that match the actual behavior of each app.
- [ ] **CRTV-01**: Operator can create a screenshot/preview storyboard for each app from approved claims, runtime evidence, and target locale.
- [ ] **CRTV-02**: Operator can generate final App Store screenshot sets in the required target size and locale mapping for each app.
- [ ] **CRTV-03**: Operator can generate approved preview video assets for apps where preview publication is part of the refresh scope.
- [ ] **CRTV-04**: Operator can upload refreshed screenshot and preview assets to ASC and verify the live read-back matches the intended app, locale, and device set.

### Readiness Gate And Reuse

- [ ] **READY-01**: Operator can compute a PASS/BLOCK submission-readiness decision per app based on legal URLs, ASC checks, build state, metadata, creative assets, and rejection evidence.
- [ ] **READY-02**: Operator can assemble a per-app submission packet that includes blockers, verified URLs, asset status, build state, ASC read-back, and the next human approval step.
- [ ] **READY-03**: Operator can publish reusable templates, checklists, and runbooks from the first remediation wave so later apps do not require process rediscovery.

## v2 Requirements

### Portfolio Automation

- **AUTO-01**: Operator can run a dry-run batch simulator that estimates which apps can advance to the next stage without modifying live state.
- **AUTO-02**: Operator can detect cross-app fix patterns automatically and suggest which sibling apps need the same remediation.

### Ongoing Readiness

- **MON-01**: Operator can monitor readiness drift after remediation and alert when legal URLs, ASC assets, or metadata fall out of sync.
- **MON-02**: Operator can keep a rolling portfolio dashboard of freshness, risk, and next-review cadence after the initial recovery project ends.

### Growth Optimization

- **GROW-01**: Operator can use market-intel-driven creative rotation to improve conversion after the portfolio is already submission-ready.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Actual App Review submission and release publication | This project stops at submission-ready state; irreversible actions require separate approval |
| New app development or major new end-user features | The goal is remediation and release-readiness for existing apps, not product expansion |
| Full portfolio rebrand | Broad branding work would delay blocked apps and is not required for submission readiness |
| Replatforming the legal host into a full CMS or SPA | Stable, verifiable legal/support pages are sufficient for the current goal |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PORT-01 | TBD | Pending |
| PORT-02 | TBD | Pending |
| PORT-03 | TBD | Pending |
| LEGAL-01 | TBD | Pending |
| LEGAL-02 | TBD | Pending |
| LEGAL-03 | TBD | Pending |
| ASC-01 | TBD | Pending |
| ASC-02 | TBD | Pending |
| ASC-03 | TBD | Pending |
| ASC-04 | TBD | Pending |
| META-01 | TBD | Pending |
| CRTV-01 | TBD | Pending |
| CRTV-02 | TBD | Pending |
| CRTV-03 | TBD | Pending |
| CRTV-04 | TBD | Pending |
| READY-01 | TBD | Pending |
| READY-02 | TBD | Pending |
| READY-03 | TBD | Pending |

**Coverage:**
- v1 requirements: 18 total
- Mapped to phases: 0
- Unmapped: 18 ⚠️

---
*Requirements defined: 2026-03-11*
*Last updated: 2026-03-11 after initial definition*
