# Technology Stack: AI Agent Infrastructure Services

**Project:** AI Agent Infrastructure Market Research
**Researched:** 2026-03-13
**Overall Confidence:** MEDIUM-HIGH (rapidly evolving ecosystem; protocols stabilizing but implementations still maturing)

## The Two Protocol Standards

Before diving into the stack, understanding the protocol landscape is essential because it defines the entire infrastructure surface area.

### MCP (Model Context Protocol) -- The Tool Integration Standard
| Attribute | Detail | Confidence |
|-----------|--------|------------|
| Current Spec | [2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25) | HIGH |
| Governance | Linux Foundation (Agentic AI Foundation, donated Dec 2025) | HIGH |
| Transport | Streamable HTTP (replaces deprecated SSE), stdio for local | HIGH |
| Auth | OAuth 2.1 + PKCE + RFC 7591 Dynamic Client Registration | HIGH |
| Message Format | JSON-RPC 2.0 | HIGH |
| Capabilities | Tools, Resources, Prompts (server); Sampling, Roots, Elicitation (client) | HIGH |
| Adoption | 97M+ monthly SDK downloads; backed by Anthropic, OpenAI, Google, Microsoft | HIGH |

MCP is the de facto standard for connecting agents to external tools and data. Every major AI vendor has standardized on it. Building MCP-compatible infrastructure is non-negotiable.

### A2A (Agent2Agent Protocol) -- The Agent Interoperability Standard
| Attribute | Detail | Confidence |
|-----------|--------|------------|
| Current Spec | [v1.0 (Release)](https://a2a-protocol.org/latest/specification/) | HIGH |
| Governance | Linux Foundation (open-sourced from Google Cloud) | HIGH |
| Transport | HTTP + SSE, JSON-RPC 2.0, gRPC (optional, added in v0.3) | HIGH |
| Auth | OAuth 2.0 with PKCE, Device Code flow | HIGH |
| Core Concepts | Agent Cards (JSON metadata), Tasks (lifecycle states), Messages, Parts | HIGH |
| Adoption | 150+ supporting organizations; v1.0 released with stricter REST/gRPC/JSON-RPC bindings | MEDIUM |

A2A enables agent-to-agent communication for opaque multi-agent systems. Less mature than MCP but growing fast. Infrastructure services should be A2A-aware.

---

## Recommended Stack

### MCP Server Development (Primary)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **TypeScript** | 5.x | Primary language | MCP ecosystem is TS-first; best SDK support; type safety for protocol work | HIGH |
| **@modelcontextprotocol/sdk** | 1.27.x (v2 expected Q1-Q2 2026) | MCP server/client SDK | Official SDK; 32K+ dependent packages; actively maintained | HIGH |
| **Zod** | 4.x | Schema validation | MCP SDK peer dependency; 14x faster parsing vs v3; JSON Schema export via `.toJSONSchema()` | HIGH |
| **FastMCP** (Python) | 3.1.x | Python MCP servers | Powers 70% of MCP servers across all languages; granular auth, versioning, OpenTelemetry built-in | HIGH |
| **mcp** (Python SDK) | 1.7.x | Python MCP SDK | Official Python SDK; FastMCP 1.0 was incorporated into it | HIGH |

**Why TypeScript-first:** The MCP TypeScript SDK is the reference implementation. The spec's authoritative schema is defined in TypeScript (`schema.ts`). Cloudflare Workers (the recommended deployment target) runs TypeScript natively. The entire MCP gateway ecosystem (Traefik, Docker, Microsoft) is TS/JS-oriented.

**Why also Python:** FastMCP 3.0 is the most productive way to build MCP servers -- decorator-based, automatic tool definition generation from type hints. For AI/ML-heavy servers, Python is unavoidable.

### Web Framework & API Layer

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Hono** | 4.x | HTTP framework | 12KB, runs on every edge runtime (Workers, Deno, Bun, Node); type-safe RPC mode; 1.8M weekly downloads | HIGH |
| **Cloudflare Workers** | -- | Edge compute runtime | Fastest MCP deployment path; Durable Objects for state; built-in MCP support via Agents SDK | HIGH |
| **Cloudflare Agents SDK** | 0.6.x | Agent framework on Workers | Persistent stateful agents; SQLite per instance; WebSocket/SSE streaming; native MCP integration | MEDIUM |

**Why Hono over Express/Fastify:** Hono is built on Web Standards, meaning the same code runs on Cloudflare Workers, Deno, Node, and Bun. For MCP server infrastructure that may need edge deployment, this portability is critical. Express is too heavy and Node-only.

**Why Cloudflare Workers over AWS Lambda / Vercel:** Durable Objects provide per-agent SQLite state with zero-latency access -- essential for MCP session management and agent state. No cold start problem. Workers run in 300+ data centers globally. The Agents SDK integrates MCP natively with RPC transport (no HTTP overhead between Agent and McpAgent in same Worker).

### Database & State

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Cloudflare D1** | -- | Relational database (SQLite-based) | Native Workers integration; zero config; edge-local reads | MEDIUM |
| **Drizzle ORM** | 0.30+ | TypeScript ORM | 7.4KB bundle (vs Prisma 2MB); SQL-like API; serverless-native; works on Workers | HIGH |
| **PostgreSQL** (via Neon/Supabase) | 16+ | Production relational DB | For non-edge workloads; Neon serverless driver works with Drizzle | HIGH |
| **Cloudflare Durable Objects** | -- | Per-agent stateful storage | Built-in SQLite per instance; ideal for MCP session state and agent memory | HIGH |
| **Qdrant** | 1.x | Vector database | Open-source, Rust-based, self-hostable; 60-80% cheaper than Pinecone at scale | MEDIUM |

**Why D1 + Durable Objects (not just PostgreSQL):** MCP servers need session state that lives close to compute. Durable Objects give each agent instance its own SQLite database with strong consistency and zero network latency. D1 handles shared relational data. PostgreSQL (via Neon) serves as the canonical data store for billing, user management, and analytics.

**Why Qdrant over Pinecone/Chroma:** For a small team, self-hostable and open-source matters. Qdrant is the performance leader among open-source vector DBs. Chroma is fine for prototyping but not production-scale. Pinecone is managed but expensive and vendor-locked.

### LLM Gateway

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **LiteLLM** | latest | Unified LLM API gateway | OpenAI-compatible API to 100+ providers; virtual keys; budget tracking per key/user; used by Netflix, Rocket Money | HIGH |

**Why LiteLLM:** Any AI agent infrastructure service will need to call LLMs. LiteLLM provides a single OpenAI-compatible interface to every provider, with built-in cost tracking, rate limiting, and virtual API keys. Deploy as a proxy server and all your services go through one gateway. This is the foundational cost-control layer.

### Observability

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Langfuse** | latest | LLM/agent observability | Open-source (MIT); self-hostable; tracing, cost tracking, prompt versioning, evals | HIGH |
| **OpenTelemetry** | GenAI semconv v1.37+ | Trace standard | Industry standard; GenAI semantic conventions for agent spans now supported by Datadog, Langfuse | HIGH |

**Why Langfuse over LangSmith/Braintrust:** Langfuse is open-source and self-hostable -- critical for a small team that needs data sovereignty and cost control. LangSmith is great but LangChain-coupled and proprietary. Braintrust is CI/CD-native but closed-source. Langfuse integrates with OpenTelemetry, LiteLLM, and every major framework.

**Why OpenTelemetry:** The GenAI semantic conventions are now stable enough for production. They define standardized attributes for agent tasks, actions, tool calls, and LLM interactions. Instrument once, export to any backend (Langfuse, Datadog, Grafana).

### Authentication & Integration

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Nango** | latest | OAuth token management | Open-source; 500+ OAuth integrations; handles token refresh/rotation; self-hostable | HIGH |
| **Composio** | latest | Managed MCP integrations | 500+ pre-built connectors; centralized auth; production-ready tool calling at scale | MEDIUM |

**Why Nango for auth, Composio for integrations:** The project context identifies "external API authentication management" as a key pain point. Nango solves OAuth/token lifecycle as an open-source, self-hostable service -- you own the auth layer. Composio provides the breadth of pre-built MCP tool integrations. Use Nango when you want auth control; use Composio when you want fast integration coverage.

### Billing & Metering

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Lago** | latest | Usage-based billing | Open-source; event-based metering; no revenue percentage; trusted by Mistral AI; self-hostable | HIGH |
| **Stripe** (+ Metronome) | latest | Payment processing + AI metering | Stripe acquired Metronome ($1B, Jan 2026); new AI-focused metering for tokens/tasks/workflows | HIGH |

**Why Lago + Stripe (not Stripe alone):** Stripe Billing's legacy architecture has a 100 req/s rate limit on usage ingestion -- insufficient for high-volume agent operations. Lago handles the high-frequency event metering (tokens, tool calls, agent actions) and integrates with Stripe for payment processing. Lago is open-source, self-hostable, and takes no revenue cut. This combination gives you Stripe's payment infrastructure with Lago's metering performance.

**Emerging: Nevermined** for agent-to-agent payments (MCP/A2A native, supports fiat + crypto). Worth monitoring for marketplace use cases but not mature enough for primary billing. **Confidence: LOW**

### Agent Sandbox / Execution

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **E2B** | latest | Code execution sandbox | Open-source; Firecracker microVMs; <200ms cold start; used by ~50% of Fortune 500; Python + TS SDKs | HIGH |

**Why E2B:** When agents need to execute arbitrary code, E2B provides secure, isolated Firecracker microVM sandboxes. Each sandbox gets its own kernel. Modal is the alternative for GPU workloads, but E2B is purpose-built for agent code execution with the best developer experience.

### MCP Gateway (Governance Layer)

| Technology | Type | Purpose | Why | Confidence |
|------------|------|---------|-----|------------|
| **Traefik Hub** | Commercial + OSS core | MCP gateway with TBAC | Session-smart routing; audit-ready observability; integrates with existing Traefik deployments | MEDIUM |
| **Docker MCP Gateway** | Open-source | MCP server orchestration | Centralized proxy; credential management; access control | MEDIUM |
| **Microsoft MCP Gateway** | Open-source | K8s MCP management | Session-aware routing; authorization; lifecycle management in Kubernetes | MEDIUM |

**Assessment:** The MCP gateway space is nascent and fragmented. For a small team building infrastructure, this is a potential opportunity space rather than a "pick one" decision. The gateway layer (auth, rate limiting, audit, policy enforcement) between MCP clients and servers is where significant value creation opportunity exists.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Language | TypeScript | Go, Rust | MCP ecosystem is TS-first; Go/Rust SDKs exist but lag in features and community |
| Web Framework | Hono | Express, Fastify | Express is Node-only and heavy; Fastify is faster but not edge-compatible |
| Edge Runtime | Cloudflare Workers | AWS Lambda, Vercel Edge | Lambda has cold starts; Vercel lacks Durable Objects equivalent; Workers has best MCP integration |
| ORM | Drizzle | Prisma | Prisma's 2MB bundle is prohibitive for edge; Drizzle's SQL-like API is better for DB-literate devs |
| LLM Gateway | LiteLLM | Portkey, Helicone | LiteLLM is open-source with broadest provider coverage; Portkey/Helicone are more enterprise/commercial |
| Observability | Langfuse | LangSmith, Braintrust | LangSmith is LangChain-coupled; Braintrust is closed-source; Langfuse is MIT and self-hostable |
| Vector DB | Qdrant | Pinecone, Chroma | Pinecone is expensive/proprietary; Chroma caps out at prototyping scale |
| Billing | Lago + Stripe | Chargebee, Orb | Chargebee takes revenue cut; Orb is good but closed-source; Lago is free and self-hostable |
| Agent Framework | (Framework-agnostic) | LangGraph, CrewAI | Building infrastructure, not agents -- must support all frameworks, not pick one |

---

## What NOT to Use

| Technology | Why Avoid |
|------------|-----------|
| **SSE transport for MCP** | Deprecated in 2025-06-18 spec; replaced by Streamable HTTP |
| **Express.js for edge** | Node-only, cannot run on Workers/Deno/Bun; heavy for MCP servers |
| **Prisma on edge** | 2MB bundle makes it impractical for Cloudflare Workers or any edge runtime |
| **Chroma for production** | Not designed for >10M vectors; use for development/prototyping only |
| **Single LLM provider** | OpenAI Agents SDK locks you to OpenAI; use LiteLLM for provider flexibility |
| **Custom billing from scratch** | 3-6 months engineering time; 92% of AI companies adjust pricing at least once -- use Lago |
| **Blockchain-first payments** | Nevermined is interesting but crypto adds unnecessary complexity for initial billing; use Stripe |

---

## Installation

```bash
# Core MCP Server (TypeScript)
npm install @modelcontextprotocol/sdk zod hono

# Cloudflare
npm install -D wrangler @cloudflare/workers-types

# Database
npm install drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit

# LLM Gateway (deploy as proxy)
pip install litellm[proxy]

# MCP Server (Python)
pip install fastmcp>=3.0

# Observability
pip install langfuse opentelemetry-api opentelemetry-sdk

# Billing
# Lago: self-host via Docker or use Lago Cloud
# Stripe: npm install stripe

# Agent Sandbox
pip install e2b
npm install @e2b/code-interpreter

# OAuth Management (Nango)
# Self-host via Docker or use Nango Cloud
```

---

## Protocol Version Matrix

| Protocol | Latest Stable | Key Date | Breaking Changes to Watch |
|----------|--------------|----------|--------------------------|
| MCP | 2025-11-25 | Nov 2025 | Streamable HTTP replaced SSE; OAuth 2.1 is now the auth standard |
| A2A | v1.0 | ~Q1 2026 | TextPart/FilePart/DataPart replaced with unified Part; stricter REST/gRPC bindings |

---

## Sources

### Protocol Specifications
- [MCP Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)
- [A2A Protocol v1.0 Specification](https://a2a-protocol.org/latest/specification/)
- [A2A What's New in v1.0](https://a2a-protocol.org/latest/whats-new-v1/)

### SDKs & Frameworks
- [MCP TypeScript SDK (GitHub)](https://github.com/modelcontextprotocol/typescript-sdk)
- [@modelcontextprotocol/sdk on npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk) -- v1.27.1
- [FastMCP 3.0 Release](https://www.jlowin.dev/blog/fastmcp-3) -- v3.1.0
- [MCP Python SDK on PyPI](https://pypi.org/project/mcp/) -- v1.7.1
- [Hono Framework](https://hono.dev/) -- ~1.8M weekly npm downloads
- [Cloudflare Agents SDK](https://developers.cloudflare.com/agents/) -- v0.6.x
- [Zod v4 Release Notes](https://zod.dev/v4)

### Infrastructure
- [LiteLLM - Unified LLM Gateway](https://docs.litellm.ai/docs/)
- [Langfuse - Open Source LLM Observability](https://langfuse.com/)
- [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [E2B Sandbox](https://github.com/e2b-dev/e2b)

### Billing & Auth
- [Lago - Open Source Billing](https://getlago.com/)
- [Stripe Metronome Acquisition](https://stripe.com/blog/metronome-stripe-building-the-future-of-billing)
- [Nango - OAuth Integration](https://nango.dev/)
- [Composio - AI Agent Integration](https://composio.dev/)
- [Nevermined - AI Agent Payments](https://nevermined.ai/)

### Gateway & Governance
- [Traefik MCP Gateway](https://traefik.io/solutions/mcp-gateway)
- [Docker MCP Gateway](https://docs.docker.com/ai/mcp-catalog-and-toolkit/mcp-gateway/)
- [Microsoft MCP Gateway (GitHub)](https://github.com/microsoft/mcp-gateway)
- [Obot (formerly Acorn Labs) MCP Gateway](https://obot.ai/)

### Market Context
- [MCP Enterprise Adoption 2025-2026](https://guptadeepak.com/the-complete-guide-to-model-context-protocol-mcp-enterprise-adoption-market-trends-and-implementation-strategies/)
- [MCP Authorization - Stack Overflow Blog](https://stackoverflow.blog/2026/01/21/is-that-allowed-authentication-and-authorization-in-model-context-protocol/)
- [AI Agent Billing Patterns 2026](https://nevermined.ai/blog/ai-agent-billing-patterns)
- [AI Agent Infrastructure Landscape 2025-2026 (Medium)](https://medium.com/@vinniesmandava/the-agentic-ai-infrastructure-landscape-in-2025-2026-a-strategic-analysis-for-tool-builders-b0da8368aee2)
- [AI Agent Tools Landscape 120+ Tools Mapped](https://www.stackone.com/blog/ai-agent-tools-landscape-2026/)
