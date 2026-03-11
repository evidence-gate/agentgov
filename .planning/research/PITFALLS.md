# Pitfalls Research

**Domain:** Brownfield multi-app App Store remediation for an existing iOS portfolio
**Researched:** 2026-03-11
**Confidence:** HIGH

Program phase labels used below:
- Phase 0: Portfolio Intake and Baseline
- Phase 1: Legal URL Inventory and Cloudflare Migration
- Phase 2: ASC State Audit and Browser-Only Gap Closure
- Phase 3: Rejection Root Cause Analysis and Corrective Action
- Phase 4: Creative Asset Production and QA
- Phase 5: Portfolio Readiness Gate and Template Hardening

## Critical Pitfalls

### Pitfall 1: Incomplete Legal URL Migration

**What goes wrong:**
Privacy Policy, Terms, Support, Marketing, or License links are updated in drafts but the live `apps.allnew.work` URLs still 404, redirect to legacy GitHub Pages pages, show the wrong app copy, or only work on `workers.dev`. ASC then points to URLs that look migrated in planning documents but are not actually review-safe.

**Why it happens:**
Teams treat "content moved" as equivalent to "migration complete." They skip route-level verification on the final domain, do not keep a per-app URL inventory, and miss that brownfield portfolios often have different required document sets and stale links embedded in existing ASC records.

**How to avoid:**
Create a per-app legal URL matrix before any migration work starts. For each app, list the required public URLs, the final `apps.allnew.work` destination, the current ASC value, and the verification owner. Deploy with minimum-change Cloudflare routing, then verify the final public URL directly on the custom domain before updating ASC metadata.

**Warning signs:**
Legal pages work only on staging or `workers.dev`; the app name on the page does not match the app being remediated; ASC still reads back a `github.io` link; or one document type is missing for only a subset of apps.

**Phase to address:**
Phase 1: Legal URL Inventory and Cloudflare Migration

---

### Pitfall 2: Missing Browser-Only ASC Checks

**What goes wrong:**
Metadata push and asset upload succeed, but the app still cannot move cleanly toward submission because browser-only ASC items remain incomplete. The common misses are privacy nutrition labels, tax category, age rating questionnaire, app review contact info, marketing URL, and license agreement.

**Why it happens:**
Brownfield remediation programs over-trust API coverage. The team sees successful `pull`/`push`/upload operations and assumes ASC is fully configured, even though several blocking items are only visible or editable in the web UI.

**How to avoid:**
Make browser-only verification a mandatory Phase 2 gate for every app, not just rejected ones. Record the six browser-only checks in a shared checklist with evidence links or screenshots, and do not mark an app "submission-ready" until each item is confirmed on the ASC web side.

**Warning signs:**
The app has a "ready" status in the tracker but no browser evidence packet; the pre-submission audit still contains warnings for browser-required items; or the team cannot answer which fields were verified in ASC web versus API.

**Phase to address:**
Phase 2: ASC State Audit and Browser-Only Gap Closure

---

### Pitfall 3: Rejected-App Fixes That Do Not Reach Root Cause

**What goes wrong:**
The team reacts to rejection text with surface edits such as new review notes, changed copy, or a small UI tweak, but the underlying cause remains. The same app gets re-rejected, or sibling apps fail later because the original defect was never mapped across code, metadata, privacy configuration, IAP state, and review setup.

**Why it happens:**
Brownfield apps carry hidden drift between shipped code, archived builds, ASC metadata, compliance settings, and legal pages. Without a root-cause packet, teams fix the symptom named in the rejection message instead of proving which layer actually triggered the rejection.

**How to avoid:**
Require a rejection RCA packet for each blocked app: original rejection text, reproduction path, impacted layers, hypothesized root cause, fix owner, and a post-fix verification plan. A fix is not complete until the remediated build, ASC settings, and related compliance artifacts are all checked together.

**Warning signs:**
The proposed fix starts with "maybe Apple meant..."; there is no reproducible scenario; the build attached in ASC is not the build that contains the fix; or the same rejection theme appears across multiple apps with inconsistent remediation notes.

**Phase to address:**
Phase 3: Rejection Root Cause Analysis and Corrective Action

---

### Pitfall 4: Creative Assets Drift Away from the Actual Product

**What goes wrong:**
Screenshots and preview videos are regenerated, but they no longer match the live app flow, supported locale, current pricing model, or Apple device requirements. Common failures are stale UI captures, unsupported claims, wrong screenshot ordering, mixed locales, and uploading the wrong iPhone size set.

**Why it happens:**
The team skips evidence lock and treats Figma, simulator capture, and ASC upload as separate tracks. In a multi-app program, generic patterns get copied across apps before app-specific facts, build state, and locale-specific messaging are frozen.

**How to avoid:**
Freeze an evidence set per app before copy or layout work: build identifier, locked simulator captures, supported features, locale scope, price model, and target screenshot set. Run creative QA against hook-to-operation-to-proof narrative, title/subtitle alignment, and `APP_IPHONE_67` upload rules before calling the asset set done.

**Warning signs:**
Frames show features that no longer exist; the first screenshot hook does not match the app's actual value proposition; English and Japanese sets share identical copy; or uploaded dimensions mix 6.7-inch and 6.5-inch assumptions.

**Phase to address:**
Phase 4: Creative Asset Production and QA

---

### Pitfall 5: Non-Repeatable One-Off Fixes

**What goes wrong:**
The first app gets unblocked through ad hoc fixes, but nothing is captured in a reusable form. The second and third apps repeat the same discovery work, diverge in naming and checklists, and accumulate inconsistent operating patterns across the portfolio.

**Why it happens:**
The immediate pressure is to rescue the currently rejected apps. Teams optimize for local speed, keep rationale in chat threads, and fail to separate common remediation assets from app-specific overrides.

**How to avoid:**
Every solved issue must write back into a portfolio artifact: legal URL matrix, browser-only ASC checklist, rejection RCA template, creative QA checklist, and final readiness gate. Treat the first successful remediation as the seed for the repeatable program, not as a special case.

**Warning signs:**
The team needs a fresh investigation for the same class of issue on the next app; file names and checklist fields differ per app without reason; or there is no common folder of templates that later app owners can reuse.

**Phase to address:**
Phase 5: Portfolio Readiness Gate and Template Hardening

---

### Pitfall 6: "Uploaded" Is Treated as "Submission-Ready"

**What goes wrong:**
The portfolio reports progress based on upload or push success, even though live ASC state still has missing locales, unattached builds, incomplete IAP review assets, or post-push discrepancies. The program appears done while the most important cross-checks have not happened.

**Why it happens:**
Upload and push events are easy to count, while brownfield readiness requires read-back verification across multiple systems. Teams stop at operational success instead of verifying the final state that App Review will actually see.

**How to avoid:**
Define a single readiness gate per app and for the portfolio: ASC read-back matches intended metadata, required locales are complete, required screenshot and preview sets exist, the correct build is attached, IAP state is ready for review, and known rejection checks are clear. Treat missing evidence as a fail, not as a TODO.

**Warning signs:**
Status updates focus on "pushed" and "uploaded" with no read-back evidence; the correct build number is not recorded next to the app version; IAP review screenshots are absent; or the team cannot show a pass/fail sheet for final readiness.

**Phase to address:**
Phase 5: Portfolio Readiness Gate and Template Hardening

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Repoint only the obvious Privacy Policy link and leave other legal URLs for later | Fastest way to unblock a single visible error | Hidden support, marketing, or license links keep failing in ASC or on review follow-up | Never |
| Verify ASC state only through API pull results | Less manual effort during remediation | Browser-only blockers remain invisible until late-stage review | Never |
| Reuse the first app's screenshot copy and layout across sibling apps with minimal edits | Speeds up asset generation for the next app | Value props blur together, factual drift increases, and portfolio assets become hard to trust | Only for an internal draft before app-specific QA |
| Keep rejection learnings in chat threads instead of a shared RCA template | Saves documentation time in the moment | Same rejection class is rediscovered app by app | Never |
| Mark an app green after metadata push and asset upload | Simple progress reporting | Final submission-readiness remains unknown and rollback work expands | Never |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Cloudflare custom domain hosting | Verifying only `workers.dev` or local preview and assuming the final `apps.allnew.work` route behaves the same | Test the exact production URL and path that ASC will use, and capture the response as migration evidence |
| App Store Connect API + Web UI | Assuming API push coverage includes privacy labels, tax, age rating, review contact, marketing URL, and license agreement | Split the audit into API-verifiable items and browser-only items, and block readiness until both are complete |
| Figma/simulator/composite pipeline | Designing from stale artboards or screenshots that are not tied to a specific build and locale | Lock the evidence set first, then regenerate copy, design, and exports from the same app/build basis |
| ASC screenshot upload | Uploading the wrong size class or mixing screenshot sets across devices and locales | Standardize on the primary `APP_IPHONE_67` set and verify locale/device mapping before upload |
| Rejection remediation across code and ASC | Fixing code without checking the ASC build, compliance settings, and review metadata tied to that code | Verify the exact build number, associated ASC version, and related compliance state as one remediation unit |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Manual app-by-app status tracking in chat or ad hoc notes | Different owners report different truths for the same app | Maintain one portfolio tracker with per-app phase, blocker, owner, and readiness evidence links | Breaks at 4+ apps or 2+ concurrent owners |
| Full creative regeneration for every small message change | Asset iteration slows down and review feedback sits idle | Lock facts first, then limit revisions to one or two variables per cycle | Breaks at 9 apps with multiple locale variants |
| Late browser-only ASC checking | Apps look complete until the end, then bunch up behind web-only blockers | Move browser-only verification into Phase 2, before creative and final gating work piles up | Breaks as soon as 3+ apps reach late-stage readiness together |
| Separate rejection investigation per app with no shared pattern catalog | Similar defects are rediscovered repeatedly | Maintain a shared rejection pattern list with mapped layers and proven checks | Breaks when 2+ apps share the same rejection theme |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Publishing legal or support pages that leak internal contact details, draft notes, or review-only credentials | Internal addresses or test access paths become public and must be rotated | Review legal page content as public-facing production content before deploy |
| Rotating Cloudflare or related deployment secrets by editing code or checked-in config | Secret exposure and unclear rollback path during urgent remediation | Use secret stores and minimum-change deploys, then verify behavior with direct requests |
| Using real user health data or identifiable screenshots in App Store creative assets | Privacy breach and potential App Review or legal escalation | Use sanitized demo data and visual QA before export and upload |
| Sharing one review/demo credential across multiple apps without app-specific scoping | Cross-app access confusion during review and internal debugging | Maintain app-specific review access details and document ownership clearly |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Legal/support links lead to a generic or wrong app page | Users and reviewers lose trust immediately | Route each app to app-specific public pages with consistent naming and content |
| First screenshot focuses on a feature detail instead of the app's core outcome | Store visitors do not understand why the app exists | Keep the first frame as a fast hook, then move into operation and proof |
| Preview video shows setup friction before the core value | Early drop-off and weaker conversion | Show the key outcome in the first seconds, then explain how it works |
| Cross-app asset reuse makes multiple apps look interchangeable | Portfolio credibility drops and keyword intent gets blurred | Preserve a common system, but keep each app's promise, proof, and capture set distinct |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Legal migration:** Often missing final custom-domain verification or ASC read-back of the new URL — verify every public URL from the exact `apps.allnew.work` path stored in ASC
- [ ] **ASC setup:** Often missing browser-only items after successful API push — verify the six browser-only checks with web evidence
- [ ] **Rejected app fix:** Often missing proof that the exact rejection cause was removed from the exact build under review — verify reproduction, fix build, and associated ASC settings together
- [ ] **Creative package:** Often missing app/build/locale consistency and device-size correctness — verify source captures, copy claims, ordering, and `APP_IPHONE_67` compliance
- [ ] **Submission readiness:** Often missing attached build, IAP review readiness, or locale completeness — verify a final read-back gate, not just upload success
- [ ] **Portfolio rollout:** Often missing reusable templates after the first success — verify that the second app can use the same checklists and artifacts with only app-specific overrides

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Incomplete legal URL migration | MEDIUM | Freeze further ASC link updates, rebuild the per-app URL matrix, redeploy the final Cloudflare route, verify the exact custom-domain paths, then update ASC from verified values only |
| Missing browser-only ASC checks | MEDIUM | Re-open the app's audit packet, complete the six browser-only checks in ASC web, capture evidence, and re-run the readiness gate before any "ready" status is restored |
| Rejected-app fixes that do not reach root cause | HIGH | Reconstruct the rejection timeline, reproduce the issue, identify all impacted layers, assign one owner per layer, and validate the fixed build plus ASC state as a single remediation set |
| Creative assets drift away from the product | MEDIUM | Discard the stale evidence set, lock the current build and supported feature facts, regenerate copy and layouts from that basis, and repeat asset QA before upload |
| Non-repeatable one-off fixes | MEDIUM | Pause the next app rollout long enough to capture the missing template, backfill the common checklist or runbook, then resume with the next app using the new artifact |
| "Uploaded" treated as "submission-ready" | HIGH | Replace upload-only status with a formal readiness sheet, re-run read-back checks for every app marked green, and downgrade any app missing evidence until the gate passes |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Incomplete Legal URL Migration | Phase 1 | Every app has a legal URL matrix, each final `apps.allnew.work` URL returns the expected page on the custom domain, and ASC read-back shows only migrated URLs |
| Missing Browser-Only ASC Checks | Phase 2 | Each app has a completed browser-only checklist covering privacy labels, tax, age rating, review contact, marketing URL, and license agreement with evidence attached |
| Rejected-App Fixes That Do Not Reach Root Cause | Phase 3 | Each rejected app has an RCA packet, a fixed build tied to that packet, and a verification note proving the relevant code/config/ASC layers were rechecked together |
| Creative Assets Drift Away from the Actual Product | Phase 4 | Each asset set is tied to a locked build, locale, and capture set, passes copy/device/order QA, and uses the correct upload target size |
| Non-Repeatable One-Off Fixes | Phase 5 | The portfolio contains shared templates for URL migration, ASC audit, rejection RCA, creative QA, and readiness gating, and the second app can run through them without redesigning the process |
| "Uploaded" Is Treated as "Submission-Ready" | Phase 5 | Final readiness reports include ASC read-back, required locale completeness, build attachment, IAP review state, and known rejection checks for every app marked ready |

## Sources

- `/Users/masa/gsd-workspace/.planning/PROJECT.md`
- `/Users/masa/Development/mcp/app-store-director/skills/appstore-listing/SKILL.md`
- `/Users/masa/.codex/skills/cloudflare-workers-ops-docs/SKILL.md`
- `/Users/masa/.codex/skills/appstore-promo-director-ja/SKILL.md`
- `/Users/masa/Development/.claude/rules/30-mcp-ops.md`
- `/Users/masa/Development/AGENTS.md`

---
*Pitfalls research for: brownfield multi-app App Store remediation*
*Researched: 2026-03-11*
