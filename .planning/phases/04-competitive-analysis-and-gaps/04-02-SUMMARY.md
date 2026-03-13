---
phase: 04-competitive-analysis-and-gaps
plan: 02
subsystem: research
tags: [oss, saas, defensibility, moat, composite-ranking, langfuse, posthog, supabase]

requires:
  - phase: 03-competitive-player-mapping
    provides: "14-category competitive player map with gap analysis"
  - phase: 04-competitive-analysis-and-gaps
    provides: "Big Tech absorption risk ratings per category"
provides:
  - "OSS vs SaaS positioning analysis for all 14 categories"
  - "4 OSS case studies with growth metrics and success patterns"
  - "Composite opportunity ranking (Gap + Safety + OSS Fit) for all 14 categories"
  - "Top 3 categories: Cost Control, HITL, Error Handling (all 9/9)"
  - "10 categories explicitly deprioritized with rationale"
affects: [05-developer-pain-points, 06-regulatory-structural-opportunities, 07-revenue-model-analysis, 08-strategic-synthesis]

tech-stack:
  added: []
  patterns: ["OSS-first strategy (MIT core + cloud hosting)", "composite scoring methodology"]

key-files:
  created:
    - report/04-competitive-analysis-part2-oss-saas.md
  modified: []

key-decisions:
  - "OSS-first (Langfuse model) is the optimal strategy for Cost Control, HITL, and Error Handling"
  - "Composite score: Cost Control 9/9, HITL 9/9, Error Handling 9/9 (but Error Handling has weaker demand signal)"
  - "Error Handling should be bundled into Cost Control + HITL as 'Agent Governance', not standalone"
  - "10/14 categories are non-recommended for small team entry"
  - "Q1 2026 OSS acquisition rush (Langfuse, Helicone) validates OSS as exit strategy"
  - "98% free users (PostHog model) creates network effects and word-of-mouth"

patterns-established:
  - "OSS success pattern: MIT license → community growth → network effects → acquisition or independent growth"
  - "Composite scoring: Gap(3) + Safety(3) + OSSFit(3) = max 9"

requirements-completed: [COMP-04]

duration: 4min
completed: 2026-03-13
---

# Phase 4 Plan 02: OSS vs SaaS Positioning & Composite Ranking Summary

**Analyzed OSS success patterns via 4 case studies, positioned all 14 categories on OSS/SaaS axis, and produced composite opportunity ranking with Cost Control and HITL as top candidates (9/9)**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-13T03:10:30Z
- **Completed:** 2026-03-13T03:14:04Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments
- 4 OSS case studies analyzed: Langfuse ($15B ClickHouse), Helicone (Mintlify), PostHog ($1.4B), Supabase ($5B)
- All 14 categories assessed on 7 evaluation axes for OSS/SaaS positioning
- Composite ranking with 3-dimensional scoring (gap + safety + OSS fit)
- Top 3 all scored 9/9: Cost Control, HITL, Error Handling
- 10 categories explicitly deprioritized with clear rationale
- 7 key findings distilled for downstream phases

## Task Commits

1. **Task 1-3: OSS vs SaaS positioning and composite ranking** - `af67bf0` (feat)

**Plan metadata:** committed with SUMMARY

## Files Created/Modified
- `report/04-competitive-analysis-part2-oss-saas.md` - OSS case studies, per-category analysis, composite ranking (436 lines)

## Decisions Made
- Langfuse model (MIT core + cloud hosting) is optimal for top categories
- Error Handling has weaker demand signal than Cost Control/HITL, should be bundled rather than standalone
- Community investment ROI is quantified: 2.1x revenue growth, 46% higher LTV, $6.40 per $1 invested
- OSSコミュニティ is "acquisition currency" (Langfuse: 20K stars → ClickHouse buy)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 4 complete with clear Top 3 category ranking
- Phase 5 should focus on quantifying demand for Cost Control and HITL specifically
- Phase 6 should validate EU AI Act-driven HITL demand and small-team entry barriers
- 10 categories deprioritized -- Phase 5-6 can focus narrowly

---
*Phase: 04-competitive-analysis-and-gaps*
*Completed: 2026-03-13*
