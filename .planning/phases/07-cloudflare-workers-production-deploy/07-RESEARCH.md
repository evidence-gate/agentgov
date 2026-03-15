# Phase 7: Cloudflare Workers Production Deploy - Research

**Researched:** 2026-03-15
**Domain:** Cloudflare Workers deployment, wrangler configuration, environment management, Turso cloud
**Confidence:** HIGH

## Summary

Phase 7 is a deployment integration and validation phase — the code is already written and tested. The proxy already targets Cloudflare Workers (`src/index.ts`) and uses all Workers-compatible primitives (`@libsql/client/web`, `WorkflowEntrypoint`, `c.executionCtx.waitUntil`). The work here is: (1) configure `wrangler.jsonc` with a correct `[env.production]` block that redeclares all non-inheritable bindings, (2) set all secrets via `wrangler secret put --env production`, and (3) run a smoke-test against the deployed Worker to confirm Gemini token settle and HITL workflow triggering both function in the live runtime.

The single most important Cloudflare constraint: **bindings are non-inheritable**. Every `vars` key, every `[[workflows]]` entry, and any future binding type (KV, R2, etc.) must be declared again under `env.production` — they will not cascade from the top-level config. The top-level `wrangler.jsonc` is used for local dev / `wrangler dev`. `env.production` is used by `wrangler deploy --env production`.

**Primary recommendation:** Add `[env.production]` to `wrangler.jsonc` with all vars and workflows redeclared (empty string placeholders for secrets), then use `wrangler secret put <KEY> --env production` for every secret value. Run `wrangler deploy --env production` and smoke-test with a `gemini-*` request.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DEPLOY-01 | `wrangler deploy` deploys to Cloudflare Workers with Turso cloud + Workflows binding; all v1.1 features (Gemini, Anthropic streaming, async Python SDK, budget CRUD) work in Workers runtime | `[env.production]` block with workflows + vars redeclared; TURSO_DATABASE_URL/TURSO_AUTH_TOKEN set as secrets pointing to Turso cloud; smoke-test plan covers all three providers |
| DEPLOY-02 | All secrets (`GEMINI_API_KEY` and all existing provider keys) set exclusively via `wrangler secret put` — no secrets in `wrangler.jsonc` | Complete `wrangler secret put --env production` command list for all 9 secret values; current `wrangler.jsonc` already uses empty-string placeholders correctly |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| wrangler | `^4` (installed) | Deploy, manage secrets, generate types | Cloudflare's official CLI — required |
| `@libsql/client/web` | via `@libsql/client ^0.14.0` (installed) | libSQL HTTP client for Workers runtime | `/web` sub-path is mandatory; bare `@libsql/client` fails in Workers |
| Turso | cloud service | SQLite-compatible database accessible from Workers | Only libSQL-compatible database that works via HTTP in Workers runtime |
| Cloudflare Workflows | platform binding (`HITL_WORKFLOW`) | Durable HITL suspend/resume | Already implemented in `workflow.ts` — binding wires it to the deployed Worker |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `.dev.vars` | n/a (local file) | Local dev secret overrides | Local `wrangler dev` only — never committed |
| `worker-configuration.d.ts` | generated | TypeScript Env types from wrangler config | Must regenerate after updating `wrangler.jsonc` with `wrangler types` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `wrangler deploy --env production` | Docker Compose | Already covered by Phase 4 — Workers is the edge alternative |
| Turso cloud | Cloudflare D1 | D1 is Workers-native but requires schema migration tooling change; Turso already works via `@libsql/client/web` |

**No new packages needed.** All required dependencies are already installed.

---

## Architecture Patterns

### Recommended wrangler.jsonc Structure

The current `wrangler.jsonc` has the top-level config for local dev. Phase 7 adds an `env.production` block.

```jsonc
{
  "name": "agentgov-proxy",
  "compatibility_date": "2025-01-01",
  "main": "src/index.ts",

  // Top-level: used by wrangler dev (local)
  "workflows": [
    {
      "name": "agentgov-hitl",
      "binding": "HITL_WORKFLOW",
      "class_name": "HitlWorkflow"
    }
  ],
  "vars": {
    // All empty — actual values come from .dev.vars (local) or wrangler secrets (production)
    "TURSO_DATABASE_URL": "",
    "TURSO_AUTH_TOKEN": "",
    "OPENAI_API_KEY": "",
    "ANTHROPIC_API_KEY": "",
    "GEMINI_API_KEY": "",
    "AGENTGOV_ALERT_WEBHOOK_URL": "",
    "AGENTGOV_ALERT_THRESHOLDS": "0.80,1.00",
    "AGENTGOV_HITL_TTL_SECONDS": "259200",
    "AGENTGOV_HITL_WEBHOOK_URL": "",
    "SLACK_BOT_TOKEN": "",
    "SLACK_CHANNEL_ID": "",
    "SLACK_SIGNING_SECRET": ""
  },

  // Production environment — MUST redeclare all non-inheritable keys
  "env": {
    "production": {
      "name": "agentgov-proxy-production",
      "workflows": [
        {
          "name": "agentgov-hitl-production",
          "binding": "HITL_WORKFLOW",
          "class_name": "HitlWorkflow"
        }
      ],
      // vars declared here — actual secret values set via wrangler secret put --env production
      // Non-secret config with stable defaults inlined here; secrets remain empty string
      "vars": {
        "TURSO_DATABASE_URL": "",
        "TURSO_AUTH_TOKEN": "",
        "OPENAI_API_KEY": "",
        "ANTHROPIC_API_KEY": "",
        "GEMINI_API_KEY": "",
        "AGENTGOV_ALERT_WEBHOOK_URL": "",
        "AGENTGOV_ALERT_THRESHOLDS": "0.80,1.00",
        "AGENTGOV_HITL_TTL_SECONDS": "259200",
        "AGENTGOV_HITL_WEBHOOK_URL": "",
        "SLACK_BOT_TOKEN": "",
        "SLACK_CHANNEL_ID": "",
        "SLACK_SIGNING_SECRET": ""
      }
    }
  }
}
```

**Why the Workflow name differs:** `agentgov-hitl` (top-level) is the dev Workflow; `agentgov-hitl-production` is the production Workflow. They are separate Cloudflare Workflow instances. The binding name `HITL_WORKFLOW` is the same in both — that is what `c.env.HITL_WORKFLOW` refers to in code.

### Secret Management Pattern

Secrets are set with `wrangler secret put` after the `[env.production]` block is in place. The command prompts for the secret value interactively (or can be piped):

```bash
# Interactive (prompts for value)
wrangler secret put TURSO_DATABASE_URL --env production
wrangler secret put TURSO_AUTH_TOKEN --env production
wrangler secret put OPENAI_API_KEY --env production
wrangler secret put ANTHROPIC_API_KEY --env production
wrangler secret put GEMINI_API_KEY --env production
wrangler secret put AGENTGOV_ALERT_WEBHOOK_URL --env production
wrangler secret put AGENTGOV_HITL_WEBHOOK_URL --env production
wrangler secret put SLACK_BOT_TOKEN --env production
wrangler secret put SLACK_SIGNING_SECRET --env production
wrangler secret put SLACK_CHANNEL_ID --env production

# Non-interactive (pipe value) — useful in CI
echo "libsql://my-db.turso.io" | wrangler secret put TURSO_DATABASE_URL --env production
```

`AGENTGOV_ALERT_THRESHOLDS`, `AGENTGOV_HITL_TTL_SECONDS` are **not secrets** — they have safe defaults in `vars` and only need to be set if the operator wants to change them. They do NOT need `wrangler secret put`.

### Deploy Command

```bash
# From packages/proxy directory
wrangler deploy --env production

# Or from monorepo root (if wrangler.jsonc is in packages/proxy)
cd packages/proxy && wrangler deploy --env production
```

### wrangler types Regeneration

After updating `wrangler.jsonc`, run:

```bash
cd packages/proxy && wrangler types
```

This regenerates `worker-configuration.d.ts`, which defines the `Env` interface TypeScript sees. The current file (generated from a pre-Phase-5 state) is missing `GEMINI_API_KEY` from the `Cloudflare.Env` interface — it must be regenerated after the `env.production` block is added.

### Anti-Patterns to Avoid

- **Secret values in `wrangler.jsonc`**: Any non-empty string in `vars` for secret keys is committed to source control. Empty strings are correct placeholders — `wrangler secret put` overrides them at runtime.
- **Relying on top-level binding inheritance**: A `[[workflows]]` block at the top level does NOT carry into `[env.production]`. Every binding must be declared in the env block.
- **Omitting `name` in `env.production`**: If `name` is omitted, the Worker is deployed with the same name as the default config. This is usually fine, but naming it explicitly (`agentgov-proxy-production`) avoids accidental dev/production collision.
- **Running `wrangler secret put` without `--env production`**: Secrets set without `--env` go to the default (dev) Worker, not the production one.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Database HTTP in Workers | Custom HTTP wrapper for SQLite | `@libsql/client/web` (already installed) | Handles libSQL protocol, auth, connection pooling |
| Secret storage | Custom encrypted config | `wrangler secret put` | Cloudflare manages encryption at rest; secrets never appear in dashboard |
| Env type definitions | Manual `interface Env {}` | `wrangler types` (generates `worker-configuration.d.ts`) | Auto-synced to wrangler.jsonc bindings |
| Workflow class export | Custom binding wiring | `export { HitlWorkflow } from './hitl/workflow'` (already in `index.ts`) | Cloudflare requires explicit class export alongside default app export |

**Key insight:** The code is already correct for Workers deployment. Phase 7 is configuration, not code changes. The one code gap is the missing `GEMINI_API_KEY` in `worker-configuration.d.ts` (needs `wrangler types` regeneration).

---

## Common Pitfalls

### Pitfall 1: Bindings are non-inheritable (the critical rule)
**What goes wrong:** Developer adds `[[workflows]]` and `[vars]` at the top level, runs `wrangler deploy --env production`, and the deployed Worker has no `HITL_WORKFLOW` binding (undefined) and all vars are empty strings.
**Why it happens:** Cloudflare explicitly documents that vars, kv_namespaces, workflows, durable_objects, and all other binding types are non-inheritable. The top-level config is only the default environment.
**How to avoid:** Always redeclare every `vars` key and every binding type inside `[env.production]`.
**Warning signs:** `c.env.HITL_WORKFLOW` is undefined at runtime; budget enforcement is disabled (the `!dbUrl || !dbToken` guard in `index.ts` triggers).

### Pitfall 2: worker-configuration.d.ts is stale
**What goes wrong:** `GEMINI_API_KEY` is not in the `Cloudflare.Env` interface (confirmed in current `worker-configuration.d.ts` — it was added in Phase 5 but types not regenerated). TypeScript errors or `c.env.GEMINI_API_KEY` accessing an unknown property.
**Why it happens:** `wrangler types` was not re-run after Phase 5 added `GEMINI_API_KEY` to `wrangler.jsonc`.
**How to avoid:** Run `wrangler types` after any `wrangler.jsonc` change. This is a Wave 0 task.
**Warning signs:** TypeScript sees `GEMINI_API_KEY` as `any` or type error on `c.env.GEMINI_API_KEY` access.

### Pitfall 3: Turso URL must use `libsql://` scheme, not `file:`
**What goes wrong:** TURSO_DATABASE_URL set to a `file:` path (from Docker Compose habits). `@libsql/client/web` only supports the HTTP/libsql protocol — `file:` URLs are `@libsql/client` Node.js only.
**Why it happens:** `createDbClient` in `db/client.ts` uses `@libsql/client/web`, which does not support local file: URLs.
**How to avoid:** TURSO_DATABASE_URL secret must be a Turso cloud URL of form `libsql://<db-name>.<org>.turso.io`.
**Warning signs:** DB connection errors at runtime; "Cannot use file: URL in Workers" type error.

### Pitfall 4: `wrangler secret put` without `--env` targets the wrong Worker
**What goes wrong:** Secrets set to the default Worker (no `--env` flag), but deploy is to `--env production`. Production Worker has empty string for API keys; all LLM requests return 503.
**Why it happens:** Wrangler environments are separate deployed Workers with separate secret stores.
**How to avoid:** Every `wrangler secret put` command must include `--env production`.
**Warning signs:** Worker returns 503 "LLM provider API key not configured" immediately after deploy.

### Pitfall 5: Dashboard SPA is not bundled into the Worker
**What goes wrong:** `packages/dashboard/dist` is a separate Vite build. In Docker Compose, the Node.js server serves the SPA from the filesystem. In Workers, there is no filesystem — static files must either be served via Cloudflare Pages or bundled as Worker assets.
**Why it happens:** The dashboard SPA and the proxy Worker are separate packages. Workers cannot serve arbitrary files from disk.
**How to avoid:** Phase 7 scope is proxy-only. The dashboard SPA is out of scope for the Workers deploy (it works via Docker Compose self-host). If serving the SPA from Workers is desired, that is a future task (Cloudflare Pages or Worker static assets).
**Warning signs:** Not applicable if scope is correctly limited to proxy deploy verification.

### Pitfall 6: `HitlWorkflow` class name must match `class_name` in wrangler.jsonc
**What goes wrong:** `class_name` in `[[workflows]]` does not match the exported class name. Cloudflare silently fails to wire the binding; `c.env.HITL_WORKFLOW.create()` throws at runtime.
**Why it happens:** `class_name` is a string that Cloudflare resolves at deploy time.
**How to avoid:** Verify `class_name: "HitlWorkflow"` in `[env.production]` matches the export `export { HitlWorkflow } from './hitl/workflow'` in `index.ts`. Both are already correct in the codebase.
**Warning signs:** HITL trigger returns 500 "workflow error"; `c.env.HITL_WORKFLOW` does not have a `create` method.

---

## Code Examples

Verified patterns from existing codebase and official Cloudflare docs.

### wrangler.jsonc env.production block (final form)
```jsonc
// Source: Cloudflare Workers Environments docs + existing wrangler.jsonc
"env": {
  "production": {
    "name": "agentgov-proxy-production",
    "workflows": [
      {
        "name": "agentgov-hitl-production",
        "binding": "HITL_WORKFLOW",
        "class_name": "HitlWorkflow"
      }
    ],
    "vars": {
      "TURSO_DATABASE_URL": "",
      "TURSO_AUTH_TOKEN": "",
      "OPENAI_API_KEY": "",
      "ANTHROPIC_API_KEY": "",
      "GEMINI_API_KEY": "",
      "AGENTGOV_ALERT_WEBHOOK_URL": "",
      "AGENTGOV_ALERT_THRESHOLDS": "0.80,1.00",
      "AGENTGOV_HITL_TTL_SECONDS": "259200",
      "AGENTGOV_HITL_WEBHOOK_URL": "",
      "SLACK_BOT_TOKEN": "",
      "SLACK_CHANNEL_ID": "",
      "SLACK_SIGNING_SECRET": ""
    }
  }
}
```

### Smoke test: Gemini request via deployed Worker
```bash
# Source: existing test patterns + Workers curl verification
curl -X POST https://agentgov-proxy-production.<account>.workers.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Agent-Id: smoke-test-agent" \
  -d '{
    "model": "gemini-2.0-flash",
    "messages": [{"role": "user", "content": "Say hi in one word"}]
  }'
# Expected: 200 with chat completion body (or 429 if budget is exhausted)
# NOT expected: 503 (would mean GEMINI_API_KEY not set)
# NOT expected: budget enforcement disabled warning (would mean TURSO secrets not set)
```

### Verify HITL binding is wired
```bash
# A tool_call with an irreversible action should trigger HITL
curl -X POST https://agentgov-proxy-production.<account>.workers.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Agent-Id: smoke-hitl-agent" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {
        "role": "assistant",
        "content": null,
        "tool_calls": [
          {
            "id": "call_1",
            "type": "function",
            "function": {"name": "delete_database", "arguments": "{}"}
          }
        ]
      }
    ]
  }'
# Expected: 202 HITL_PENDING (confirms HITL_WORKFLOW binding is wired)
# NOT expected: 500 (would mean HITL_WORKFLOW binding not declared in [env.production])
```

### Check HITL classifier for irreversible actions
```typescript
// Source: packages/proxy/src/hitl/classifier.ts (verify 'delete_database' is in risk table)
// If not present, use an action that IS in the table (e.g., 'tool_call:send_email')
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `wrangler.toml` | `wrangler.jsonc` | Wrangler 3+ | JSONC supports comments; `wrangler types` command requires `.jsonc` |
| Manual Env interface | `wrangler types` → `worker-configuration.d.ts` | Wrangler 3+ | Auto-generated from config; must re-run after config changes |
| `@libsql/client` (bare) | `@libsql/client/web` | libsql 0.5+ | `/web` sub-path uses HTTP transport compatible with Workers fetch |

**Current codebase status:**
- `@libsql/client/web`: Correct, already in `db/client.ts`
- `HitlWorkflow` export: Correct, already in `index.ts` line 279
- `executionCtx.waitUntil`: Correct, already in `index.ts` and `hitl/routes.ts`
- `GEMINI_API_KEY` in `wrangler.jsonc` vars: Present (added Phase 5), but `worker-configuration.d.ts` NOT regenerated yet

---

## Open Questions

1. **Dashboard SPA deploy target for Workers context**
   - What we know: Dashboard SPA lives in `packages/dashboard/dist`; Vite proxies `/api` to `localhost:8787` in dev; Docker Compose serves both from the same Node.js process
   - What's unclear: Whether Phase 7 scope includes serving the SPA from Workers (via Cloudflare Pages or Worker static assets), or whether the SPA is considered Docker-Compose-only
   - Recommendation: Treat as out of scope for Phase 7. The phase success criteria (DEPLOY-01, DEPLOY-02) only require the proxy Worker to function — no mention of dashboard. State.md "Decide dashboard deploy target" is a deferred todo. Do NOT block DEPLOY-01/DEPLOY-02 on this.

2. **Which Turso database to use for production**
   - What we know: Turso requires a cloud account; the schema migration (`drizzle-kit migrate`) must be run against the cloud DB before first deploy; `@libsql/client/web` requires a `libsql://` URL
   - What's unclear: Whether a separate Turso DB exists for production, or if the smoke test can reuse an existing DB
   - Recommendation: Plan Wave 0 to include Turso cloud DB creation and migration step. The TURSO_DATABASE_URL secret should point to the cloud DB.

3. **HITL risk table — which action names are classified as irreversible/external**
   - What we know: `hitl/classifier.ts` has a static risk table; the smoke test needs an action name from that table to trigger HITL
   - What's unclear: The exact action names in the risk table without reading `classifier.ts`
   - Recommendation: Read `classifier.ts` during planning to identify a reliable test action name for the HITL smoke test.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^2 + @cloudflare/vitest-pool-workers ^0.12.21 |
| Config file | `packages/proxy/vitest.config.ts` (Workers pool) + `vitest.config.node.ts` (Node.js) |
| Quick run command | `cd packages/proxy && vitest run` |
| Full suite command | `cd packages/proxy && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEPLOY-01 | Proxy deploys and accepts gemini-* requests with accurate token settle | smoke (manual) | N/A — live Workers deploy required | ✅ curl commands documented above |
| DEPLOY-01 | Workers runtime: HITL_WORKFLOW binding wired | smoke (manual) | N/A — live Workers deploy required | ✅ curl commands documented above |
| DEPLOY-01 | `worker-configuration.d.ts` includes GEMINI_API_KEY | unit/build | `cd packages/proxy && wrangler types && tsc --noEmit` | ❌ Wave 0: re-run `wrangler types` |
| DEPLOY-02 | No secrets in wrangler.jsonc (all values are empty string) | static analysis | `grep -v '"": ""' packages/proxy/wrangler.jsonc` | ✅ (current config already correct) |

### Sampling Rate
- **Per task commit:** `cd packages/proxy && vitest run` (Workers pool — 3 tests in index.test.ts + forward.test.ts)
- **Per wave merge:** `cd packages/proxy && npm test` (full suite: Workers + Node pools)
- **Phase gate:** `wrangler deploy --env production` succeeds + smoke test curl commands return expected status codes

### Wave 0 Gaps
- [ ] Run `cd packages/proxy && wrangler types` — regenerates `worker-configuration.d.ts` to include `GEMINI_API_KEY` in `Cloudflare.Env`
- [ ] Create Turso cloud database (if not exists) and run `drizzle-kit migrate` against it
- [ ] Confirm Turso cloud DB URL format (`libsql://<name>.<org>.turso.io`) is available before setting secrets

*(No new test files needed — existing Workers pool tests cover the runtime. Smoke tests are manual curl commands.)*

---

## Sources

### Primary (HIGH confidence)
- Cloudflare Workers Environments docs (fetched) — non-inheritable bindings confirmed: vars, workflows, kv_namespaces, durable_objects must be redeclared in each env
- Cloudflare Workers Configuration docs (fetched) — `[env.production]` JSON syntax, non-inheritable keys list
- `packages/proxy/wrangler.jsonc` (read) — current config structure confirmed
- `packages/proxy/src/index.ts` (read) — HitlWorkflow export confirmed, executionCtx.waitUntil pattern confirmed
- `packages/proxy/src/db/client.ts` (read) — `@libsql/client/web` confirmed
- `packages/proxy/worker-configuration.d.ts` (read, first 80 lines) — GEMINI_API_KEY confirmed missing from Cloudflare.Env interface

### Secondary (MEDIUM confidence)
- WebSearch: `wrangler secret put --env production` syntax — confirmed `--env` flag is supported
- WebSearch: `wrangler deploy --env` pattern — confirmed standard CI/CD usage

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already installed, codebase already Workers-ready
- Architecture: HIGH — wrangler.jsonc env.production pattern is official Cloudflare docs
- Pitfalls: HIGH — non-inheritance rule from official docs; GEMINI_API_KEY gap confirmed by reading worker-configuration.d.ts

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (wrangler config API is stable; 30-day estimate)
