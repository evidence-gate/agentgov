# Project Research Summary

**Project:** AllNew App Store Portfolio Recovery
**Domain:** Brownfield App Store remediation and release-readiness for an existing iOS app portfolio
**Researched:** 2026-03-11
**Confidence:** HIGH

## Executive Summary

This project is not a new product build. It is a brownfield operations program that brings 9 existing iOS apps to a verifiable submission-ready state by fixing three shared failure classes: legal/support URL hosting, App Store creative quality, and ASC review/compliance drift. Research consistently points to an API-first, evidence-first operating model with explicit exceptions for browser-only ASC work.

The recommended approach is to build a small portfolio control plane over the existing app repos, then run shared pipelines for Cloudflare legal-doc migration, ASC audit/remediation, and Figma-backed creative production. The key risk is false progress: teams often treat uploaded assets or changed URLs as "done" without verifying the live custom-domain URLs, browser-only ASC fields, or post-fix live ASC state. The roadmap should therefore front-load inventory and audit work, then use a final readiness gate before any human submission decision.

## Key Findings

### Recommended Stack

The strongest stack is lightweight and operational rather than platform-heavy. Legal/support documents should move to Cloudflare Workers Static Assets on `apps.allnew.work`, creative work should use the existing Figma Max Bridge plus Playwright/compositor path, and ASC should be operated through App Store Listing Director plus `appagent-mcp` with browser automation reserved for Apple fields that the API cannot handle.

GitHub Projects is a reasonable portfolio tracker because it keeps work items, evidence, and execution status close to the repos and review artifacts. Node.js 22 LTS can remain the shared runtime across Workers, Playwright, and local Figma/creative tooling, which keeps the brownfield toolchain coherent.

**Core technologies:**
- Cloudflare Workers Static Assets + Wrangler 4.x: legal/support hosting and routing under `apps.allnew.work` with unified deploys
- App Store Listing Director + `appagent-mcp`: API-first ASC pull/audit/push/upload flow with explicit browser-only exceptions
- Figma Desktop + `figma-llm-max-bridge` + Playwright 1.57: repeatable screenshot/preview production and QA from real app evidence
- GitHub Projects: portfolio-level wave tracking, blockers, owners, and evidence links

### Expected Features

Research shows that the MVP for this program is operational, not product-facing. The table stakes are a portfolio inventory/readiness matrix, rejection intake with evidence, a legal migration playbook, metadata refresh, a screenshot/preview refresh pipeline, a submission-ready compliance gate, and a runbook with approval boundaries. These are the features without which the 9-app program becomes a pile of unrelated tasks.

The best differentiators are not flashy automation. They are reusable templates, evidence-locked creative orchestration, API-first/browser-exception operating rules, and clean per-app submission packets. The main anti-features are bulk auto-submit, full rebrand during recovery, bespoke per-app processes, and browser-first firefighting.

**Must have (table stakes):**
- Portfolio inventory and readiness matrix — users of the process need one truth for app state, blockers, and wave priority
- Rejection intake and evidence bundle — rejected apps need traceable root-cause packets and retest proof
- Legal document migration playbook — every app needs correct public legal/support endpoints before readiness claims are credible
- Screenshot and preview refresh pipeline — the project explicitly includes replacing stale store assets with a reusable process
- Submission-ready compliance gate — "uploaded" must not be treated as "ready"

**Should have (competitive):**
- Reusable portfolio remediation templates — reduce repeat work after the first app wave
- Evidence-locked creative orchestration — keep screenshots/previews aligned with actual app behavior and approved claims
- Per-app submission packet — make final human approval faster and safer

**Defer (v2+):**
- Continuous release-readiness monitoring — useful later, but not required to recover the current portfolio
- Market-intel-driven creative rotation — valuable after readiness, not before
- Dry-run batch execution simulator — premature until the real workflow stabilizes

### Architecture Approach

The architecture should separate a portfolio control plane from shared execution pipelines. The control plane owns app inventory, wave order, blocker status, and evidence-linked readiness state. Shared pipelines own legal-doc migration, creative production, ASC remediation, and QA. Each app keeps its own repo and app-specific deltas; shared infrastructure should not collapse the portfolio into one codebase.

**Major components:**
1. App Inventory Registry — canonical roster of apps, repo paths, ASC identities, slugs, locales, and rejection state
2. Legal-Doc Migration Pipeline — BOTTO-style Cloudflare migration with per-app URL mapping and verification
3. Creative Production Pipeline — simulator captures, Figma recipes, exports, and semantic QA for screenshots/previews
4. ASC Review / Remediation Pipeline — pull live state, classify blockers, fix code/metadata/manual items, and verify read-back
5. Evidence / QA Readiness Gate — combine legal, creative, and ASC proof into a PASS/BLOCK decision
6. Rollout Tracker — wave-level sequencing and handoff, derived from evidence rather than replacing it

### Critical Pitfalls

1. **Incomplete legal URL migration** — verify final `apps.allnew.work` URLs on the custom domain before updating ASC
2. **Missing browser-only ASC checks** — treat the six browser-only Apple items as a mandatory early gate, not a late reminder
3. **Rejected-app fixes that miss root cause** — require an RCA packet that ties rejection text, impacted layers, fix owner, and retest proof together
4. **Creative assets drifting from product truth** — lock build, locale, and approved claims before Figma/Playwright production
5. **"Uploaded" treated as "submission-ready"** — require live ASC read-back, attached build, locale completeness, and evidence-backed final gate

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Portfolio Intake and Wave Definition
**Rationale:** Every later decision depends on having one roster of apps, repo paths, ASC state, slugs, and risk order.
**Delivers:** App inventory manifest, readiness matrix, wave policy, and target-app mapping
**Addresses:** Portfolio inventory and readiness matrix
**Avoids:** App-by-app heroics and status drift

### Phase 2: Legal URL Baseline and Cloudflare Migration Template
**Rationale:** Legal/support URLs are a shared blocker and a reusable template opportunity, so they should be standardized early.
**Delivers:** BOTTO-derived hosting pattern, per-app URL matrix, verified `apps.allnew.work` targets, and migration checklist
**Uses:** Cloudflare Workers Static Assets, Wrangler
**Implements:** Legal-Doc Migration Pipeline

### Phase 3: ASC Audit, Browser-Only Checks, and Rejection RCA
**Rationale:** The team needs live ASC truth before changing creatives or claiming readiness, especially for rejected apps.
**Delivers:** Per-app ASC snapshots, browser-only checklist evidence, rejected-app RCA packets, and blocker classification
**Uses:** App Store Listing Director, `appagent-mcp`
**Implements:** ASC Review / Remediation Pipeline

### Phase 4: App-Specific Corrective Changes and Metadata/Claim Lock
**Rationale:** Rejection fixes and store claims must be stabilized before new screenshots and previews are generated.
**Delivers:** Corrected app behavior/config, approved metadata drafts, approved claim sets, and per-app proof prerequisites
**Uses:** Existing app repos under `/Users/masa/Development`
**Implements:** Bridge between ASC remediation and creative production

### Phase 5: Creative Production and QA
**Rationale:** Once runtime truth and claims are stable, screenshot/preview generation becomes safe to scale across apps.
**Delivers:** Storyboards, simulator captures, Figma-driven compositions, final screenshot/preview bundles, and QA evidence
**Uses:** Figma Max Bridge, Playwright/compositor
**Implements:** Creative Production Pipeline

### Phase 6: Submission-Ready Gate and Template Hardening
**Rationale:** The project definition ends at submission-ready, so the last phase must prove readiness and capture reusable templates.
**Delivers:** Per-app readiness packets, PASS/BLOCK decisions, reusable runbooks/checklists/templates, and rollout handoff
**Uses:** Evidence / QA gate plus tracker updates
**Implements:** Readiness Gate and Rollout Tracker

### Phase Ordering Rationale

- Inventory and legal URL mapping come before app-level fixes because every other track needs stable app identity and public URL targets.
- ASC audit and RCA must precede creative generation so screenshots/previews do not reflect stale claims or broken flows.
- Creative production is intentionally late because it should consume stabilized truth, not shape it.
- The final gate is separate from asset generation and metadata push so "task complete" never replaces "live state verified."

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** Final Cloudflare structure, redirect strategy, and existing BOTTO delta need local repo inspection
- **Phase 3:** Each rejected app's exact Apple rejection reason, affected layer, and browser-only gap must be verified from live ASC state
- **Phase 5:** Figma bridge readiness, template reuse strategy, and preview necessity vary per app and may need local tool checks

Phases with standard patterns (skip research-phase):
- **Phase 1:** Inventory, wave definition, and tracker scaffolding are well-understood operational patterns
- **Phase 6:** Final readiness packet and template hardening are mostly synthesis of prior evidence, not domain discovery

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Grounded in local skills, local toolchain, and official Cloudflare/Apple/GitHub docs |
| Features | MEDIUM | Strong operational fit, but some feature boundaries will tighten after live ASC inspection |
| Architecture | HIGH | Brownfield portfolio boundary model is clear and locally consistent |
| Pitfalls | HIGH | Closely aligned with known ASC/legal/creative failure modes in this domain |

**Overall confidence:** HIGH

### Gaps to Address

- Exact ASC rejection reasons per blocked app: resolve during planning with live ASC pull and rejection review
- Exact per-app legal document set and current URL inventory: resolve by inspecting existing public site/app metadata mappings
- Whether every app truly needs preview video versus screenshots only: resolve per app during creative planning, not globally
- Whether the oxygen app is `OxiSnap` or the local repo/app slug currently differs (`OxiVox` vs `oxisnap`): resolve during inventory phase to avoid ID drift

## Sources

### Primary (HIGH confidence)
- `/Users/masa/gsd-workspace/.planning/research/STACK.md`
- `/Users/masa/gsd-workspace/.planning/research/FEATURES.md`
- `/Users/masa/gsd-workspace/.planning/research/ARCHITECTURE.md`
- `/Users/masa/gsd-workspace/.planning/research/PITFALLS.md`
- `/Users/masa/Development/mcp/app-store-director/skills/appstore-listing/SKILL.md`
- `/Users/masa/.codex/skills/cloudflare-workers-ops-docs/SKILL.md`
- `/Users/masa/Development/.claude/commands/figma-max-bridge.md`
- `https://developers.cloudflare.com/workers/static-assets/`
- `https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots/`

### Secondary (MEDIUM confidence)
- `/Users/masa/.codex/skills/appstore-promo-director-ja/SKILL.md`
- `https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects`

### Tertiary (LOW confidence)
- None

---
*Research completed: 2026-03-11*
*Ready for roadmap: yes*
