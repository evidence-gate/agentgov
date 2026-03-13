# Roadmap: AI Agent Infrastructure -- Market Research

## Overview

This roadmap delivers a comprehensive market research report on AI agent infrastructure opportunities for a solo/small-team entrant. The research flows from foundational technology understanding through competitive and market analysis, to revenue model evaluation, strategic synthesis, and final report assembly. Each phase produces research artifacts that feed downstream phases, culminating in an actionable Go-to-Market recommendation with supporting evidence.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Protocol & Framework Landscape** - Map the current state of AI agent protocols (MCP, A2A, AG-UI) and major frameworks
- [ ] **Phase 2: Infrastructure Standards & Trends** - Analyze standardization efforts and multi-agent system trends shaping the infrastructure layer
- [ ] **Phase 3: Competitive Player Mapping** - Identify and catalog existing players across all 14 infrastructure categories
- [ ] **Phase 4: Competitive Analysis & Gaps** - Analyze competitive dynamics, Big Tech absorption risk, and OSS vs SaaS positioning
- [ ] **Phase 5: Developer Pain Points & Market Sizing** - Quantify market opportunity and rank developer pain points by severity
- [ ] **Phase 6: Regulatory & Structural Opportunities** - Analyze regulation-driven demand (EU AI Act) and entry barriers for small teams
- [ ] **Phase 7: Revenue Model Analysis** - Evaluate pricing models, unit economics, and OSS-to-paid conversion patterns
- [ ] **Phase 8: Strategic Synthesis & Recommendations** - Synthesize all research into ranked domain recommendations with GTM strategies
- [ ] **Phase 9: Report Assembly & Deliverables** - Package all findings into the final research report with executive summary and decision tools

## Phase Details

### Phase 1: Protocol & Framework Landscape
**Goal**: Reader understands the current protocol and framework ecosystem that defines where infrastructure can be inserted
**Depends on**: Nothing (first phase)
**Requirements**: TECH-01, TECH-02
**Success Criteria** (what must be TRUE):
  1. Report section clearly explains MCP, A2A, and AG-UI protocols with their maturity levels, adoption metrics, and roadmaps as of March 2026
  2. Report section compares major agent frameworks (LangGraph, CrewAI, OpenAI Agents SDK, AutoGen, Google ADK) with market share indicators and architectural differences
  3. Reader can identify which protocol boundaries are natural insertion points for infrastructure services
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md -- Research and write protocol landscape section (MCP, A2A, AG-UI)
- [x] 01-02-PLAN.md -- Research and write framework comparison section (LangGraph, CrewAI, OpenAI Agents SDK, AutoGen, Google ADK)

### Phase 2: Infrastructure Standards & Trends
**Goal**: Reader understands the standardization trajectory and multi-agent trends that will shape infrastructure demand over the next 12-24 months
**Depends on**: Phase 1
**Requirements**: TECH-03, TECH-04
**Success Criteria** (what must be TRUE):
  1. Report section catalogs active standardization efforts (AAIF, OAuth 2.1 for MCP, OpenTelemetry GenAI conventions) with their timelines and expected impact
  2. Report section presents multi-agent system trends with analyst predictions (Forrester/Gartner) and implications for infrastructure needs
  3. Reader can assess which standards are mature enough to build on now vs. which require a wait-and-see approach
**Plans**: 2 plans

Plans:
- [x] 02-01-PLAN.md -- Research and write standardization efforts section (AAIF, OAuth 2.1, OTel GenAI, EU AI Act)
- [x] 02-02-PLAN.md -- Research and write multi-agent system trends section (Gartner/Deloitte/Salesforce predictions, 6 key trends)

### Phase 3: Competitive Player Mapping
**Goal**: Reader has a comprehensive map of who is building what across every infrastructure category
**Depends on**: Phase 1
**Requirements**: COMP-01, COMP-02
**Success Criteria** (what must be TRUE):
  1. All 14 infrastructure categories have identified players with funding, team size, and product maturity data
  2. Each category has a strengths/weaknesses/gaps analysis that reveals where incumbents are weak or absent
  3. Reader can visually scan the competitive landscape to identify crowded vs. underserved categories
**Plans**: TBD

Plans:
- [ ] 03-01-PLAN.md -- Research and write competitive player mapping for categories 1-7 (LLM gateways, observability, auth/identity, tool management, cost control, error handling, sandboxes)
- [ ] 03-02-PLAN.md -- Research and write competitive player mapping for categories 8-14 (memory, guardrails, secrets, HITL, evaluation, payments, deployment) plus cross-category summary

### Phase 4: Competitive Analysis & Gaps
**Goal**: Reader understands the strategic dynamics -- who will absorb what, and where open source creates defensible positions
**Depends on**: Phase 3
**Requirements**: COMP-03, COMP-04
**Success Criteria** (what must be TRUE):
  1. Big Tech (Cloudflare, AWS, Google, Microsoft) agent infrastructure moves are cataloged with absorption risk ratings per category
  2. OSS vs. SaaS positioning analysis shows which categories favor open-source-first strategies and which require proprietary approaches
  3. Reader can identify categories where small-team entrants have structural advantages over well-funded competitors
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD

### Phase 5: Developer Pain Points & Market Sizing
**Goal**: Reader knows which developer problems are most painful and how large the addressable market is for each infrastructure category
**Depends on**: Phase 3
**Requirements**: MRKT-01, MRKT-02
**Success Criteria** (what must be TRUE):
  1. Each infrastructure category has a market size estimate (TAM/SAM/SOM) or qualitative opportunity assessment with supporting rationale
  2. Developer pain points are organized by category and ranked by severity, frequency, and willingness-to-pay indicators
  3. Reader can cross-reference pain severity with market size to identify high-impact, high-opportunity intersections
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD

### Phase 6: Regulatory & Structural Opportunities
**Goal**: Reader understands which market opportunities are structurally favorable for small teams and which are unlocked by upcoming regulation
**Depends on**: Phase 4, Phase 5
**Requirements**: MRKT-03, MRKT-04
**Success Criteria** (what must be TRUE):
  1. Entry barriers and moat potential are evaluated per category with explicit assessment of what small teams can and cannot defend
  2. EU AI Act (August 2026) and other regulatory drivers are analyzed for the specific infrastructure demand they create
  3. Reader can filter categories by "small-team feasibility" to focus on realistically winnable domains
**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD

### Phase 7: Revenue Model Analysis
**Goal**: Reader understands which business models work for AI infrastructure and has proven GTM patterns to follow
**Depends on**: Phase 5, Phase 6
**Requirements**: REV-01, REV-02, REV-03
**Success Criteria** (what must be TRUE):
  1. Major revenue model patterns (API usage, SaaS subscription, OSS+Cloud, marketplace) are documented with pros/cons and real-world examples
  2. Unit economics structures are analyzed with explicit assessment of small-team viability (can one person run this profitably?)
  3. At least 3 OSS-to-paid success stories (e.g., Langfuse, PostHog) are dissected for their GTM sequence, timeline, and community-building approach
  4. Reader can match revenue models to specific infrastructure categories based on the analysis
**Plans**: TBD

Plans:
- [ ] 07-01: TBD
- [ ] 07-02: TBD

### Phase 8: Strategic Synthesis & Recommendations
**Goal**: Reader has a clear, evidence-backed recommendation of which domains to pursue and how to enter the market
**Depends on**: Phase 2, Phase 4, Phase 6, Phase 7
**Requirements**: STRT-01, STRT-02, STRT-03, STRT-04
**Success Criteria** (what must be TRUE):
  1. Top 3 recommended domains are presented with scoring rationale that traces back to competitive, market, and revenue analyses
  2. Each recommended domain has a Go-to-Market strategy specifying entry sequence, initial target users, and differentiation points
  3. An execution plan skeleton addresses the Japan-based/small-team constraints with concrete first steps
  4. Risk assessment covers timing, competitive, platform, and regulatory risks with specific mitigation strategies
  5. Reader can make an informed go/no-go decision on which domain to pursue for MVP development
**Plans**: TBD

Plans:
- [ ] 08-01: TBD
- [ ] 08-02: TBD

### Phase 9: Report Assembly & Deliverables
**Goal**: All research is packaged into a polished, navigable report that supports rapid decision-making
**Depends on**: Phase 8
**Requirements**: DLVR-01, DLVR-02, DLVR-03, DLVR-04
**Success Criteria** (what must be TRUE):
  1. Executive summary exists that a decision-maker can read in 5 minutes and understand the key recommendation
  2. Competitive map visualization shows categories, players, and positioning in a scannable format
  3. Decision matrix scores candidate domains across evaluation axes with transparent methodology
  4. Next actions section lists concrete MVP implementation steps with clear priorities
  5. Report is internally consistent -- executive summary claims match detailed section evidence
**Plans**: TBD

Plans:
- [ ] 09-01: TBD
- [ ] 09-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9

Note: Phases 1 and 3 can execute in parallel (no dependency). Phases 4 and 5 can execute in parallel (both depend on Phase 3, not each other).

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Protocol & Framework Landscape | 2/2 | Complete | 2026-03-13 |
| 2. Infrastructure Standards & Trends | 2/2 | Complete | 2026-03-13 |
| 3. Competitive Player Mapping | 0/2 | Not started | - |
| 4. Competitive Analysis & Gaps | 0/2 | Not started | - |
| 5. Developer Pain Points & Market Sizing | 0/2 | Not started | - |
| 6. Regulatory & Structural Opportunities | 0/2 | Not started | - |
| 7. Revenue Model Analysis | 0/2 | Not started | - |
| 8. Strategic Synthesis & Recommendations | 0/2 | Not started | - |
| 9. Report Assembly & Deliverables | 0/2 | Not started | - |
