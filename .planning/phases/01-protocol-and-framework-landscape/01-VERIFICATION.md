---
phase: 01-protocol-and-framework-landscape
verified: 2026-03-13T04:00:00Z
status: passed
score: 8/8 must-haves verified
re_verification: false
---

# Phase 1: Protocol & Framework Landscape Verification Report

**Phase Goal:** Reader understands the current protocol and framework ecosystem that defines where infrastructure can be inserted
**Verified:** 2026-03-13
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Report section clearly explains MCP, A2A, and AG-UI protocols with maturity levels, adoption metrics, and roadmaps as of March 2026 | VERIFIED | `report/01-protocol-landscape.md` covers all three protocols in dedicated sections (1.2, 1.3, 1.4) with specific data: MCP 97M+ monthly SDK downloads, A2A 150+ orgs, AG-UI v0.x maturity. Roadmap section 1.2.8 covers 2026 trajectory. |
| 2 | Report section compares major agent frameworks (LangGraph, CrewAI, OpenAI Agents SDK, AutoGen, Google ADK) with market share indicators and architectural differences | VERIFIED | `report/02-framework-comparison.md` profiles all 5 required frameworks with PyPI weekly downloads (LangGraph ~3M, CrewAI ~500K, OpenAI Agents SDK ~150K, AutoGen ~120K, Google ADK ~100K) and GitHub stars. Comparison table at section 2.4 covers 10 dimensions. |
| 3 | Reader can identify which protocol boundaries are natural insertion points for infrastructure services | VERIFIED | Section 1.6 "Infrastructure insertion points analysis" explicitly ranks MCP Gateway (highest), A2A boundary (medium), AG-UI streaming (low-medium) with rationale and current player mapping. Section 2.5.4 reinforces via framework-agnostic imperative argument. |

**Score:** 3/3 success criteria verified

### Must-Have Truths (from PLAN frontmatter)

#### Plan 01-01 Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | MCP section: maturity, 97M+ downloads, Linux Foundation, Streamable HTTP, OAuth 2.1, 2026 roadmap | VERIFIED | Section 1.2 covers all items. Spec 2025-11-25, Linux Foundation/AAIF governance, Streamable HTTP transport, OAuth 2.1 + PKCE + Dynamic Client Registration auth, 9,700万 monthly SDK downloads, SDK v2 roadmap in 1.2.8. |
| 2 | A2A section: maturity, 150+ orgs, governance, transport options, Agent Card, v1.0 status | VERIFIED | Section 1.3 covers all items. v1.0 spec, Linux Foundation governance, HTTP+SSE/JSON-RPC 2.0/gRPC transports, Agent Card concept with JSON example, 150+ supporting orgs. |
| 3 | AG-UI section: earlier-stage maturity, CopilotKit/Oracle/Google backing, streaming purpose | VERIFIED | Section 1.4 covers all items. Explicitly assessed as "初期段階" (early stage), CopilotKit/Oracle/Google backing named, event-based streaming model documented with event types (TEXT_DELTA, TOOL_CALL_START, etc.). |
| 4 | Comparative summary table: all three protocols side-by-side on key dimensions | VERIFIED | Section 1.5 provides 14-row table comparing MCP/A2A/AG-UI on: maturity, spec version, governance, developer, monthly SDK downloads, supporting orgs, transport, message format, auth, primary use case, infrastructure insertion opportunity, market competition state. |
| 5 | Infrastructure insertion points identified with opportunity assessment | VERIFIED | Section 1.6 provides ranked analysis: MCP Gateway (highest -- universal touchpoint, nascent market, auth as entry wedge), A2A boundary (medium -- future-promising), AG-UI streaming (low-medium -- protocol risk). Current players listed for MCP Gateway. |

#### Plan 01-02 Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Each major framework profiled with architecture model, strengths, weaknesses, ecosystem health | VERIFIED | Sections 2.2.1-2.2.5 provide dedicated subsections for LangGraph, CrewAI, OpenAI Agents SDK, AutoGen, Google ADK. Each has architecture description, strengths, weaknesses bullet lists, and ecosystem context. |
| 2 | Market share indicators (npm/PyPI downloads, GitHub stars, community activity) for each framework | VERIFIED | All 5 frameworks have data tables with PyPI weekly downloads and GitHub stars. Market share ASCII chart in section 2.5.1 summarizes relative position. Caveats about CI/CD inflation included. |
| 3 | Comparison table on consistent dimensions | VERIFIED | Section 2.4 comparison table covers 10 dimensions: developer, architecture, language, maturity, PyPI weekly DL, GitHub stars, MCP support, A2A support, LLM providers, key differentiator. |
| 4 | Fragmentation trend and why infrastructure must be framework-agnostic | VERIFIED | Section 2.5.1 analyzes 3 structural causes of fragmentation. Section 2.5.4 argues the framework-agnostic imperative with 5 evidence points. Introduction (2.1) states it directly: "プロトコルレベル（MCP、A2A）でフレームワーク非依存のインフラを構築することが、市場全体をターゲットにする唯一の防御可能なアプローチである." |
| 5 | Amazon Bedrock AgentCore as framework-agnostic managed runtime and its implications | VERIFIED | Section 2.3 (supplementary frameworks) covers AgentCore as a managed runtime (not a framework). Section 2.5.3 analyzes its market implications under 3 headings: "フレームワーク断片化の公式承認", "インフラ層の分離", "競合と機会の両面". |

**Score:** 8/8 must-have truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `report/01-protocol-landscape.md` | Complete report section on AI agent protocols as of March 2026, contains "MCP" | VERIFIED | File exists, 480 lines (well above 100-line threshold), substantive Japanese prose with English technical terms, 27 source URLs, no placeholder content. Pattern "MCP" found 45 times. |
| `report/02-framework-comparison.md` | Complete report section comparing major AI agent frameworks as of March 2026, contains "LangGraph" | VERIFIED | File exists, 335 lines (well above 100-line threshold), substantive Japanese prose with English technical terms, 25 source URLs, no placeholder content. Pattern "LangGraph" found 17 times. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `report/01-protocol-landscape.md` | downstream Phase 2 and Phase 8 analysis | maturity/adoption/roadmap content | VERIFIED | Section 1.5 comparison table provides protocol maturity assessments. Section 1.6 provides insertion point analysis. Pattern "成熟度" (maturity) found 14 times. Pattern "ロードマップ" (roadmap) found in section 1.2.8. Explicitly states it feeds standardization analysis (AAIF Q3 2026 prediction). |
| `report/02-framework-comparison.md` | downstream Phase 3, Phase 4, and Phase 8 analysis | framework market dynamics content | VERIFIED | Section 2.5 provides market dynamics analysis. Section 2.6 provides infrastructure strategy implications. Pattern "断片化" (fragmentation) appears 8 times. Pattern "フレームワーク非依存" (framework-agnostic) appears 6 times. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TECH-01 | 01-01-PLAN.md | 2026年3月時点のAIエージェント主要プロトコル（MCP, A2A, AG-UI）の成熟度・採用状況・ロードマップを整理する | SATISFIED | `report/01-protocol-landscape.md` (480 lines) covers all three protocols with specific adoption metrics, maturity assessments, and 2026 roadmaps. REQUIREMENTS.md marks it [x] Complete. |
| TECH-02 | 01-02-PLAN.md | 主要エージェントフレームワーク（LangGraph, CrewAI, OpenAI Agents SDK, AutoGen, Google ADK等）の比較と市場シェア動向を整理する | SATISFIED | `report/02-framework-comparison.md` (335 lines) profiles all 5 required frameworks with PyPI/GitHub market data, comparison table, and market dynamics analysis. REQUIREMENTS.md marks it [x] Complete. |

No orphaned requirements found. REQUIREMENTS.md Traceability table maps TECH-01 and TECH-02 to Phase 1 only.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| -- | -- | -- | -- | -- |

No anti-patterns detected. Grep for TODO/FIXME/XXX/HACK/placeholder/coming soon returned 0 matches across both report files. No empty implementations or stub content found.

### Human Verification Required

The two report files are research documents, not executable code. The following items would benefit from human review to confirm research accuracy, but they are not blockers for goal achievement:

#### 1. Adoption Metric Accuracy

**Test:** Cross-check the stated 97M+ monthly SDK downloads for MCP against current npm/PyPI data.
**Expected:** npm @modelcontextprotocol/sdk and PyPI mcp package download counts should corroborate the 9,700万回 figure cited in section 1.2.6.
**Why human:** The numbers were researched at time of writing (2026-03-13). Verifying against live registries requires external access.

#### 2. AG-UI Protocol Maturity Assessment

**Test:** Confirm that AG-UI has no Linux Foundation governance as of March 2026 and remains CopilotKit-led.
**Expected:** CopilotKit.ai/ag-ui page should show no mention of CNCF/LF governance transfer.
**Why human:** The assessment that AG-UI is "初期段階" and CopilotKit-dependent is an interpretive judgment that could affect Phase 8 strategic recommendations if wrong.

#### 3. Framework PyPI Download Figures

**Test:** Check PyPI download stats for `langgraph`, `crewai`, `openai-agents`, `autogen-agentchat`, `google-adk`.
**Expected:** Numbers should be in the same order of magnitude as reported (LangGraph ~3M/week, CrewAI ~500K/week, etc.).
**Why human:** PyPI stats require external access. The relative ranking (LangGraph >> CrewAI >> others) is more important than absolute figures for downstream analysis.

### Gaps Summary

No gaps found. All automated checks passed.

Both report artifacts exist with substantive content (480 and 335 lines respectively), zero placeholder patterns, all required protocols and frameworks covered with specific data, comparison tables present, infrastructure insertion points analyzed, and sources documented with URLs.

The phase goal "Reader understands the current protocol and framework ecosystem that defines where infrastructure can be inserted" is fully achieved:
- The three protocols (MCP, A2A, AG-UI) are explained with enough specificity to reason about maturity and timing
- The five frameworks are compared with quantitative market indicators
- Infrastructure insertion points are explicitly ranked with rationale, naming current players per category

---

_Verified: 2026-03-13_
_Verifier: Claude (gsd-verifier)_
