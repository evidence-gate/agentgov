# Feature Research

**Domain:** Agent Governance Platform (cost control + HITL + error handling)
**Researched:** 2026-03-13
**Confidence:** MEDIUM-HIGH

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in any "agent governance" product. Missing any of these means the product feels broken or incomplete before users even evaluate differentiators.

#### Pillar 1: Cost Control

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Per-request cost calculation | Without this, no budget tracking is possible — it's the atomic primitive | LOW | Token counts × model pricing. Must handle input/output asymmetry. Pricing table must be maintainable |
| Multi-level spend aggregation | Developers need to see cost by model, provider, user, team — without this, "cost tracking" is a single undifferentiated number | MEDIUM | Requires tagging/labeling on every request. LiteLLM, Portkey both do this |
| Budget definition (global + per-entity) | Any serious multi-tenant or multi-agent setup needs budgets at multiple scopes, not just one top-level limit | MEDIUM | Global / provider / model / team / agent scopes. LiteLLM has user+team+provider+tag budgets |
| Hard enforcement (block on exceeded budget) | Alerting alone is insufficient — agents don't respond to alerts; developers can't babysit. The blocking is the whole point | MEDIUM | This is what Portkey/LiteLLM do partially. The gap is enforcement at agent-session granularity, not just key-level |
| Cost dashboard (read-only observability) | Developers expect to see what's happening. A proxy with no UI feels like a black box | MEDIUM | Table stakes for trust. AgentOps, Langfuse, Portkey all have dashboards |
| Budget alert/notification | Before hard enforcement, developers expect soft warnings | LOW | Email, webhook, Slack. All major players have this |

#### Pillar 2: HITL / Approval

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Approval request routing | Without delivery mechanism, HITL is a concept not a product | MEDIUM | At minimum: webhook. Slack is expected by enterprise users. HumanLayer supports Slack, email, SMS, WhatsApp |
| Approve / deny response path | A request must flow back to the agent — not just notify the human | MEDIUM | Denied actions must be fed back into agent context. HumanLayer confirmed this pattern |
| Async approval (non-blocking wait) | Agents must pause and resume; synchronous blocking HITL is unusable in real workflows | HIGH | Requires state persistence across the pause. LangGraph uses checkpointers for this |
| Timeout / escalation handling | If the human doesn't respond, the agent must know what to do (auto-deny, escalate, retry) | MEDIUM | HumanLayer has escalation. No clear standard pattern yet |
| Approval history / audit trail | Compliance requires knowing who approved what and when | MEDIUM | Immutable log of approval decisions with actor, timestamp, action taken |

#### Pillar 3: Error Handling

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Error classification (transient vs permanent) | Retrying a permanent error wastes budget; not retrying a transient error loses work | MEDIUM | Retriable (rate limits, 5xx) vs non-retriable (auth, 4xx). Standard pattern in distributed systems |
| Finite retry with backoff | Infinite retry is the enemy. Exponential backoff with jitter is the established safe pattern | LOW | Max retries cap is essential. Without it, runaway loops burn budget |
| Stuck/loop detection | Agents that recurse without progress are a known failure mode — users expect the platform to catch this | HIGH | Requires state tracking across turns. GSD-2 uses 2-failure-stop rule. Dead letter queue pattern is industry standard |
| Structured error reporting | "Something failed" is not actionable. Structured error objects with type, context, and suggested action are expected | LOW | Schema: error type + timestamp + agent context + suggested remediation |

#### Cross-Pillar

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| SDK integration (1-line wrap) | Developers will not adopt a product that requires significant instrumentation overhead | MEDIUM | `agentgov.wrap(client)` or equivalent. AgentOps does `agentops.init(API_KEY)`. HumanLayer is framework-agnostic |
| OpenAI-compatible API surface | Most agent frameworks target OpenAI API format. Deviating creates adoption friction | LOW | Proxy must accept standard `chat/completions` and tool call format |
| Self-hostable deployment | Enterprise developers won't send agent traffic through a third-party cloud without an on-prem option | MEDIUM | Docker Compose minimum. This is why Langfuse MIT+self-host beats proprietary observability tools |

---

### Differentiators (Competitive Advantage)

Features where agentgov can win by doing what competitors structurally cannot or have not done.

#### Pillar 1: Cost Control — Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Hold/Settle budget pattern (pessimistic reservation) | Prevents concurrent agent sessions from over-drafting a shared budget — a race condition every proxy-level approach misses | HIGH | banto proved the concept: reserve budget before call, settle actual cost after. No competitor implements this at the session layer. Critical for multi-agent parallelism |
| Graceful degradation to cheaper model | When a budget is near-exceeded, automatically route to a cheaper model rather than just failing — preserves task completion | HIGH | Requires model tier knowledge + budget state + routing logic. No competitor does automatic downgrade at budget threshold |
| Per-session budget isolation | Not just per-key or per-user, but per agent execution session — allows independent budget accounting for autonomous agents spawned from a parent | HIGH | AgentBudget.dev offers hierarchical parent/child budgets as a differentiator. Portkey/LiteLLM budget at key/team level, not session level |
| Crash-safe budget state | If the proxy crashes mid-session, budget should not be corrupted — reserved amounts must be recoverable | HIGH | Requires durable state (not in-memory). File-based or DB-backed state machine. GSD-2 principle: file-based state machine for crash recovery |

#### Pillar 2: HITL — Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Risk-graded action classification (static, deterministic) | Instead of requiring LLMs to decide what needs approval, classify action types statically — Reversible / Semi-Reversible / Irreversible / External. Deterministic and auditable | HIGH | GSD-2 design principle. HumanLayer routes all tool calls to humans — agentgov routes only based on risk class. Reduces approval fatigue |
| HITL decision feeds agent context | Denial reasons are injected back into the agent's context window, allowing agent to self-correct | MEDIUM | HumanLayer does this. It should be table stakes but many HITL implementations just block and fail |
| EU AI Act Article 14 compliance mode | Export evidence of human oversight with timestamps, actor identity, and decision chain for high-risk AI systems | HIGH | Article 14 requires human-machine interface tools and oversight documentation. Enforcement date 2026-08-02. No competitor positions explicitly for this |
| Approval audit log with cryptographic integrity | Append-only log with hash chaining — not just logs that happen to be append-only, but logs where tampering is detectable | HIGH | OneUptime 2026 blog describes OTel + append-only pipeline. Differentiates from simple DB logs |

#### Pillar 3: Error Handling — Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| 3-tier timeout (soft warning → idle detection → hard stop) | More nuanced than simple timeout. Soft warning lets agent wind down gracefully; idle detection catches agents that stopped producing without crashing; hard stop is last resort | HIGH | GSD-2 design. No competitor product implements this 3-tier structure explicitly |
| Error-type to handler static mapping | Declare at configuration time what happens for each error class — don't let the agent decide at runtime whether to retry, escalate, or abort | MEDIUM | GSD-2 principle: deterministic code, not LLM judgment, for error routing |
| Partial result return on hard stop | When the hard budget or timeout limit hits, return the work completed so far rather than discarding. Preserves partial value | MEDIUM | AgentBudget.dev describes "return partial result" on budget exceeded. Not standard in observability tools |

#### Cross-Pillar Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Unified governance in one SDK (cost + HITL + error) | Competitors address one pillar each. Integration of all three in a single `wrap()` call eliminates the integration tax | HIGH | Portkey = cost/routing. HumanLayer = HITL. AgentOps = observability. No single product combines all three |
| Cloudflare Workers edge deployment | Sub-millisecond governance overhead globally. Competitors run on traditional cloud (LiteLLM/Langfuse on VMs, Portkey on AWS) | HIGH | Enables $5/month self-host with global distribution. Unique positioning |
| Capability-based security model | Treat the agent as an untrusted contractor, not a trusted employee. Governance enforced by capability grants, not by trusting agent self-reporting | HIGH | GSD-2 principle. Relevant for agentic security concerns being raised by Strata (2026 research) |

---

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| LLM routing / load balancing | Seems natural for a proxy layer to also route between models for latency/cost optimization | Commoditized. LiteLLM, Portkey, Helicone all do this. No differentiation possible. Scope creep distraction from core governance | Let users choose their routing layer. agentgov wraps on top of whatever client they already use |
| Guardrails / content filtering | Natural addition to a "governance" product | Separate problem domain with different buyers (safety teams vs eng teams). Highly competitive (Guardrails.ai, NeMo Guardrails, Lakera). Risk of becoming mediocre at everything | Stay focused on cost/HITL/error. Document integration patterns with guardrail tools |
| Agent framework features (orchestration, memory, planning) | Users building complex agents want their governance tool to "understand" the agent | Becomes a competing framework, not a governance layer. Destroys the "wrap any client" positioning | Provide framework adapters (LangChain callback, CrewAI middleware) without owning the framework |
| ML-based anomaly detection for cost | Sounds smart — detect unusual spend patterns with ML | High implementation cost, high false positive rate, difficult to debug. Deterministic thresholds (3x rolling average) are more trustworthy and auditable | Use deterministic threshold-based alerts with configurable multipliers |
| Real-time everything (WebSocket push for all events) | Dashboard showing live spend feels impressive | Significant infrastructure complexity. Most governance decisions don't require real-time updates — polling with 30s intervals is sufficient for most use cases | Use polling + webhook notifications for threshold events. Reserve WebSocket for approval queue only |
| Fine-grained RBAC on approval workflows | Enterprise feature requests always include role-based access control | RBAC is a deep surface area that can consume roadmap for quarters. Most early adopters are small teams where it's not needed | Start with simple API-key-based auth. Add RBAC only after PMF validation |
| Mobile approval app | "Approvals on the go" sounds useful | Requires iOS/Android development. Governance approvals are not mobile-first — they happen in Slack or email already | Support Slack + webhook. Let Slack's mobile app handle mobile notifications |
| Billing and invoicing | Natural if the product tracks cost | Requires financial-grade infrastructure, legal compliance (payment processing), and support overhead | Track costs for users' own billing. Do not process payments |

---

## Feature Dependencies

```
[Cost calculation (per-request)]
    └──requires──> [Pricing table (model → $/token)]
    └──enables──> [Spend aggregation]
                      └──enables──> [Budget definition]
                                        └──enables──> [Hard enforcement]
                                                          └──enables──> [Graceful degradation]
                                        └──enables──> [Budget alerts]

[Hold/Settle pattern]
    └──requires──> [Budget definition]
    └──requires──> [Durable state (crash-safe)]

[HITL approval routing]
    └──requires──> [Risk classification (static)]
    └──requires──> [Async state persistence]
                       └──requires──> [Durable state (crash-safe)]
    └──enables──> [Approval audit log]

[Error classification]
    └──requires──> [Error taxonomy definition]
    └──enables──> [Finite retry]
    └──enables──> [Stuck/loop detection]
    └──enables──> [3-tier timeout]

[3-tier timeout]
    └──requires──> [Durable state (crash-safe)]
    └──enhances──> [HITL approval routing] (timeout on approval wait)

[Append-only audit log]
    └──requires──> [Cost calculation]
    └──requires──> [HITL approval routing]
    └──enhances──> [EU AI Act Article 14 compliance mode]

[SDK (1-line wrap)]
    └──requires──> [OpenAI-compatible API surface]
    └──enables──> [All other features] (integration point)

[Durable state (crash-safe)]
    └──is-shared-by──> [Hold/Settle pattern]
    └──is-shared-by──> [Async HITL wait]
    └──is-shared-by──> [3-tier timeout]
    └──is-shared-by──> [Stuck/loop detection]
```

### Dependency Notes

- **Durable state is the infrastructure primitive:** Hold/Settle, async HITL, 3-tier timeout, and loop detection all require crash-safe persistent state. This must be built in Phase 1 as a shared foundation — not discovered later per feature.
- **Pricing table gates everything:** Without an accurate, maintainable pricing table, cost calculation is wrong, budgets are wrong, and enforcement is wrong. Must be updated as providers change pricing (this is an ongoing operational cost).
- **Risk classification must precede HITL routing:** The static action classification taxonomy must be defined before HITL wiring, because classification determines which actions enter the approval queue.
- **Hold/Settle requires concurrent budget writes to be serialized:** Two agent sessions must not be able to simultaneously read the same budget balance and both conclude they have remaining headroom. Requires row-level locking or optimistic concurrency at the budget store.

---

## MVP Definition

### Launch With (v1)

Minimum needed to validate the core thesis: "1-line governance wrapping an existing client enforces cost budgets deterministically."

- [ ] Per-request cost calculation with pricing table (OpenAI, Anthropic, Google minimum) — without this nothing works
- [ ] Budget definition: global + per-agent-session — validates the multi-scope hypothesis
- [ ] Hard enforcement (block on exceeded budget) — the core differentiator vs Portkey/LiteLLM which alert only
- [ ] Hold/Settle budget pattern — unique proof point vs any competitor; validates crash-safe design
- [ ] SDK TypeScript: `agentgov.wrap(client)` — adoption requires frictionless integration
- [ ] Append-only audit log (budget decisions) — compliance starting point; builds trust
- [ ] Self-host via Docker Compose — enterprise prerequisite; opens dev adoption
- [ ] Basic dashboard: budget status, session cost, enforcement events — minimum observability

### Add After Validation (v1.x)

Add when v1 has users and feedback validates the direction.

- [ ] Risk-graded HITL routing (Slack webhook) — add once cost control has traction; HITL is the next pillar
- [ ] Python SDK — expand to second major ecosystem after TypeScript proves out
- [ ] Error classification + finite retry — error handling pillar; add once HITL is validated
- [ ] Stuck/loop detection — higher complexity; add once error classification taxonomy is proven
- [ ] Graceful degradation to cheaper model — power feature; requires model tier knowledge + routing config

### Future Consideration (v2+)

Defer until product-market fit is established and resources justify the complexity.

- [ ] 3-tier timeout (full implementation) — the soft warning + idle detection layer adds significant complexity over a simple hard timeout; defer until v1 timeouts prove insufficient
- [ ] EU AI Act Article 14 compliance mode — regulatory deadline 2026-08-02 creates natural forcing function; build when enterprise pipeline materializes
- [ ] Cryptographic audit log integrity (hash chaining) — important for regulated industries; defer until compliance buyers appear
- [ ] Cloudflare Workers edge deployment (cloud version) — higher complexity than Docker self-host; validate self-host adoption first
- [ ] Multi-channel approval (SMS, WhatsApp, email) — Slack webhook is sufficient for early adopters; expand channels based on user requests
- [ ] Per-session budget inheritance (parent/child) — needed for multi-agent hierarchies; defer until users report needing it

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Per-request cost calculation | HIGH | LOW | P1 |
| Hard budget enforcement (block) | HIGH | MEDIUM | P1 |
| Hold/Settle pattern | HIGH | HIGH | P1 |
| SDK 1-line wrap (TypeScript) | HIGH | MEDIUM | P1 |
| Append-only audit log | HIGH | LOW | P1 |
| Self-host Docker Compose | HIGH | MEDIUM | P1 |
| Basic dashboard | MEDIUM | MEDIUM | P1 |
| Budget alerts/notifications | MEDIUM | LOW | P1 |
| Risk-graded HITL routing | HIGH | HIGH | P2 |
| Python SDK | HIGH | MEDIUM | P2 |
| Error classification + retry | HIGH | MEDIUM | P2 |
| Stuck/loop detection | HIGH | HIGH | P2 |
| Graceful model degradation | MEDIUM | HIGH | P2 |
| 3-tier timeout | MEDIUM | HIGH | P3 |
| EU AI Act compliance mode | HIGH | HIGH | P3 |
| Cryptographic audit log | MEDIUM | HIGH | P3 |
| Edge (Cloudflare Workers) cloud | MEDIUM | HIGH | P3 |
| Multi-channel approval | MEDIUM | MEDIUM | P3 |
| Per-session budget inheritance | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | Portkey | LiteLLM | Langfuse | HumanLayer | AgentOps | AgentBudget | agentgov |
|---------|---------|---------|---------|------------|---------|------------|---------|
| Per-request cost calc | Yes | Yes | Yes | No | Yes | Yes | Yes |
| Hard budget enforcement | Partial (enterprise, key-level) | Yes (key/team/tag/model) | No (tracking only) | No | No | Yes | Yes |
| Hold/Settle (pessimistic reserve) | No | No | No | No | No | No | Yes |
| Per-session budget isolation | No | No | No | No | No | Yes (hierarchical) | Yes |
| Graceful model degradation | No | No | No | No | No | No | Yes (planned) |
| HITL approval routing | No | No | No | Yes | No | No | Yes |
| Risk-graded static classification | No | No | No | No | No | No | Yes |
| Async HITL with state persistence | No | No | No | Yes (basic) | No | No | Yes |
| Stuck/loop detection | No | No | No | No | No | Yes (loop detection) | Yes |
| 3-tier timeout | No | No | No | No | No | No | Yes |
| Append-only audit log | Partial (request log) | Partial (request log) | Yes (traces) | Partial | Yes (traces) | No | Yes |
| Crash-safe budget state | No | No | No | No | No | No | Yes |
| SDK 1-line wrap | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Self-host | Yes (OSS) | Yes (OSS) | Yes (OSS) | No | No | No | Yes |
| EU AI Act compliance positioning | No | No | No | No | No | No | Yes (planned) |

### Key Gaps in Competitors

**Portkey:** Has budget enforcement but it's enterprise-gated (not available in OSS tier), operates at virtual key level (not session level), and has no Hold/Settle pattern. No HITL, no error handling.

**LiteLLM:** Strong budget enforcement across multiple scopes (user/team/provider/tag/model), but no session-level isolation, no Hold/Settle, no HITL, no error handling. Python-only, concurrency concerns under high load.

**Langfuse:** Pure observability — tracking and dashboards but deliberately no enforcement. Was acquired by ClickHouse; focus is shifting to analytics infrastructure, not governance enforcement.

**HumanLayer:** HITL specialist with good multi-channel routing, but no cost control and no error handling. Pivoted to "CodeLayer" (agent coding tools), suggesting HITL-only positioning is insufficient.

**AgentOps:** Monitoring and observability only. No enforcement of any kind. Cost is tracked, not controlled.

**AgentBudget.dev:** Closest to agentgov's cost control vision — has hierarchical sessions, loop detection, webhooks, and hard enforcement. Pure Python library (no proxy/server). No HITL, no error handling. Only one pillar.

**The market gap:** No product combines all three pillars (cost enforcement + HITL + error handling) in a single integration. Every team building production agents assembles this themselves or goes without.

---

## Sources

- [Portkey Budget Limits Docs](https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/virtual-keys/budget-limits-enterprise-feature) — Portkey's enforcement features (enterprise-tier)
- [Portkey: How to implement budget limits and alerts](https://portkey.ai/blog/budget-limits-and-alerts-in-llm-apps/) — Hard cap vs soft cap distinction
- [LiteLLM Budgets, Rate Limits](https://docs.litellm.ai/docs/proxy/users) — User/team-level budget enforcement
- [LiteLLM Budget Routing](https://docs.litellm.ai/docs/proxy/provider_budget_routing) — Provider-level budget routing
- [Langfuse Token and Cost Tracking](https://langfuse.com/docs/observability/features/token-and-cost-tracking) — Observability-only cost tracking
- [HumanLayer HITL features](https://www.permit.io/blog/human-in-the-loop-for-ai-agents-best-practices-frameworks-use-cases-and-demo) — Multi-channel approval, denied message feedback
- [LangGraph Human-in-the-Loop interrupt](https://blog.langchain.com/making-it-easier-to-build-human-in-the-loop-agents-with-interrupt/) — State persistence for async approval
- [AgentBudget.dev](https://agentbudget.dev) — Hierarchical budgets, loop detection, hard enforcement
- [AgentOps GitHub](https://github.com/AgentOps-AI/agentops) — Agent monitoring SDK, cost tracking
- [EU AI Act Article 14](https://artificialintelligenceact.eu/article/14/) — Human oversight requirements for high-risk AI
- [5 AI Agent Failure Patterns](https://earezki.com/ai-news/2026-03-07-5-ai-agent-failures-that-will-kill-your-production-deployment-and-how-i-fixed-them/) — Production error patterns
- [AI Agent Error Handling: 5 Production Patterns](https://blog.jztan.com/ai-agent-error-handling-patterns/) — Circuit breakers, validation gates, dead letter queues
- [Immutable Audit Log Pipeline using OpenTelemetry](https://oneuptime.com/blog/post/2026-02-06-immutable-audit-log-pipeline-otel/view) — Append-only + hash integrity pattern
- [GitHub Agent Control Plane GA](https://github.blog/changelog/2026-02-26-enterprise-ai-controls-agent-control-plane-now-generally-available/) — Enterprise control plane concept
- [Mintlify acquires Helicone](https://www.mintlify.com/blog/mintlify-acquires-helicone) — Helicone in maintenance mode post-acquisition
- [AI Cost Surges Force New Infrastructure Battle](https://thinkintokens.com/ai-cost-surges-force-new-infrastructure-battle-among-providers/) — FinOps pressure in 2026
- [How to get AI agent budgets right 2026 (CIO)](https://www.cio.com/article/4099548/how-to-get-ai-agent-budgets-right-in-2026.html) — Enterprise budget concerns

---
*Feature research for: Agent Governance Platform (agentgov)*
*Researched: 2026-03-13*
