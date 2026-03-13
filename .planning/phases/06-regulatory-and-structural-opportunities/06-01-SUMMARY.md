---
phase: 06-regulatory-and-structural-opportunities
plan: 01
subsystem: research
tags: [entry-barriers, moat-analysis, small-team-feasibility, oss-strategy, soc2, solo-founder]

requires:
  - phase: 04-competitive-analysis-and-gaps
    provides: Big Tech absorption risk ratings, OSS vs SaaS positioning per category
  - phase: 05-developer-pain-points-and-market-sizing
    provides: Market size estimates (TAM/SAM/SOM) and developer pain rankings per category
provides:
  - Entry barrier assessment for all 14 categories with small-team feasibility ratings
  - Deep moat analysis for top 3 categories (Cost Control, HITL, Error Handling)
  - Solo developer build timelines (12-month roadmap per category)
  - Japan-based global expansion strategy assessment
affects: [phase-07-revenue-model-analysis, phase-08-strategic-synthesis]

tech-stack:
  added: []
  patterns: [entry-barrier-framework, moat-scoring, build-timeline-estimation]

key-files:
  created:
    - report/06-regulatory-and-structural-opportunities-part1.md
  modified: []

key-decisions:
  - "3 of 14 categories rated Feasible for small-team entry: Cost Control, HITL, Error Handling (bundled)"
  - "7 categories rated Infeasible due to structural barriers (capital, trust, competition)"
  - "SOC 2 not needed Day 1 for OSS-first strategy -- defer to month 12-18"
  - "Cost Control has strongest moat structure (18/25): data network effects + switching costs + OSS + community"
  - "HITL has strongest regulatory moat (17/25): Article 14 expertise + audit trail lock-in"
  - "Error Handling should be bundled into Cost Control as 'Agent Governance' platform"
  - "Japan-based team should use Global-first strategy: English-first, OSS community, PLG, async-first"

patterns-established:
  - "6-dimension entry barrier framework: capital, complexity, trust, network effects, lock-in, regulatory"
  - "Moat scoring: 5 moat types rated 1-5 stars, summed to 25-point scale"
  - "Solo developer build timeline: 12-month roadmap with 2-month milestone increments"

requirements-completed: [MRKT-03]

duration: 12min
completed: 2026-03-13
---

# Phase 6 Plan 1: Entry Barrier and Moat Analysis Summary

**6-dimension entry barrier framework applied to 14 categories: 3 Feasible (Cost Control, HITL, Error Handling), 4 Challenging, 7 Infeasible for small-team entry**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-13T12:35:00Z
- **Completed:** 2026-03-13T12:47:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Created 6-dimension entry barrier framework and assessed all 14 infrastructure categories
- Deep moat analysis for top 3 categories: Cost Control (18/25), HITL (17/25), Error Handling (13/25 bundled)
- Solo developer 12-month build timelines for each recommended category
- Japan-based global expansion strategy with concrete recommendations
- SOC 2 reality check: $20-60K, 6-9 months, deferrable for OSS-first approach

## Task Commits

Each task was committed atomically:

1. **Task 1: Entry barrier framework + 14-category assessment** - `a623761` (feat)
2. **Task 2: Deep moat analysis for top 3 categories** - `a623761` (feat, combined commit)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified
- `report/06-regulatory-and-structural-opportunities-part1.md` - Entry barrier framework, 14-category assessment, moat analysis for top 3, Japan strategy

## Decisions Made
- Cost Control has the strongest overall moat (data network effects + switching costs + community + OSS)
- HITL has the strongest regulatory moat (Article 14 expertise is hard to replicate)
- Error Handling is not viable standalone but compounds value when bundled with Cost Control
- SOC 2 can be deferred 12-18 months when using OSS-first strategy
- Japan-based founders should adopt Global-first approach with English-first everything

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Entry barrier data ready for Phase 7 revenue model analysis (which models work for small teams)
- Moat analysis ready for Phase 8 strategic synthesis (domain recommendation scoring)
- Ready for 06-02-PLAN.md (regulatory demand analysis)

---
*Phase: 06-regulatory-and-structural-opportunities*
*Completed: 2026-03-13*
