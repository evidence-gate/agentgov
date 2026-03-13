# Project Research Summary

**Project:** agentgov — Agent Governance Platform
**Domain:** LLM Proxy / Cost Enforcement / Human-in-the-Loop / Error Handling
**Researched:** 2026-03-13
**Confidence:** HIGH

## Executive Summary

agentgov is a proxy-layer governance platform for autonomous AI agents, combining three pillars that no competitor currently addresses together: deterministic cost enforcement (pre-request Hold/Settle budget reservation), risk-graded human-in-the-loop approval (static action classification, not LLM-mediated), and structured error handling with loop detection. Experts build products in this space as OpenAI-compatible reverse proxies with a thin SDK that redirects base URLs rather than wrapping business logic client-side. The canonical stack is Hono on Cloudflare Workers for the proxy layer, Turso/libSQL for durable state, and a lightweight TypeScript SDK — with a Docker Compose self-host path using the same Hono code via `@hono/node-server`. The market gap is clear: Portkey handles cost-at-key-level, HumanLayer handles HITL, AgentOps handles observability — but every production team assembles these manually, and none implements Hold/Settle budget reservation, which is the single most important differentiator.

The recommended approach is to lead with cost enforcement as the primary hook (cost overruns are felt in developer wallets immediately; HITL value is abstract until something goes wrong), build HITL as a natural second step, and add error handling as the production-hardening layer. The Hold/Settle pattern — pessimistically reserving budget before a request is forwarded, then settling to actual cost — is both the primary technical differentiator and the foundation every other feature depends on. It must be built first and built correctly, because retrofitting atomic budget reservations after other features are layered on top is very high cost.

The dominant risks are: (1) budget race condition under concurrent requests if Hold/Settle is not atomic from day one, (2) proxy latency creep making the product unusable if audit writes are synchronous and responses are buffered rather than streamed, and (3) pricing data staleness causing silent budget enforcement failure if unknown models default to zero cost instead of failing closed. All three are Phase 1 concerns that cannot be deferred. The EU AI Act Article 14 compliance deadline (August 2026) creates a natural forcing function for the append-only tamper-evident audit log, which should be treated as infrastructure, not a feature.

## Key Findings

### Recommended Stack

The stack is unified around the Cloudflare Workers ecosystem for the cloud variant, with Hono as the HTTP framework running identically on Workers and Node.js. This dual-runtime property is critical: the same proxy code runs in Cloudflare for the cloud offering and behind `@hono/node-server` in Docker Compose for enterprise self-host. Turso (libSQL) is the right operational database because it works in both environments — Cloudflare D1 would lock out the self-host path. Cloudflare Durable Objects provide the per-agent single-writer lock needed for atomic budget holds. Cloudflare Workflows (`waitForEvent`) handle HITL pause/resume durably without a custom state machine.

See `.planning/research/STACK.md` for full stack details.

**Core technologies:**
- **Hono 4.12.7**: HTTP proxy framework — edge-native, runs on Workers and Node.js, zero-overhead middleware chain maps onto the proxy intercept pattern
- **Cloudflare Durable Objects**: Per-agent budget ledger — serializes concurrent hold writes from the same agent, eliminates the race condition that all competitors have
- **Cloudflare Workflows (waitForEvent)**: HITL state machine — durable pause/resume without custom state management, GA April 2025
- **Turso / libSQL (@libsql/client/web)**: Operational database — SQLite-compatible, works in both Workers and Docker Compose (use `/web` import not `/http` in Workers)
- **Drizzle ORM 0.45.x**: Type-safe SQL for edge — no connection pool required, drizzle-kit for migrations
- **Zod 4.3.x**: Request validation + SDK schema — 14x faster than v3, `@zod/mini` at 1.9 KB for SDK bundle
- **TypeScript SDK (tsup dual CJS+ESM)**: Primary integration surface — `agentgov.wrap(client)` convenience layer, base URL redirect as the production path
- **React 19 + Vite 6 + @cloudflare/vite-plugin**: Dashboard SPA — keep minimal (cost summary, budget gauges, approval queue)

**Critical version notes:**
- Use `wrangler types` for Workers types — do NOT use `@cloudflare/workers-types` npm package (stale)
- Use `@libsql/client/web` not `@libsql/client` in Workers — the web-specific import is mandatory
- Verify `@hono/zod-validator` supports Zod v4 at install time

### Expected Features

The MVP thesis is: "1-line governance wrapping an existing client enforces cost budgets deterministically." Everything in v1 must prove this thesis. HITL and error handling are v1.x additions after cost control has traction.

See `.planning/research/FEATURES.md` for full feature analysis and competitor matrix.

**Must have for v1 (table stakes + core differentiators):**
- Per-request cost calculation with pricing table (OpenAI, Anthropic, Google) — the atomic primitive
- Budget definition at global + per-agent-session scope — multi-scope hypothesis validation
- Hard enforcement (block on exceeded budget) — the differentiator vs Portkey/LiteLLM which alert-only
- Hold/Settle budget pattern — unique proof point; no competitor implements this
- SDK TypeScript `agentgov.wrap(client)` + base URL redirect path — adoption requires frictionless integration
- Append-only audit log for budget decisions — compliance starting point; EU AI Act Article 12
- Self-host via Docker Compose — enterprise prerequisite
- Basic dashboard (budget status, session cost, enforcement events) — minimum observability

**Should have after v1 traction (v1.x):**
- Risk-graded HITL routing (Slack + webhook) — once cost control has users, HITL is the natural second step
- Python SDK — second major ecosystem
- Error classification + finite retry
- Stuck/loop detection (2-failure-stop rule)
- Graceful degradation to cheaper model on budget soft limit

**Defer to v2+ (after PMF):**
- 3-tier timeout (soft warning + idle detection full implementation)
- EU AI Act Article 14 compliance mode with cryptographic audit log integrity
- Cloudflare Workers cloud deployment (validate self-host adoption first)
- Multi-channel approval (SMS, WhatsApp, email) — Slack + webhook sufficient for early adopters
- Per-session budget inheritance for multi-agent hierarchies

**Anti-features to avoid explicitly:**
- LLM routing/load balancing — commoditized, no differentiation possible
- Guardrails/content filtering — different buyer, different domain
- Agent orchestration/memory — destroys "wrap any client" positioning
- Billing and invoicing — financial-grade infrastructure not justified pre-PMF

### Architecture Approach

The architecture is a linear pipeline: SDK (base URL rewrite) → Proxy Ingress (Hono, OpenAI-compatible endpoint) → Auth & Agent Identity → Budget Gate (Hold/Settle) → Action Classifier (static risk table) → LLM Passthrough or HITL Queue → Error Classifier + Timeout Watchdog → Audit Log Writer. All enforcement is server-side in the proxy; the SDK is a convenience layer only and must not be the enforcement boundary. Build order is constrained by this dependency chain: Audit Log and Budget Ledger must exist before Budget Gate, which must exist before HITL Queue, which must exist before Approval Channels.

See `.planning/research/ARCHITECTURE.md` for full component breakdown, data flow diagrams, and code patterns.

**Major components:**
1. **SDK (TS/Python)** — rewrites `base_url` to proxy URL, injects `X-Agent-Id` header, surfaces `BudgetExceeded` / `HitlPending` exceptions; zero persistent state
2. **Budget Gate** — pre-request hold (pessimistic reservation via Durable Object per agent), post-response settle; hierarchy: global > provider > model; graceful fallback to cheaper model
3. **Action Classifier** — static lookup table (action name → RiskTier); never LLM-mediated; Reversible / Semi-Reversible / Irreversible / External
4. **HITL Queue** — async suspend/resume; persists ticket to Turso before any notification; TTL-based expiry to DENIED; callback endpoint for Slack/webhook resume
5. **Error Classifier + Timeout Watchdog** — 3-tier timeout (T1 soft warn at 30s / T2 idle detect at 60s / T3 hard stop at 120s); bounded retry (2-failure-stop rule); loop detection
6. **Audit Log Writer** — append-only, hash-chained SHA-256, DB-level UPDATE/DELETE disabled; every governance event; EU AI Act Article 12/14 backbone
7. **Dashboard** — read-only queries on audit log + budget ledger; separate DB connection with SELECT-only permissions

### Critical Pitfalls

1. **Budget race condition under concurrent requests** — Use Hold/Settle from day one (atomic pessimistic reservation before forwarding, settle to actual cost after response). Never use read-then-write check. All enforcement writes must go to Turso primary, not replicas. One Durable Object per agent serializes concurrent holds. This is a Phase 1 requirement; retrofitting is very high cost.

2. **Proxy latency creep above 15ms p50** — Keep the synchronous hot path to only: (1) budget hold, (2) stream passthrough, (3) async settle. Audit log writes are fire-and-forget from the hot path. Never buffer the full response body before forwarding. Never do synchronous DB writes per token. Measure p50/p95/p99 overhead in CI; fail if p50 exceeds 15ms.

3. **Pricing data staleness causing silent enforcement failure** — Unknown model names must fail CLOSED (block + warn), never pass through with zero cost. Emit a warning if `pricing.json` is older than 30 days. Provide `agentgov pricing sync` CLI. This is a Phase 1 requirement — unknown-model behavior must be specified before enforcement logic is written.

4. **Approval state orphaning after crashes** — All approval requests must have an explicit TTL (default 24h). Expired approvals transition to DENIED deterministically. Budget holds have the same TTL as their approval request. Approval state must be persisted to Turso before any notification is sent (not after). This is a Phase 2 requirement that must be in the initial schema.

5. **HITL-first positioning failure** — Lead all marketing, README, and onboarding with cost control as the primary hook. HITL is opt-in via action classification. HumanLayer pivoted away from standalone HITL positioning — this validates the cost-first approach. Monetization attaches to cost savings, not HITL seats.

## Implications for Roadmap

Based on the dependency chain in ARCHITECTURE.md (Layer 0 → Layer 4) and the pitfall-to-phase mapping in PITFALLS.md, the natural phase structure is:

### Phase 1: Budget Engine + Proxy Foundation

**Rationale:** Durable state (audit log schema, budget ledger) is the foundation everything else depends on. The Hold/Settle atomicity contract must be established before any other feature layer exists. This phase proves the core thesis.

**Delivers:** Working `agentgov.wrap(client)` TypeScript SDK that enforces cost budgets deterministically. Unknown model fails closed. Streaming-aware hold/settle. Append-only audit log with hash chain.

**Addresses (from FEATURES.md):** Per-request cost calculation, budget definition (global + session), hard enforcement (block), Hold/Settle pattern, SDK TypeScript, append-only audit log.

**Avoids (from PITFALLS.md):** Budget race condition (Pitfall 1), proxy latency creep (Pitfall 2), pricing staleness (Pitfall 3), streaming token count late enforcement (Pitfall 6), Turso eventual consistency (Pitfall 8), non-append-only audit log (Pitfall 9).

**Stack used:** Hono, Cloudflare Durable Objects (hold serialization), Turso/libSQL, Drizzle ORM, Zod 4, Wrangler 4, Vitest + @cloudflare/vitest-pool-workers.

**Must include:** Base URL redirect as the documented primary integration path (not `wrap()` convenience layer) from day one.

**Research flag:** STANDARD PATTERNS — proxy architecture well-documented; Hold/Settle pattern well-understood from banto project.

---

### Phase 2: HITL Core + Approval Channels

**Rationale:** HITL requires Phase 1's durable state (HITL queue writes to Turso; budget holds are held during approval). Risk classification schema must be finalized before approval channels are wired. Action Classifier is a pure function (no DB dependency) so it can be built first in this phase, followed by HITL Queue, followed by Slack channel.

**Delivers:** Risk-graded HITL routing with Slack notifications and webhook callback. Approval state survives proxy restarts. TTL expiry to DENIED. Denial reasons returned to agent context.

**Addresses (from FEATURES.md):** Risk-graded HITL routing, async approval with state persistence, approval history/audit trail, approval request routing (Slack + webhook).

**Avoids (from PITFALLS.md):** HITL as a bottleneck (Pitfall 4) — static classification, 10-15% escalation target; approval state orphaning (Pitfall 5) — TTL + Turso persistence before notification; HITL-first positioning failure (Pitfall 10) — cost control already validated in Phase 1 before HITL is exposed.

**Stack used:** Cloudflare Workflows (`waitForEvent` for HITL pause/resume), workers-slack, Hono callback endpoints.

**Research flag:** NEEDS RESEARCH — Slack interactive message format, Cloudflare Workflows `waitForEvent` integration with HITL TTL, idempotency handling for Slack webhook retries.

---

### Phase 3: Error Handling + Production Hardening

**Rationale:** Error classification and loop detection require per-session state (built in Phase 1) and benefit from the HITL queue (Phase 2) for escalation paths. This phase makes the product production-ready for high-volume autonomous agents.

**Delivers:** Error classification (transient vs permanent), finite retry with backoff, stuck/loop detection (2-failure-stop rule), 3-tier timeout watchdog (T1/T2/T3 configurable per agent).

**Addresses (from FEATURES.md):** Error classification + finite retry, stuck/loop detection, structured error reporting, partial result return on hard stop.

**Avoids (from PITFALLS.md):** Runaway agents consuming budget without progress; agents holding budget reservations open indefinitely via the timeout watchdog releasing all holds at T3.

**Stack used:** Cloudflare Durable Objects (per-session timeout state), existing audit log writer.

**Research flag:** STANDARD PATTERNS — error taxonomy and retry/backoff are well-documented distributed systems patterns; loop detection is defined in GSD-2 design principles.

---

### Phase 4: Dashboard + Python SDK

**Rationale:** Dashboard is read-only and depends only on the audit log and budget ledger (Layer 0, already built). It adds no risk to core governance behavior. Python SDK expands ecosystem coverage and follows the same base URL redirect pattern as the TypeScript SDK.

**Delivers:** Read-only dashboard (cost summary, budget gauges, approval queue, audit log viewer). Python SDK (`agentgov.wrap(client)` via httpx transport override).

**Addresses (from FEATURES.md):** Cost dashboard, Python SDK for second major ecosystem.

**Stack used:** React 19 + Vite 6 + @cloudflare/vite-plugin for dashboard; Python pyproject.toml with httpx for Python SDK.

**Research flag:** STANDARD PATTERNS for dashboard. Python SDK transport override is well-documented via Anthropic/OpenAI SDK custom httpx patterns.

---

### Phase 5: Self-Host Packaging + Docker Compose

**Rationale:** Defer until v1 core features are proven with early adopters. Self-host is an enterprise prerequisite but not a Day 1 requirement. The Hono + `@hono/node-server` pattern means the proxy code is already Node.js-compatible — packaging is primarily Docker Compose authoring and embedded libSQL configuration.

**Delivers:** Full self-hosted stack via Docker Compose. Same Hono proxy via Node.js adapter. Embedded libSQL for database. Static dashboard bundle.

**Addresses (from FEATURES.md):** Self-hostable deployment (enterprise prerequisite).

**Stack used:** @hono/node-server, libSQL embedded mode, Docker Compose 2.x.

**Research flag:** STANDARD PATTERNS — Docker Compose self-host and @hono/node-server are well-documented. Verify libSQL embedded mode WAL behavior under concurrent writes.

---

### Phase 6: Cloudflare Workers Cloud Deployment (Optional)

**Rationale:** Defer until self-host adoption is validated. Higher operational complexity (Durable Objects, Cloudflare Workflows binding configuration, R2 for audit log at scale) is not justified before PMF. This is explicitly listed as v2+ in FEATURES.md.

**Delivers:** Cloud-hosted agentgov endpoint with global edge distribution, R2 audit log for high-volume retention.

**Research flag:** NEEDS RESEARCH — Cloudflare Workflows billing at scale, Durable Object costs at 10k+ agents, R2 lifecycle rules for EU AI Act 18-month retention.

---

### Phase Ordering Rationale

- **Phases 1-3 form an unbreakable dependency chain:** Budget ledger must exist before HITL queue, which must exist before error handler escalation paths. The architecture's Layer 0 → Layer 4 build order maps directly onto this phase sequence.
- **Phase 4 (Dashboard + Python SDK) can start in parallel after Phase 1** because the dashboard is read-only from Layer 0 state, and the Python SDK follows the same pattern as the TypeScript SDK. It is placed at Phase 4 to keep early phases focused.
- **Phases 5-6 are deliberately late:** Self-host and cloud deployment are distribution strategies, not core product. Validate the governance logic first.
- **The pitfall-to-phase mapping confirms this ordering:** 6 of 10 pitfalls must be addressed in Phase 1. Attempting to build HITL before Hold/Settle is proven would carry Phase 1 debt into Phase 2.

### Research Flags

Phases needing `/gsd:research-phase` during planning:
- **Phase 2 (HITL):** Cloudflare Workflows `waitForEvent` TTL interaction, Slack interactive message idempotency, webhook HMAC verification patterns for Hono.
- **Phase 6 (Cloud deployment):** Durable Object billing model at scale, R2 lifecycle rules for compliance retention, Cloudflare Workflows step timeout limits vs long-running approvals.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Budget Engine):** Proxy pattern, Hold/Settle, and append-only audit log are well-documented. banto project provides direct prior art.
- **Phase 3 (Error Handling):** Error taxonomy, retry/backoff, and loop detection are standard distributed systems patterns. GSD-2 design principles provide the 3-tier timeout spec.
- **Phase 4 (Dashboard + Python SDK):** React dashboard and Python httpx transport override are standard patterns.
- **Phase 5 (Docker Compose):** Self-host packaging is standard; @hono/node-server is official and documented.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core technologies verified via official Cloudflare docs, Hono releases, Drizzle docs. Version numbers confirmed as of March 2026. One medium-confidence item: @hono/zod-validator Zod v4 compatibility — verify at install time. |
| Features | HIGH | Competitor analysis is thorough with 7 competitors analyzed. Feature gaps well-documented. MVP definition is clear and opinionated. Pricing matrix sourced from official docs. |
| Architecture | HIGH | Proxy pattern is well-established. agentgov-specific patterns (Hold/Settle, static classification, append-only audit log) are derived from banto project experience and GSD-2 design principles, confirmed by academic references. |
| Pitfalls | HIGH | 10 pitfalls with verified sources. 6 have prior art from banto or GSD-2. LiteLLM performance degradation and Turso eventual consistency sourced from official documentation and real-world issue reports. |

**Overall confidence:** HIGH

### Gaps to Address

- **Pricing sync source:** `agentgov pricing sync` CLI needs a specific upstream data source. Research candidates: pricepertoken.com API, tokencost Python library, or maintaining a community-managed JSON in a separate repo. Validate availability before Phase 1 is complete.
- **Cloudflare Workflows step timeout limits:** HITL approvals could take hours. Workflows default step timeout needs verification against the real-world approval latency requirement. If timeout < expected approval time, fall back to Turso state table polling pattern instead of Workflows.
- **EU AI Act Article 14 enforcement date:** Enforcement begins August 2026 for some high-risk AI systems, with extensions to 2027 for others. Validate which use cases agentgov users are likely to fall into to determine when Phase 6 compliance mode becomes a hard requirement vs. a nice-to-have.
- **@hono/zod-validator Zod v4 support:** Listed as "verify at install time" in STACK.md. This should be the first thing validated when starting Phase 1 to avoid discovering late that the validator must be replaced.

## Sources

### Primary (HIGH confidence)
- [Cloudflare Workers docs — Hono](https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/) — official integration guide
- [Cloudflare Durable Objects — Rules](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/) — `transaction()` over `blockConcurrencyWhile()`
- [Cloudflare Workflows GA](https://developers.cloudflare.com/changelog/post/2025-04-07-workflows-ga/) — `waitForEvent` HITL pattern, GA April 2025
- [Cloudflare Human-in-the-Loop (Agents SDK)](https://developers.cloudflare.com/agents/concepts/human-in-the-loop/) — official HITL patterns
- [Cloudflare Vite Plugin GA](https://developers.cloudflare.com/changelog/post/2025-04-08-vite-plugin/) — GA April 2025
- [Drizzle ORM: Turso Cloud](https://orm.drizzle.team/docs/connect-turso) — drizzle-orm + @libsql/client integration
- [Zod v4 release](https://zod.dev/v4) — v4.3.x, 14x faster, @zod/mini 1.9 KB
- [Anthropic SDK TypeScript](https://github.com/anthropics/anthropic-sdk-typescript) — custom fetch parameter for proxy
- [EU AI Act Article 14](https://artificialintelligenceact.eu/article/14/) — human oversight requirements
- [hono/releases (GitHub)](https://github.com/honojs/hono/releases) — v4.12.7 confirmed March 10, 2026

### Secondary (MEDIUM confidence)
- [LiteLLM performance: 2-4.5x response time increase](https://github.com/BerriAI/litellm/discussions/4298) — real-world proxy overhead benchmark
- [HITL fatigue: 43% stop verifying under load](https://onereach.ai/blog/human-in-the-loop-agentic-ai-systems/) — escalation rate research
- [Turso eventual consistency model](https://betterstack.com/community/guides/databases/turso-explained/) — primary-follower replication
- [Portkey Budget Limits](https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/virtual-keys/budget-limits-enterprise-feature) — competitor feature scope
- [LiteLLM Budgets, Rate Limits](https://docs.litellm.ai/docs/proxy/users) — competitor budget enforcement
- [AgentBudget.dev](https://agentbudget.dev) — closest competitor to agentgov cost control vision
- [AI Agent Error Handling: 5 Production Patterns](https://blog.jztan.com/ai-agent-error-handling-patterns/) — circuit breakers, dead letter queues
- [Immutable Audit Log Pipeline using OpenTelemetry](https://oneuptime.com/blog/post/2026-02-06-immutable-audit-log-pipeline-otel/view) — hash chain pattern

### Tertiary (LOW confidence)
- [AI Agent Governance Architecture Paper (arxiv 2603.07191)](https://arxiv.org/html/2603.07191) — academic governance framework reference (needs validation against production use cases)
- WebSearch: tsup dual CJS+ESM pattern — multiple consistent sources, no single authoritative reference

---
*Research completed: 2026-03-13*
*Ready for roadmap: yes*
