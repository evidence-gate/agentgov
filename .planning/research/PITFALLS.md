# Pitfalls Research

**Domain:** Agent Governance / LLM Proxy / Cost Enforcement Platform
**Researched:** 2026-03-15 (v1.1 update — added integration pitfalls for Gemini, Anthropic SSE settle, Python async SDK, Cloudflare Workers deploy, per-agent budget UI)
**Confidence:** HIGH (v1.0 pitfalls verified 2026-03-13; v1.1 pitfalls verified against official docs and codebase)

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

## v1.1 Integration Pitfalls

These pitfalls are specific to adding the five v1.1 features to the existing system. Each is an integration pitfall — what goes wrong when you bolt a new feature onto working code, not what goes wrong building from scratch.

---

### Pitfall 11: Gemini Token Count Field Name Mismatch Silently Zeros Budget Settlement

**What goes wrong:**
The existing `budgetSettle` call expects `{ promptTokens, completionTokens }`. The Gemini API response uses `usageMetadata.promptTokenCount` and `usageMetadata.candidatesTokenCount`. If the extraction code maps fields incorrectly (e.g., looks for `prompt_tokens` as with OpenAI, or `input_tokens` as with Anthropic), it gets `undefined`, falls back to `0`, and settles the hold at zero cost. The agent runs indefinitely at zero reported cost while Turso shows negative actual billing.

**Why it happens:**
Each provider uses different field names for the same concept. The existing code has two precedents: OpenAI uses `usage.prompt_tokens / completion_tokens`, Anthropic uses `usage.input_tokens / output_tokens`. Developers copying either pattern will get the wrong field names for Gemini. The failure is silent — `undefined ?? 0` evaluates to 0 with no error.

**How to avoid:**
Gemini native API response uses `usageMetadata.promptTokenCount` (input) and `usageMetadata.candidatesTokenCount` (output). Map these explicitly to the `budgetSettle` signature. Add a strict assertion: if both extracted values are 0 after a non-empty response, log a warning — genuine zero-token responses are impossible for chat completions.

Note: If using Gemini's OpenAI-compatible endpoint (`https://generativelanguage.googleapis.com/v1beta/openai/`), the response uses OpenAI field names (`usage.prompt_tokens / completion_tokens`) and no conversion is needed. Decide at implementation time which endpoint to target and document the choice explicitly.

Also note a documented 2025 bug: `candidatesTokenCount` in Gemini 2.5 Flash Lite underreports output tokens by ~8.5x vs actual billing. Price estimates from the API may be lower than actual invoice. Acknowledge this in pricing.json comments.

**Warning signs:**
- `budget_settle` audit events show 0 cost for Gemini requests with visible outputs
- `budget_ledger.spent_usd` does not grow after Gemini calls
- `budgetSettle failed` console.error never fires but cost is zero

**Phase to address:**
v1.1 Phase: Gemini provider implementation.

---

### Pitfall 12: Gemini Safety Blocks Return `finishReason: "SAFETY"` — Not an HTTP Error

**What goes wrong:**
Gemini's safety system returns HTTP 200 with `candidates[0].finishReason: "SAFETY"` (or `"PROHIBITED_CONTENT"`) rather than a 4xx error. The existing `forwardWithRetry` treats any `response.ok` as success and passes the response through. The hold gets settled at zero cost (no tokens generated), but the agent receives a 200 that looks like a valid chat completion response — it contains no `content` and may trigger unexpected behavior in agent loops.

There is also a two-layer safety system: adjustable filters (configurable per-request via `safety_settings`) and built-in protections that cannot be disabled regardless of settings. A PROHIBITED_CONTENT block cannot be overridden by passing `BLOCK_NONE`.

**Why it happens:**
Developers accustomed to OpenAI/Anthropic expect safety blocks to surface as 4xx errors. Gemini's design choice to return safety information within a 200 response body requires explicit inspection of `finishReason` after the response is received.

**How to avoid:**
After receiving a Gemini response (HTTP 200), inspect `candidates[0].finishReason`. If it is `"SAFETY"`, `"PROHIBITED_CONTENT"`, or `"RECITATION"`, treat it as a non-retryable content error rather than a successful response. Settle the hold at 0 tokens (no content was generated). Return a structured `AgentError` to the caller with the safety category. Do NOT retry safety-blocked content — it is a permanent block, not a transient failure.

**Warning signs:**
- 200 responses with no `content` field in Gemini candidates
- Agents entering retry loops on Gemini safety blocks
- `hold.estimatedCost` never settled after safety-blocked Gemini calls

**Phase to address:**
v1.1 Phase: Gemini provider implementation.

---

### Pitfall 13: Gemini Function Calling Format Is Incompatible with OpenAI Tool Call Format

**What goes wrong:**
The existing `convertToAnthropicFormat` function is a clear precedent: OpenAI wire format must be converted before forwarding. Gemini's native function calling uses a different schema: tools are declared as `functionDeclarations` arrays (not `tools[].function`), and function call responses in the conversation use `functionResponse` parts (not `tool` role messages). Forwarding OpenAI-format `tool_calls` to Gemini's native API returns a 400 error. Forwarding OpenAI-format `tool` role messages causes Gemini to ignore tool results.

**Why it happens:**
The pattern of adding a provider by copying `forwardToAnthropic` and changing the URL is tempting but wrong for Gemini. Anthropic differs from OpenAI mainly in field renaming; Gemini differs in structural schema for multi-turn tool use.

**How to avoid:**
Two options, choose one at implementation time:
1. **Use Gemini's OpenAI-compatible endpoint** (`/v1beta/openai/chat/completions`) — no format conversion needed, uses existing OpenAI field names. Tradeoff: no access to Gemini-specific features (safety_settings configuration, thinking mode, grounding).
2. **Implement `convertToGeminiFormat`** — converts messages (including tool_calls → functionCall parts and tool role → functionResponse parts), tools array (OpenAI `function` schema → Gemini `functionDeclarations`), and system messages (OpenAI `system` role → Gemini `systemInstruction`).

Given agentgov's role as a passthrough proxy (not a format normalizer), option 1 is strongly preferred for v1.1. The HITL classifier already inspects OpenAI-format `tool_calls` — native Gemini format would require parallel HITL classification logic.

**Warning signs:**
- 400 errors from Gemini API on requests with `tools` array
- Tool use responses not visible in Gemini conversation history
- HITL classifier does not fire for Gemini tool calls

**Phase to address:**
v1.1 Phase: Gemini provider implementation. Decision on endpoint strategy must be locked before writing any conversion code.

---

### Pitfall 14: Anthropic SSE Usage Split Across Two Events — Parsing `message_start` + `message_delta`

**What goes wrong:**
The existing `pipeAndSettle` settles at 0 tokens with a TODO comment. The naive fix copies the OpenAI streaming logic: scan for a chunk containing `usage` and extract it. This fails for Anthropic because usage is split across two events:

- `message_start` event: contains `message.usage.input_tokens` (prompt tokens)
- `message_delta` event: contains `usage.output_tokens` (completion tokens)

A parser that only looks for the last `usage` field will find the `message_delta` one and get only `output_tokens`, reporting 0 input tokens. Settlement undercharges by the full cost of the prompt.

**Why it happens:**
Anthropic's streaming design separates prompt consumption (known upfront, reported in `message_start`) from generation (counted as it streams, reported in `message_delta`). OpenAI combines both in a single final usage chunk. Developers reading just the last usage-bearing event miss the `message_start` input tokens.

**How to avoid:**
In `processAnthropicStreamAndSettle` (analogous to `processStreamAndSettle`), parse SSE events by type:
- On `event: message_start` → parse `data.message.usage.input_tokens` → store as `promptTokens`
- On `event: message_delta` → parse `data.usage.output_tokens` → store as `completionTokens`
- Call `budgetSettle` after `event: message_stop`

The SSE event name precedes the `data:` line. The parser must track the current event type across lines, not just scan data lines for `usage` fields.

Also handle tool use responses: a response with `finishReason: "tool_use"` contains `content_block_start` events with `type: "tool_use"`. These still generate tokens normally — `message_start.input_tokens` and `message_delta.output_tokens` are still accurate for tool use responses.

**Warning signs:**
- `budget_settle` audit events show `promptTokens: 0` for Anthropic streaming calls
- Anthropic streaming costs are ~50% of expected (output-only pricing)
- Discrepancy between settle cost and Anthropic billing dashboard

**Phase to address:**
v1.1 Phase: Anthropic streaming settle implementation.

---

### Pitfall 15: Anthropic Streaming SSE Parser Fails on Multi-Line Chunks

**What goes wrong:**
The existing OpenAI stream parser (`processStreamAndSettle`) splits each Uint8Array chunk by `\n` and processes line by line. This works for OpenAI because each SSE event fits in a single chunk. Anthropic SSE events follow the SSE spec: an event consists of an `event:` line followed by a `data:` line, with a blank line between events. A single Uint8Array chunk from the Fetch API may contain:
- Multiple complete events
- A partial event split across two chunks
- An `event:` line in one chunk and its corresponding `data:` line in the next chunk

Splitting by `\n` and processing each line independently causes the `event:` tag to be lost, making it impossible to distinguish `message_start` data from `message_delta` data.

**Why it happens:**
The existing OpenAI parser works by accident: OpenAI's `stream_options` usage chunk is always the penultimate data line before `[DONE]`, so scanning all lines for a `usage` field works without event-type awareness. Anthropic's split usage requires event-type tracking, which requires a stateful, buffered SSE parser.

**How to avoid:**
Implement a buffered SSE parser that:
1. Maintains a `buffer` string across chunk reads (carry over partial lines from previous chunk)
2. Splits buffer by `\n\n` (double newline = event boundary in SSE spec)
3. For each complete event block, extracts the `event:` line and `data:` line separately
4. Maintains state: `currentEventType` across lines within an event block

A minimal implementation accumulates decoded text across chunks, splits on `\n\n` for event boundaries, and only resets state on a blank line.

**Warning signs:**
- Anthropic streaming fails intermittently on long responses (chunk boundary more likely)
- `promptTokens` and `completionTokens` are both 0 on most Anthropic streaming calls but occasionally non-zero
- Parser captures usage only when `message_start` and `data:` land in the same chunk

**Phase to address:**
v1.1 Phase: Anthropic streaming settle implementation (same phase as Pitfall 14).

---

### Pitfall 16: Python `agentgov.wrap()` on `AsyncOpenAI` Injects Sync Transport Into Async Client

**What goes wrong:**
The existing `agentgov.wrap(client)` mutates `client._client` to an `httpx.Client(transport=AgentgovTransport(...))` — a synchronous client. When the user passes an `AsyncOpenAI` instance, the `_client` attribute holds an `httpx.AsyncClient` under the hood. Replacing `_client` with a synchronous `httpx.Client` causes `RuntimeError: This event loop is already running` or `TypeError: object Response can't be used in 'await' expression` at the first `await client.chat.completions.create(...)` call.

**Why it happens:**
The current `AgentgovTransport` subclasses `httpx.BaseTransport` (sync). `AsyncOpenAI` and `AsyncAnthropic` expect `httpx.AsyncClient` backed by `httpx.AsyncBaseTransport`. The private-attribute mutation pattern used in `wrap()` does not check which client type is being wrapped. The bug is invisible in testing if tests only use synchronous `OpenAI()/Anthropic()` clients.

**How to avoid:**
Implement `AsyncAgentgovTransport(httpx.AsyncBaseTransport)` that overrides `handle_async_request(request)` instead of `handle_request(request)`. The `wrap()` function must detect whether the client is async (check `isinstance(client, AsyncOpenAI)` or `hasattr(client, '_async_client')`) and inject the appropriate transport type.

The `AsyncAgentgovTransport.handle_async_request` implementation is structurally identical to `AgentgovTransport.handle_request` except all calls use `await` and the inner transport is `httpx.AsyncHTTPTransport`. The governance exception logic (BudgetExceeded, HitlPending, AgentError detection) is unchanged.

Do not use `asyncio.run()` inside `handle_async_request` — this crashes in any async context (FastAPI, LangChain agents, etc.) because there is already a running event loop.

**Warning signs:**
- `RuntimeError: This event loop is already running` on first async call after wrap
- `AttributeError: 'Response' object has no attribute '__await__'`
- Tests pass when run synchronously but fail when run in async test harness

**Phase to address:**
v1.1 Phase: Python SDK async implementation.

---

### Pitfall 17: `pytest-asyncio` Mode Not Configured — All Async Tests Silently Pass Without Running

**What goes wrong:**
When adding `AsyncAgentgovTransport` tests, developers write `async def test_...` functions with `@pytest.mark.asyncio`. Without configuring `asyncio_mode = "auto"` in `pytest.ini` / `pyproject.toml`, pytest-asyncio in "strict" mode (default since 0.21) requires `@pytest.mark.asyncio` on every async test. If the marker is missing, pytest collects the test as a coroutine object, does not run it, and reports it as passing. The test suite is green but no async code is exercised.

**Why it happens:**
pytest-asyncio changed its default mode from "auto" to "strict" in v0.21 to prevent accidental test collection of coroutines. New tests without explicit markers appear to pass. This is the most common async testing pitfall in Python.

**How to avoid:**
In `packages/sdk-python/pyproject.toml`, add:
```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
```
This makes every `async def test_` function run under asyncio automatically. Alternatively, use `@pytest.mark.asyncio` on every async test, but "auto" mode is less error-prone.

Verify the config is working by adding a deliberately failing async test: `async def test_canary(): assert False`. If it fails, the mode is correct.

**Warning signs:**
- Async tests show 0 assertions but pass
- `pytest --collect-only` shows async test functions collected as `<Function>` not `<Coroutine>`
- Removing `asyncio_mode = "auto"` causes tests to start failing (confirms they were previously skipped)

**Phase to address:**
v1.1 Phase: Python SDK async implementation — configure test mode before writing any async tests.

---

### Pitfall 18: Cloudflare Workers Deploy — `GEMINI_API_KEY` in `vars` Exposed in Dashboard

**What goes wrong:**
The existing `wrangler.jsonc` places API keys (OPENAI_API_KEY, ANTHROPIC_API_KEY) in the `vars` block with empty string defaults. This is for local dev documentation only. If a developer adds `GEMINI_API_KEY: "AIza..."` to `vars` to "test the deploy," the key is committed to source control and visible in the Cloudflare dashboard. Cloudflare explicitly warns: "Do not use vars to store sensitive information."

**Why it happens:**
`vars` in `wrangler.jsonc` are visible in the Cloudflare dashboard and in git history. Developers see `OPENAI_API_KEY: ""` in `vars` and assume the pattern is to add the real key there. The empty-string default is documentation, not the injection point.

**How to avoid:**
- `wrangler.jsonc vars` block must only ever contain `""` (empty string placeholder) for secret values
- Real secret values are set via `wrangler secret put GEMINI_API_KEY` — never in the config file
- Local dev secrets go in `.dev.vars` (never committed; verify `.gitignore` includes `.dev.vars`)
- Document this distinction explicitly in the deploy runbook: "Add these secrets with `wrangler secret put`, not in `wrangler.jsonc`"
- Add a `GEMINI_API_KEY: ""` placeholder to `vars` (documentation only) alongside the existing API key patterns

**Warning signs:**
- `git log --all -S "AIza"` or `git log --all -S "sk-"` shows API keys in history
- Cloudflare dashboard shows non-empty value in the "Environment Variables" section (not "Secrets")
- CI/CD pipeline reads API keys from `wrangler.jsonc` via file parsing rather than wrangler secrets

**Phase to address:**
v1.1 Phase: Cloudflare Workers deployment — secrets management must be reviewed before first `wrangler deploy`.

---

### Pitfall 19: Cloudflare Workers Deploy — Workflow Binding Not Redeclared Per Environment

**What goes wrong:**
The existing `wrangler.jsonc` declares the `HITL_WORKFLOW` workflows binding at the top level. When a `[env.production]` section is added for the cloud deploy, the binding is silently missing in the production environment because Cloudflare Workers bindings are non-inheritable. `c.env.HITL_WORKFLOW` is undefined at runtime; HITL approval triggers crash with `TypeError: Cannot read properties of undefined (reading 'create')`.

**Why it happens:**
Cloudflare Workers has a split between "inheritable" config (name, compatibility_date, main) and "non-inheritable" config (vars, bindings, workflows, kv_namespaces, etc.). Non-inheritable keys must be re-declared in every environment block. The official docs state this but it is easy to miss when adding the first production environment.

**How to avoid:**
When adding an `[env.production]` block to `wrangler.jsonc`, copy all binding declarations (workflows, vars placeholders, any future KV/D1/R2 bindings) into the environment block. Run `wrangler types --env production` after the change to verify TypeScript sees the binding. Test with `wrangler dev --env production` before deploying.

**Warning signs:**
- `TypeError: Cannot read properties of undefined (reading 'create')` in production logs
- `c.env.HITL_WORKFLOW` TypeScript type is `undefined` when checking `worker-configuration.d.ts`
- Local dev (`wrangler dev`) works but production deploy (`wrangler deploy --env production`) fails

**Phase to address:**
v1.1 Phase: Cloudflare Workers deployment — environment configuration must be verified before production deploy.

---

### Pitfall 20: Cloudflare Workers Deploy — `@libsql/client/web` Import Path Must Not Change

**What goes wrong:**
The existing codebase imports `@libsql/client/web` (not `@libsql/client`) for Cloudflare Workers compatibility. If the Gemini implementation (or any v1.1 code) adds a new file that imports `@libsql/client` (without `/web`), the Worker build succeeds locally but fails at runtime in Cloudflare with `Error: The script will not work in Cloudflare Workers. Workers uses the V8 JavaScript engine...` or a related edge runtime compatibility error.

**Why it happens:**
`@libsql/client` (without the `/web` path) imports Node.js-specific APIs (net, tls, fs) that are unavailable in the Cloudflare Workers V8 sandbox. The `/web` subpath exports an HTTP-only client compatible with the edge runtime. This is already correctly handled in `db/client.ts` but new files copying import patterns from non-Workers examples will use the wrong subpath.

**How to avoid:**
Enforce via `grep` in CI: `grep -r "@libsql/client'" packages/proxy/src/` should return 0 results (all imports must use `/web`). Document the correct import in a code comment at the top of `db/client.ts`. When adding Gemini or any new provider code, verify no new libsql imports bypass the `/web` path.

**Warning signs:**
- `wrangler dev` fails with `Error: Module not found: net` or similar Node.js built-in error
- Worker deploys successfully but crashes on first DB call in production
- `@libsql/client` (without `/web`) appears in any import statement in `packages/proxy/src/`

**Phase to address:**
v1.1 Phase: Cloudflare Workers deployment and any DB-touching code in v1.1.

---

### Pitfall 21: Per-Agent Budget CRUD — Concurrent `PUT /budget/:agentId` Calls Clobber `spentUsd`

**What goes wrong:**
The dashboard per-agent budget UI sends a `PUT /api/v1/dashboard/budgets/:agentId` to update `limitUsd`. The naive implementation does `UPDATE budget_ledger SET limit_usd = $new WHERE agent_id = $id`. If the proxy simultaneously settles a hold (writing to `spent_usd`), the two Turso HTTP writes race. Because Turso HTTP does not support interactive transactions (documented in `ledger.ts`), a window exists where the UI write reads a stale `spent_usd` and overwrites it with a lower value, artificially reducing the agent's reported spend.

The safest implementation only updates `limit_usd` — the one field the user actually controls — rather than doing a full-row rewrite.

**Why it happens:**
Developers write `UPDATE ... SET limit_usd = $new, spent_usd = $spent` copying the full-row pattern, or use an ORM `.update().set(rowData)` call that includes all fields. In a single-writer system this would be fine; with concurrent proxy settles it creates a race window.

**How to avoid:**
The budget update API must only set `limit_usd` (and `updated_at`). Never include `spent_usd` or `reserved_usd` in the dashboard's UPDATE statement — those fields are exclusively owned by the Hold/Settle machinery. Use:
```sql
UPDATE budget_ledger SET limit_usd = $new, updated_at = $now WHERE agent_id = $id
```
Never:
```sql
UPDATE budget_ledger SET limit_usd = $new, spent_usd = $spent WHERE agent_id = $id
```

**Warning signs:**
- `spent_usd` jumps backward after a budget limit change
- Audit log shows `budget_settle` events but ledger `spent_usd` is lower than the sum of settled costs
- Race condition only visible under load (proxy settling concurrently with UI update)

**Phase to address:**
v1.1 Phase: Per-agent budget UI — API route design must constrain which fields can be updated.

---

### Pitfall 22: Per-Agent Budget UI — Stale Cache Shows Wrong Limit After Save

**What goes wrong:**
The dashboard uses TanStack Query with a `refetchInterval: 5000` polling pattern (existing `useBudgets` hook). After a user edits and saves a budget limit, the mutation calls `PUT /api/v1/dashboard/budgets/:agentId`, but TanStack Query still shows the old limit until the next 5-second poll. The user sees no visual confirmation and may double-submit.

A second issue: if the user submits while a concurrent background poll is in-flight, TanStack Query's race condition can cause the UI to briefly show the old value, then the new value, then potentially the old value again if the poll response races the mutation's optimistic update.

**Why it happens:**
The existing dashboard is read-only with `refetchInterval` polling. Mutations invalidating the query cache is a standard TanStack Query pattern that is missing when the feature is first wired up. Developers often add the mutation but forget `queryClient.invalidateQueries({ queryKey: ['budgets'] })` in the `onSuccess` callback, or they invalidate but the background refetch races the mutation response.

**How to avoid:**
In the `useBudgetUpdate` mutation:
1. Use `onMutate` for optimistic update (immediately show new limit in UI)
2. Use `onError` to rollback the optimistic update on failure
3. Use `onSettled` (not `onSuccess`) to call `queryClient.invalidateQueries({ queryKey: ['budgets'] })` — this fires on both success and error, ensuring the cache is always refreshed after mutation
4. Disable the "Save" button while `mutation.isPending` to prevent double-submit

Using `onSettled` instead of `onSuccess` for invalidation prevents the case where the mutation succeeds but invalidation is skipped due to an error in the success handler.

**Warning signs:**
- Budget limit shows old value for 5 seconds after save
- Double-submit creates two sequential API calls with the same payload
- `query.data` briefly reverts to old value after save (missing rollback logic)

**Phase to address:**
v1.1 Phase: Per-agent budget UI — mutation + cache invalidation pattern must be correct from the first implementation.

---

### Pitfall 23: Two Entry Points Must Stay Compatible After v1.1 Changes

**What goes wrong:**
The proxy has two entry points: `src/index.ts` (Cloudflare Workers, Hono + `c.env.BINDING`) and `src/index.node.ts` (Docker/Node.js, uses `DockerDbClient`). v1.1 changes — especially `GEMINI_API_KEY` added to `ForwardEnv`, Anthropic streaming settle, and per-agent budget API endpoints — must be wired into both entry points. If Gemini support is added to `forwardToLlm` via `env.GEMINI_API_KEY` but `index.node.ts` does not pass this env key when constructing `ForwardEnv`, Gemini requests in Docker self-host mode will always return 503.

**Why it happens:**
The two-entry-point pattern was established in v1.0. New env vars (GEMINI_API_KEY) require adding to both `Env` (wrangler.jsonc / `worker-configuration.d.ts`) and the Node.js `process.env` extraction in `index.node.ts`. It is easy to add to one and forget the other. The discrepancy is invisible in Cloudflare Workers CI tests and only surfaces in Docker self-host testing.

**How to avoid:**
- `ForwardEnv` interface is the single contract. Any new key added to `ForwardEnv` must be extracted in both entry points.
- After adding `GEMINI_API_KEY` to `ForwardEnv` and `wrangler.jsonc`, grep for `ForwardEnv` to find all construction sites. Currently there is exactly one in each entry point — verify both are updated.
- Add a test in `vitest.config.node.ts` that exercises a Gemini model request in Node.js mode (mock the Gemini API response) to verify the Node.js entry point wires the key correctly.

**Warning signs:**
- Gemini requests work in `wrangler dev` but return 503 in Docker Compose
- `GEMINI_API_KEY` is in `wrangler.jsonc` but not in `process.env` extraction in `index.node.ts`
- Two-entry-point test coverage is asymmetric (Workers tests pass, Node.js tests not written for new features)

**Phase to address:**
v1.1 Phase: All phases. Must be verified at the end of each v1.1 feature phase.

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
| Gemini OpenAI-compatible endpoint for v1.1 | No format conversion code needed | No access to Gemini-specific features (thinking mode, grounding) | v1.1 — acceptable tradeoff for speed |
| Sync Python transport injected into AsyncOpenAI | No async implementation needed | RuntimeError on first await; unusable for async agents | Never |
| Budget update API sets all fields | Simpler ORM update | Race condition overwrites spent_usd | Never — only update limit_usd |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| OpenAI streaming API | Not setting `stream_options: {include_usage: true}` | Always set this flag; fall back to client-side tokenizer estimate if not supported |
| Anthropic streaming API | Looking for `usage` in final chunk only | Parse `message_start.message.usage.input_tokens` AND `message_delta.usage.output_tokens` separately |
| Anthropic SSE parser | Splitting each chunk by `\n`, processing line by line | Buffer across chunks, split on `\n\n` for event boundaries, track current event type |
| Gemini API (native) | Using `usage.prompt_tokens` / `completion_tokens` field names | Use `usageMetadata.promptTokenCount` / `candidatesTokenCount` |
| Gemini API (OpenAI-compat) | Implementing format conversion for function calling | Use `/v1beta/openai/` endpoint — uses OpenAI field names natively |
| Gemini safety blocks | Treating 200 with `finishReason: "SAFETY"` as success | Inspect `finishReason` after HTTP 200; settle at 0 cost and return structured error |
| Python async wrap | Injecting `httpx.Client` (sync) into `AsyncOpenAI` via `_client` mutation | Implement `AsyncAgentgovTransport(httpx.AsyncBaseTransport)` for async clients |
| Turso writes | Using default connection (may route to replica) | Explicitly use primary URL for all enforcement writes; document which connection goes where |
| Hono middleware body reading | Reading `c.req.json()` in middleware then trying `c.req.text()` in handler | Body is consumed after first read; use `c.req.arrayBuffer()` and parse manually, or cache via `tee()` |
| Wrangler secrets | Adding API keys to `vars` in wrangler.jsonc | Use `wrangler secret put KEY` for all sensitive values; vars only contain empty-string placeholders |
| Wrangler multi-env | Expecting Workflow binding to inherit from top-level config | Non-inheritable keys (vars, bindings) must be redeclared in each `[env.X]` block |
| TanStack Query mutations | Calling `invalidateQueries` only on `onSuccess` | Use `onSettled` for invalidation (fires on both success and error) |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Synchronous Turso write per token | Increasing p99 latency under load | Batch audit writes; use async queue | >10 concurrent requests |
| Buffering streaming response to count tokens | High memory use; slow TTFT (time to first token) | Stream passthrough; count tokens from final usage chunk async | First streaming user |
| Budget check before every request (DB round-trip) | >15ms overhead per request | Cache budget state in Durable Object with TTL; refresh async | >5 RPS per agent |
| Full request logging for every LLM call | Turso write amplification; storage cost | Log summary only (model, token count, cost, decision); store raw only on policy violations | >100 requests/day |
| Cloudflare Worker CPU time for token estimation | "Worker exceeded CPU time limit" on long prompts | Use lightweight tokenizer (not full tiktoken WASM); offload heavy compute to server-side | Prompts >10K tokens |
| Gemini `usageMetadata` read after response buffered | Identical to OpenAI non-streaming — must buffer full response | Acceptable for non-streaming Gemini; document that streaming Gemini requires buffered final chunk | N/A (Gemini doesn't support stream_options) |

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
| `GEMINI_API_KEY` committed to wrangler.jsonc | Key visible in git history and Cloudflare dashboard | Use `wrangler secret put GEMINI_API_KEY`; `.dev.vars` for local dev only |
| Budget CRUD endpoint without authentication | Anyone can set any agent's limit to $0 or $1,000,000 | Dashboard API must require the same auth as the rest of the admin surface; no unauthenticated budget mutations |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Budget remaining shown as raw token count | Developers cannot intuit when budget runs out | Show remaining budget in USD ($4.23 left) and as a percentage; only show tokens in detailed view |
| HITL approval notification with no context | Approver clicks approve/deny without understanding what they're approving | Include: action type, risk classification, what will happen if approved, what will happen if denied, one-sentence agent context |
| Budget exceeded = hard 403 with no explanation | Agent crashes with cryptic error; developer doesn't know why | Return structured error: `{code: "BUDGET_EXCEEDED", budget_id: "...", spent: 9.87, limit: 10.00, suggestion: "increase limit or switch to cheaper model"}` |
| Approval queue with no SLA visibility | Approvers don't know which items are urgent | Show age of each pending approval; sort by urgency; highlight items where agent has been blocked >1h |
| No graceful degradation on budget soft limit | Agents hit hard limit and stop entirely | Implement soft limit (80% of budget) that triggers cheaper model fallback before hard limit terminates |
| Budget limit input with no validation | User enters "-5" or "0" as limit | Validate: limit_usd must be a positive number; show error inline; do not submit until valid |
| Budget save with no confirmation feedback | User unsure if save succeeded | Show loading state during mutation; show success/error toast after `onSettled`; re-enable Save only after settlement |

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
- [ ] **Gemini settle:** Send a Gemini streaming request; verify `budget_settle` audit event shows non-zero `promptTokens` AND `completionTokens`
- [ ] **Anthropic streaming settle:** Send a streaming Anthropic request; verify `budget_settle` shows non-zero `promptTokens` (from `message_start`) AND non-zero `completionTokens` (from `message_delta`)
- [ ] **Gemini safety block:** Send a Gemini request that triggers safety filtering; verify (a) HTTP 200 is NOT passed through as success, (b) hold is settled at 0 cost, (c) AgentError is returned
- [ ] **Python async:** Call `agentgov.wrap(AsyncOpenAI())` and `await` a chat completion; verify no `RuntimeError: This event loop is already running`
- [ ] **Python async test coverage:** Verify pytest actually runs async tests by adding a deliberately failing async test and confirming it fails
- [ ] **Two entry points:** Run the full test suite against both `wrangler dev` and `node index.node.ts`; verify Gemini, Anthropic streaming, and budget CRUD work in both
- [ ] **Wrangler secrets:** Run `git log --all -S "AIza" -S "sk-ant"` to confirm no API keys in git history
- [ ] **Production binding:** Deploy to a staging environment with `wrangler deploy --env staging`; verify `c.env.HITL_WORKFLOW` is defined (not undefined)
- [ ] **Budget CRUD race:** Run concurrent settle + limit-update operations; verify `spent_usd` does not decrease unexpectedly after a limit change

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
| Gemini settle at zero (field name mismatch) | LOW | Fix field name extraction; run reconciliation on audit log to find under-settled holds; re-settle or adjust limits manually |
| API key committed to git via wrangler.jsonc | HIGH | Rotate key immediately; rewrite git history (git filter-repo); audit Cloudflare access logs for unauthorized usage |
| Python async RuntimeError in production | LOW | Ship `AsyncAgentgovTransport` hotfix; bump patch version; add async integration test to CI |
| Production Worker missing Workflow binding | LOW | Add binding to `[env.production]` in wrangler.jsonc; redeploy; verify with `wrangler tail` |
| Budget CRUD overwrote spent_usd | MEDIUM | Restore from audit log (sum all settle events for agent); correct ledger row; add column-restriction to UPDATE query |

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
| Gemini field name mismatch (Pitfall 11) | v1.1: Gemini phase | Assert non-zero settle after Gemini call; unit test with mock usageMetadata |
| Gemini safety block passthrough (Pitfall 12) | v1.1: Gemini phase | Send safety-triggering content; verify AgentError response |
| Gemini function calling format (Pitfall 13) | v1.1: Gemini phase | Lock OpenAI-compat endpoint choice; test with tools array |
| Anthropic SSE usage split (Pitfall 14) | v1.1: Anthropic streaming phase | Verify both input_tokens and output_tokens non-zero after streaming |
| Anthropic SSE multi-line parser (Pitfall 15) | v1.1: Anthropic streaming phase | Test with responses that span chunk boundaries |
| Python async transport (Pitfall 16) | v1.1: Python async phase | Async integration test; verify no RuntimeError |
| pytest-asyncio mode (Pitfall 17) | v1.1: Python async phase | Canary failing async test before writing real tests |
| Wrangler secrets in vars (Pitfall 18) | v1.1: Cloudflare deploy phase | `git log --all -S "AIza"` must return empty |
| Workflow binding non-inherited (Pitfall 19) | v1.1: Cloudflare deploy phase | `wrangler deploy --env production` + HITL smoke test |
| libsql/client import path (Pitfall 20) | v1.1: All phases (grep in CI) | CI check: no `@libsql/client'` without `/web` |
| Budget CRUD spent_usd clobber (Pitfall 21) | v1.1: Budget UI phase | Concurrent settle + update test; verify spent_usd monotonically increases |
| TanStack Query stale cache (Pitfall 22) | v1.1: Budget UI phase | UI test: save then verify new value shows immediately |
| Two-entry-point compatibility (Pitfall 23) | v1.1: All phases | Test matrix: Workers + Node.js for every new feature |

---

## Sources

- banto project lessons (hold/settle pattern, macOS Keychain non-portability): project-level context
- GSD-2 design principles (deterministic enforcement, risk-graded actions, 3-layer timeouts): project-level context
- HumanLayer pivot from standalone HITL: milestone context
- LiteLLM real-world performance: 2-4.5x response time increase in production (GitHub issue #4298): https://github.com/BerriAI/litellm/discussions/4298
- LiteLLM budget sync drift at 100 RPS (10-request window): https://docs.litellm.ai/docs/proxy/users
- LiteLLM "zero cost = skip budget checks" behavior: https://docs.litellm.ai/docs/proxy/custom_pricing
- HITL fatigue: 43% of professionals stop verifying AI outputs under load: https://onereach.ai/blog/human-in-the-loop-agentic-ai-systems/
- Cloudflare Workers non-inheritable bindings (vars, workflows): https://developers.cloudflare.com/workers/wrangler/configuration/
- Cloudflare Workers secrets vs vars: https://developers.cloudflare.com/workers/configuration/secrets/
- Cloudflare Workflows workers API (binding, create, get, sendEvent): https://developers.cloudflare.com/workflows/build/workers-api/
- Anthropic streaming messages reference (message_start, message_delta, usage split): https://docs.anthropic.com/en/api/messages-streaming
- Anthropic streaming event format (event types, token usage): https://docs.anthropic.com/claude/reference/messages-streaming
- Gemini API usageMetadata (promptTokenCount, candidatesTokenCount): https://ai.google.dev/gemini-api/docs/tokens
- Gemini API candidatesTokenCount underreporting bug (Gemini 2.5 Flash Lite, 8.5x discrepancy): https://discuss.ai.google.dev/t/bug-gemini-2-5-flash-lite-candidatestokencount-underreports-output-tokens-by-8-5x-vs-actual-billing/124448
- Gemini OpenAI compatibility layer (endpoint, response format, field names): https://ai.google.dev/gemini-api/docs/openai
- Gemini safety settings and two-layer system (PROHIBITED_CONTENT cannot be overridden): https://ai.google.dev/gemini-api/docs/safety-settings
- Gemini function calling format (functionDeclarations, functionResponse parts): https://ai.google.dev/gemini-api/docs/function-calling
- httpx AsyncBaseTransport (handle_async_request interface): https://www.python-httpx.org/advanced/transports/
- httpx connection pools not shareable across event loops: https://www.python-httpx.org/async/
- OpenAI Python SDK: async client uses httpx.AsyncClient, `_client` private attribute: https://github.com/openai/openai-python/blob/main/src/openai/_client.py
- pytest-asyncio strict mode default (v0.21+), asyncio_mode = "auto" configuration: https://github.com/pytest-dev/pytest-asyncio
- TanStack Query optimistic updates race condition (concurrent mutations): https://github.com/TanStack/query/discussions/7932
- TanStack Query: use onSettled (not onSuccess) for invalidation: https://tkdodo.eu/blog/concurrent-optimistic-updates-in-react-query
- @libsql/client/web import requirement for Cloudflare Workers (Workers tutorial): https://developers.cloudflare.com/workers/tutorials/connect-to-turso-using-workers/
- Turso Cloudflare Workers integration documentation: https://developers.cloudflare.com/workers/databases/third-party-integrations/turso/
- Existing codebase: `packages/proxy/src/passthrough/forward.ts` (pipeAndSettle TODO), `packages/proxy/src/budget/ledger.ts` (non-transactional race condition documentation), `packages/sdk-python/src/agentgov/_transport.py` (sync-only AgentgovTransport)

---
*Pitfalls research for: Agent Governance / LLM Proxy / Cost Enforcement Platform (agentgov) — v1.1 integration additions*
*Researched: 2026-03-15*
