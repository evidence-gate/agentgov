# Stack Research

**Domain:** Agent Governance Platform (proxy-layer cost enforcement, HITL, audit logging)
**Researched:** 2026-03-13
**Confidence:** MEDIUM-HIGH (core stack verified via official docs; version numbers from npm/GitHub releases)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Hono | 4.12.7 | HTTP framework for Workers + SDK API server | The only serious edge-native TS web framework. Zero-overhead middleware chain maps directly onto the proxy intercept pattern. Runs identically on Workers and Node.js — critical for Docker Compose self-host variant. First-class Cloudflare Workers support, officially documented. |
| Cloudflare Workers | Runtime (Wrangler 4.x) | Cloud compute + routing | Runs at 300+ PoPs with <1ms cold starts. Durable Objects provide the atomic counter primitive required for crash-safe Hold/Settle budget enforcement. No other serverless platform gives both edge routing and strong consistency in the same runtime. |
| Cloudflare Durable Objects | — (Workers runtime) | Per-agent budget ledger (atomic state) | A single DO per budget scope guarantees serialized read-modify-write without distributed locking. Atomic transactions via `transaction()` (not `blockConcurrencyWhile()`). The canonical primitive for budget enforcement at edge. |
| Cloudflare Workflows | — (Workers runtime) | HITL approval state machine with `waitForEvent` | GA'd April 2025. `step.waitForEvent()` allows a Workflow to pause and wait for human approval, then resume. Eliminates the need for a custom state machine for the approval hold. Natively durable — survives Worker restarts. |
| Cloudflare Queues | — (Workers runtime) | Async delivery of approval requests + audit events | Decouples the hot proxy path from slow Slack/webhook delivery. Consumer Workers write to audit log without blocking the LLM call. |
| Cloudflare R2 | — (Workers runtime) | Immutable audit log storage | Append-only object writes (one object per audit event, UUID key) provide de-facto immutability without WORM locks. Free egress within Cloudflare network. EU AI Act Article 14 compliance: 18-month retention via lifecycle rules. |
| Turso (libSQL) | @libsql/client 0.x | Operational database (budgets, agents, policies) | SQLite-compatible, edge-replicated, free tier is sufficient for months 1-6. Pairs with Drizzle ORM natively. Import as `@libsql/client/web` (not `@libsql/client`) in Workers — the web-specific import is mandatory. |
| Drizzle ORM | 0.45.x + drizzle-kit | Type-safe SQL for Turso / edge SQLite | Lightest ORM with Workers compatibility. Schema-as-code, migrations via `drizzle-kit generate` + `drizzle-kit migrate`. Does not require a connection pool (critical for edge). Zod integration built-in for validation. |
| TypeScript | 5.x | Language | Workers runtime natively generates types via `wrangler types`. Full type coverage for SDK distribution — the API contract is enforced at compile time, not at runtime. |
| Zod | 4.3.x | Request/config validation + SDK schema | Zod v4 is 14x faster than v3 for string parsing, ships as `@zod/mini` (1.9 KB) for SDK. Use Zod schemas as the single source of truth for both SDK types and API validation. |
| Wrangler | 4.x | Deploy, local dev, type generation | Wrangler 4 generates runtime types directly from workerd — do not use `@cloudflare/workers-types` package (stale). `wrangler.jsonc` is now recommended over `wrangler.toml`. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tsup | latest (esbuild-powered) | SDK bundle: dual CJS+ESM output | For npm SDK package builds. Produces `.js` (ESM) + `.cjs` (CJS) + `.d.ts` in one command. Zero config for straightforward libs. Use `tsup.config.ts` for custom entrypoints. |
| @hono/zod-validator | latest | Hono middleware for request validation | Validates incoming SDK registration payloads and dashboard API bodies against Zod schemas. Eliminates manual `safeParse` boilerplate. |
| openai (npm) | 4.x | TypeScript SDK for OpenAI — used as proxy target model | The TypeScript SDK accepts a custom `fetch` parameter. Pass a governance-intercepting fetch to wrap the client transparently. `agentgov.wrap(client)` works by substituting the fetch transport layer. |
| @anthropic-ai/sdk | 0.x latest | TypeScript SDK for Anthropic — same proxy mechanism | Same custom fetch pattern as OpenAI SDK. `new Anthropic({ fetch: agentgovFetch })` is the integration point. |
| @ai-sdk/openai-compatible | latest | Vercel AI SDK compatibility layer | If users use Vercel AI SDK (`generateText`, etc.), this package provides `createOpenAICompatible` which accepts a `baseURL` pointing to the agentgov proxy endpoint — no SDK-level patching required. |
| react + @vitejs/plugin-react | React 19, Vite 6 | Dashboard SPA | Cloudflare Vite plugin (GA April 2025) runs Worker code inside Vite dev server via workerd. React + Vite + Cloudflare Pages is the supported path. Keep dashboard minimal: cost summary, budget gauges, approval queue. |
| @cloudflare/vite-plugin | 1.x | Wires React/Vite to Workers runtime in dev | Required for `vite dev` to serve Workers + React SPA from a single process. Do not use without this plugin — local dev otherwise diverges from production. |
| workers-slack | latest | Cloudflare Workers-native Slack API client | Designed for Workers environment (no Node.js dependencies). Use for Slack HITL approval message delivery from Queue consumer. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Wrangler 4 | Dev server, deploy, secrets, type gen | `wrangler dev --remote` tests against live DO/Queues. `wrangler types` regenerates `worker-configuration.d.ts` after every `wrangler.jsonc` change. |
| Vitest 4.x | Unit + integration tests | Cloudflare Workers support via `@cloudflare/vitest-pool-workers`. Run tests inside the actual workerd runtime — critical for catching Workers-incompatible Node.js APIs before deploy. |
| drizzle-kit | Paired with drizzle-orm version | Schema migrations | `drizzle-kit generate` creates SQL migrations. For Turso: `drizzle-kit migrate` applies via libSQL HTTP API. Check in migration files — do not auto-apply in production boot. |
| tsup | Latest | SDK package build | Dual CJS+ESM. `--dts` flag emits declarations. Use `--external openai --external @anthropic-ai/sdk` to keep those as peer dependencies. |
| Docker Compose | 2.x | Self-host orchestration | The `docker-compose.yml` variant runs: (1) Hono proxy server via Node.js adapter, (2) Turso-compatible SQLite via embedded libSQL, (3) optional Redis for queue. Hono's Node.js adapter (`@hono/node-server`) is the migration path from Workers to Docker. |
| @hono/node-server | latest | Node.js adapter for Hono | Enables the same Hono app to run on Node.js for Docker Compose self-host. No code changes required — the proxy logic is runtime-agnostic. This is the self-host story. |

---

## Installation

```bash
# Core Workers app (cloud variant)
npm create cloudflare@latest agentgov-worker -- --type worker

# Framework + validation
npm install hono zod @hono/zod-validator

# Database
npm install drizzle-orm @libsql/client
npm install -D drizzle-kit

# Queue + DO are Workers runtime built-ins, no npm install needed

# SDK package (separate workspace)
npm install openai @anthropic-ai/sdk @ai-sdk/openai-compatible

# Dashboard
npm install react react-dom
npm install -D @vitejs/plugin-react @cloudflare/vite-plugin vite

# Self-host adapter
npm install @hono/node-server

# Dev dependencies
npm install -D vitest @cloudflare/vitest-pool-workers wrangler tsup typescript
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Cloudflare Durable Objects | Redis / Valkey | Only for self-host Docker variant where DO is unavailable. Use Redis MULTI/EXEC for atomic hold-settle. |
| Cloudflare Workflows (waitForEvent) | Custom state machine in Turso | If HITL approval latency > 24h is expected (Workflows has a step timeout). For very long-running approvals, store pending state in Turso and poll. |
| Cloudflare R2 (append-only objects) | Cloudflare D1 (append-only table) | D1 is fine if volume is low (<1M audit events/month). R2 has no row limits and cheaper at high volume. For MVP, D1 is acceptable. |
| Turso (libSQL edge-replicated) | Cloudflare D1 | D1 is fine if you commit to Workers-only (no self-host). Turso works in both Workers and Node.js (Docker Compose), making it the better choice for dual-target. |
| Hono | itty-router | itty-router is lighter but has no middleware ecosystem. Hono's middleware chain is the backbone of the proxy intercept layer. |
| tsup | tsc / tshy | tsup is faster and single-command. Use tshy if you want a purely tsc-based pipeline without esbuild. |
| Vitest + @cloudflare/vitest-pool-workers | Jest | Jest does not run in the Workers runtime. Vitest pool workers is the only way to test DO/Queue behavior in-process. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| LiteLLM (as a dependency) | Python-native, 100MB+ dependency tree, not edge-compatible. Competing product in the same space (LLM gateway) — creates positioning confusion. | Custom fetch-intercepting transport in the agentgov SDK |
| Cloudflare AI Gateway | Owned by Cloudflare — they can break or replicate your feature at will. Overlapping functionality (cost tracking, rate limiting). Creates a dangerous dependency for a governance platform. | Build the proxy layer in Workers directly |
| Prisma ORM | Prisma requires a Node.js-compatible environment and a connection pool via Prisma Accelerate for edge. Adds significant cold start overhead. | Drizzle ORM — designed for edge, zero binary dependencies |
| Fastify / Express | Not edge-compatible. For Docker Compose self-host, Hono + `@hono/node-server` runs identically to Workers. Maintaining two frameworks doubles the surface area. | Hono with `@hono/node-server` adapter |
| @cloudflare/workers-types (npm package) | Stale — types are generated from an older workerd snapshot. Will drift from what your Worker actually supports. | `wrangler types` — generates from your exact compatibility date |
| Jest | No Workers runtime support. Tests will pass locally but mask edge-incompatible APIs (no `process`, no `fs`, etc.). | Vitest + `@cloudflare/vitest-pool-workers` |
| Zod v3 | v4 is 14x faster, half the bundle size. No migration friction since you're greenfield. | Zod 4.3.x |

---

## Stack Patterns by Variant

**Cloud variant (Cloudflare Workers):**
- Hono routes on Workers
- Budget ledger = Durable Object per agent scope
- HITL state = Cloudflare Workflow with `waitForEvent`
- Async delivery = Cloudflare Queues
- Audit log = R2 (append-only objects)
- Operational DB = Turso (HTTP endpoint)
- Dashboard = React + Vite + Cloudflare Pages (Workers Assets)

**Self-host variant (Docker Compose):**
- Same Hono app, run via `@hono/node-server`
- Budget ledger = SQLite WAL with row-level locking (via libSQL embedded)
- HITL state = Turso state table polled by queue worker
- Async delivery = BullMQ (Redis-backed) or in-process queue
- Audit log = append-only SQLite table OR local filesystem NDJSON
- Operational DB = same Turso/libSQL (embedded mode)
- Dashboard = same React/Vite SPA, served statically

**SDK distribution (npm + PyPI):**
- TypeScript SDK: intercepts via custom `fetch` param in openai/anthropic clients
- Python SDK: intercepts via custom `httpx.Client` passed to openai/anthropic clients
- Both SDKs expose `agentgov.wrap(client)` which returns a governance-wrapped client
- No network hop for SDK-level enforcement — budget check calls agentgov proxy endpoint
- Proxy endpoint is the authoritative decision point

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| hono@4.12.x | Wrangler 4.x | Confirmed. Use `@hono/node-server` for Docker. |
| drizzle-orm@0.45.x | @libsql/client@0.x | Confirmed. Use `import '@libsql/client/web'` (not `/http`) in Workers. |
| @cloudflare/vitest-pool-workers | Vitest 4.x | Compatible — check `@cloudflare/vitest-pool-workers` release notes before upgrading Vitest major. |
| Zod 4.x | Hono's @hono/zod-validator | Verify @hono/zod-validator supports Zod v4 at install time — as of March 2026, check latest release. |
| Cloudflare Workflows | Wrangler 4.x | Workflows is GA (April 2025). Requires `wrangler.jsonc` workflow binding declaration. |

---

## Sources

- [hono/releases (GitHub)](https://github.com/honojs/hono/releases) — confirmed v4.12.7 (March 10, 2026). HIGH confidence.
- [Cloudflare Workers docs: Hono](https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/) — official integration guide. HIGH confidence.
- [Drizzle ORM: Turso Cloud](https://orm.drizzle.team/docs/connect-turso) — confirmed drizzle-orm + @libsql/client integration. HIGH confidence.
- [Cloudflare Durable Objects: Rules](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/) — `transaction()` over `blockConcurrencyWhile()`. HIGH confidence.
- [Cloudflare Workflows GA](https://developers.cloudflare.com/changelog/post/2025-04-07-workflows-ga/) — GA April 2025, `waitForEvent` API. HIGH confidence.
- [Cloudflare Workflows: Human-in-the-Loop](https://developers.cloudflare.com/workflows/examples/wait-for-event/) — official HITL example. HIGH confidence.
- [Cloudflare Agents: Human-in-the-Loop](https://developers.cloudflare.com/agents/concepts/human-in-the-loop/) — official patterns. HIGH confidence.
- [Cloudflare Vite Plugin GA](https://developers.cloudflare.com/changelog/post/2025-04-08-vite-plugin/) — GA April 2025. HIGH confidence.
- [Zod v4 release](https://zod.dev/v4) — v4.3.x, 14x faster, @zod/mini 1.9 KB. HIGH confidence.
- [Wrangler npm](https://www.npmjs.com/package/wrangler) — Wrangler 4.x confirmed. MEDIUM confidence (npm 403 on fetch, version from search result).
- [Anthropic SDK TypeScript](https://github.com/anthropics/anthropic-sdk-typescript) — custom fetch parameter for proxy. HIGH confidence.
- [AI SDK: OpenAI Custom Providers](https://ai-sdk.dev/providers/openai-compatible-providers/custom-providers) — createOpenAICompatible with baseURL. HIGH confidence.
- WebSearch: tsup dual CJS+ESM pattern — MEDIUM confidence (multiple consistent sources).
- WebSearch: @hono/node-server Docker Compose pattern — MEDIUM confidence (official Hono docs referenced).

---
*Stack research for: Agent Governance Platform (agentgov)*
*Researched: 2026-03-13*
