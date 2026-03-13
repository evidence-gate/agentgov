# Phase 3: Error Handling + Production Hardening — Research

**Researched:** 2026-03-14
**Domain:** Distributed systems error handling — retry, classification, loop detection, structured error reporting
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Error classification: transient (rate limit, 5xx) vs permanent (auth, 4xx) — static code decision, not LLM judgment
- 2-failure-stop rule: same action + same input repeated twice without progress = stop + diagnostics
- Budget hold is maintained during retries (no re-hold on each attempt)
- All error events write to audit_log via `appendAuditEvent()` (never-throw pattern)
- `appendAuditEvent()` must NEVER throw — failed audit write must not abort enforcement
- Error classification happens inside the proxy (wrapping `forwardToLlm()`), not in the SDK
- New error class `AgentError` added to SDK following BudgetExceeded / HitlPending pattern

### Claude's Discretion

- Stuck/loop detection scope: per-request vs per-session — per-request is sufficient for Phase 3
- Retry configuration: environment variables (simpler than per-agent config)
- Retry-After header: whether to respect LLM provider's suggested backoff time

### Deferred Ideas (OUT OF SCOPE)

- 3-tier timeout (soft warning, idle detection, hard stop) — ERR-05, v2
- Error-type to handler static mapping (declarative config) — ERR-06, v2
- Partial result return on hard stop — ERR-07, v2
- ML-based anomaly detection — explicitly Out of Scope in REQUIREMENTS.md
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ERR-01 | Error classification — transient (retriable: rate limit, 5xx) vs permanent (non-retriable: auth, 4xx) | HTTP status code lookup table; pure function with no side effects; well-documented distributed systems pattern |
| ERR-02 | Finite retry with exponential backoff and jitter, configurable max retries | Standard algorithm: `delay = min(base * 2^attempt, cap) + random(0, jitter)`; Cloudflare Workers `waitUntil` compatible |
| ERR-03 | Stuck/loop detection — detect agents repeating the same action without progress (2-failure-stop rule) | Per-request action history in memory (no DB needed for Phase 3); fingerprint = `hash(actionName + inputArgs)` |
| ERR-04 | Structured error reporting with type, timestamp, agent context, and suggested remediation | Extend `AuditEventType`, add `AgentError` SDK class, JSON payload in `audit_log.payload` |
</phase_requirements>

---

## Summary

Phase 3 adds production resilience to the agentgov proxy. The proxy currently returns LLM provider errors as-is (`forwardToLlm()` returns the raw response when `!llmResponse.ok`). Phase 3 wraps this with a retry engine that classifies errors before deciding to retry or halt.

The four requirements map cleanly to four pure/isolated components: an Error Classifier (pure function, no I/O), a Retry Engine (wraps `forwardToLlm()`), a Stuck/Loop Detector (in-memory per-request, compares action fingerprints), and a Structured Error Reporter (extends `appendAuditEvent()` + new `AuditEventType` values + `AgentError` SDK class).

The architecture already provides every integration point needed: `forwardToLlm()` is the single LLM call site to wrap, `appendAuditEvent()` is the never-throw audit writer, `AuditEventType` is extended by adding to the union in `types.ts`, and the SDK error class pattern (`BudgetExceeded`, `HitlPending`) is directly reusable for `AgentError`.

**Primary recommendation:** Implement all four components as isolated modules (`error/classifier.ts`, `error/retry.ts`, `error/loop-detector.ts`, `error/reporter.ts`), integrate them in `passthrough/forward.ts`, then expose `AgentError` from the SDK. Keep state management in-memory (no new DB tables needed for Phase 3 per-request loop detection).

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (no new dependencies) | — | Phase 3 is pure logic | All primitives (fetch, setTimeout/delay, crypto.subtle) are available in Cloudflare Workers runtime |

### Supporting
| Component | Source | Purpose | When to Use |
|-----------|--------|---------|-------------|
| `crypto.randomUUID()` | Web Crypto (built-in) | Generating retry trace IDs | Already used throughout codebase |
| `Date.now()` | Built-in | Timestamps for retry events | Already used in audit events |
| vitest v2 | `@agentgov/proxy` devDependency | Unit tests for classifier, retry engine, loop detector | Already pinned at v2 per [Phase 01-03] decision |

### No New Dependencies Required
Phase 3 logic is entirely algorithmic. The existing stack provides everything:
- Error classification: pure switch/lookup on HTTP status code
- Backoff: `Math.min(base * 2^n, cap) + Math.random() * jitter` — pure arithmetic
- Loop detection: `Map<string, {count, timestamps}>` in memory during request lifetime
- Structured errors: extend `AuditEventType` union, new SDK class

**Installation:** No new packages needed.

---

## Architecture Patterns

### Recommended File Structure

```
packages/proxy/src/
├── error/
│   ├── classifier.ts       # Pure function: HTTP status → transient | permanent | unknown
│   ├── retry.ts            # Retry engine: wraps forwardToLlm() with backoff loop
│   ├── loop-detector.ts    # Per-request action fingerprint tracker
│   └── reporter.ts         # Structured audit event builder for error scenarios
├── passthrough/
│   └── forward.ts          # MODIFIED: integrate retry engine here
└── types.ts                # MODIFIED: extend AuditEventType union

packages/sdk-typescript/src/
└── errors.ts               # MODIFIED: add AgentError class
```

### Pattern 1: Error Classifier (Pure Function)

**What:** Maps HTTP status code to `'transient' | 'permanent' | 'unknown'`
**When to use:** After every non-2xx response from LLM provider
**Design principle from CONTEXT.md:** "エラー分類と型別ルーティング — エラー種別ごとに最適なハンドラーを静的マッピング"

```typescript
// packages/proxy/src/error/classifier.ts
export type ErrorClass = 'transient' | 'permanent' | 'unknown';

export interface ClassifiedError {
  class: ErrorClass;
  status: number;
  retryable: boolean;
  suggestedRemediation: string;
}

const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);
const PERMANENT_STATUSES = new Set([400, 401, 403, 404, 422]);

export function classifyHttpError(status: number): ClassifiedError {
  if (TRANSIENT_STATUSES.has(status)) {
    return {
      class: 'transient',
      status,
      retryable: true,
      suggestedRemediation:
        status === 429
          ? 'Rate limit exceeded. Request will be retried with exponential backoff.'
          : `Upstream ${status} error. Transient — retry in progress.`,
    };
  }
  if (PERMANENT_STATUSES.has(status)) {
    return {
      class: 'permanent',
      status,
      retryable: false,
      suggestedRemediation:
        status === 401 || status === 403
          ? 'Authentication failed. Check API key configuration — no retry will be attempted.'
          : `Permanent ${status} error. Check request format or model name.`,
    };
  }
  return {
    class: 'unknown',
    status,
    retryable: false,
    suggestedRemediation: `Unexpected status ${status}. Treated as non-retriable.`,
  };
}
```

### Pattern 2: Retry Engine with Exponential Backoff + Jitter

**What:** Wraps a single LLM call, retries on transient errors up to `MAX_RETRIES`
**When to use:** Called from `passthrough/forward.ts` instead of bare `fetch`
**Configuration:** Environment variables `AGENTGOV_MAX_RETRIES` (default: 3), `AGENTGOV_RETRY_BASE_MS` (default: 1000)

Full jitter formula (AWS recommendation, avoids thundering herd):
```
delay = random(0, min(cap, base * 2^attempt))
```

```typescript
// packages/proxy/src/error/retry.ts
export interface RetryConfig {
  maxRetries: number;    // from env AGENTGOV_MAX_RETRIES, default 3
  baseDelayMs: number;   // from env AGENTGOV_RETRY_BASE_MS, default 1000
  capMs: number;         // max delay cap, default 30000
}

export function calcBackoffMs(attempt: number, config: RetryConfig): number {
  // Full jitter: random between 0 and exponential cap
  const exponential = Math.min(config.capMs, config.baseDelayMs * Math.pow(2, attempt));
  return Math.floor(Math.random() * exponential);
}

export function parseRetryConfig(env: Record<string, string | undefined>): RetryConfig {
  return {
    maxRetries: parseInt(env.AGENTGOV_MAX_RETRIES ?? '3', 10),
    baseDelayMs: parseInt(env.AGENTGOV_RETRY_BASE_MS ?? '1000', 10),
    capMs: 30_000,
  };
}
```

**Cloudflare Workers delay:** Workers do NOT have `setTimeout`. Use:
```typescript
// Delay compatible with Cloudflare Workers
async function delay(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    // Workers support this via the Promise microtask queue + scheduler
    // For actual wall-clock delay in Workers: use a loop or Streams
    // Simplest Workers-compatible approach:
    const start = Date.now();
    function check() {
      if (Date.now() - start >= ms) resolve();
      else setTimeout(check, Math.min(ms, 50)); // Workers DO have setTimeout (see note)
    }
    check();
  });
}
```

**IMPORTANT NOTE on Workers + setTimeout:** Cloudflare Workers DO support `setTimeout` in the fetch handler scope (it's in the WinterCG spec). The Workers runtime has `setTimeout` available. This was verified in Cloudflare Workers docs. Short delays (100ms-30s) work fine.

### Pattern 3: Loop / Stuck Detector

**What:** Per-request in-memory Map tracking action fingerprints
**When to use:** After a successful LLM response, before returning to caller — check if the returned tool_calls fingerprint matches a previous call in this request's history
**2-failure-stop rule:** Same fingerprint seen 2 times without different output = STUCK

```typescript
// packages/proxy/src/error/loop-detector.ts
export interface ActionRecord {
  fingerprint: string;   // SHA-256 of actionName + normalizedArgs
  timestamps: number[];  // ms timestamps of each occurrence
  count: number;
}

export interface LoopDetectorState {
  history: Map<string, ActionRecord>;
}

export function createLoopDetector(): LoopDetectorState {
  return { history: new Map() };
}

// Fingerprint: hash of action name + sorted/normalized arguments
// Use JSON.stringify with sorted keys to normalize argument order
export async function fingerprintAction(
  actionName: string,
  args: unknown
): Promise<string> {
  const normalized = JSON.stringify({ action: actionName, args }, sortKeys);
  const encoded = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function sortKeys(_: string, value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value as Record<string,unknown>).sort());
  }
  return value;
}

export interface StuckResult {
  stuck: false;
} | {
  stuck: true;
  repeatedFingerprint: string;
  actionName: string;
  timestamps: number[];
  suggestedRemediation: string;
}

export function recordAction(
  state: LoopDetectorState,
  fingerprint: string,
  actionName: string,
  now: number
): StuckResult {
  const existing = state.history.get(fingerprint);
  if (!existing) {
    state.history.set(fingerprint, { fingerprint, timestamps: [now], count: 1 });
    return { stuck: false };
  }
  existing.count += 1;
  existing.timestamps.push(now);
  if (existing.count >= 2) {
    return {
      stuck: true,
      repeatedFingerprint: fingerprint,
      actionName,
      timestamps: existing.timestamps,
      suggestedRemediation:
        `Agent repeated action '${actionName}' ${existing.count} times with identical inputs. ` +
        `Check for missing state updates or broken feedback loops in agent logic.`,
    };
  }
  return { stuck: false };
}
```

**Scope decision (per CONTEXT.md discretion):** Per-request scope is sufficient for Phase 3. The loop detector `state` is created once per incoming request in `index.ts` and passed through the call chain. No DB persistence needed.

### Pattern 4: Structured Error Reporter

**What:** Builds audit log events and SDK error bodies for error scenarios
**New `AuditEventType` values** to add to `types.ts`:

```typescript
// Addition to AuditEventType union in types.ts:
| 'error_classified'    // every classification decision
| 'retry_attempt'       // each retry with backoff details
| 'retry_exhausted'     // all retries consumed
| 'permanent_error'     // immediate halt on permanent error
| 'stuck_detected'      // loop detector triggered
```

**SDK `AgentError` class** (follows BudgetExceeded / HitlPending pattern):

```typescript
// packages/sdk-typescript/src/errors.ts — addition
export interface AgentErrorBody {
  error: {
    code: 'AGENT_ERROR';
    type: 'retry_exhausted' | 'permanent_error' | 'stuck_detected';
    message: string;
    agentId: string;
    timestamp: number;           // Unix ms
    context?: Record<string, unknown>;  // error-type-specific fields
    suggestedRemediation: string;
  };
}
export class AgentError extends Error {
  readonly code = 'AGENT_ERROR' as const;
  readonly type: AgentErrorBody['error']['type'];
  readonly agentId: string;
  readonly timestamp: number;
  readonly context?: Record<string, unknown>;
  readonly suggestedRemediation: string;
  constructor(message: string, body: AgentErrorBody) {
    super(message);
    this.name = 'AgentError';
    this.type = body.error.type;
    this.agentId = body.error.agentId;
    this.timestamp = body.error.timestamp;
    this.context = body.error.context;
    this.suggestedRemediation = body.error.suggestedRemediation;
  }
}
```

### Integration Point: `forwardToLlm()` Wrapping

The current `forward.ts` returns provider errors as-is:
```typescript
// CURRENT (Phase 1-2):
if (!llmResponse.ok) {
  return new Response(llmResponse.body, { status: llmResponse.status, ... });
}
```

Phase 3 replaces this block with the retry engine:
```typescript
// PHASE 3 — inside forwardToOpenAI() / forwardToAnthropic():
if (!llmResponse.ok) {
  const classified = classifyHttpError(llmResponse.status);
  await appendAuditEvent(db, { eventType: 'error_classified', ... });

  if (classified.class === 'permanent') {
    await appendAuditEvent(db, { eventType: 'permanent_error', ... });
    return buildAgentErrorResponse('permanent_error', agentId, classified);
  }

  if (classified.class === 'transient' && attempt < maxRetries) {
    await appendAuditEvent(db, { eventType: 'retry_attempt', ... });
    await delay(calcBackoffMs(attempt, retryConfig));
    return retryForwardToLlm(..., attempt + 1); // recursive or loop
  }

  // transient but retries exhausted
  await appendAuditEvent(db, { eventType: 'retry_exhausted', ... });
  return buildAgentErrorResponse('retry_exhausted', agentId, classified);
}
```

**Budget hold during retries:** The existing `holdId` is maintained across all retry attempts. No new hold is created per retry. The hold expires only on success (settle) or final error halt.

### Anti-Patterns to Avoid

- **Retrying 401/403:** Authentication errors should NEVER retry. Wasted budget + delays. Classify as permanent and halt immediately.
- **Unbounded retries:** Always enforce `maxRetries` ceiling. Default 3 is sufficient for transient rate limits.
- **Retrying on 400:** Malformed request won't fix itself. 400 is permanent.
- **Throwing from audit event writes:** `appendAuditEvent()` must remain never-throw. Error classification and retry audit events follow the same never-throw pattern.
- **Global mutable state for loop detection:** Loop detector state MUST be per-request (created in `index.ts` handler), never module-level global.
- **MD5/simple hash for fingerprinting:** Use `crypto.subtle.digest('SHA-256', ...)` — already available, already used in `audit/writer.ts`.
- **Re-creating DB hold per retry:** Hold is created once in `budgetGate()` before retries. Retry engine does NOT touch the hold — it only passes `holdId` through.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Backoff delay in Workers | Custom scheduler/polling | `setTimeout` (Works in Workers) | Workers WinterCG runtime includes `setTimeout`; simple and battle-tested |
| SHA-256 fingerprint | Custom hash function | `crypto.subtle.digest('SHA-256', ...)` | Already used in `audit/writer.ts`; Web Crypto API available in all environments |
| Error HTTP codes table | Manual if/else chain | Explicit `Set` lookup | `Set.has()` is O(1) and declarative; easier to extend |
| Argument normalization | Custom serializer | `JSON.stringify(args, sortKeyReplacer)` | Handles nested objects; deterministic ordering sufficient for loop detection |

**Key insight:** All retry/backoff/classification patterns are 20-line pure functions. The complexity is in wiring them correctly into `forwardToLlm()`, not in the algorithms themselves.

---

## Common Pitfalls

### Pitfall 1: Mistaking 429 for Permanent

**What goes wrong:** Some 429 responses from LLMs are rate-limit transient; others signal quota exhaustion (effectively permanent for the session). Both return 429.
**Why it happens:** HTTP 429 means "Too Many Requests" — could be per-minute rate limit OR monthly quota.
**How to avoid:** Treat all 429 as transient for Phase 3 (retry with backoff). The budget gate already blocks quota-exhausted agents via budget enforcement before they reach the LLM.
**Warning signs:** If retries always exhaust on 429, the agent is likely quota-limited — budget enforcement should catch this upstream.

### Pitfall 2: Hold Not Settled on Error Halt

**What goes wrong:** Agent is halted after retry exhaustion, but the budget hold remains `active` in the `holds` table — reserving budget indefinitely.
**Why it happens:** `budgetSettle()` is only called on success paths today. Error paths in `forward.ts` return early without settling.
**How to avoid:** When the retry engine decides to halt (permanent error or retry exhaustion), it MUST call `budgetSettle(db, holdId, { promptTokens: 0, completionTokens: 0 }, model, agentId)` to release the hold. The hold settling to 0 cost is correct — no LLM tokens were consumed (or consumed tokens already counted in a streaming response that failed).
**Warning signs:** `holds` table accumulates `active` rows that never settle.

### Pitfall 3: `executionCtx.waitUntil()` and Retry Timing

**What goes wrong:** Retries are fired inside `waitUntil()` but the Worker's execution context terminates before the retry completes.
**Why it happens:** `waitUntil()` extends execution for fire-and-forget tasks, but retries need to return a response to the caller — they must be on the hot path, not background tasks.
**How to avoid:** Retry logic MUST be synchronous from the request handler's perspective (awaited on the main request path). Only audit event writes and alert checks go in `waitUntil()`.

### Pitfall 4: Loop Detection with Non-Deterministic Arguments

**What goes wrong:** Two identical tool calls produce different fingerprints because argument JSON has non-deterministic key ordering.
**Why it happens:** `JSON.stringify(obj)` key order is implementation-defined (though V8 is stable in practice).
**How to avoid:** Use a replacer function that sorts object keys before serializing. Already shown in the `fingerprintAction` example above.

### Pitfall 5: Retry-After Header vs Fixed Backoff

**What goes wrong:** Ignoring the `Retry-After` header from OpenAI/Anthropic leads to retrying too soon (wastes attempts) or unnecessarily long waits.
**Why it happens:** Provider sends `Retry-After: 30` but the backoff formula might compute 1000ms for attempt 0.
**How to avoid (CONTEXT.md discretion):** Respect `Retry-After` when present, fall back to exponential backoff formula when absent. Read `llmResponse.headers.get('Retry-After')` and parse as seconds. This is a LOW-complexity improvement worth including.

---

## Code Examples

### Error Classifier — Full Lookup Table

```typescript
// Source: well-documented HTTP status semantics (RFC 9110) + LLM provider docs
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);
// 429: rate limit (transient — per-minute limits reset)
// 500, 502, 503, 504: upstream server errors (transient — provider-side)

const PERMANENT_STATUSES = new Set([400, 401, 403, 404, 422]);
// 400: bad request (permanent — request won't fix itself)
// 401: unauthorized (permanent — API key issue, wasted to retry)
// 403: forbidden (permanent — permission issue)
// 404: not found (permanent — model name wrong or endpoint missing)
// 422: unprocessable entity (permanent — schema violation)
```

### Retry Loop Structure (in `forwardToLlm`)

```typescript
// Retry loop structure — called once per provider (openai/anthropic)
async function forwardWithRetry(
  requestFn: () => Promise<Response>,
  config: RetryConfig,
  db: DbClient,
  holdId: HoldId,
  agentId: AgentId,
  model: string,
): Promise<Response> {
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    const response = await requestFn();

    if (response.ok) return response;  // success path unchanged

    const classified = classifyHttpError(response.status);

    // Always log classification
    await appendAuditEvent(db, {
      eventType: 'error_classified',
      agentId, model,
      costDelta: 0, runningBalance: 0,
      meta: { status: response.status, class: classified.class, attempt },
    });

    if (classified.class === 'permanent') {
      await appendAuditEvent(db, {
        eventType: 'permanent_error',
        agentId, model, costDelta: 0, runningBalance: 0,
        meta: { status: response.status, attempt, holdId },
      });
      // Release hold (0 cost — no tokens consumed)
      await budgetSettle(db, holdId, { promptTokens: 0, completionTokens: 0 }, model, agentId);
      return buildAgentErrorResponse('permanent_error', agentId, classified, response.status);
    }

    if (attempt === config.maxRetries) {
      await appendAuditEvent(db, {
        eventType: 'retry_exhausted',
        agentId, model, costDelta: 0, runningBalance: 0,
        meta: { status: response.status, totalAttempts: attempt + 1, holdId },
      });
      await budgetSettle(db, holdId, { promptTokens: 0, completionTokens: 0 }, model, agentId);
      return buildAgentErrorResponse('retry_exhausted', agentId, classified, response.status);
    }

    // Transient, more retries available
    const retryAfter = response.headers.get('Retry-After');
    const delayMs = retryAfter
      ? parseInt(retryAfter, 10) * 1000
      : calcBackoffMs(attempt, config);

    await appendAuditEvent(db, {
      eventType: 'retry_attempt',
      agentId, model, costDelta: 0, runningBalance: 0,
      meta: { status: response.status, attempt, delayMs, nextAttempt: attempt + 1 },
    });

    await sleep(delayMs);
  }
  // TypeScript unreachable — loop always returns
  throw new Error('unreachable');
}
```

### Loop Detector Integration in index.ts

```typescript
// index.ts — create per-request detector ONCE, pass through
const loopState = createLoopDetector();

// After forwardToLlm() succeeds, check returned tool_calls:
const toolCallsInResponse = extractToolCallsFromResponse(responseBody);
for (const tc of toolCallsInResponse) {
  const fingerprint = await fingerprintAction(tc.function.name, tc.function.arguments);
  const stuckResult = recordAction(loopState, fingerprint, tc.function.name, Date.now());
  if (stuckResult.stuck) {
    await appendAuditEvent(db, {
      eventType: 'stuck_detected',
      agentId, model, costDelta: 0, runningBalance: 0,
      meta: {
        repeatedAction: stuckResult.actionName,
        timestamps: stuckResult.timestamps,
        fingerprint: stuckResult.repeatedFingerprint,
        suggestedRemediation: stuckResult.suggestedRemediation,
      },
    });
    return buildStuckErrorResponse(agentId, stuckResult);
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual retry in agent code | Infrastructure-layer retry (proxy handles it) | 2023+ (LLM gateway pattern) | Agent code stays clean; centralized enforcement |
| Fixed delay retries | Full jitter backoff (AWS blog, 2015) | Industry standard since 2016 | Eliminates thundering herd; reduces p99 latency under load |
| Global error logs | Per-request structured error events in audit chain | Phase 3 | Hash-chained tamper-evident errors; EU AI Act compliance |
| Status code guessing | Explicit classification table (Set-based lookup) | N/A — always best practice | O(1) lookup; easy to extend; self-documenting |

**Deprecated/outdated:**
- Exponential backoff without jitter: causes request waves when many clients hit same rate limit simultaneously. Full jitter (random 0 to cap) is the current recommendation per AWS Architecture blog.
- Per-session loop detection in DB: overkill for Phase 3. In-memory per-request is sufficient given the 2-failure-stop rule fires within a single request lifecycle.

---

## Open Questions

1. **Retry-After header precision**
   - What we know: OpenAI returns `Retry-After` (seconds) on 429s; Anthropic may use `retry-after` or `x-ratelimit-reset-requests`
   - What's unclear: Header name casing, format (seconds vs Unix timestamp), presence across all providers
   - Recommendation: Parse `Retry-After` as integer seconds; if absent/invalid, fall back to `calcBackoffMs()`. Log which path was taken in `retry_attempt` audit event.

2. **Hold settle on stuck detection**
   - What we know: When stuck is detected, the LLM call succeeded (it returned tool_calls) — tokens were consumed
   - What's unclear: Should we settle with actual tokens (response was valid) before halting, or release hold at 0?
   - Recommendation: When stuck is detected after a successful LLM response, settle the hold with actual token counts (the request was valid, tokens were spent), then return the stuck error. This accurately reflects cost.

3. **Loop detector scope for streaming responses**
   - What we know: Streaming responses (`stream: true`) return an SSE stream; tool_calls appear in SSE chunks
   - What's unclear: Phase 3 loop detection should apply to tool_calls in both streaming and non-streaming responses
   - Recommendation: Loop detection operates on the parsed request body's `messages[].tool_calls` (what the agent sent), not the LLM's response. This is simpler and avoids SSE parsing complexity. An agent looping will send the same tool_call in successive requests.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest v2 (pinned per Phase 01-03 decision) |
| Config file (Workers pool) | `packages/proxy/vitest.config.ts` |
| Config file (Node.js) | `packages/proxy/vitest.config.node.ts` |
| Quick run command | `cd packages/proxy && pnpm test:node` |
| Full suite command | `cd packages/proxy && pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ERR-01 | `classifyHttpError(429)` returns `transient`, `classifyHttpError(401)` returns `permanent` | unit | `pnpm --filter @agentgov/proxy test:node -- --reporter=verbose src/error/classifier.test.ts` | Wave 0 |
| ERR-01 | All status codes in lookup table map to correct class | unit | same | Wave 0 |
| ERR-02 | `calcBackoffMs(0, config)` returns value in `[0, base]` range, `calcBackoffMs(2, config)` in `[0, cap]` | unit | `pnpm --filter @agentgov/proxy test:node -- src/error/retry.test.ts` | Wave 0 |
| ERR-02 | Retry engine retries transient errors up to `maxRetries`, does NOT retry permanent | unit (mock fetch) | same | Wave 0 |
| ERR-02 | Retry engine respects `Retry-After` header over computed backoff | unit | same | Wave 0 |
| ERR-03 | `recordAction()` returns `stuck:false` on first occurrence, `stuck:true` on second identical fingerprint | unit | `pnpm --filter @agentgov/proxy test:node -- src/error/loop-detector.test.ts` | Wave 0 |
| ERR-03 | `fingerprintAction()` produces same hash for argument objects with different key ordering | unit | same | Wave 0 |
| ERR-04 | Structured error response body matches `AgentErrorBody` interface (type, timestamp, suggestedRemediation) | unit | `pnpm --filter @agentgov/proxy test:node -- src/error/reporter.test.ts` | Wave 0 |
| ERR-04 | `AgentError` SDK class constructor populates all fields from `AgentErrorBody` | unit | `pnpm --filter @agentgov/sdk-typescript test -- wrap.test.ts` | Wave 0 |
| ERR-01+02 | `AuditEventType` includes `error_classified`, `retry_attempt`, `retry_exhausted`, `permanent_error` | type check | `pnpm --filter @agentgov/proxy tsc --noEmit` | Wave 0 (types.ts change) |
| ERR-03 | `AuditEventType` includes `stuck_detected` | type check | same | Wave 0 (types.ts change) |

### Sampling Rate

- **Per task commit:** `cd /Users/masa/gsd-workspace/packages/proxy && pnpm test:node`
- **Per wave merge:** `cd /Users/masa/gsd-workspace && pnpm test` (full workspace)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/proxy/src/error/classifier.test.ts` — covers ERR-01 (does not exist, new module)
- [ ] `packages/proxy/src/error/retry.test.ts` — covers ERR-02 (does not exist, new module)
- [ ] `packages/proxy/src/error/loop-detector.test.ts` — covers ERR-03 (does not exist, new module)
- [ ] `packages/proxy/src/error/reporter.test.ts` — covers ERR-04 (does not exist, new module)
- [ ] `packages/proxy/vitest.config.node.ts` — MUST be updated to include `src/error/*.test.ts` in the include list
- [ ] `packages/sdk-typescript/src/errors.ts` — add `AgentError` class (file exists, needs modification)
- [ ] No new framework install needed — vitest v2 already present

---

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `packages/proxy/src/passthrough/forward.ts` — exact integration point identified
- Codebase inspection: `packages/proxy/src/audit/writer.ts` — never-throw pattern confirmed
- Codebase inspection: `packages/proxy/src/types.ts` — `AuditEventType` union, extension approach verified
- Codebase inspection: `packages/sdk-typescript/src/errors.ts` — `AgentError` pattern confirmed from `BudgetExceeded`/`HitlPending`
- Codebase inspection: `packages/proxy/vitest.config.node.ts` — test infrastructure confirmed (vitest v2 Node.js config)
- CONTEXT.md — locked decisions and design principles

### Secondary (MEDIUM confidence)
- RFC 9110 (HTTP Semantics) — authoritative on status code meanings (401, 429, 5xx classification)
- AWS Architecture Blog "Exponential Backoff And Jitter" (2015, updated) — full jitter formula
- Cloudflare Workers WinterCG runtime spec — `setTimeout` availability confirmed

### Tertiary (LOW confidence)
- OpenAI `Retry-After` header format — assumed seconds integer; actual behavior should be verified against live responses

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all patterns use existing proxy primitives
- Architecture: HIGH — integration points precisely identified from codebase inspection; algorithms are textbook distributed systems
- Pitfalls: HIGH — hold-not-settled and context termination pitfalls identified from codebase structure; standard retry pitfalls from well-known literature
- Test infrastructure: HIGH — vitest config files read directly; Wave 0 gaps enumerated from file-system inspection

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable algorithms; only expires if Cloudflare Workers runtime changes)
