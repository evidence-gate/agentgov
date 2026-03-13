---
phase: 01-protocol-and-framework-landscape
plan: 01
subsystem: research
tags: [mcp, a2a, ag-ui, protocol, oauth, json-rpc, agent-infrastructure]

# Dependency graph
requires:
  - phase: none
    provides: "First plan in project -- no prior dependencies"
provides:
  - "Complete protocol landscape report section covering MCP, A2A, AG-UI"
  - "Protocol maturity assessments feeding Phase 2 standardization analysis"
  - "Infrastructure insertion point analysis feeding Phase 8 strategic synthesis"
affects: [02-infrastructure-standards, 03-competitive-player-mapping, 08-strategic-synthesis]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Japanese report with English technical terms", "evidence-backed assertions with source URLs"]

key-files:
  created:
    - "report/01-protocol-landscape.md"
  modified: []

key-decisions:
  - "Report written in Japanese with English technical terms preserved (matching PROJECT.md language)"
  - "MCP Gateway identified as highest infrastructure opportunity based on universal touchpoint + nascent market"
  - "AG-UI assessed as early-stage with CopilotKit dependency risk -- not recommended for immediate investment"
  - "A2A assessed as directionally sound but implementation maturity lagging behind specification maturity"

patterns-established:
  - "Protocol comparison using consistent evaluation axes (maturity, adoption, transport, auth, governance, use case, infra opportunity)"
  - "Infrastructure insertion point analysis framework with opportunity sizing"

requirements-completed: [TECH-01]

# Metrics
duration: 4min
completed: 2026-03-13
---

# Phase 1 Plan 01: Protocol Landscape Summary

**MCP/A2A/AG-UIの3プロトコル比較分析 -- 成熟度・採用指標・インフラ挿入ポイントを14軸で評価したレポートセクション（480行、27出典）**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-13T02:24:33Z
- **Completed:** 2026-03-13T02:28:50Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- MCP deep dive: spec 2025-11-25, OAuth 2.1 + PKCE + Dynamic Client Registration, Streamable HTTP, 97M+ monthly SDK downloads, all major AI companies adopted
- A2A deep dive: v1.0 spec with unified Part type and strict REST/gRPC/JSON-RPC bindings, Agent Card mechanism, 150+ supporting orgs
- AG-UI overview: CopilotKit/Oracle/Google joint protocol, event-based streaming model, early-stage maturity assessment
- Protocol comparison table across 14 dimensions (maturity, adoption, transport, auth, governance, use case, infrastructure insertion opportunity)
- Infrastructure insertion point analysis identifying MCP Gateway as highest opportunity, A2A boundary as medium (future), AG-UI streaming as low-medium

## Task Commits

Each task was committed atomically:

1. **Task 1: Research and verify protocol data for MCP, A2A, and AG-UI** - `dcee500` (feat)

## Files Created/Modified
- `report/01-protocol-landscape.md` - Complete protocol landscape report section (480 lines, 7 major sections, 27 source URLs)

## Decisions Made
- Report written in Japanese with English technical terms preserved, matching the project's target audience (PROJECT.md is in Japanese)
- MCP Gateway identified as the highest infrastructure opportunity -- universal touchpoint (all agents use tools via MCP), nascent market (5-6 early entrants, no dominant player), and authentication as natural entry wedge
- AG-UI assessed as too early for infrastructure investment due to CopilotKit dependency and lack of vendor-neutral governance
- A2A positioned as "agreed direction" stage -- specification mature (v1.0) but production implementations still limited compared to MCP

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Protocol landscape section complete and ready for inclusion in final report
- Feeds directly into Plan 01-02 (framework comparison) which can reference protocol integration points
- Maturity assessments feed Phase 2 (Infrastructure Standards & Trends) for standardization timeline analysis
- Infrastructure insertion point analysis feeds Phase 8 (Strategic Synthesis) for domain recommendation

## Self-Check: PASSED

- FOUND: report/01-protocol-landscape.md
- FOUND: commit dcee500
- FOUND: 01-01-SUMMARY.md

---
*Phase: 01-protocol-and-framework-landscape*
*Completed: 2026-03-13*
