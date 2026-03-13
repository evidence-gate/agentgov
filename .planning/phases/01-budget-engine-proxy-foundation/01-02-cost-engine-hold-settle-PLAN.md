---
phase: 01-budget-engine-proxy-foundation
plan: "02"
type: execute
wave: 2
depends_on:
  - "01-01"
files_modified:
  - packages/proxy/src/budget/pricing.ts
  - packages/proxy/src/budget/calculator.ts
  - packages/proxy/src/budget/gate.ts
  - packages/proxy/src/budget/ledger.ts
  - packages/proxy/src/audit/writer.ts
  - packages/proxy/src/index.ts
  - packages/proxy/pricing.json
  - packages/proxy/src/budget/calculator.test.ts
  - packages/proxy/src/budget/gate.test.ts
  - packages/proxy/src/audit/writer.test.ts
autonomous: true
requirements:
  - COST-01
  - COST-02
  - COST-03
  - COST-04

must_haves:
  truths:
    - "A request for gpt-4o with 1000 input tokens and 500 output tokens returns a cost within ±5% of the correct value"
    - "An unknown model name is BLOCKED, not allowed through with zero cost"
    - "A request that would exceed the configured budget receives a 429 response with BudgetExceeded error body before any forwarding occurs"
    - "Two concurrent hold requests for the same agent_id are serialized — the second hold sees the reduced balance after the first hold"
    - "Every budget decision (allow, block, hold, settle) writes a row to audit_log"
    - "pricing.json has a last_updated field and the proxy emits a warning log if it is more than 30 days old"
  artifacts:
    - path: "packages/proxy/src/budget/pricing.ts"
      provides: "Pricing table loader with staleness check"
      exports: ["loadPricing", "getPriceForModel"]
    - path: "packages/proxy/src/budget/calculator.ts"
      provides: "Per-request cost estimation"
      exports: ["estimateCost", "settleCost"]
    - path: "packages/proxy/src/budget/gate.ts"
      provides: "Budget gate: hold before forward, block when exceeded"
      exports: ["budgetGate", "budgetSettle"]
    - path: "packages/proxy/src/budget/ledger.ts"
      provides: "DB read/write for budget_ledger and holds tables"
      exports: ["createHold", "settleHold", "getBudget", "ensureAgent"]
    - path: "packages/proxy/src/audit/writer.ts"
      provides: "Append-only audit log writer"
      exports: ["appendAuditEvent"]
    - path: "packages/proxy/pricing.json"
      provides: "Model pricing table with last_updated timestamp"
      contains: "last_updated"
  key_links:
    - from: "packages/proxy/src/index.ts"
      to: "packages/proxy/src/budget/gate.ts"
      via: "budgetGate() called in /v1/chat/completions handler before forwarding"
      pattern: "budgetGate"
    - from: "packages/proxy/src/budget/gate.ts"
      to: "packages/proxy/src/budget/ledger.ts"
      via: "createHold(), getBudget()"
      pattern: "createHold|getBudget"
    - from: "packages/proxy/src/budget/gate.ts"
      to: "packages/proxy/src/audit/writer.ts"
      via: "appendAuditEvent() on every decision"
      pattern: "appendAuditEvent"
---

<objective>
Build the budget enforcement core: a cost calculator that translates token counts into USD (per-request, with input/output asymmetry), a Hold/Settle budget gate that writes a pessimistic reservation to the DB before forwarding any request, a ledger module that serializes concurrent hold writes, and an append-only audit writer that records every enforcement decision.

Purpose: This is the primary differentiator — the Hold/Settle pattern eliminates the race condition that all competitor proxies have. Without this plan's output, the proxy is just a passthrough with no enforcement. With it, concurrent agent requests cannot double-spend.

Output: Working budget gate wired into the /v1/chat/completions handler. Unknown models blocked. Budget-exceeded requests receive 429 BudgetExceeded before any forwarding. Every decision logged to audit_log.
</objective>

<execution_context>
@/Users/masa/.config/claude/get-shit-done/workflows/execute-plan.md
@/Users/masa/.config/claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/research/ARCHITECTURE.md
@.planning/research/PITFALLS.md
@.planning/phases/01-budget-engine-proxy-foundation/01-01-SUMMARY.md

<interfaces>
<!-- Key types from 01-01 that this plan builds against. -->

From packages/proxy/src/types.ts:
```typescript
export type AgentId = string;
export type HoldId = string;

export interface ChatCompletionRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
  max_tokens?: number;
}

export interface BudgetHold {
  holdId: HoldId;
  agentId: AgentId;
  estimatedCost: number;
  model: string;
  createdAt: number;
  expiresAt: number;
}

export type AuditEventType =
  | 'budget_hold'
  | 'budget_settle'
  | 'budget_blocked'
  | 'request_forwarded'
  | 'alert_fired';

export interface AuditEvent {
  eventType: AuditEventType;
  agentId: AgentId;
  model: string;
  costDelta: number;
  runningBalance: number;
  meta?: Record<string, unknown>;
}

export interface GateResult {
  action: 'pass' | 'block';
  holdId?: HoldId;
  reason?: string;
}

export interface BudgetExceededErrorBody {
  error: {
    code: 'BUDGET_EXCEEDED';
    message: string;
    budgetId: string;
    spent: number;
    limit: number;
  };
}
```

From packages/proxy/src/db/schema.ts (Drizzle tables):
```typescript
// budget_ledger: agentId (PK), limitUsd, spentUsd, reservedUsd, updatedAt
// holds: id (PK UUID), agentId, model, estimatedCost, status ('active'|'settled'|'expired'), createdAt, expiresAt
// audit_log: seq (autoincrement PK), eventType, agentId, model, costDelta, runningBalance, payload, prevHash, hash, ts
```

From packages/proxy/src/db/client.ts:
```typescript
export function createDbClient(url: string, authToken: string): DbClient;
export type DbClient = ReturnType<typeof createDbClient>;
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pricing table, cost calculator, audit writer</name>
  <files>
    packages/proxy/pricing.json,
    packages/proxy/src/budget/pricing.ts,
    packages/proxy/src/budget/calculator.ts,
    packages/proxy/src/audit/writer.ts,
    packages/proxy/src/budget/calculator.test.ts,
    packages/proxy/src/audit/writer.test.ts
  </files>
  <behavior>
    Cost calculator:
    - estimateCost("gpt-4o", { inputTokens: 1000, outputTokens: 0 }) returns 0.0025 (±5%)
    - estimateCost("gpt-4o", { inputTokens: 0, outputTokens: 1000 }) returns 0.01 (±5%)
    - estimateCost("claude-3-5-sonnet-20241022", { inputTokens: 1000, outputTokens: 1000 }) returns a value > 0
    - estimateCost("unknown-model-xyz", { inputTokens: 1000, outputTokens: 1000 }) throws an error with message containing "unknown model"
    - estimateInputTokens({ messages: [{ role: "user", content: "hello" }] }) returns a positive integer

    Pricing staleness:
    - If pricing.json last_updated is within 30 days: loadPricing() returns the table without warning
    - If pricing.json last_updated is > 30 days ago: loadPricing() returns the table AND emits console.warn with "pricing data is stale"

    Audit writer:
    - appendAuditEvent() with a mock DB client inserts a row into audit_log
    - The inserted row has a non-empty hash field
    - The genesis entry (first row, no previous) has prevHash set to a sentinel "0000...0000"
    - Each successive entry's prevHash equals the previous entry's hash
  </behavior>
  <action>
    `packages/proxy/pricing.json` — create with:
    ```json
    {
      "last_updated": "2026-03-13",
      "models": {
        "gpt-4o": { "input_per_1m": 2.50, "output_per_1m": 10.00 },
        "gpt-4o-mini": { "input_per_1m": 0.15, "output_per_1m": 0.60 },
        "gpt-4o-mini-2024-07-18": { "input_per_1m": 0.15, "output_per_1m": 0.60 },
        "gpt-4-turbo": { "input_per_1m": 10.00, "output_per_1m": 30.00 },
        "gpt-3.5-turbo": { "input_per_1m": 0.50, "output_per_1m": 1.50 },
        "claude-3-5-sonnet-20241022": { "input_per_1m": 3.00, "output_per_1m": 15.00 },
        "claude-3-5-haiku-20241022": { "input_per_1m": 0.80, "output_per_1m": 4.00 },
        "claude-3-opus-20240229": { "input_per_1m": 15.00, "output_per_1m": 75.00 },
        "gemini-1.5-pro": { "input_per_1m": 1.25, "output_per_1m": 5.00 },
        "gemini-1.5-flash": { "input_per_1m": 0.075, "output_per_1m": 0.30 },
        "gemini-2.0-flash": { "input_per_1m": 0.10, "output_per_1m": 0.40 }
      }
    }
    ```

    `packages/proxy/src/budget/pricing.ts`:
    - `loadPricing()`: reads pricing.json (use a relative path from the module), parses last_updated, emits `console.warn("agentgov: pricing data is stale (>30 days). Run agentgov pricing sync.")` if stale. Returns the models map.
    - `getPriceForModel(model: string, pricing: PricingTable)`: looks up model in pricing. If NOT found → throws `new Error(\`unknown model: \${model}. agentgov fails closed on unknown models to prevent budget bypass.\`)`. Returns `{ inputPer1m: number, outputPer1m: number }`.
    - Export a `PRICING_STALENESS_DAYS = 30` constant.

    `packages/proxy/src/budget/calculator.ts`:
    - `estimateInputTokens(request: ChatCompletionRequest): number` — simple heuristic: sum all message content character counts ÷ 4 (approximation of tokens). Round up. Use max_tokens or 4096 as ceiling for output estimate.
    - `estimateCost(model: string, usage: { inputTokens: number; outputTokens: number }): number` — calls getPriceForModel (throws on unknown model). Returns `(inputTokens / 1_000_000) * inputPer1m + (outputTokens / 1_000_000) * outputPer1m`.
    - `settleCost(model: string, actualUsage: { promptTokens: number; completionTokens: number }): number` — same calculation against actual usage. This is called after the LLM response arrives.
    - Export type `TokenUsage = { inputTokens: number; outputTokens: number }`.

    `packages/proxy/src/audit/writer.ts`:
    - `appendAuditEvent(db: DbClient, event: AuditEvent): Promise<void>`
    - Algorithm:
      1. Query audit_log for the most recent row: `SELECT hash FROM audit_log ORDER BY seq DESC LIMIT 1`
      2. prevHash = last row's hash OR the genesis sentinel `'0000000000000000000000000000000000000000000000000000000000000000'`
      3. Construct payload JSON: `JSON.stringify({ ...event, prevHash, ts: Date.now() })`
      4. Compute SHA-256 of payload using `crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))` (Web Crypto, compatible with both Workers and Node.js)
      5. Convert hash ArrayBuffer to hex string
      6. Insert row into audit_log with all fields including hash and prevHash
    - This function MUST NOT throw if the audit insert fails — log the error to console.error and continue. (A failed audit write must not abort a budget allow decision, but must be monitored.)
    - EXCEPTION: Make the function async and the caller can decide to await or fire-and-forget.

    Write tests for calculator.ts and writer.ts. For writer tests, use an in-memory SQLite DB or a mock DbClient (since we are not in Workers runtime for these tests). Use vitest's mock capabilities or create a simple stub that records calls.
  </action>
  <verify>
    <automated>cd /Users/masa/gsd-workspace/packages/proxy && npx vitest run src/budget/calculator.test.ts src/audit/writer.test.ts --reporter=verbose 2>&1 | tail -30</automated>
  </verify>
  <done>
    All tests pass. estimateCost throws on unknown models. Pricing staleness warning is emitted when last_updated is old. appendAuditEvent produces hash-chained rows. pricing.json covers 11 models across OpenAI, Anthropic, and Google.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Budget ledger, Hold/Settle gate, wire into /v1/chat/completions</name>
  <files>
    packages/proxy/src/budget/ledger.ts,
    packages/proxy/src/budget/gate.ts,
    packages/proxy/src/index.ts,
    packages/proxy/src/budget/gate.test.ts
  </files>
  <behavior>
    Ledger / hold atomicity:
    - ensureAgent(db, agentId, limitUsd) creates a budget_ledger row if not present; does nothing if already present
    - createHold(db, agentId, model, estimatedCost): if (spentUsd + reservedUsd + estimatedCost) > limitUsd → returns { approved: false, remaining: number }; otherwise atomically increments reservedUsd and inserts a hold row → returns { approved: true, holdId }
    - settleHold(db, holdId, actualCost): marks hold as settled, decrements reservedUsd by estimatedCost, increments spentUsd by actualCost
    - Two sequential calls to createHold that together exceed the limit: second call returns approved: false

    Budget gate:
    - budgetGate(ctx) with sufficient budget → returns { action: 'pass', holdId }
    - budgetGate(ctx) with a model not in pricing.json → returns { action: 'block', reason: 'unknown_model' }
    - budgetGate(ctx) with insufficient budget → returns { action: 'block', reason: 'budget_exceeded' }
    - budgetGate(ctx) that passes → appendAuditEvent is called with eventType 'budget_hold'
    - budgetGate(ctx) that blocks → appendAuditEvent is called with eventType 'budget_blocked'

    Endpoint integration:
    - POST /v1/chat/completions with X-Agent-Id header and a model not in pricing.json → returns 429 with BudgetExceededErrorBody (code: 'BUDGET_EXCEEDED')
    - POST /v1/chat/completions with X-Agent-Id header and budget exceeded → returns 429
    - POST /v1/chat/completions with X-Agent-Id header and sufficient budget → returns 200 stub (actual LLM forward is in 01-03)
    - POST /v1/chat/completions without X-Agent-Id header → returns 400 with { error: "X-Agent-Id header required" }
  </behavior>
  <action>
    `packages/proxy/src/budget/ledger.ts`:
    - `ensureAgent(db: DbClient, agentId: AgentId, limitUsd: number): Promise<void>` — INSERT OR IGNORE into budget_ledger (agentId, limitUsd, spentUsd=0, reservedUsd=0, updatedAt=now)
    - `getBudget(db: DbClient, agentId: AgentId): Promise<{ limitUsd: number; spentUsd: number; reservedUsd: number } | null>` — SELECT from budget_ledger
    - `createHold(db: DbClient, agentId: AgentId, model: string, estimatedCost: number): Promise<{ approved: true; holdId: HoldId } | { approved: false; remaining: number }>`:
      1. SELECT current budget_ledger row (read from primary — add comment "// primary read for enforcement correctness — see PITFALLS.md #8")
      2. If (spentUsd + reservedUsd + estimatedCost) > limitUsd → return { approved: false, remaining: limitUsd - spentUsd - reservedUsd }
      3. Generate holdId = crypto.randomUUID()
      4. INSERT into holds (id, agentId, model, estimatedCost, status='active', createdAt=now, expiresAt=now+3600000)
      5. UPDATE budget_ledger SET reservedUsd = reservedUsd + estimatedCost, updatedAt = now WHERE agentId = agentId
      6. Return { approved: true, holdId }
      Note: Steps 3-5 should be wrapped in a db.transaction() if the libSQL client supports it. If not, execute sequentially and add a comment noting this is a known consistency risk at high concurrency (Durable Objects per agent is the Phase 2 mitigation).
    - `settleHold(db: DbClient, holdId: HoldId, actualCost: number): Promise<void>`:
      1. SELECT the hold to get agentId and estimatedCost
      2. UPDATE holds SET status='settled'
      3. UPDATE budget_ledger SET reservedUsd = reservedUsd - estimatedCost, spentUsd = spentUsd + actualCost, updatedAt = now

    `packages/proxy/src/budget/gate.ts`:
    ```typescript
    interface GateContext {
      db: DbClient;
      agentId: AgentId;
      request: ChatCompletionRequest;
    }

    export async function budgetGate(ctx: GateContext): Promise<GateResult>
    export async function budgetSettle(db: DbClient, holdId: HoldId, actualUsage: { promptTokens: number; completionTokens: number }): Promise<void>
    ```
    - budgetGate:
      1. Try estimateCost (catches unknown model → block with reason 'unknown_model', call appendAuditEvent with 'budget_blocked')
      2. Call ensureAgent to guarantee the agent has a ledger row (use a default limit of 10.00 USD if no external config yet — TODO comment: replace with config lookup in a later plan)
      3. Call createHold
      4. If approved: appendAuditEvent 'budget_hold', return { action: 'pass', holdId }
      5. If not approved: appendAuditEvent 'budget_blocked', return { action: 'block', reason: 'budget_exceeded' }
    - budgetSettle: calls settleCost (actual token cost), calls settleHold, calls appendAuditEvent 'budget_settle'

    `packages/proxy/src/index.ts` — update the POST /v1/chat/completions handler:
    - Extract X-Agent-Id header; if missing → return 400 { error: "X-Agent-Id header required" }
    - Parse body as ChatCompletionRequest
    - Call budgetGate(ctx) — if action === 'block':
      - If reason === 'unknown_model': return 422 with { error: { code: 'UNKNOWN_MODEL', message: `Model ${model} is not in the pricing table. agentgov fails closed on unknown models.` } }
      - Otherwise: return 429 with BudgetExceededErrorBody
    - If action === 'pass': return the existing stub 200 response (LLM forwarding is Plan 01-03)
    - NOTE: budgetSettle is NOT called in the stub path — it will be called after real LLM response in 01-03
    - The DB client is initialized in the handler from environment bindings (env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN). If bindings are missing (local dev without .dev.vars), log a warning and skip budget enforcement (allow all) to keep local dev usable.

    Write gate.test.ts with mocked DB and audit writer to test all behavior cases above without touching a real DB.
  </action>
  <verify>
    <automated>cd /Users/masa/gsd-workspace/packages/proxy && npx vitest run --reporter=verbose 2>&1 | tail -30</automated>
  </verify>
  <done>
    All tests pass including gate.test.ts. POST /v1/chat/completions without X-Agent-Id returns 400. Budget gate correctly blocks unknown models and budget-exceeded requests. appendAuditEvent is called on every gate decision. ledger functions handle the hold/settle lifecycle correctly.
  </done>
</task>

</tasks>

<verification>
After both tasks complete:
1. `cd /Users/masa/gsd-workspace/packages/proxy && npx vitest run` — full test suite green
2. Grep `estimateCost.*unknown` in calculator.ts — confirms unknown model throws
3. Grep `appendAuditEvent` in gate.ts — appears on every branch (pass AND block)
4. Grep `@libsql/client/web` in ledger.ts or client.ts — confirms correct import path
5. Check that `pricing.json` has `last_updated` field and covers gpt-4o, claude-3-5-sonnet, gemini models
6. Check that `createHold` contains a comment referencing primary read requirement (PITFALLS.md #8)
</verification>

<success_criteria>
- estimateCost throws an error (not returns zero) for models not in pricing.json
- createHold returns approved: false when budget is insufficient — does NOT insert a hold row in that case
- appendAuditEvent is called for every gate decision (both pass and block paths)
- The audit writer uses Web Crypto (crypto.subtle) not Node.js crypto module
- POST /v1/chat/completions with budget-exceeded request returns 429 before any LLM call is made
- Unknown model returns an explicit error response (422 or 429) — not a passthrough
</success_criteria>

<output>
After completion, create `.planning/phases/01-budget-engine-proxy-foundation/01-02-SUMMARY.md` covering:
- Pricing table models and their prices (for SDK plan reference)
- Token estimation heuristic (chars/4)
- Hold/settle transaction pattern used (transaction() or sequential with caveat)
- Default budget limit used (10.00 USD) and where to change it
- Audit writer hash algorithm and genesis sentinel value
- Any deviations from plan
- Test file locations and coverage
</output>
