# Architecture Research: AI Agent Infrastructure Ecosystem

**Domain:** AI Agent Infrastructure Services (auth, billing, observability, testing)
**Researched:** 2026-03-13
**Confidence:** MEDIUM-HIGH (multiple authoritative sources converge on the same layered model)

## The 2026 AI Agent Protocol Stack

The AI agent ecosystem has consolidated around a four-protocol stack. Understanding this stack is essential because **each protocol boundary is a natural insertion point for infrastructure services**.

```
┌─────────────────────────────────────────────────────────────────┐
│                     User / Frontend Layer                        │
│                                                                 │
│  ┌──────────────┐                                               │
│  │   AG-UI      │  Agent-to-User Interaction Protocol            │
│  │  (CopilotKit)│  Event-based streaming from agent to UI       │
│  └──────┬───────┘                                               │
├─────────┼───────────────────────────────────────────────────────┤
│         │          Orchestration / Agent Layer                    │
│         ▼                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │  Agent A     │  │  Agent B     │  │  Agent C     │           │
│  │ (LangGraph)  │  │  (CrewAI)    │  │ (AutoGen)    │           │
│  └──┬───────┬───┘  └──┬───────┬──┘  └──┬───────┬───┘           │
│     │       │          │       │         │       │              │
│     │  A2A  ◄──────────►  A2A  ◄─────────►  A2A │              │
│     │(Agent-to-Agent Protocol, Google/Linux Foundation)         │
│     │  JSON-RPC 2.0 / HTTP(S), Agent Cards for discovery       │
│     │                                                           │
├─────┼───────────────────────────────────────────────────────────┤
│     │              Tool / Capability Layer                       │
│     ▼                                                           │
│  ┌──────────────────────────────────────────┐                   │
│  │            MCP Gateway                    │ <-- KEY INFRA    │
│  │  (Auth, Rate Limiting, Observability)     │     INSERTION    │
│  └──┬────────────┬────────────┬─────────┬───┘     POINT        │
│     │            │            │         │                       │
│  ┌──▼──┐     ┌──▼──┐     ┌──▼──┐   ┌──▼──┐                    │
│  │ MCP  │     │ MCP  │     │ MCP │   │ MCP │                    │
│  │Srv A │     │Srv B │     │Srv C│   │Srv D│                    │
│  │(DB)  │     │(API) │     │(FS) │   │(SaaS)                   │
│  └──────┘     └──────┘     └──────┘  └──────┘                  │
├─────────────────────────────────────────────────────────────────┤
│                  Foundation Layer                                │
│                                                                 │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                │
│  │  LLM APIs  │  │  Vector DB │  │ Persistence│                │
│  │(OpenAI,    │  │(Pinecone,  │  │(Postgres,  │                │
│  │ Anthropic, │  │ Weaviate)  │  │ Redis)     │                │
│  │ Gemini)    │  │            │  │            │                │
│  └────────────┘  └────────────┘  └────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

### Protocol Role Summary

| Protocol | Direction | Purpose | Transport | Status (2026-03) |
|----------|-----------|---------|-----------|-------------------|
| **MCP** (Anthropic) | Agent -> Tools | Agent accesses external capabilities (DB, API, filesystem) | JSON-RPC 2.0 over stdio or Streamable HTTP | Mature. 97M+ monthly SDK downloads. Adopted by all major AI providers |
| **A2A** (Google/LF) | Agent <-> Agent | Agents discover and delegate tasks to other agents | JSON-RPC 2.0 over HTTP(S), gRPC (v0.3+) | Growing. v0.3 released. 100+ enterprise supporters |
| **AG-UI** (CopilotKit) | Agent -> User | Streaming agent events to frontend UI | Event-based streaming | Emerging. Oracle, Google, CopilotKit joint release |
| **OAuth 2.1** | Cross-cutting | Authentication at every boundary | HTTP headers / token exchange | Standard. MCP spec recommends OAuth for remote servers |

**Confidence:** HIGH -- sourced from official protocol specs and multiple independent analyses.

## Component Responsibilities

### MCP Architecture (Vertical: Agent-to-Tool)

| Component | Responsibility | Implementation |
|-----------|---------------|----------------|
| **MCP Host** | AI application that coordinates MCP clients (e.g., Claude Desktop, VS Code, custom agent) | Agent framework runtime |
| **MCP Client** | 1:1 connection to an MCP server; translates LLM requests to JSON-RPC | SDK-provided (Python/TypeScript MCP SDK) |
| **MCP Server** | Exposes tools, resources, prompts to the agent | Lightweight program; 500+ public servers exist |
| **MCP Gateway** | Reverse proxy between agents and MCP servers; adds auth, rate limiting, observability | Emerging category: Bifrost, ContextForge, Traefik Hub, Composio |

MCP servers expose three primitives:
- **Tools** -- executable functions (side effects allowed: API calls, DB writes)
- **Resources** -- read-only data sources (file contents, DB records)
- **Prompts** -- reusable interaction templates (system prompts, few-shot examples)

### A2A Architecture (Horizontal: Agent-to-Agent)

| Component | Responsibility | Implementation |
|-----------|---------------|----------------|
| **Agent Card** | JSON metadata describing agent identity, capabilities, endpoint, auth requirements | Published at `/.well-known/agent.json` |
| **Client Agent** | Discovers remote agents, creates tasks, receives results | Any agent framework with A2A SDK |
| **Remote Agent** | Receives tasks, executes them, returns artifacts | Any agent framework with A2A SDK |
| **Task** | Unit of work with lifecycle: submitted -> working -> input-required -> completed/failed | JSON-RPC managed object |
| **Artifact** | Output generated by agent (documents, images, structured data), composed of Parts | Returned via streaming or polling |

### Agent Framework Layer

| Framework | Architecture Model | Strengths |
|-----------|-------------------|-----------|
| **LangGraph** (LangChain) | Graph-based: nodes = tasks, edges = transitions | Production-grade, fine-grained control, state machines |
| **CrewAI** | Two-layer: Crews (role-based agents) + Flows (deterministic orchestration) | Rapid prototyping, role metaphor, popular |
| **AutoGen** (Microsoft) | Event-driven messaging: Core (low-level) + AgentChat (high-level) | Multi-agent conversations, async patterns |
| **Semantic Kernel** (Microsoft) | Enterprise: session management, type safety, filters, telemetry | Enterprise-grade, .NET/Python/Java |
| **SmolAgents** (HuggingFace) | Code-first: LLM writes Python instead of JSON tool calls | Minimal overhead, open-source models |

**2026 Trend:** Convergence toward graph-based orchestration. Hybrid stacks are common (e.g., LangChain tools wrapped in CrewAI agents).

## Data Flow

### Flow 1: Single Agent Tool Use (most common)

```
User Query
    |
    v
[Agent Framework] -- selects tool based on LLM reasoning
    |
    v
[MCP Client] -- JSON-RPC 2.0 request
    |
    v
[MCP Gateway] -- authenticates, rate limits, logs   <-- INFRA INSERTION
    |
    v
[MCP Server] -- executes tool (API call, DB query, etc.)
    |
    v
[Tool Result] -- returned as content array (text/image/resource)
    |
    v
[Agent Framework] -- feeds result back to LLM as context
    |
    v
[Response to User]
```

### Flow 2: Multi-Agent Delegation (A2A)

```
Client Agent receives complex task
    |
    v
[Agent Card Discovery] -- GET /.well-known/agent.json
    |                      from candidate remote agents
    v
[Task Creation] -- POST /tasks with instructions + context
    |
    v                                                    <-- INFRA INSERTION
[Remote Agent] -- works on task (may use MCP tools)       (billing, auth,
    |               status: submitted -> working           observability)
    v
[Artifact Stream] -- SSE or polling for results
    |                  status: working -> completed
    v
[Client Agent] -- integrates artifacts into own context
    |
    v
[Final Response]
```

### Flow 3: Agent-to-User Streaming (AG-UI)

```
[Agent] -- produces events during execution
    |
    v
[AG-UI Protocol] -- standardized event stream          <-- INFRA INSERTION
    |                (text delta, tool call start,        (usage metering,
    v                 state snapshot, etc.)                session tracking)
[Frontend Client] -- renders events in real-time
    |                 (React, Angular via CopilotKit)
    v
[User sees streaming response + agent actions]
```

## Natural Insertion Points for Infrastructure Services

The architecture reveals **five natural insertion points** where infrastructure services can intercept, augment, or govern agent behavior. These are ordered by market maturity and opportunity.

### 1. MCP Gateway Layer (HIGHEST OPPORTUNITY)

**What:** Reverse proxy between MCP clients and MCP servers
**Why it matters:** Every tool call flows through here. This is the "API Gateway" of the agent world.

| Service | How It Inserts | Market State |
|---------|---------------|--------------|
| **Authentication** | OAuth token management, credential vault, token refresh/rotation | Active competition: Composio, Bifrost, ContextForge |
| **Rate Limiting** | Per-agent, per-user, per-tool request caps | Built into gateways but not standalone |
| **Cost Control** | Budget caps per agent/user, usage tracking, kill switches | Emerging; LiteLLM does this for LLM calls but not MCP |
| **Observability** | OpenTelemetry traces, Prometheus metrics, audit logs | Converging on OTel standard; Langfuse/LangSmith for LLM layer |
| **Caching** | Cache repeated tool call results to reduce latency and cost | Basic in gateways; not intelligent yet |

**Architecture pattern:** Hub-and-spoke. Gateway transforms N-agents x M-tools into N-agents x 1-gateway x M-tools.

### 2. A2A Boundary Layer

**What:** Middleware at the agent-to-agent communication boundary
**Why it matters:** When agents delegate to other agents, billing, auth, and trust become critical.

| Service | How It Inserts | Market State |
|---------|---------------|--------------|
| **Agent Identity & Trust** | Verify Agent Cards, sign cards cryptographically (A2A v0.3) | Nascent; A2A spec just added card signing |
| **Task Billing** | Meter task creation/completion between agents | Not yet addressed by any player |
| **Cross-agent Observability** | Trace task lifecycle across agent boundaries | OpenTelemetry context propagation applies but not agent-specific |
| **Access Control** | TBAC (Task-Based Access Control) per A2A spec | Spec-level only; no production implementations found |

### 3. LLM API Gateway Layer

**What:** Proxy between agent and LLM provider APIs
**Why it matters:** LLM calls are the most expensive single operation in agent systems.

| Service | How It Inserts | Market State |
|---------|---------------|--------------|
| **Multi-provider routing** | Route to cheapest/fastest/best model per request | Active: LiteLLM (100+ LLMs), Portkey (1600+ models) |
| **Spend tracking** | Per-agent, per-user token usage and cost | LiteLLM, Helicone, Portkey all offer this |
| **Fallback & retry** | Auto-failover between providers | Standard in gateways |

**Note:** This layer is already well-served. Less opportunity for new entrants.

### 4. Agent Framework Middleware

**What:** Hooks/interceptors within the agent framework itself
**Why it matters:** Framework-level integration captures intent, not just HTTP traffic.

| Service | How It Inserts | Market State |
|---------|---------------|--------------|
| **Tracing & Observability** | SDK-level instrumentation (decorators, callbacks) | Langfuse, LangSmith, AgentOps -- active competition |
| **Evaluation & Testing** | Automated test runs, regression detection | Emerging: Braintrust, RAGAS, custom evals |
| **Guardrails** | Input/output filtering, PII detection | NeMo Guardrails, Guardrails AI |

### 5. AG-UI Streaming Layer

**What:** Protocol boundary between agent backend and user-facing frontend
**Why it matters:** User-facing metrics, session management, compliance logging.

| Service | How It Inserts | Market State |
|---------|---------------|--------------|
| **Session management** | Track user-agent sessions, state persistence | CopilotKit provides basics; enterprise needs more |
| **Usage metering** | Per-user interaction tracking for SaaS billing | Not addressed |
| **Compliance logging** | Audit trail of what agent showed to user | Not addressed |

## Suggested Build Order (Dependencies)

The following order reflects technical dependencies and market opportunity.

```
Phase 1: MCP Gateway Core
    |     (Authentication + Rate Limiting + Basic Observability)
    |     Foundation -- everything else depends on tool access control
    |
Phase 2: Cost Control & Billing
    |     (Budget caps, usage metering, billing APIs)
    |     Builds on Phase 1 gateway data; most requested by developers
    |
Phase 3: Advanced Observability
    |     (OpenTelemetry traces, cross-agent tracing, dashboards)
    |     Builds on Phase 1+2 telemetry data
    |
Phase 4: A2A Boundary Services
    |     (Agent identity, task billing, cross-agent trust)
    |     Market is younger; requires A2A adoption to mature
    |
Phase 5: Testing & Evaluation
          (Agent behavior testing, regression detection)
          Requires observability data from Phase 3
```

**Rationale:**
- MCP gateway is the highest-value insertion point because **every agent, regardless of framework, uses MCP for tool access**. It is framework-agnostic by design.
- Cost control is the most painful developer problem (runaway agents causing surprise bills).
- A2A services should wait because the protocol is still maturing (v0.3 just released).
- Testing/evaluation depends on having observability data first.

## Architectural Patterns

### Pattern 1: Gateway-as-Middleware (Recommended Starting Point)

**What:** MCP Gateway that sits between any MCP client and any MCP server, adding cross-cutting concerns transparently.

**When to use:** When you want to provide infrastructure to the broadest possible audience regardless of their agent framework choice.

**Trade-offs:**
- Pro: Framework-agnostic. Works with LangChain, CrewAI, AutoGen, raw MCP SDK, everything.
- Pro: Transparent to existing MCP servers -- no changes needed on either side.
- Con: Limited to information visible at the protocol boundary (HTTP headers, JSON-RPC payloads).
- Con: Cannot see agent-internal reasoning or intent.

```
[Any Agent Framework]
        |
        v
   [MCP Client]
        |
        v
┌───────────────────┐
│   MCP Gateway     │  <-- Your infrastructure service
│                   │
│  - OAuth/token mgmt
│  - Rate limiting  │
│  - Cost tracking  │
│  - OTel tracing   │
│  - Audit logging  │
└───────┬───────────┘
        |
        v
   [MCP Server(s)]
```

### Pattern 2: SDK-Level Instrumentation

**What:** Lightweight SDK that wraps agent framework calls, capturing telemetry at the source.

**When to use:** When you need deeper visibility into agent reasoning, tool selection, and multi-step workflows.

**Trade-offs:**
- Pro: Rich data -- can see LLM prompts, tool selection reasoning, intermediate state.
- Pro: Better developer experience (decorators, callbacks, auto-instrumentation).
- Con: Framework-specific. Need adapters for LangChain, CrewAI, AutoGen, etc.
- Con: Requires developer adoption (install SDK, add instrumentation).

```python
# Example: SDK-level instrumentation pattern
from infra_sdk import trace, budget

@trace()                    # Auto-captures LLM calls, tool usage
@budget(max_usd=1.00)      # Kills execution if budget exceeded
async def my_agent(query: str):
    result = await agent.run(query)
    return result
```

### Pattern 3: Sidecar / Agent Mesh

**What:** Each agent gets a co-located sidecar process that handles infrastructure concerns, similar to service mesh (Istio/Envoy) in microservices.

**When to use:** Multi-agent systems where agents need independent infrastructure management.

**Trade-offs:**
- Pro: Complete isolation; each agent has its own budget, auth context, observability.
- Pro: Familiar pattern from service mesh; proven at scale.
- Con: Operational complexity. Overkill for most current deployments.
- Con: Market is not ready -- most deployments are single-agent.

## Anti-Patterns

### Anti-Pattern 1: Framework Lock-In

**What people do:** Build infrastructure tightly coupled to one agent framework (e.g., LangChain-only observability).
**Why it's wrong:** The framework landscape is fragmenting, not consolidating. Developers switch frameworks frequently. LangSmith's tight LangChain coupling is viewed as both strength and weakness.
**Do this instead:** Build at the protocol level (MCP, A2A) which is framework-agnostic. Provide thin framework adapters as optional convenience layers.

### Anti-Pattern 2: Trying to Be the Agent Runtime

**What people do:** Build an infrastructure service that also tries to host/run agents.
**Why it's wrong:** Competes with every agent framework simultaneously. Massive surface area. Not what infrastructure customers want.
**Do this instead:** Be invisible middleware. Enhance existing agent setups without replacing them.

### Anti-Pattern 3: LLM Gateway Re-invention

**What people do:** Build yet another LLM API proxy with routing and cost tracking.
**Why it's wrong:** LiteLLM, Portkey, Helicone already have strong positions. Saturated market.
**Do this instead:** Focus on the MCP/A2A layer where the market is earlier and less crowded.

### Anti-Pattern 4: Ignoring the Credential Problem

**What people do:** Let each MCP server handle its own authentication, leading to credential sprawl.
**Why it's wrong:** Agents typically connect to 5-20 MCP servers. Managing OAuth tokens, API keys, and refresh cycles for each one separately is the #1 developer pain point.
**Do this instead:** Centralized credential vault with automated token lifecycle management (the Composio pattern). This is the "PayPal position" -- handling the auth so developers don't have to.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-100 agents | Single gateway instance. SQLite or Postgres for usage tracking. Sufficient for indie/small team. |
| 100-10K agents | Horizontal gateway scaling. Redis for rate limiting state. Async billing pipeline. Need multi-tenant isolation. |
| 10K+ agents | Distributed gateway (edge deployment). Kafka/NATS for event streaming. Dedicated billing microservice. This is enterprise territory. |

### Scaling Priorities

1. **First bottleneck:** Gateway latency. Bifrost achieves ~11 microsecond overhead. Gateway must not meaningfully increase tool call latency. In-memory auth caching and connection pooling are essential.
2. **Second bottleneck:** Observability data volume. At scale, every tool call generates traces. Need sampling strategies and efficient storage (columnar stores, time-series DBs).

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| LLM Providers (OpenAI, Anthropic, Google) | Not directly -- these sit below the MCP layer | LLM gateways (LiteLLM) handle this layer |
| MCP Servers (500+ public) | Reverse proxy / registry | Must support both stdio (local) and Streamable HTTP (remote) transports |
| A2A Agents | Agent Card registry + task routing | JSON-RPC 2.0 over HTTPS; gRPC for v0.3+ |
| OAuth Providers | Token exchange, refresh, vault | MCP spec recommends OAuth for remote server auth |
| OpenTelemetry Collectors | OTel SDK export | Industry standard; Jaeger/Zipkin/Datadog compatible |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Gateway <-> Auth Service | Internal API or embedded module | Start embedded, extract if scaling demands |
| Gateway <-> Billing Service | Async event pipeline | Do not block tool calls for billing writes |
| Gateway <-> Observability | OTel SDK (fire-and-forget) | Must not add latency to the hot path |
| Gateway <-> Rate Limiter | In-memory (Redis for distributed) | Sub-millisecond lookup required |
| Dashboard <-> Gateway API | REST/GraphQL | Separate read path for usage analytics |

## Key Architectural Insight for This Project

The "PayPal position" in AI agent infrastructure maps most naturally to the **MCP Gateway layer**. Here is why:

1. **Universal touchpoint:** Every AI agent, regardless of framework, uses tools. MCP is the de facto standard for tool access (adopted by OpenAI, Anthropic, Google, Microsoft, Amazon). Building at this layer means your infrastructure applies to the entire market.

2. **Authentication is the wedge:** Managing OAuth tokens, API keys, and credential rotation across 5-20 MCP servers per agent is a recurring pain. Solving this creates immediate value and natural lock-in (like PayPal's credential vault for e-commerce).

3. **Billing follows auth:** Once you manage credentials and see all tool traffic, adding usage metering and cost control is a natural extension -- you already have the data.

4. **Observability follows traffic:** All tool calls flow through your gateway, so you can offer observability as a built-in feature rather than requiring separate instrumentation.

The progression is: **Auth -> Billing -> Observability -> Testing**, each building on data from the previous layer.

## Sources

- [MCP Architecture Overview -- modelcontextprotocol.io](https://modelcontextprotocol.io/docs/learn/architecture)
- [A2A Protocol Specification -- a2a-protocol.org](https://a2a-protocol.org/latest/specification/)
- [AG-UI Protocol -- CopilotKit](https://www.copilotkit.ai/ag-ui)
- [MCP vs A2A Complete Guide -- DEV Community](https://dev.to/pockit_tools/mcp-vs-a2a-the-complete-guide-to-ai-agent-protocols-in-2026-30li)
- [Architecting Agentic MLOps with A2A and MCP -- InfoQ](https://www.infoq.com/articles/architecting-agentic-mlops-a2a-mcp/)
- [Enterprise AI Stack 2026 -- DextraLabs](https://dextralabs.com/blog/enterprise-ai-stack-2026-mcp-a2a-domain-models/)
- [AI Agent Frameworks Compared 2026 -- Arsum](https://arsum.com/blog/posts/ai-agent-frameworks/)
- [LLM Gateways as Critical Infrastructure -- LangGuard](https://langguard.ai/2026/01/13/invisible-backbone.html)
- [MCP Gateways Developer Guide -- Composio](https://composio.dev/content/mcp-gateways-guide)
- [Secure AI Agent Infrastructure Guide -- Composio](https://composio.dev/blog/secure-ai-agent-infrastructure-guide)
- [AI Agent Observability with Langfuse -- Langfuse Blog](https://langfuse.com/blog/2024-07-ai-agent-observability-with-langfuse)
- [Best MCP Gateways 2026 -- TrueFoundry](https://www.truefoundry.com/blog/best-mcp-gateways)
- [ContextForge AI Gateway -- IBM](https://ibm.github.io/mcp-context-forge/)
- [Building AI Agent Gateway with MCP, OPA -- InfoQ](https://www.infoq.com/articles/building-ai-agent-gateway-mcp/)
- [A2A Protocol Upgrade -- Google Cloud Blog](https://cloud.google.com/blog/products/ai-machine-learning/agent2agent-protocol-is-getting-an-upgrade)
- [What Is A2A Protocol -- IBM](https://www.ibm.com/think/topics/agent2agent-protocol)
- [The AI Agents Stack -- Letta](https://www.letta.com/blog/ai-agents-stack)
- [MCP Authentication Patterns -- Security Boulevard](https://securityboulevard.com/2026/03/mcp-authentication-and-authorization-patterns/)

---
*Architecture research for: AI Agent Infrastructure Services*
*Researched: 2026-03-13*
