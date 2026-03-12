# Research Summary: AI Agent Infrastructure Services

**Domain:** AI Agent Infrastructure ("PayPal position" -- essential services agents depend on)
**Researched:** 2026-03-13
**Overall confidence:** MEDIUM-HIGH

## Executive Summary

The AI agent infrastructure ecosystem in March 2026 has consolidated around two protocol standards: MCP (Model Context Protocol) for agent-to-tool communication and A2A (Agent2Agent Protocol) for agent-to-agent interoperability. MCP is the mature standard (97M+ monthly SDK downloads, adopted by Anthropic, OpenAI, Google, Microsoft) while A2A reached v1.0 with 150+ supporting organizations. Both are now under Linux Foundation governance. A third protocol, AG-UI (CopilotKit), handles agent-to-user streaming but is earlier stage. Every protocol boundary is a natural insertion point for infrastructure services.

The agent framework market is fragmented (LangGraph, CrewAI, OpenAI Agents SDK, AutoGen, Google ADK) with no winner-takes-all. Amazon Bedrock AgentCore already runs all major frameworks on managed infrastructure. This fragmentation means **infrastructure must be framework-agnostic and protocol-level**. Building on MCP/A2A standards rather than any specific framework is the only defensible approach.

The MCP Gateway layer -- the reverse proxy sitting between agents and MCP tool servers -- is the highest-opportunity infrastructure position. It is the universal touchpoint (every agent uses tools), the gateway space is nascent and fragmented (Traefik, Docker, Microsoft, Obot all have early-stage offerings but none dominant), and authentication/cost control at this layer directly addresses the project owner's pain points. The progression is natural: auth management creates the credential relationship, metering follows from seeing all traffic, observability is a byproduct of instrumentation, and billing monetizes the metered data.

However, the critical risk is platform absorption: Cloudflare already ships MCP auth with Durable Objects, and AWS/Google are building agent infrastructure. The defense against absorption is **depth over breadth** -- going deep on one domain (e.g., agent cost governance) with data-network effects that platforms cannot easily replicate. The project owner's constraint (individual/small team, Japan-based) makes focus even more critical.

## Key Findings

**Stack:** TypeScript-first (MCP ecosystem is TS-native), Cloudflare Workers + Durable Objects for edge compute with per-agent state, Hono for the HTTP layer, MCP SDK + FastMCP for protocol implementation, LiteLLM for LLM gateway, Langfuse for observability, Lago + Stripe for billing, Nango for OAuth management.

**Architecture:** Protocol Gateway pattern -- MCP-aware reverse proxy that adds cross-cutting concerns (auth, metering, policy enforcement, observability) transparently. Five natural insertion points identified: MCP Gateway (highest opportunity), A2A boundary, LLM API gateway (saturated), agent framework middleware, AG-UI streaming.

**Critical pitfall:** Platform absorption risk -- building infrastructure that Cloudflare/AWS/Google can ship as a feature within 12 months. Mitigation: deep domain expertise + data-network effects + open-source-first strategy.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Protocol Foundation & MCP Gateway MVP** - Rationale: MCP is the universal agent integration point. Auth + rate limiting at the gateway solves the #1 developer pain point (credential management across 5-20 MCP servers per agent).
   - Addresses: OAuth 2.1 + PKCE + Dynamic Client Registration, MCP protocol support, API key management, basic rate limiting
   - Avoids: Pitfall 2 (Dynamic Client Registration), Pitfall 5 (auth complexity), Pitfall 1 (deprecated SSE transport)
   - Technology: @modelcontextprotocol/sdk, Hono, Cloudflare Workers + Durable Objects, Nango

2. **Cost Control & Usage Metering** - Rationale: 78% of IT leaders report unexpected AI charges. Cost control is the #2 pain point and the natural monetization wedge.
   - Addresses: Usage metering, budget controls (per-agent, per-user, per-project), billing integration
   - Avoids: Pitfall 3 (synchronous billing), Pitfall 6 (recursive cost problem), Pitfall 8 (pricing rigidity)
   - Technology: Lago (metering), Stripe (payments), Durable Objects (edge accumulators)

3. **Observability & Agent Cost Attribution** - Rationale: Builds on traffic data from Phase 1 and metering data from Phase 2. Agent cost attribution (mapping every call to agent/task/user) is the key differentiator.
   - Addresses: OpenTelemetry tracing, cost attribution, agent debugging dashboards
   - Avoids: Pitfall 12 (late OTel instrumentation -- instrument from Phase 1, dashboard in Phase 3)
   - Technology: Langfuse, OpenTelemetry GenAI semantic conventions

4. **Developer Experience & Community** - Rationale: Self-service developer portal, CLI tooling, documentation. Must precede monetization. English-first, async-first community building.
   - Addresses: Developer portal, CLI onboarding, documentation, API playground
   - Avoids: Pitfall 4 (Japan-to-global gap), Pitfall 13 (dashboard-first instead of CLI-first)

5. **Advanced Features & A2A Support** - Rationale: A2A protocol maturity needed. Cross-protocol bridge, policy engine, compliance templates.
   - Addresses: MCP gateway policy enforcement (TBAC), A2A awareness, compliance templates
   - Avoids: Pitfall 9 (ignoring A2A until too late)

**Phase ordering rationale:**
- Auth first because it is the credential wedge (like PayPal's vault)
- Cost control second because it monetizes the auth relationship and is the most painful developer problem
- Observability third because it requires traffic + metering data from Phases 1-2
- Developer experience fourth because community precedes monetization
- Advanced features fifth because A2A needs time to mature and policy enforcement builds on all prior layers

**Research flags for phases:**
- Phase 1: Needs deeper research on MCP Dynamic Client Registration (RFC 7591) implementation -- not many reference implementations exist
- Phase 2: Needs deeper research on Lago integration patterns with Cloudflare Workers (edge-to-billing pipeline)
- Phase 3: OpenTelemetry GenAI semantic conventions are evolving; may need to track spec changes
- Phase 5: A2A v1.0 ecosystem adoption should be monitored quarterly; research needed before building

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack (STACK.md) | HIGH | Protocol specs verified against official docs; SDK versions verified on npm/PyPI; Cloudflare Workers capabilities verified against official docs |
| Features (FEATURES.md) | HIGH | Table stakes validated across multiple market analyses; differentiators aligned with project owner's pain points; anti-features grounded in competitive analysis |
| Architecture (ARCHITECTURE.md) | MEDIUM-HIGH | Protocol gateway pattern well-supported; deployment architecture on Cloudflare is opinionated but well-justified; scalability beyond 10K users is speculative |
| Pitfalls (PITFALLS.md) | HIGH | Protocol risks verified against official specs; platform absorption historically documented; pricing challenges supported by industry data (92% adjust, 78% unexpected charges) |

## Gaps to Address

- **AG-UI Protocol:** Mentioned in ARCHITECTURE.md from parallel researcher; not deeply investigated in this research. CopilotKit/Oracle/Google joint protocol for agent-to-user streaming. Worth monitoring but too early for primary focus.
- **MCP Dynamic Client Registration (RFC 7591):** Critical for the MCP gateway but poorly documented in practice. Need to study NapthaAI/http-oauth-mcp-server reference implementation before building.
- **AAIF Joint Interoperability Spec:** The Linux Foundation's Agentic AI Foundation may publish a joint MCP/A2A interoperability spec in Q3 2026. This could change the protocol landscape significantly. Monitor closely.
- **EU AI Act Compliance:** Takes effect August 2026 for high-risk systems. If the infrastructure handles enterprise decision-making workflows, it may be in scope. Needs legal assessment.
- **Cloudflare Workers Pricing at Scale:** Edge compute costs at high-volume agent traffic need detailed modeling. Durable Object pricing per alarm, per SQL query matters for the metering architecture.
- **Competitive Moat Analysis:** This research identifies the market opportunity but doesn't deeply analyze why a small team can win against well-funded startups (Composio $12M raised, Arcade backed by Google). Needs strategic analysis.
