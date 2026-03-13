# Pitfalls Research

**Domain:** Agent Governance / LLM Proxy / Cost Enforcement Platform
**Researched:** 2026-03-13
**Confidence:** HIGH (critical pitfalls verified across multiple sources; prior project lessons from banto/GSD-2 incorporated)

---

## Critical Pitfalls

### Pitfall 1: Budget Race Condition Under Concurrent Requests

**What goes wrong:**
Two requests arrive simultaneously. Both check the budget, both see headroom, both are approved. Budget goes negative by 2x the cost of a single request. At 100 RPS across multiple edge nodes, enforcement drift can allow 10+ requests through after the true budget is exhausted.

**Why it happens:**
Developers implement budget enforcement as read-then-write: (1) read current spend, (2) compare to limit, (3) allow/block, (4) write new spend. Steps 1-4 are not atomic. Distributed edge deployments (Cloudflare Workers) make this worse because each edge node has no shared memory — budget reads from Turso/DB see slightly stale values.

**How to avoid:**
Use the Hold/Settle pattern inherited from banto: reserve (hold) the maximum possible cost before the request is dispatched, then settle to actual cost after the response. The hold is an atomic increment with a compare-and-swap or database-level serialized write. Never use optimistic "check then write" for budget decrements. All writes must route to the Turso primary; reads for enforcement checks must request read-consistency, not replica reads.

**Warning signs:**
- Budget goes negative in logs despite enforcement code
- "Over-budget" events appear in audit log after spend already exceeded limit
- Unit tests pass but load tests show budget overrun at >10 RPS

**Phase to address:**
Phase 1 (core budget engine) — the Hold/Settle atomicity contract must be established before any other feature is layered on top.

---

### Pitfall 2: Proxy Latency Creep Becoming a Dealbreaker

**What goes wrong:**
The proxy adds 40-200ms overhead per request. Developers notice their agents are 2x slower. They remove the proxy. LiteLLM's real-world overhead has been measured at 2-4.5x response time increase versus direct API calls on self-hosted instances. Users tolerate <10ms overhead; anything above 50ms becomes visible and above 100ms becomes a support ticket.

**Why it happens:**
Proxy code does too much synchronously in the hot path: database writes for every token count, synchronous audit log commits, blocking HITL checks even for low-risk actions, buffering the entire request/response before forwarding.

**How to avoid:**
- Keep the synchronous hot path to: (1) budget hold (one DB write), (2) pass-through the request as a stream, (3) settle budget async after stream ends
- Never buffer the full response body before forwarding — use TransformStream / streaming passthrough
- Audit log writes are async, fire-and-forget from the hot path
- HITL checks run only for risk-classified actions; default path has zero HITL overhead
- Measure p50/p95/p99 latency add per request in CI; fail build if overhead exceeds 15ms p50

**Warning signs:**
- Response time doubles compared to direct API call in benchmarks
- First token time (TTFT) increases significantly (streaming penalty)
- Memory usage grows under load (response buffering)
- "Worker exceeded CPU time limit" errors in Cloudflare logs

**Phase to address:**
Phase 1 (proxy core) — streaming passthrough and async audit writes must be in the initial design. Retrofitting is expensive.

---

### Pitfall 3: Pricing Data Staleness Causing Silent Enforcement Failure

**What goes wrong:**
pricing.json contains model costs at time of writing. OpenAI cuts gpt-4o prices 75%, or releases a new model. The proxy continues enforcing budgets against stale prices. Worse: if a model is not in pricing.json and the fallback is zero, LiteLLM's behavior (and banto's equivalent) is to skip budget checks entirely for that model.

**Why it happens:**
Pricing is hard-coded or committed to the repo. No one updates it. New model variants (gpt-4o-mini-2024-07-18 vs gpt-4o-mini) have different pricing but developers add the base name only. The "zero cost = skip checks" pattern in LiteLLM shows this is a systemic failure mode across implementations.

**How to avoid:**
- pricing.json must have a `last_updated` timestamp; proxy emits a warning if >30 days stale
- Unknown model names must fail CLOSED (block + warn), not fail open (pass through with zero cost)
- Provide a CLI command `agentgov pricing sync` that fetches from a community-maintained pricing source (e.g., pricepertoken.com API or tokencost library)
- Version pricing data separately from code; allow user overrides without code changes
- Support per-model price overrides in config for enterprise custom pricing agreements

**Warning signs:**
- Logs show `model_not_found` with cost=0 but requests pass through
- Budget not depleted after large runs that should have exceeded it
- pricing.json `last_updated` field is more than 30 days old

**Phase to address:**
Phase 1 (budget engine) — pricing data handling and unknown-model behavior must be specified before enforcement logic is written.

---

### Pitfall 4: HITL as a Bottleneck, Not a Safeguard

**What goes wrong:**
Every agent action goes through HITL review. Reviewers get alert fatigue, approve everything, and the HITL becomes theater. Or the opposite: high-volume agents generate hundreds of HITL requests per hour, reviewers cannot keep up, agents stall, and the product gets disabled.

**Why it happens:**
HITL classification is too coarse: "anything touching external state" becomes an approval trigger. Developers use HITL as a substitute for clear risk classification, over-triggering to feel safe. Research shows 43% of professionals stop verifying AI outputs when review load is high — HITL fatigue is real and documented.

**How to avoid:**
Use the GSD-2 Risk-Graded Action classification: Reversible / Semi-Reversible / Irreversible / External. Only Irreversible and External above a configurable risk threshold trigger HITL. Reversible and Semi-Reversible run without human approval. The classification is STATIC and DETERMINISTIC — the agent never self-classifies its own actions. Target sustainable escalation rate of 10-15% of actions.

**Warning signs:**
- HITL queue depth growing faster than it drains
- Mean time to resolution for approvals exceeds 1 hour
- Users configure `hitl_enabled: false` to make their agents usable
- Approval rate >95% (rubber-stamping, not meaningful oversight)

**Phase to address:**
Phase 2 (HITL core) — risk classification schema must be finalized before building approval channels. Changing the classification model later requires migrating all existing action type mappings.

---

### Pitfall 5: Approval State Orphaning After Crashes or Timeouts

**What goes wrong:**
Agent sends an action for HITL approval. Agent process crashes, user closes browser, or Slack notification is never delivered. The approval sits in "pending" forever. The agent's state becomes inconsistent — it's waiting for an approval decision that will never come. Budget hold from before the action is never settled. Over time, the system accumulates ghost holds that eat into available budget.

**Why it happens:**
Developers build the happy path (approve → proceed) but not the error paths (timeout → cancel, crash → rollback). Webhook delivery is assumed reliable. Approval state is stored only in memory or in a format that cannot survive process restart.

**How to avoid:**
- All approval requests have an explicit TTL (default: 24h, configurable per action type)
- Expired approvals transition to DENIED, not abandoned — agent receives a deterministic error
- Budget holds have the same TTL as their approval request; expired holds are auto-released
- Approval state persists to Turso on creation (not just in memory) before any notification is sent
- Webhook delivery must have at least 3 retry attempts with exponential backoff
- Health check endpoint reports count of pending approvals older than 1h

**Warning signs:**
- Budget available is lower than expected; no recent expensive requests in logs
- Approval queue shows items with `created_at` days in the past
- Agent process restart causes "approval not found" errors

**Phase to address:**
Phase 2 (HITL core) — TTL and crash-safety for approval state must be in the initial schema. Append-only audit log with explicit state transitions is the enforcement mechanism.

---

### Pitfall 6: Streaming Token Count Unknown Until Stream End (Late Budget Enforcement)

**What goes wrong:**
For streaming responses, the actual token count and cost are not known until the final SSE frame. If the proxy only enforces budget after the stream ends, the full response has already been sent to the agent and the cost already incurred — enforcement is retroactive, not preventive. Budget can go significantly negative on expensive long-form outputs.

**Why it happens:**
Developers model enforcement as request/response but LLM responses are streams. The `usage` field in OpenAI's streaming API only appears in the final chunk when `stream_options: {include_usage: true}` is explicitly set. Without it, token counts are unavailable mid-stream.

**How to avoid:**
- Use the Hold/Settle pattern: hold the maximum possible cost for this model/context before the stream begins (use model's max_tokens parameter or a configurable ceiling)
- Always set `stream_options: {include_usage: true}` when forwarding requests to OpenAI-compatible APIs
- Settle to actual cost after stream completes; release the difference back to budget
- For models that don't return usage in stream: estimate client-side, settle after stream, then reconcile with actual billed amount on next sync
- Document the maximum possible overshoot per request in API docs

**Warning signs:**
- Streaming responses complete after budget is exhausted
- Budget shows negative values only after streaming requests
- Cost per request in logs is 0 during stream, then large spike at stream end

**Phase to address:**
Phase 1 (budget engine) — streaming-aware hold/settle must be designed before any streaming passthrough is implemented.

---

### Pitfall 7: `agentgov.wrap(client)` Breaking When Upstream SDK Updates

**What goes wrong:**
OpenAI and Anthropic release new SDK major versions. The `wrap(client)` approach intercepts method calls or overrides `baseURL`. If the upstream SDK refactors its internal structure (class renamed, method moved, response format changed), the wrapper silently breaks — agents either error out or bypass governance entirely.

**Why it happens:**
SDK wrapping inherits the surface area of the wrapped SDK. OpenAI Python SDK has had breaking changes across v0→v1 (complete rewrite). Anthropic's SDK differs structurally from OpenAI's (separate `system` field, `input_schema` vs `function.parameters` for tools). Maintaining compatibility with 2+ SDKs across versions creates combinatorial testing burden.

**How to avoid:**
- The canonical integration path is base URL redirect (point OpenAI/Anthropic client to agentgov proxy URL) — this is SDK-version-agnostic and maintenance-free
- `agentgov.wrap(client)` is a convenience layer for quick testing only; warn in docs that it is not the production path
- The proxy speaks OpenAI-compatible wire format on the inbound side; Anthropic SDK users must use the OpenAI compatibility layer or the proxy's native Anthropic endpoint
- Pin integration tests to specific SDK versions and run a separate suite against latest SDK

**Warning signs:**
- Integration test failures after `npm update` or `pip install --upgrade`
- Users report that governance is bypassed after SDK upgrade
- Type errors when wrapping newer client versions

**Phase to address:**
Phase 1 (SDK/proxy integration) — base URL redirection must be the primary documented path from day one. Wrapper convenience layer is explicitly secondary.

---

### Pitfall 8: Turso Eventual Consistency Allowing Budget Reads from Stale Replicas

**What goes wrong:**
Turso/libSQL uses a primary-follower replication model. Reads from edge replicas may lag the primary by hundreds of milliseconds. A budget enforcement check that reads from a nearby replica sees the budget as available when the primary has already recorded it as exhausted. Multiple concurrent enforcement checks across different edge nodes all see "available" and allow requests.

**Why it happens:**
Edge database placement optimizes for read latency, not write-read consistency. Developers assume database reads are consistent because they "just wrote" — but in a distributed system, replicas have propagation lag.

**How to avoid:**
- All budget writes go to the Turso primary (hardcode primary URL for writes)
- Budget enforcement reads must also target the primary for hard limits; replica reads are acceptable only for soft-limit dashboards and reporting
- Use Turso's per-request consistency option when available on the relevant SDK tier
- For the free-tier budget ($75/month), a single primary with no replicas is acceptable and avoids consistency issues entirely
- Document which DB calls are primary-required vs replica-ok

**Warning signs:**
- Budget overrun events in audit log without corresponding write at the time of overrun
- Enforcement behavior differs between single-instance dev and multi-region production
- Integration tests pass but load tests show budget overrun

**Phase to address:**
Phase 1 (budget engine) — database read routing must be explicit from the start. Default-to-replica is wrong for enforcement paths.

---

### Pitfall 9: Audit Log as an Afterthought (Immutability Broken by Design)

**What goes wrong:**
Audit log is added in a later phase as "just another table with inserts." It uses standard UPDATE/DELETE operations, meaning any bug in the codebase can overwrite or delete audit records. The log cannot serve as evidence for EU AI Act compliance because it is not tamper-evident.

**Why it happens:**
Developers focus on core functionality first and treat logging as plumbing. The difference between an append-only log and a regular table is invisible at the API level but critical for compliance.

**How to avoid:**
- Audit log table must have `UPDATE` and `DELETE` disabled via trigger or separate schema from day one
- Each entry includes a `prev_hash` chained SHA-256 to create a tamper-evident chain
- The audit log schema is immutable — new event types add rows, not columns; schema migrations cannot remove columns
- Audit log reads are separate from operational data reads (different DB connection or table)
- Include `agent_id`, `decision_type`, `decision_rationale`, `budget_before`, `budget_after` in every budget enforcement event to satisfy Article 14 "traceability of automated decisions"

**Warning signs:**
- Audit log has UPDATE or DELETE permissions anywhere in application code
- Log entries lack `prev_hash` or `event_id` linking
- Schema migration drops or renames audit columns

**Phase to address:**
Phase 1 — audit log schema design happens before any enforcement logic writes to it. Add DB-level trigger to prevent mutations in the same phase.

---

### Pitfall 10: Standalone HITL Has Insufficient WTP to Drive Adoption Alone

**What goes wrong:**
Positioning agentgov primarily as a "HITL tool" fails to generate enough developer pull. HumanLayer pivoted away from standalone HITL. Developer pain threshold for HITL is lower than for cost blowouts — developers will tolerate unsafe agents longer than expensive ones. This mirrors the milestone context lesson directly.

**Why it happens:**
HITL is a compliance requirement (EU AI Act, internal risk policy) but developers perceive it as friction, not value. Cost control is immediately felt in developer wallets and in customer billing. HITL value is abstract until something goes wrong.

**How to avoid:**
- Lead all marketing, README, and onboarding with cost control as the primary hook
- HITL is positioned as "once you have cost control, add safety" — the natural second step
- The SDK entry point is `agentgov.wrap(client)` for cost control first; HITL is opt-in via action risk classification
- Monetization (if any) must attach to cost savings, not HITL seats
- Measure adoption funnel: users who adopt cost control should convert to HITL at >40% rate

**Warning signs:**
- User interviews reference cost control pain but not HITL pain
- HITL configuration is skipped by most users in onboarding
- GitHub issues focus on cost features; HITL issues are rare

**Phase to address:**
Phase 0 (positioning/roadmap) — must be locked before Phase 1 implementation. Not a code problem.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Optimistic budget check (read-then-write, no hold) | Simpler code, fewer DB ops | Budget overrun under concurrent load; catastrophic for SLA | Never — use Hold/Settle from start |
| Synchronous audit log writes in hot path | Simpler code | Latency bloat; single slow DB write blocks every request | Never — always async |
| Buffer full response before forwarding | Easier token counting | Memory pressure; streaming UX broken; CPU time limit hit on CF Workers | Never for streaming |
| Skip pricing for unknown model (default zero cost) | No errors on new models | Budget enforcement silently disabled for new model classes | Never — fail closed |
| Store approval state in memory only | No DB schema needed | All pending approvals lost on process restart | Never in production |
| Single pricing.json committed to repo | Simple | Stale prices within weeks; requires code change to update | MVP only, with explicit TODO |
| Replica reads for budget enforcement | Lower latency | Budget overrun from stale reads in distributed deployment | Never for hard limits |
| LLM decides which actions need HITL | Flexible | Non-deterministic; agents can self-authorize; violates GSD-2 principle | Never |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| OpenAI streaming API | Not setting `stream_options: {include_usage: true}` | Always set this flag; fall back to client-side tokenizer estimate if not supported |
| Anthropic API | Assuming OpenAI wire format compatibility | Anthropic has different field names (`input_schema` vs `function.parameters`, separate `system` field); test with native Anthropic format |
| Slack HITL channel | Sending message, assuming delivery | Implement delivery confirmation; retry with exponential backoff; fall back to webhook if Slack unreachable |
| Turso writes | Using default connection (may route to replica) | Explicitly use primary URL for all enforcement writes; document which connection goes where |
| Hono middleware body reading | Reading `c.req.json()` in middleware then trying `c.req.text()` in handler | Body is consumed after first read; use `c.req.arrayBuffer()` and parse manually, or cache via `tee()` |
| OpenAI SDK base URL override | Assuming all request types route correctly | Test all request types: chat completions, embeddings, assistants — each has a different path |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Synchronous Turso write per token | Increasing p99 latency under load | Batch audit writes; use async queue | >10 concurrent requests |
| Buffering streaming response to count tokens | High memory use; slow TTFT (time to first token) | Stream passthrough; count tokens from final usage chunk async | First streaming user |
| Budget check before every request (DB round-trip) | >15ms overhead per request | Cache budget state in Durable Object with TTL; refresh async | >5 RPS per agent |
| Full request logging for every LLM call | Turso write amplification; storage cost | Log summary only (model, token count, cost, decision); store raw only on policy violations | >100 requests/day |
| Cloudflare Worker CPU time for token estimation | "Worker exceeded CPU time limit" on long prompts | Use lightweight tokenizer (not full tiktoken WASM); offload heavy compute to server-side | Prompts >10K tokens |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| API key stored in Worker environment unencrypted | Key exfiltration through log leaks or Worker binding exposure | Use Cloudflare Secrets (encrypted at rest); never log API keys; redact key fields from audit log |
| Agent can self-classify its own actions as Reversible | Agent bypasses HITL by always claiming low risk | Risk classification is static code mapping, not runtime LLM decision |
| Budget hold keys not scoped per agent | One agent can consume another agent's budget hold | Hold keys must include `agent_id` + `request_id`; global holds are an explicit admin-only operation |
| Approval webhooks without HMAC signature | Malicious approval injection via POST to webhook URL | Sign all webhook payloads with HMAC-SHA256; verify on receipt; reject unsigned |
| Audit log queryable by agents at runtime | Agent can read its own audit trail and learn enforcement patterns | Audit log read path is admin/human only; agents never receive audit log data in responses |
| Misconfigured proxy exposes LLM API keys to internet | Hackers scan for misconfigured proxies specifically for LLM access | Never log raw Authorization headers; rate-limit auth failures; alert on anomalous spend spikes |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Budget remaining shown as raw token count | Developers cannot intuit when budget runs out | Show remaining budget in USD ($4.23 left) and as a percentage; only show tokens in detailed view |
| HITL approval notification with no context | Approver clicks approve/deny without understanding what they're approving | Include: action type, risk classification, what will happen if approved, what will happen if denied, one-sentence agent context |
| Budget exceeded = hard 403 with no explanation | Agent crashes with cryptic error; developer doesn't know why | Return structured error: `{code: "BUDGET_EXCEEDED", budget_id: "...", spent: 9.87, limit: 10.00, suggestion: "increase limit or switch to cheaper model"}` |
| Approval queue with no SLA visibility | Approvers don't know which items are urgent | Show age of each pending approval; sort by urgency; highlight items where agent has been blocked >1h |
| No graceful degradation on budget soft limit | Agents hit hard limit and stop entirely | Implement soft limit (80% of budget) that triggers cheaper model fallback before hard limit terminates |

---

## "Looks Done But Isn't" Checklist

- [ ] **Budget enforcement:** Verify enforcement holds under concurrent load (10+ simultaneous requests) — test with k6 or similar; don't rely on single-threaded unit tests
- [ ] **Streaming:** Verify streaming passthrough works end-to-end and token counts are correctly settled after stream ends — manually inspect final SSE chunk for usage data
- [ ] **Crash recovery:** Kill the proxy process mid-request; verify (a) budget hold is released or properly settled on restart, (b) pending approvals still exist in DB
- [ ] **New model handling:** Add an unknown model name to a request; verify it is BLOCKED (not allowed through with zero cost)
- [ ] **Audit log immutability:** Attempt an UPDATE and DELETE on audit table rows via DB client; verify they fail at DB level, not just application level
- [ ] **Approval TTL:** Create an approval, advance system clock past TTL; verify it transitions to DENIED and the budget hold is released
- [ ] **Pricing staleness:** Advance `last_updated` in pricing.json past 30 days; verify proxy emits a warning log or metric
- [ ] **Webhook failure:** Take down the Slack webhook endpoint; verify approval request retries and eventually falls back correctly

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Budget race condition discovered post-launch | HIGH | Audit all historical requests for overrun; add compensation credits to affected agent accounts; rewrite enforcement with Hold/Settle and re-deploy |
| Stale pricing caused significant undercharge | MEDIUM | Run reconciliation query against actual provider bills; issue retroactive budget adjustment; update pricing pipeline |
| Approval state orphaned at scale | MEDIUM | Write one-time migration to expire all approvals older than TTL and release associated holds; add scheduled cleanup job |
| Audit log mutated (non-append-only) | HIGH | Log integrity is permanently compromised; can only timestamp when integrity was lost; add DB-level triggers immediately; disclose if compliance-critical |
| Proxy latency too high for production | MEDIUM | Profile hot path; move audit writes to async queue; switch to streaming passthrough; measure until <15ms overhead |
| SDK wrap broken by upstream update | LOW | Document base URL redirect as primary path; remove or clearly mark wrap() as experimental; add SDK version pin to CI |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Budget race condition | Phase 1: Budget engine | Load test with concurrent requests; verify no negative budget |
| Proxy latency creep | Phase 1: Proxy core | Benchmark test in CI; alert if p50 overhead >15ms |
| Pricing data staleness | Phase 1: Budget engine | Unknown model blocks request; pricing age metric emitted |
| HITL bottleneck/alert fatigue | Phase 2: HITL design | Escalation rate stays 10-15%; queue drain time <1h in load test |
| Approval state orphaning | Phase 2: HITL state machine | Kill-process test; TTL expiry test |
| Streaming token count late | Phase 1: Budget engine | Streaming hold/settle integration test |
| SDK wrap breakage | Phase 1: SDK integration | Base URL redirect documented as primary path from day 1 |
| Turso eventual consistency | Phase 1: Budget engine | Primary-only writes enforced; documented in code |
| Non-append-only audit log | Phase 1: Audit schema | DB-level trigger test in schema migration tests |
| HITL-first positioning failure | Phase 0: Roadmap/positioning | Cost control is first feature; HITL is opt-in second |

---

## Sources

- banto project lessons (hold/settle pattern, macOS Keychain non-portability): project-level context
- GSD-2 design principles (deterministic enforcement, risk-graded actions, 3-layer timeouts): project-level context
- HumanLayer pivot from standalone HITL: milestone context
- LiteLLM real-world performance: 2-4.5x response time increase in production (GitHub issue #4298): https://github.com/BerriAI/litellm/discussions/4298
- LiteLLM budget sync drift at 100 RPS (10-request window): https://docs.litellm.ai/docs/proxy/users
- LiteLLM "zero cost = skip budget checks" behavior: https://docs.litellm.ai/docs/proxy/custom_pricing
- LiteLLM performance: 40ms median overhead, 2x RPS improvement: https://docs.litellm.ai/blog/sub-millisecond-proxy-overhead
- HITL fatigue: 43% of professionals stop verifying AI outputs under load: https://onereach.ai/blog/human-in-the-loop-agentic-ai-systems/
- HITL escalation rate: 10-15% sustainable target: https://galileo.ai/blog/human-in-the-loop-agent-oversight
- Gartner: 40% of agentic AI projects cancelled by 2027 due to cost and risk controls: https://www.stackai.com/blog/the-biggest-ai-adoption-challenges
- Cloudflare Workers CPU time limits (30s default, 5min opt-in as of March 2025): https://developers.cloudflare.com/changelog/post/2025-03-25-higher-cpu-limits/
- Cloudflare Workers streaming CPU exceeded issue: https://community.cloudflare.com/t/streaming-response-catch-worker-exceeded-cpu-time-limit-error/372138
- Turso eventual consistency / primary-follower model: https://betterstack.com/community/guides/databases/turso-explained/
- Hono body already consumed issue (v3.5.0+): https://github.com/honojs/hono/issues/1387
- OpenAI streaming usage in final chunk (`stream_options`): https://api7.ai/learning-center/api-gateway-guide/api-gateway-proxy-llm-requests
- Append-only audit log with hash chaining: https://dev.to/veritaschain/building-a-tamper-evident-audit-log-with-sha-256-hash-chains-zero-dependencies-h0b
- EU AI Act Article 14 human oversight requirements (high-risk AI, applicable August 2026 with 2027 extension for high-risk AI systems): https://artificialintelligenceact.eu/article/14/
- Agent hidden cost explosion: 3 tool calls in staging → 22 in production = 10x cost: https://guptadeepak.com/complete-guide-to-ai-tokens-understanding-optimization-and-cost-management/
- Misconfigured proxies targeted by hackers for LLM access: https://anavem.com/cybersecurity/hackers-scan-misconfigured-proxies-paid-llm-services

---
*Pitfalls research for: Agent Governance / LLM Proxy / Cost Enforcement Platform (agentgov)*
*Researched: 2026-03-13*
