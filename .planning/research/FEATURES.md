# Feature Research

**Domain:** Portfolio-scale App Store remediation and release-readiness operations for existing iOS apps
**Researched:** 2026-03-11
**Confidence:** MEDIUM

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Portfolio inventory and readiness matrix | A 9-app recovery program needs one place to see per-app state, blockers, owners, and submission readiness | MEDIUM | Depends on app/version inventory and blocker capture; MVP |
| Rejection intake and evidence bundle | Rejected apps cannot be recovered without a structured record of rejection reason, impacted surface, fix owner, and retest proof | HIGH | Depends on ASC status review, local app inspection, and retest evidence; MVP |
| Legal document migration playbook | Release readiness requires working support/privacy/license destinations, not ad-hoc URL fixes | MEDIUM | Depends on BOTTO-style hosting pattern, Cloudflare target, and per-app URL mapping; MVP |
| Metadata refresh workflow | Existing apps need locale-safe title/subtitle/description/What's New updates before they are truly ready again | MEDIUM | Depends on localization inventory and App Store metadata rules; MVP |
| Screenshot and preview refresh pipeline | Portfolio recovery explicitly includes replacing stale or missing App Store visuals with reusable production steps | HIGH | Depends on simulator captures, Figma bridge workflow, copy/layout lock, and QA; MVP |
| Submission-ready compliance gate | The program needs a clear stop/go check across metadata, assets, legal, build linkage, and submission settings | HIGH | Depends on listing audit rules and per-app evidence packets; MVP |
| Portfolio runbook with approval boundaries | Multiple apps and high-risk release steps require explicit ownership, checkpoints, and irreversible-action boundaries | LOW | Depends on reusable templates and operator discipline; MVP |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Reusable portfolio remediation templates | Turns one-off fixes into repeatable playbooks, reducing future recovery cost across similar apps | MEDIUM | Builds on the runbook, checklists, and evidence schema; v1 |
| API-first, browser-exception operating model | Reduces manual ASC drift and makes repeated runs more auditable by standardizing tool routing | HIGH | Depends on appagent-style workflow selection and documented browser-only exceptions; v1 |
| Evidence-locked creative orchestration | Keeps refreshed visuals tied to real app evidence with a consistent `hook -> operation -> proof` narrative and QA gate | HIGH | Depends on copy lock, layout lock, prompt lock, and Figma export flow; v1 |
| Priority sequencing by portfolio risk | Unblocks rejected or high-business-risk apps first and reuses proven fixes on lower-risk apps later | LOW | Depends on the readiness matrix and blocker scoring model; MVP |
| Per-app submission packet | Produces a clean handoff bundle per app instead of scattered notes, making final approval fast and low-friction | MEDIUM | Depends on all remediation outputs being linked into one packet; v1 |
| Cross-app delta audit | Detects when a fix or policy update should propagate to other apps in the portfolio, preventing repeat drift | HIGH | Depends on app taxonomy, shared patterns, and structured evidence; later |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| One-click auto-submit for the whole portfolio | Feels like the fastest path to reopen all apps | Collapses app-specific approval, hides unresolved blockers, and crosses high-risk submission boundaries | Produce submission-ready packets and keep final submit as an explicit approval step |
| Full rebrand before remediation | Sounds like a chance to fix everything at once | Explodes scope, delays blocked apps, and mixes recovery work with optional brand exploration | Limit v1 to release-readiness assets and obvious trust/compliance defects |
| Bespoke process for every app | Each app appears unique, so teams want custom handling | Destroys reuse, makes audits inconsistent, and slows portfolio throughput | Use a shared playbook with app-specific delta sections |
| Browser-first ASC firefighting | Operators often think clicking through the web UI is faster | It is fragile, hard to audit, and hard to repeat across apps | Use API-first operations and reserve browser steps for confirmed exceptions |
| Push every app through every stage in parallel | Looks efficient on paper | Overloads shared bottlenecks, hides learnings, and multiplies failures before the process hardens | Sequence the rejected cohort first, then roll out the proven path in waves |

## Feature Dependencies

```text
[Submission-Ready Compliance Gate]
    ├──requires──> [Portfolio Inventory and Readiness Matrix]
    ├──requires──> [Rejection Intake and Evidence Bundle]
    ├──requires──> [Legal Document Migration Playbook]
    ├──requires──> [Metadata Refresh Workflow]
    └──requires──> [Screenshot and Preview Refresh Pipeline]
                           └──requires──> [Evidence-Locked Creative Orchestration]
                                              ├──requires──> [Copy Lock]
                                              └──requires──> [Layout Lock]

[Priority Sequencing by Portfolio Risk] ──enhances──> [Portfolio Inventory and Readiness Matrix]

[One-Click Auto-Submit] ──conflicts──> [Portfolio Runbook with Approval Boundaries]
```

### Dependency Notes

- **Submission-Ready Compliance Gate requires Portfolio Inventory and Readiness Matrix:** the gate is only meaningful if each app/version/build has a known status, owner, and blocker list.
- **Submission-Ready Compliance Gate requires Rejection Intake and Evidence Bundle:** rejected apps need traceable proof that each rejection cause was understood, fixed, and retested before they can be marked ready.
- **Submission-Ready Compliance Gate requires Legal Document Migration Playbook:** broken support/privacy/license endpoints create release-readiness gaps even if code and assets are fixed.
- **Submission-Ready Compliance Gate requires Metadata Refresh Workflow:** the program cannot call an app ready if store text, locale coverage, or release notes still lag behind the intended release state.
- **Screenshot and Preview Refresh Pipeline requires Evidence-Locked Creative Orchestration:** creative refresh must stay tied to actual app behavior, otherwise the portfolio risks claim drift and review issues.
- **Priority Sequencing by Portfolio Risk enhances Portfolio Inventory and Readiness Matrix:** raw status data becomes operationally useful only when it drives wave ordering and resource focus.
- **One-Click Auto-Submit conflicts with Portfolio Runbook with Approval Boundaries:** irreversible submit actions need app-level review and approval, so they should not be buried inside a bulk automation shortcut.

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept.

- [ ] Portfolio inventory and readiness matrix — establishes the single source of truth for all 9 apps
- [ ] Rejection intake and evidence bundle — focuses the first wave on blocked apps with clear proof requirements
- [ ] Legal document migration playbook — closes the shared hosting/compliance gap across the portfolio
- [ ] Metadata refresh workflow — makes locale and release-note remediation repeatable instead of ad hoc
- [ ] Screenshot and preview refresh pipeline — refreshes stale App Store assets with a reusable, evidence-based process
- [ ] Submission-ready compliance gate — defines when an app is genuinely ready for final approval
- [ ] Portfolio runbook with approval boundaries — keeps the program auditable and safe around irreversible actions

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] Reusable portfolio remediation templates — add when the first wave proves which artifacts actually reduce repeat work
- [ ] Per-app submission packet generator — add when reviewers want a consistent final handoff bundle
- [ ] API-first, browser-exception operating model hardening — add when common browser-only cases are understood and can be documented cleanly
- [ ] Cross-app delta audit for shared fixes — add once there is enough structured evidence to automate propagation decisions

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Continuous release-readiness monitor — defer until the remediation baseline is stable and there is value in ongoing monitoring
- [ ] Portfolio risk dashboard with freshness alerts — defer until operational data exists for trend-based prioritization
- [ ] Dry-run batch execution simulator — defer until the live workflow is stable enough to model safely
- [ ] Market-intel-driven creative rotation — defer until basic readiness is solved and the focus shifts to conversion lift

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Portfolio inventory and readiness matrix | HIGH | MEDIUM | P1 |
| Rejection intake and evidence bundle | HIGH | HIGH | P1 |
| Legal document migration playbook | HIGH | MEDIUM | P1 |
| Metadata refresh workflow | HIGH | MEDIUM | P1 |
| Screenshot and preview refresh pipeline | HIGH | HIGH | P1 |
| Submission-ready compliance gate | HIGH | HIGH | P1 |
| Portfolio runbook with approval boundaries | HIGH | LOW | P1 |
| Reusable portfolio remediation templates | MEDIUM | MEDIUM | P2 |
| Per-app submission packet | MEDIUM | MEDIUM | P2 |
| API-first, browser-exception operating model | MEDIUM | HIGH | P2 |
| Cross-app delta audit | MEDIUM | HIGH | P3 |
| Continuous release-readiness monitor | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Competitor A | Competitor B | Our Approach |
|---------|--------------|--------------|--------------|
| Portfolio readiness tracking | Ad hoc spreadsheet and chat follow-up per app | Single-app tooling with no portfolio roll-up | Maintain one readiness matrix with blockers, owners, dependencies, and approval state across all apps |
| Rejection remediation | Reactive manual note-taking from rejection history | Metadata-only audit that misses code/legal/creative links | Build evidence bundles that map each rejection to fixes, retest proof, and portfolio reuse potential |
| Creative refresh workflow | Outsourced or manual design passes per app | Screenshot automation without a director layer | Use evidence lock plus `hook -> operation -> proof` orchestration and Figma-backed exports |
| Submission governance | Human checklist with weak audit trail | Automation-biased flow that tries to push through submission | Use an automated readiness gate, then preserve explicit approval before irreversible actions |

## Sources

- `/Users/masa/gsd-workspace/.planning/PROJECT.md`
- `/Users/masa/.codex/get-shit-done/templates/research-project/FEATURES.md`
- `/Users/masa/Development/mcp/app-store-director/skills/appstore-listing/SKILL.md`
- `/Users/masa/.codex/skills/appstore-promo-director-ja/SKILL.md`
- `/Users/masa/.codex/skills/appstore-promo-director-ja/references/orchestration-playbook-ja.md`
- `/Users/masa/Development/.claude/commands/figma-max-bridge.md`
- `/Users/masa/Development/IOS_APP_POLICY.md`
- Operational baselines analyzed: ad hoc per-app remediation, single-app listing automation, and creative-only asset refresh workflows

---
*Feature research for: App Store remediation and release-readiness operations*
*Researched: 2026-03-11*
