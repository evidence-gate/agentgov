---
phase: 01-budget-engine-proxy-foundation
plan: "03"
type: execute
wave: 3
depends_on:
  - "01-01"
  - "01-02"
files_modified:
  - packages/sdk-typescript/package.json
  - packages/sdk-typescript/tsconfig.json
  - packages/sdk-typescript/tsup.config.ts
  - packages/sdk-typescript/src/wrap.ts
  - packages/sdk-typescript/src/interceptor.ts
  - packages/sdk-typescript/src/errors.ts
  - packages/sdk-typescript/src/index.ts
  - packages/sdk-typescript/src/wrap.test.ts
  - packages/proxy/src/passthrough/forward.ts
  - packages/proxy/src/budget/alerts.ts
  - packages/proxy/src/index.ts
autonomous: true
requirements:
  - SDK-01
  - COST-05

must_haves:
  truths:
    - "A developer can wrap an OpenAI client with agentgov.wrap(client, options) and subsequent calls are routed to the proxy"
    - "When the proxy returns 429 BudgetExceeded, the SDK raises a BudgetExceeded exception (not a generic HTTP error)"
    - "The proxy forwards an approved request to the real LLM provider and streams the response back to the caller"
    - "After a streaming response completes, budgetSettle is called with actual token usage from the response"
    - "When budget crosses a configured threshold (e.g., 80%), the proxy POSTs an alert payload to the configured webhook URL"
    - "Base URL redirect is documented in the SDK as the primary integration path"
  artifacts:
    - path: "packages/sdk-typescript/src/wrap.ts"
      provides: "agentgov.wrap(client, options) entry point"
      exports: ["wrap"]
    - path: "packages/sdk-typescript/src/errors.ts"
      provides: "BudgetExceeded exception class"
      exports: ["BudgetExceeded"]
    - path: "packages/sdk-typescript/src/interceptor.ts"
      provides: "Base URL rewrite + X-Agent-Id header injection"
      exports: ["createAgentgovFetch", "buildProxyBaseUrl"]
    - path: "packages/proxy/src/passthrough/forward.ts"
      provides: "Streaming LLM passthrough with post-response settle"
      exports: ["forwardToLlm"]
    - path: "packages/proxy/src/budget/alerts.ts"
      provides: "Budget alert webhook firing at configurable thresholds"
      exports: ["checkAndFireAlerts"]
  key_links:
    - from: "packages/sdk-typescript/src/wrap.ts"
      to: "packages/sdk-typescript/src/interceptor.ts"
      via: "createAgentgovFetch — the custom fetch passed to OpenAI client"
      pattern: "createAgentgovFetch"
    - from: "packages/sdk-typescript/src/interceptor.ts"
      to: "agentgov proxy /v1/chat/completions"
      via: "fetch() with rewritten base URL"
      pattern: "baseUrl"
    - from: "packages/proxy/src/index.ts"
      to: "packages/proxy/src/passthrough/forward.ts"
      via: "forwardToLlm() called when gate returns pass"
      pattern: "forwardToLlm"
    - from: "packages/proxy/src/passthrough/forward.ts"
      to: "packages/proxy/src/budget/gate.ts"
      via: "budgetSettle() called after stream ends"
      pattern: "budgetSettle"
---

<objective>
Build the TypeScript SDK and wire the proxy's LLM passthrough with streaming support. The SDK gives developers the `agentgov.wrap(client)` one-liner that intercepts OpenAI (or any OpenAI-compatible) client calls and routes them through the proxy. The proxy's passthrough module streams the approved request to the real LLM and calls budgetSettle after the stream completes. Budget alert webhooks (COST-05) fire at configurable spend thresholds.

Purpose: This plan closes the end-to-end loop: SDK → proxy → LLM → SDK → agent code. Without it, the budget engine exists but cannot be used. The SDK is the primary adoption surface — the friction of this integration is the primary adoption risk.

Output: A published (locally built) @agentgov/sdk npm package that intercepts OpenAI client calls; a streaming passthrough in the proxy that settles budget after real token usage; webhook alerts at 80%/100% thresholds.
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
@.planning/phases/01-budget-engine-proxy-foundation/01-02-SUMMARY.md

<interfaces>
<!-- Types and contracts established by 01-01 and 01-02 -->

From packages/proxy/src/types.ts:
```typescript
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
export interface AuditEvent { ... }
```

From packages/proxy/src/budget/gate.ts:
```typescript
export async function budgetGate(ctx: GateContext): Promise<GateResult>;
export async function budgetSettle(db: DbClient, holdId: HoldId, actualUsage: { promptTokens: number; completionTokens: number }): Promise<void>;
```

From packages/proxy/src/db/client.ts:
```typescript
export function createDbClient(url: string, authToken: string): DbClient;
```

From packages/proxy/src/index.ts:
- POST /v1/chat/completions: validates X-Agent-Id, calls budgetGate, returns stub 200 on pass or 429 on block
- This plan replaces the stub 200 with a real LLM forward
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: TypeScript SDK — wrap(), BudgetExceeded, base URL interceptor</name>
  <files>
    packages/sdk-typescript/package.json,
    packages/sdk-typescript/tsconfig.json,
    packages/sdk-typescript/tsup.config.ts,
    packages/sdk-typescript/src/errors.ts,
    packages/sdk-typescript/src/interceptor.ts,
    packages/sdk-typescript/src/wrap.ts,
    packages/sdk-typescript/src/index.ts,
    packages/sdk-typescript/src/wrap.test.ts
  </files>
  <behavior>
    - `new BudgetExceeded("msg", errorBody)` is an instance of Error
    - `BudgetExceeded.code` equals 'BUDGET_EXCEEDED'
    - `createAgentgovFetch({ proxyUrl, agentId })` returns a fetch-compatible function
    - The returned fetch function rewrites request URLs: requests to https://api.openai.com/v1/chat/completions become http://proxy-url/v1/chat/completions
    - The returned fetch function injects X-Agent-Id header on every request
    - When the proxied fetch returns 429 with BudgetExceededErrorBody, the interceptor throws BudgetExceeded (not a generic error)
    - `wrap(client, { proxyUrl, agentId })` returns the same client type with baseURL and fetch patched to route through proxy
    - `buildProxyBaseUrl(proxyUrl)` returns the proxy URL normalized (trailing slash stripped, https:// or http:// preserved)
    - The SDK README comment (in index.ts JSDoc) states base URL redirect is the primary path and wrap() is a convenience layer
  </behavior>
  <action>
    Create `packages/sdk-typescript/` as a new workspace package:

    `packages/sdk-typescript/package.json`:
    ```json
    {
      "name": "@agentgov/sdk",
      "version": "0.1.0",
      "description": "TypeScript SDK for agentgov — 1-line governance for AI agents",
      "type": "module",
      "main": "./dist/index.cjs",
      "module": "./dist/index.js",
      "types": "./dist/index.d.ts",
      "exports": {
        ".": {
          "import": "./dist/index.js",
          "require": "./dist/index.cjs",
          "types": "./dist/index.d.ts"
        }
      },
      "scripts": {
        "build": "tsup",
        "test": "vitest run"
      },
      "peerDependencies": {
        "openai": ">=4.0.0"
      },
      "devDependencies": {
        "openai": "^4.0.0",
        "tsup": "latest",
        "typescript": "^5",
        "vitest": "^4"
      }
    }
    ```

    `packages/sdk-typescript/tsup.config.ts`:
    ```typescript
    import { defineConfig } from 'tsup';
    export default defineConfig({
      entry: ['src/index.ts'],
      format: ['esm', 'cjs'],
      dts: true,
      splitting: false,
      clean: true,
      external: ['openai', '@anthropic-ai/sdk'],
    });
    ```

    `packages/sdk-typescript/src/errors.ts`:
    ```typescript
    export interface BudgetExceededBody {
      error: { code: 'BUDGET_EXCEEDED'; message: string; budgetId: string; spent: number; limit: number };
    }
    export class BudgetExceeded extends Error {
      readonly code = 'BUDGET_EXCEEDED' as const;
      readonly spent: number;
      readonly limit: number;
      readonly budgetId: string;
      constructor(message: string, body: BudgetExceededBody) {
        super(message);
        this.name = 'BudgetExceeded';
        this.spent = body.error.spent;
        this.limit = body.error.limit;
        this.budgetId = body.error.budgetId;
      }
    }
    ```

    `packages/sdk-typescript/src/interceptor.ts`:
    ```typescript
    export interface AgentgovOptions {
      proxyUrl: string;   // e.g., "http://localhost:8787" or "https://proxy.example.com"
      agentId: string;    // Injected as X-Agent-Id header on every request
    }

    export function buildProxyBaseUrl(proxyUrl: string): string {
      // Strip trailing slash
      return proxyUrl.replace(/\/$/, '');
    }

    export function createAgentgovFetch(options: AgentgovOptions): typeof fetch {
      const base = buildProxyBaseUrl(options.proxyUrl);
      return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        // Rewrite URL: replace any https://api.openai.com or https://api.anthropic.com prefix
        // with the proxy base URL. If the URL is already relative or pointing elsewhere,
        // strip to path only and prepend proxy base.
        const originalUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
        const url = new URL(originalUrl);
        const proxiedUrl = `${base}${url.pathname}${url.search}`;

        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : {}));
        headers.set('X-Agent-Id', options.agentId);

        const response = await fetch(proxiedUrl, { ...init, headers });

        // Detect BudgetExceeded
        if (response.status === 429) {
          const clone = response.clone();
          try {
            const body = await clone.json() as { error?: { code?: string } };
            if (body?.error?.code === 'BUDGET_EXCEEDED') {
              const fullBody = body as import('./errors').BudgetExceededBody;
              const { BudgetExceeded } = await import('./errors');
              throw new BudgetExceeded(fullBody.error.message, fullBody);
            }
          } catch (e) {
            if (e instanceof Error && e.name === 'BudgetExceeded') throw e;
            // Not a BudgetExceeded — return original 429 response
          }
        }

        return response;
      };
    }
    ```

    `packages/sdk-typescript/src/wrap.ts`:
    ```typescript
    import { createAgentgovFetch, AgentgovOptions } from './interceptor';

    /**
     * Wrap an OpenAI-compatible client to route through the agentgov proxy.
     *
     * PRIMARY INTEGRATION PATH (recommended for production):
     *   const client = new OpenAI({ baseURL: "https://your-proxy.example.com/v1", fetch: agentgovFetch });
     *   // No agentgov.wrap() needed — just point baseURL at the proxy.
     *
     * CONVENIENCE WRAPPER (for quick integration / testing):
     *   const client = agentgov.wrap(new OpenAI(), { proxyUrl: "...", agentId: "agent-1" });
     */
    export function wrap<T extends { baseURL?: string; fetch?: typeof fetch }>(
      client: T,
      options: AgentgovOptions,
    ): T {
      const agentgovFetch = createAgentgovFetch(options);
      // Patch the client's fetch and baseURL in place.
      // OpenAI SDK accepts a custom fetch parameter and baseURL at construction time,
      // but we can also set them post-construction for convenience.
      (client as Record<string, unknown>)['fetch'] = agentgovFetch;
      (client as Record<string, unknown>)['baseURL'] = options.proxyUrl.replace(/\/$/, '') + '/v1';
      return client;
    }
    ```

    `packages/sdk-typescript/src/index.ts`:
    ```typescript
    export { wrap } from './wrap';
    export { BudgetExceeded } from './errors';
    export { createAgentgovFetch, buildProxyBaseUrl } from './interceptor';
    export type { AgentgovOptions } from './interceptor';

    /**
     * @agentgov/sdk — TypeScript SDK for agentgov governance proxy
     *
     * Quick start (base URL redirect — recommended for production):
     *   import OpenAI from 'openai';
     *   const client = new OpenAI({
     *     baseURL: 'https://your-agentgov-proxy.example.com/v1',
     *     defaultHeaders: { 'X-Agent-Id': 'my-agent' },
     *   });
     *
     * Quick start (wrap convenience — good for testing):
     *   import { wrap } from '@agentgov/sdk';
     *   import OpenAI from 'openai';
     *   const client = wrap(new OpenAI(), { proxyUrl: 'http://localhost:8787', agentId: 'my-agent' });
     */
    ```

    Write `packages/sdk-typescript/src/wrap.test.ts` using vitest. Use `vi.fn()` mocks for fetch — do not make real HTTP calls. Test all behavior cases above.

    After writing source files, run `cd packages/sdk-typescript && npm run build` (or pnpm build) to verify tsup produces dist/index.js, dist/index.cjs, dist/index.d.ts.
  </action>
  <verify>
    <automated>cd /Users/masa/gsd-workspace/packages/sdk-typescript && npx vitest run --reporter=verbose 2>&1 | tail -20</automated>
  </verify>
  <done>
    All SDK tests pass. BudgetExceeded is an Error instance with correct code/spent/limit properties. createAgentgovFetch rewrites URLs and injects X-Agent-Id. wrap() patches the client's fetch and baseURL. tsup build succeeds producing dist/index.js, dist/index.cjs, dist/index.d.ts.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: LLM passthrough with streaming settle, budget alert webhook</name>
  <files>
    packages/proxy/src/passthrough/forward.ts,
    packages/proxy/src/budget/alerts.ts,
    packages/proxy/src/index.ts
  </files>
  <behavior>
    Passthrough (forward.ts):
    - forwardToLlm(request, holdId, env) forwards the incoming request to the real LLM provider
    - The LLM provider URL is determined from the model: OpenAI models → https://api.openai.com, Anthropic models → https://api.anthropic.com, Gemini → https://generativelanguage.googleapis.com
    - The forwarded request uses the real LLM provider API key from env bindings (OPENAI_API_KEY, ANTHROPIC_API_KEY) — NOT the agentgov proxy API key
    - Streaming responses are piped directly without buffering (use Response body stream passthrough)
    - When stream ends (or for non-streaming), extract usage from response: OpenAI usage is in response.usage.prompt_tokens / completion_tokens; for streaming, set stream_options: {include_usage: true} in the forwarded request body
    - After usage extraction, call budgetSettle(db, holdId, actualUsage)
    - If the LLM provider returns an error (4xx/5xx), return that error response as-is to the caller (do not hide provider errors)
    - If env bindings for LLM API keys are missing, return 503 { error: "LLM provider API key not configured" }

    Alert webhook (alerts.ts):
    - checkAndFireAlerts(db, agentId, thresholds, webhookUrl) checks current (spentUsd / limitUsd) ratio
    - If ratio ≥ 0.80 and the 80% alert has not been fired yet for this agent: POST the alert payload to webhookUrl
    - If ratio ≥ 1.00 and the 100% alert has not been fired yet: POST the 100% alert payload
    - Alert payload: { event: "budget_alert", agentId, threshold: 0.80, spent: number, limit: number, timestamp: ISO8601 }
    - "Has not been fired" check: use audit_log (check for a 'alert_fired' event with the threshold in meta)
    - If webhookUrl is not configured: skip alert silently (no error)
    - Webhook POST failure must NOT propagate to caller — catch and log to console.error
    - After firing an alert, append an audit event with eventType 'alert_fired' and meta: { threshold, webhookUrl }

    Integration (index.ts):
    - POST /v1/chat/completions: after budgetGate returns pass, call forwardToLlm (not the stub anymore)
    - After forwardToLlm completes, call checkAndFireAlerts fire-and-forget (do not await — not on hot path)
    - The AGENTGOV_ALERT_WEBHOOK_URL env var is the webhook URL for alerts
    - AGENTGOV_ALERT_THRESHOLDS env var (optional, default "0.80,1.00") configures thresholds as comma-separated values
  </behavior>
  <action>
    `packages/proxy/src/passthrough/forward.ts`:

    Implement `forwardToLlm(originalRequest: Request, holdId: HoldId, db: DbClient, env: Env): Promise<Response>`:

    1. Clone the incoming request body (already parsed as ChatCompletionRequest in the handler — pass it as a parameter)
    2. Determine provider from model name:
       - Starts with 'gpt-' or 'o1-' or 'o3-' → OpenAI (https://api.openai.com)
       - Starts with 'claude-' → Anthropic (https://api.anthropic.com)
       - Starts with 'gemini-' → Google (https://generativelanguage.googleapis.com)
       - Unknown → return Response with 422 { error: "cannot determine LLM provider from model name" }
    3. For OpenAI: forward to https://api.openai.com/v1/chat/completions with Authorization: Bearer {OPENAI_API_KEY}
       - If streaming request: add `stream_options: { include_usage: true }` to the body before forwarding
    4. For Anthropic: forward to https://api.anthropic.com/v1/messages with x-api-key: {ANTHROPIC_API_KEY}
       - Note: Anthropic format differs (separate system field). For Phase 1, convert OpenAI format to Anthropic format: extract system message from messages array if present.
    5. Pipe the response body as a ReadableStream passthrough — do NOT buffer. Use:
       ```typescript
       return new Response(llmResponse.body, {
         status: llmResponse.status,
         headers: { 'Content-Type': llmResponse.headers.get('Content-Type') ?? 'application/json' }
       });
       ```
    6. For non-streaming responses: after awaiting llmResponse.json(), extract usage and call budgetSettle. Return the JSON response.
    7. For streaming responses: Use TransformStream to intercept the stream. Read SSE chunks, detect the final `[DONE]` chunk or a chunk containing usage data, call budgetSettle async. Return the stream immediately (do not wait for settle to complete before returning).
    8. If env.OPENAI_API_KEY or env.ANTHROPIC_API_KEY is undefined: return 503 { error: "LLM provider API key not configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in wrangler secrets." }

    Add to wrangler.jsonc vars section:
    - OPENAI_API_KEY placeholder (actual value in .dev.vars, never committed)
    - ANTHROPIC_API_KEY placeholder
    - AGENTGOV_ALERT_WEBHOOK_URL placeholder
    - AGENTGOV_ALERT_THRESHOLDS placeholder (default "0.80,1.00")

    `packages/proxy/src/budget/alerts.ts`:

    Implement `checkAndFireAlerts(db: DbClient, agentId: AgentId, webhookUrl: string | undefined, thresholds: number[]): Promise<void>`:
    1. If !webhookUrl: return immediately
    2. Call getBudget(db, agentId) to get current spentUsd and limitUsd
    3. Compute ratio = (spentUsd + reservedUsd) / limitUsd
    4. For each threshold in thresholds (sorted descending, check highest first):
       - If ratio < threshold: skip
       - Query audit_log: SELECT count(*) FROM audit_log WHERE agent_id = agentId AND event_type = 'alert_fired' AND json_extract(payload, '$.threshold') = threshold
       - If count > 0: already fired, skip
       - POST to webhookUrl: `fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'budget_alert', agentId, threshold, spent: spentUsd, limit: limitUsd, timestamp: new Date().toISOString() }) })`
       - Catch fetch error: console.error and continue
       - Call appendAuditEvent(db, { eventType: 'alert_fired', agentId, model: '', costDelta: 0, runningBalance: spentUsd, meta: { threshold, webhookUrl } })

    Update `packages/proxy/src/index.ts`:
    - Replace the stub 200 response in the pass branch with: `return forwardToLlm(c.req.raw, holdId!, db, c.env)`
    - After the return (or in a background task): fire checkAndFireAlerts (use `c.executionCtx.waitUntil(checkAndFireAlerts(...))` if in Workers context, or just `checkAndFireAlerts(...).catch(console.error)` if not available)

    Write tests for alerts.ts with mocked db and fetch. Test: no alert if webhookUrl undefined, alert fires once at 80%, does not fire again on second check (idempotent due to audit_log check), fires at 100% separately.
  </action>
  <verify>
    <automated>cd /Users/masa/gsd-workspace/packages/proxy && npx vitest run --reporter=verbose 2>&1 | tail -30</automated>
  </verify>
  <done>
    All tests pass including alerts tests. forwardToLlm correctly routes by model name. checkAndFireAlerts fires exactly once per threshold (idempotent). Streaming passthrough does not buffer the full response body. budgetSettle is called after stream/response completes. POST /v1/chat/completions with env.OPENAI_API_KEY missing returns 503.
  </done>
</task>

</tasks>

<verification>
After both tasks complete, run the full test suite across both packages:
1. `cd /Users/masa/gsd-workspace && npx vitest run --reporter=verbose 2>&1 | tail -40` (root-level if workspace vitest configured, otherwise run per package)
2. `cd /Users/masa/gsd-workspace/packages/sdk-typescript && npx tsc --noEmit` — SDK TypeScript compiles cleanly
3. `cd /Users/masa/gsd-workspace/packages/sdk-typescript && npx tsup` — dist/ produced
4. Grep `createAgentgovFetch` in `packages/sdk-typescript/src/wrap.ts` — confirms interceptor is used
5. Grep `budgetSettle` in `packages/proxy/src/passthrough/forward.ts` — confirms settle is called post-response
6. Grep `alert_fired` in `packages/proxy/src/budget/alerts.ts` — confirms idempotency check
7. Grep `stream_options.*include_usage` in `packages/proxy/src/passthrough/forward.ts` — confirms streaming usage extraction
8. Confirm `.dev.vars` is listed in `.gitignore` (or create .gitignore entry) — secrets must not be committed
</verification>

<success_criteria>
- SDK: BudgetExceeded is raised (not generic 429 error) when proxy returns budget exceeded
- SDK: wrap(client) patches both fetch and baseURL on the client
- SDK: tsup build produces dist/index.js (ESM), dist/index.cjs (CJS), dist/index.d.ts
- Proxy: forwardToLlm does not buffer streaming responses — response body is piped directly
- Proxy: budgetSettle is called with actual token usage after every successful LLM response
- Proxy: checkAndFireAlerts is idempotent — does not fire the same threshold alert twice
- Proxy: missing API key returns 503 (not 500, not a crash)
- All vitest tests in both packages pass
</success_criteria>

<output>
After completion, create `.planning/phases/01-budget-engine-proxy-foundation/01-03-SUMMARY.md` covering:
- SDK package name and version (for PyPI/npm packaging reference in Phase 4)
- wrap() implementation notes (what fields are patched on the client)
- BudgetExceeded exception shape (for Python SDK parity in Phase 4)
- Streaming passthrough technique used (TransformStream or tee pattern)
- Alert threshold defaults and how to override via env
- Provider routing table (which model prefix → which provider URL)
- Any deviations from plan
- Final test count and coverage
</output>
