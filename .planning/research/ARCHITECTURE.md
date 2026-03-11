# Architecture Research

**Domain:** Brownfield multi-app App Store remediation program
**Researched:** 2026-03-11
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                    Portfolio Control Plane                        │
├────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐ │
│  │ App Inventory    │  │ Rollout Tracker  │  │ Evidence / QA    │ │
│  │ Registry         │  │ Waves + Status   │  │ Readiness Gate   │ │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘ │
│           │                     │                     │           │
├───────────┴─────────────────────┴─────────────────────┴───────────┤
│                    Shared Execution Pipelines                      │
├────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐ │
│  │ Legal-Doc        │  │ Creative         │  │ ASC Review /     │ │
│  │ Migration        │  │ Production       │  │ Remediation      │ │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘ │
│           │                     │                     │           │
├───────────┴─────────────────────┴─────────────────────┴───────────┤
│                 Brownfield Source and Target Systems               │
├────────────────────────────────────────────────────────────────────┤
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────────────┐ │
│  │ App Repos      │ │ Cloudflare     │ │ ASC + Figma + Xcode   │ │
│  │ /Development   │ │ apps.allnew... │ │ Simulator + QA Stores │ │
│  └────────────────┘ └────────────────┘ └────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

This program should be run as a portfolio control plane over existing app repositories, not as a monolithic rewrite. Shared pipelines own repeatable remediation logic, while each app keeps its repo, feature truth, and store identity.

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| App Inventory Registry | Canonical roster of the 9 apps, repo paths, ASC IDs, locales, rejection state, hosting slug, and wave priority | Versioned YAML/JSON manifest plus pulled ASC snapshots |
| Legal-Doc Migration | Move each app from legacy GitHub Pages legal hosting to Cloudflare-backed support/legal URLs under `apps.allnew.work` | Shared page shell, per-app content fragments, deployment manifest, URL verification log |
| Creative Production | Turn approved claims into screenshots and preview assets without inventing unsupported UI or privacy promises | Simulator capture, Figma Max Bridge batch commands, asset manifest, export bundle |
| ASC Review / Remediation | Pull live ASC state, classify blockers, map fixes to code/config/metadata/browser-only tasks, and verify post-fix state | `appagent-mcp` API-first sync, rejection matrix, browser-only checklist, push plan |
| Evidence / QA Readiness Gate | Decide whether an app is genuinely resubmission-ready based on proof, not on task completion claims | Runtime evidence, screenshot semantic review, legal URL checks, quality self-assessment, readiness report |
| Rollout Tracker | Sequence waves, expose blocker ownership, and track app-level readiness without becoming the source of truth for content | Wave board, blocker ledger, submission-ready checklist, handoff notes |

### Recommended Build Order

1. Build the `App Inventory Registry` first. Every later pipeline needs stable app IDs, repo paths, slugs, rejection state, and target locales.
2. Establish the shared `Legal-Doc Migration` baseline next, using BOTTO as the reference pattern for Cloudflare-hosted support/legal pages.
3. Pull and normalize current `ASC Review / Remediation` state before generating new assets, so rejection-driven fixes shape the source truth.
4. Fix app-level feature/compliance truth in code, metadata drafts, and legal claims before running large creative batches.
5. Run `Creative Production` after the runtime truth is stable, because screenshots and previews should be derived from what the app can actually demonstrate.
6. Run `Evidence / QA Readiness Gate` on the combined legal, creative, and ASC outputs, and block any app missing proof.
7. Update `Rollout Tracker` only from verified outputs, then schedule wave-by-wave submission preparation with rejected apps first.

## Recommended Project Structure

```
portfolio-remediation/
├── inventory/                 # Portfolio control-plane manifests
│   ├── apps.yaml              # App roster, repo paths, ASC IDs, slugs, wave
│   ├── asc-snapshots/         # Pulled ASC state and rejection snapshots
│   └── waves.yaml             # Rollout grouping and priority policy
├── legal/                     # Legal migration control artifacts
│   ├── templates/             # Shared Terms/Privacy/FAQ shell and clause blocks
│   ├── per-app/               # App-specific content, URL mapping, publish checklist
│   └── deploy/                # Cloudflare deploy manifests and verification logs
├── creative/                  # Screenshot and preview production assets
│   ├── storyboards/           # Claim-approved screenshot plans
│   ├── figma-recipes/         # Bridge batch commands and template mapping
│   ├── captures/              # Raw simulator PNG/MP4 evidence
│   └── exports/               # Final ASC-ready screenshot and preview bundles
├── remediation/               # ASC-facing remediation work packages
│   ├── findings/              # Rejection summaries and root-cause mapping
│   ├── metadata/              # JA/EN metadata drafts and push payloads
│   ├── browser-only/          # Privacy, age rating, review contact manual queue
│   └── push-plans/            # Per-app push and verification steps
├── evidence/                  # Fail-closed proof for readiness decisions
│   ├── legal/                 # URL checks, rendered pages, clause coverage
│   ├── creative/              # Runtime-semantic and screenshot-semantic evidence
│   ├── asc/                   # Read-back verification and checklist results
│   └── readiness/             # Final PASS/BLOCK package per app
└── rollout/                   # Program-level sequencing and reporting
    ├── status-board.yaml      # App state, owner, next action, blocker
    ├── wave-reports/          # Wave-level summaries and handoff notes
    └── exceptions/            # Deferred issues and explicit risk acceptance
```

### Structure Rationale

- **`inventory/`:** Keeps portfolio identity, priority, and external IDs in one place so the rest of the program can stay stateless and repeatable.
- **`legal/`:** Separates canonical legal-content migration from app repos and from ASC metadata, which reduces drift during Cloudflare cutover.
- **`creative/`:** Isolates generation inputs, raw captures, and exported deliverables so QA can prove asset provenance.
- **`remediation/`:** Holds ASC-facing work products and manual-only tasks without mixing them into the source repositories.
- **`evidence/`:** Makes readiness derived from artifacts, not from narrative status updates.
- **`rollout/`:** Tracks sequencing and risk decisions, but should never override failed evidence or unresolved blockers.

## Architectural Patterns

### Pattern 1: Portfolio Control Plane + Per-App Work Packages

**What:** Keep one shared control plane for app roster, waves, and common templates, while each app keeps its own repo and app-specific remediation package.
**When to use:** Brownfield portfolios where multiple apps share the same remediation categories but differ in app state, rejection history, and content.
**Trade-offs:** Strong reuse and easier prioritization, but it requires disciplined manifest maintenance to avoid stale app metadata.

**Example:**
```yaml
apps:
  - id: babyvox
    repo_path: /Users/masa/Development/projects/BabyVox
    asc_app_id: "1234567890"
    legal_slug: babyvox
    locales: [ja, en-US]
    wave: 1
    rejection_state: rejected
    pipelines: [legal, creative, asc, evidence]
```

### Pattern 2: Truth-First Creative Pipeline

**What:** Creative production consumes approved feature truth, legal truth, and runtime captures before it produces screenshots or preview videos.
**When to use:** Any App Store remediation where creative assets can accidentally over-promise, especially health/privacy apps with review sensitivity.
**Trade-offs:** Creative throughput is slower at the beginning, but false claims and rework drop sharply because assets are anchored to real app behavior.

**Example:**
```json
{
  "app": "oxisnap",
  "approved_claims": [
    "camera capture",
    "manual correction",
    "history tracking"
  ],
  "required_evidence": [
    "runtime_smoke",
    "privacy_policy_url_check",
    "asc_pull_snapshot"
  ],
  "creative_can_start": true
}
```

### Pattern 3: Evidence-First Readiness Gate

**What:** Rollout status changes only after legal hosting, creative exports, ASC read-back, and blocker-specific QA artifacts are present and internally consistent.
**When to use:** Any portfolio program where "done" must mean "resubmission-ready," not "someone says the task is complete."
**Trade-offs:** More artifact generation and storage overhead, but much lower risk of last-minute ASC surprises or unsupported screenshots.

**Example:**
```yaml
readiness:
  app: thermosnap
  legal_urls: PASS
  asc_browser_only_items: BLOCKED
  screenshot_semantic: PASS
  rejection_fix_verification: PASS
  overall: BLOCK
  reason: "Privacy answers saved but not published in ASC"
```

## Data Flow

### Request Flow

```
[Wave Selection]
    ↓
[App Inventory] → [Per-App Work Package] → [Legal / Creative / ASC Pipelines]
    ↓                                                   ↓
[Rollout Tracker] ← [Evidence / QA Readiness Gate] ← [Proof Bundle]
```

### State Management

```
[Readiness Ledger]
    ↓ (query)
[Pipeline Owners] ←→ [Status Updates] → [Blocker Queue] → [Readiness Ledger]
```

The tracker should store derived state only: `not_started`, `in_progress`, `blocked`, `ready_for_submission_prep`, `deferred`. Source truth stays in manifests, app repos, Cloudflare deploy outputs, and ASC snapshots.

### Key Data Flows

1. **Inventory bootstrap:** Project roster, local repo paths, ASC identities, and rejection flags are normalized into one manifest that downstream pipelines can consume deterministically.
2. **Legal migration flow:** Canonical legal content plus app-specific clauses become published Cloudflare URLs, then those verified URLs feed back into metadata and review checklists.
3. **Creative production flow:** Approved claims, simulator captures, and Figma recipes generate screenshots and previews, which then pass semantic QA before they are considered uploadable.
4. **ASC remediation flow:** ASC pull snapshots and rejection messages are translated into code/config/metadata/manual fix queues, then post-fix read-back confirms the live state matches the intended fix.
5. **Evidence consolidation flow:** Legal proof, creative proof, ASC proof, and manual checklist outcomes are merged into one readiness package that the rollout tracker uses to decide wave advancement.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-3 apps | Manual wave tracking is acceptable, but still keep one inventory manifest and one evidence folder per app. |
| 4-10 apps | Move to manifest-driven batches for ASC pull, legal publish verification, creative export, and readiness scoring. This is the target shape for the current 9-app portfolio. |
| 10+ apps | Add queue-based execution, immutable snapshot retention, and explicit domain owners for legal, creative, ASC, and QA so parallel work does not overwrite status or evidence. |

### Scaling Priorities

1. **First bottleneck:** Truth drift between app behavior, legal claims, and ASC metadata. Fix it with one per-app manifest and evidence-backed approval gates before asset generation.
2. **Second bottleneck:** Creative and QA throughput. Fix it with reusable Figma templates, manifest-driven batches, and separate raw-capture versus export storage so reruns stay cheap.

## Anti-Patterns

### Anti-Pattern 1: App-by-App Heroics

**What people do:** Treat every app as a one-off rescue and re-discover the same legal, creative, and ASC steps repeatedly.
**Why it's wrong:** Shared portfolio knowledge never compounds, blocker classifications stay inconsistent, and later apps take just as long as early ones.
**Do this instead:** Build one shared control plane and reusable pipeline templates, then express only per-app deltas in manifests and findings.

### Anti-Pattern 2: External System as Source of Truth

**What people do:** Edit screenshots in Figma, metadata in ASC, and legal URLs on Cloudflare without preserving the manifest or source artifact that generated them.
**Why it's wrong:** Drift becomes invisible, reruns become manual archaeology, and QA cannot prove that live assets still match approved claims.
**Do this instead:** Keep canonical manifests, content sources, and export logs in the remediation workspace, and treat external systems as deploy targets plus verification surfaces.

### Anti-Pattern 3: Creative Before Compliance Truth

**What people do:** Start screenshot redesign immediately after seeing a rejection notice, before confirming what the app can actually claim or what legal/privacy answers must say.
**Why it's wrong:** Screenshots, preview scripts, and metadata are likely to encode unsupported promises and require rework after remediation.
**Do this instead:** Stabilize rejection fixes, legal URL targets, and approved claim sets first, then run the creative pipeline from runtime-backed evidence.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Cloudflare (`apps.allnew.work`) | Deploy verified legal/support pages from shared templates plus per-app content | Keep routing minimal, verify published URLs before updating ASC, and prefer small deploy deltas during migration. |
| Figma Max Bridge | Generate or update screenshot frames through manifest-driven local bridge batches | Plugin API handles canvas edits; the bridge client should emit batch/evidence logs for later QA. |
| App Store Connect | Use `appagent-mcp` as the API-first integration layer for pull, push, and verification | Browser automation is fallback-only for API-inoperable settings; submit and auth remain human-owned. |
| Xcode / iOS Simulator | Produce runtime truth, raw screenshots, and preview recordings from the real app builds | 6.7-inch assets remain the primary App Store target, with captures stored before composition. |
| Evidence / QA automation | Validate runtime semantics, legal URLs, ASC read-back, and checklist completeness | The readiness decision should consume these artifacts, not replace them with manual judgment. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| App Inventory Registry ↔ Legal-Doc Migration | Manifest + publish checklist | Legal pipeline should consume app slugs/locales only, not infer them from live URLs. |
| App Inventory Registry ↔ Creative Production | Manifest + approved claim set | Creative should not read raw ASC rejection text directly; it should consume normalized claim/truth inputs. |
| Legal-Doc Migration ↔ ASC Review / Remediation | Verified URL contract | ASC metadata should reference only already-published and checked legal URLs. |
| Creative Production ↔ Evidence / QA | Asset manifest + raw/runtime evidence | QA needs both final exports and their provenance to catch fabricated or stale visuals. |
| ASC Review / Remediation ↔ Evidence / QA | ASC snapshots + blocker checklist | Read-back verification must be independent from the process that pushed changes. |
| Evidence / QA ↔ Rollout Tracker | PASS/BLOCK readiness package | Tracker state is derived; it must not manually override missing proof or failed checks. |

## Sources

- `/Users/masa/gsd-workspace/.planning/PROJECT.md`
- `/Users/masa/.codex/get-shit-done/templates/research-project/ARCHITECTURE.md`
- `/Users/masa/Development/mcp/app-store-director/skills/appstore-listing/SKILL.md`
- `/Users/masa/.codex/skills/cloudflare-workers-ops-docs/SKILL.md`
- `/Users/masa/Development/.claude/commands/figma-max-bridge.md`
- `/Users/masa/Development/IOS_APP_POLICY.md`
- `/Users/masa/Development/.claude/docs/DESIGN.md`
- `/Users/masa/Development/.claude/rules/30-mcp-ops.md`
- `/Users/masa/Development/.claude/rules/40-project-governance.md`
- `/Users/masa/Development/.claude/rules/45-quality-driven-execution.md`
- `/Users/masa/Development/.claude/rules/50-ios-development.md`

---
*Architecture research for: brownfield multi-app App Store remediation program*
*Researched: 2026-03-11*
