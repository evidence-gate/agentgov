# Phase 4: Dashboard + Python SDK + Self-Host — Research

**Researched:** 2026-03-15
**Domain:** Python SDK (httpx transport), Docker Compose self-host (embedded libSQL / @hono/node-server), React SPA dashboard
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Python SDK mechanism: httpx custom transport to rewrite base_url, injecting X-Agent-Id header
- Python exceptions: `BudgetExceeded`, `HitlPending`, `AgentError` — same field structure as TypeScript SDK
- Package name: `agentgov` on PyPI; `pyproject.toml` with hatchling build
- Dashboard: React 19 + Vite 6 SPA, read-only, three pages: costs.tsx / approvals.tsx / audit.tsx
- Dashboard data: Turso (cloud) or embedded libSQL (self-host) — SELECT-only queries from `budget_ledger`, `holds`, `audit_log`, `hitl_queue`
- Self-host proxy entry point: `@hono/node-server` wrapping the same Hono `app` object from `packages/proxy`
- Self-host database: embedded libSQL (`file:agentgov.db`) — no Turso cloud dependency
- Parallelization plan: 04-01 Python SDK → 04-02 Docker Compose self-host → 04-03 Dashboard SPA

### Claude's Discretion
- Python package directory layout (src/agentgov/ vs flat agentgov/)
- React data-fetching library choice (TanStack Query vs raw fetch + useInterval)
- Dashboard polling interval
- Docker image base (node:20-alpine vs node:22-alpine)
- Static file serving strategy (Hono serveStatic vs dedicated nginx container)
- Whether drizzle migrate runs on container startup or via init container

### Deferred Ideas (OUT OF SCOPE)
- Python async client support (AsyncOpenAI, AsyncAnthropic) — deferred to later plan
- SSE/WebSocket for dashboard real-time push — REQUIREMENTS.md explicitly out of scope
- Python HITL/Error exception subclasses (BudgetExceeded only for Phase 4 MVP — HITL/Error deferred)
- Pricing sync CLI in Python SDK
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SDK-02 | Python SDK with equivalent `agentgov.wrap(client)` API | httpx custom transport + base_url override pattern is well-documented; both OpenAI and Anthropic Python SDKs accept `base_url` and `http_client` parameters |
| SDK-04 | Docker Compose self-host deployment (5-minute setup) | `@hono/node-server` wraps the existing Hono app unchanged; embedded libSQL with `file:` URL needs `@libsql/client` (not `/web` subpath) in Node.js; Drizzle migrate runs on startup |
| SDK-05 | Basic dashboard — budget status, session cost, enforcement events, approval queue — live updates without page reload | React 19 + Vite 6 + TanStack Query `refetchInterval` is the standard pattern; dashboard served as static build from Hono `serveStatic` or separate nginx; data from direct DB read-only queries via a new `/api/v1/dashboard/*` endpoint on the proxy |
</phase_requirements>

---

## Summary

Phase 4 has three independent work streams: (1) a Python SDK package that replicates the TypeScript SDK's `wrap()` behavior using httpx custom transports, (2) a Docker Compose stack that runs the existing Hono proxy with embedded SQLite instead of Turso, and (3) a React SPA dashboard that displays live governance state via polling.

All three are well-supported by existing libraries. The main engineering risks are the DB client path split (`@libsql/client/web` for Cloudflare Workers vs `@libsql/client` for Node.js), running Drizzle migrations on container startup, and making the dashboard's data API read-only enough that it can be served from the same proxy container without adding write surface.

The Python SDK requires no new proxy protocol — it is purely a thin wrapper that sets `base_url` and injects `X-Agent-Id` on every request. Both the OpenAI and Anthropic Python SDKs accept `base_url` and `http_client` parameters, so `wrap()` can cover both in a single function.

**Primary recommendation:** Use httpx BaseTransport subclass for Python SDK; use `@libsql/client` (not `/web`) for the Docker Node.js entry point; serve the dashboard SPA as static files from the proxy container via `@hono/node-server/serve-static`; use TanStack Query `refetchInterval` for live polling.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| httpx | 0.28.1 | Python HTTP client underlying OpenAI + Anthropic SDKs | Both SDKs are httpx-based; custom transport is the official extension point |
| openai (Python) | latest | Python client being wrapped | SDK-02 target; accepts `base_url` and `http_client` parameters |
| anthropic (Python) | latest | Python client being wrapped | SDK-02 target; accepts `base_url` (str or httpx.URL) and `http_client` (httpx.Client) |
| hatchling | latest | pyproject.toml build backend | Modern Python packaging standard; anthropic SDK itself uses it |
| @hono/node-server | ^1.x | Serve Hono app on Node.js | Same Hono app works on Workers and Node.js with only the entry point different |
| @libsql/client | ^0.14.0 | Local file SQLite for Docker | `file:` URL mode works in Node.js; `@libsql/client/web` does NOT support file URLs |
| drizzle-orm | ^0.45.1 | ORM (same as proxy package) | Already in use; migrate() works with local libSQL client |
| React | 19 | Dashboard SPA | Locked in CONTEXT.md |
| Vite | 6 | Dashboard build tool | Locked in CONTEXT.md |
| @tanstack/react-query | ^5 | Dashboard data fetching + polling | `refetchInterval` is the standard no-WebSocket live-update pattern |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pytest | latest | Python SDK tests | Unit tests for wrap(), BudgetExceeded, header injection |
| pytest-httpx | latest | Mock httpx requests in tests | Required for transport-level unit tests without real network |
| @hono/node-server/serve-static | (bundled) | Serve Vite build as static files | Dashboard delivery from same container |
| recharts or no chart library | N/A | Dashboard visualizations | Keep simple — text tables are fine for MVP |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TanStack Query | raw fetch + useInterval | TanStack adds stale-while-revalidate, error retry, loading states; worth the dep |
| Serve SPA from proxy container | Separate nginx container | Extra container adds complexity; serveStatic from Hono is sufficient for MVP |
| hatchling | setuptools | hatchling is what anthropic/openai use; no configuration needed for simple package |
| drizzle migrate() on startup | Manual SQL file execution | migrate() is already used in the proxy; consistent pattern |

**Installation:**

Python SDK (local dev):
```bash
pip install httpx openai anthropic
```

Dashboard:
```bash
pnpm add @tanstack/react-query react react-dom
pnpm add -D vite @vitejs/plugin-react typescript
```

Docker/Node.js proxy:
```bash
pnpm add @hono/node-server
# @libsql/client already present — confirm bare import (not /web) works in Node.js
```

---

## Architecture Patterns

### Recommended Project Structure

```
packages/
├── proxy/
│   ├── src/
│   │   ├── index.ts              # Cloudflare Workers entry (existing)
│   │   └── index.node.ts         # NEW: Node.js entry point using @hono/node-server
│   └── Dockerfile                # NEW
├── sdk-typescript/               # Existing
├── sdk-python/                   # NEW
│   ├── pyproject.toml
│   ├── src/
│   │   └── agentgov/
│   │       ├── __init__.py       # exports wrap, BudgetExceeded, HitlPending, AgentError
│   │       ├── _transport.py     # AgentgovTransport(BaseTransport)
│   │       └── _exceptions.py    # BudgetExceeded, HitlPending, AgentError
│   └── tests/
│       └── test_wrap.py
└── dashboard/                    # NEW
    ├── vite.config.ts
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx
    │   ├── pages/
    │   │   ├── costs.tsx         # Budget summary from /api/v1/dashboard/budgets
    │   │   ├── approvals.tsx     # HITL queue from /api/v1/dashboard/approvals
    │   │   └── audit.tsx         # Audit log from /api/v1/dashboard/audit
    │   └── hooks/
    │       └── useDashboard.ts   # TanStack Query hooks with refetchInterval
    └── dist/                     # Vite build output (served by proxy container)

docker/
├── compose.yml                   # NEW: proxy + (optional dashboard nginx)
└── .env.example                  # Template for OPENAI_API_KEY etc.
```

### Pattern 1: Python httpx Transport Override

**What:** Subclass `httpx.BaseTransport`, intercept every request, rewrite URL to proxy base, inject `X-Agent-Id` header, inspect response for governance error codes.

**When to use:** This is the ONLY supported pattern — both OpenAI and Anthropic SDKs use httpx internally and accept `http_client=httpx.Client(transport=...)`.

**Example:**
```python
# Source: https://www.python-httpx.org/advanced/transports/
import httpx
from agentgov._exceptions import BudgetExceeded, HitlPending, AgentError

class AgentgovTransport(httpx.BaseTransport):
    def __init__(self, proxy_url: str, agent_id: str, **kwargs):
        self._proxy_base = proxy_url.rstrip('/')
        self._agent_id = agent_id
        self._wrapped = httpx.HTTPTransport(**kwargs)

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        # Rewrite URL: strip original host, prepend proxy base
        proxied_url = httpx.URL(
            self._proxy_base + str(request.url.copy_with(scheme='', host='', port=None))
        )
        request = request.copy_with(
            url=proxied_url,
            headers=dict(request.headers) | {'X-Agent-Id': self._agent_id},
        )
        response = self._wrapped.handle_request(request)
        # Inspect response for governance error codes
        if response.status_code == 429:
            body = response.json()
            if body.get('error', {}).get('code') == 'BUDGET_EXCEEDED':
                raise BudgetExceeded(body['error'])
        if response.status_code == 202:
            body = response.json()
            if body.get('error', {}).get('code') == 'HITL_PENDING':
                raise HitlPending(body['error'])
        if response.status_code == 502:
            body = response.json()
            if body.get('error', {}).get('code') == 'AGENT_ERROR':
                raise AgentError(body['error'])
        return response

    def close(self):
        self._wrapped.close()


def wrap(client, *, proxy_url: str, agent_id: str):
    """Wrap an OpenAI or Anthropic Python client to route through agentgov proxy."""
    transport = AgentgovTransport(proxy_url=proxy_url, agent_id=agent_id)
    http_client = httpx.Client(transport=transport)
    # Both OpenAI and Anthropic SDKs accept base_url + http_client
    client._client = http_client   # internal httpx.Client replacement
    # Alternative: reconstruct client with base_url= and http_client=
    return client
```

**Note on wrap() implementation:** The cleanest approach is to pass `base_url` and `http_client` at construction time (not post-patching). The Python `wrap()` should document that users should pass options at construction:

```python
# Recommended pattern — matches TypeScript SDK
from openai import OpenAI
import agentgov

client = agentgov.wrap(
    OpenAI(api_key=os.environ["OPENAI_API_KEY"]),
    proxy_url="http://localhost:8787",
    agent_id="my-agent"
)
```

Since OpenAI and Anthropic SDKs both accept `http_client=httpx.Client(transport=...)`, this is clean. The internal `._client` mutation approach is fragile — prefer recreating via `OpenAI(base_url=..., http_client=...)` if the SDK version allows.

### Pattern 2: Node.js Entry Point for Docker

**What:** Add `packages/proxy/src/index.node.ts` that imports the same Hono `app` and calls `serve()` from `@hono/node-server`. The existing `index.ts` remains unchanged for Cloudflare Workers.

**When to use:** This is the Docker container entry point only.

**Example:**
```typescript
// Source: https://hono.dev/docs/getting-started/nodejs
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import app from './index';   // reuse the same Hono app

// Serve dashboard SPA static files (built by `pnpm --filter @agentgov/dashboard build`)
app.use('/*', serveStatic({ root: './dashboard-dist' }));
// SPA fallback: serve index.html for unmatched routes
app.use('/*', serveStatic({ path: './dashboard-dist/index.html' }));

serve({ fetch: app.fetch, port: parseInt(process.env.PORT ?? '8787') });
```

**CRITICAL difference from Cloudflare Workers:** The Workers entry must NOT call `serve()`. The Node.js entry must NOT export default. These are two separate files sharing the same `app` object.

### Pattern 3: Embedded libSQL for Docker

**What:** Use `@libsql/client` (bare import, NOT `@libsql/client/web`) with `url: 'file:/data/agentgov.db'` for Docker volume persistence.

**When to use:** Self-host only. Production cloud deployment continues to use `@libsql/client/web` + Turso URL.

**Example:**
```typescript
// Node.js Docker entry — NOT for Cloudflare Workers
import { createClient } from '@libsql/client';   // bare import, NOT /web
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import * as schema from './db/schema';

export async function createDockerDbClient() {
  const url = process.env.DATABASE_URL ?? 'file:/data/agentgov.db';
  const client = createClient({ url });   // no authToken for local file
  const db = drizzle(client, { schema });
  // Run migrations on startup — idempotent
  await migrate(db, { migrationsFolder: './migrations' });
  return db;
}
```

**CRITICAL:** `@libsql/client/web` does NOT support `file:` URLs. This is a platform split: use `/web` for Cloudflare Workers, use bare `@libsql/client` for Node.js/Docker.

### Pattern 4: Dashboard Data API Endpoints

**What:** Add `/api/v1/dashboard/*` read-only GET endpoints to the Hono app (or a separate Express/Hono dashboard server) that query the DB and return JSON.

**When to use:** Dashboard needs a data source. Since the proxy already has DB access, extend it rather than adding a new service.

**Example:**
```typescript
// New file: packages/proxy/src/dashboard/routes.ts
import { Hono } from 'hono';

export const dashboardRoutes = new Hono<{ Bindings: Env }>();

dashboardRoutes.get('/api/v1/dashboard/budgets', async (c) => {
  const db = getDb(c);  // shared DB client
  const rows = await db.select().from(budgetLedger);
  return c.json(rows);
});

dashboardRoutes.get('/api/v1/dashboard/audit', async (c) => {
  const db = getDb(c);
  const limit = parseInt(c.req.query('limit') ?? '100');
  const rows = await db.select().from(auditLog).orderBy(desc(auditLog.seq)).limit(limit);
  return c.json(rows);
});

dashboardRoutes.get('/api/v1/dashboard/approvals', async (c) => {
  const db = getDb(c);
  const rows = await db.select().from(hitlQueue).where(eq(hitlQueue.status, 'pending'));
  return c.json(rows);
});
```

**Note:** These endpoints are SELECT-only. The dashboard has no write path — this is a hard design constraint from CONTEXT.md.

### Pattern 5: TanStack Query Polling

**What:** Use `useQuery` with `refetchInterval` for no-WebSocket live updates. No SSE required.

**Example:**
```typescript
// Source: https://tanstack.com/query/latest/docs/framework/react/examples/auto-refetching
import { useQuery } from '@tanstack/react-query';

function useBudgets() {
  return useQuery({
    queryKey: ['budgets'],
    queryFn: () => fetch('/api/v1/dashboard/budgets').then(r => r.json()),
    refetchInterval: 5000,   // poll every 5 seconds
    staleTime: 3000,
  });
}
```

### Anti-Patterns to Avoid

- **Using `@libsql/client/web` in Docker:** Will throw at runtime — `/web` subpath requires Cloudflare Workers runtime. Use bare `@libsql/client` in Node.js.
- **Mutating `client._client` post-construction in Python SDK:** Private attribute, breaks on SDK version changes. Prefer passing `http_client=` at construction time.
- **Adding write endpoints to the dashboard routes:** The dashboard is read-only by design. No `POST`/`PUT`/`DELETE` on dashboard routes.
- **Importing Cloudflare Workflows types in the Node.js entry:** `c.env.HITL_WORKFLOW` is Cloudflare-only. The Node.js entry must stub or skip HITL workflow creation (HITL requires Phase 2 + Cloudflare).
- **Building the dashboard into `packages/proxy/src/`:** Keep Vite build output outside the proxy `src/` tree to prevent TypeScript from trying to compile it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP transport interception in Python | Custom urllib/requests monkey-patch | httpx.BaseTransport subclass | httpx is the SDK dependency; direct transport access is the official API |
| Python package distribution | setup.py / setup.cfg | pyproject.toml + hatchling | PEP 517/518 standard; anthropic and openai both use it |
| SQLite migration runner | Custom SQL file executor | drizzle-orm migrate() | Already used in proxy; handles tracking applied migrations |
| Dashboard state management | Redux / Zustand | TanStack Query | Query is a server-state library; no client state needed for read-only dashboard |
| Polling logic | setInterval + manual refetch | TanStack Query refetchInterval | Handles stale data, background refetch, error retry |
| HTTP mocking in Python tests | Real network calls | pytest-httpx | Intercepts at transport level, compatible with custom transports |

**Key insight:** The Python SDK is pure interception — no new protocol, no new server endpoints required. The transport pattern means agentgov works transparently with any httpx-based SDK without modifying the SDK itself.

---

## Common Pitfalls

### Pitfall 1: libSQL Client Path in Node.js Context

**What goes wrong:** `createClient` from `@libsql/client/web` throws when given a `file:` URL in Node.js. The Workers proxy uses `/web` — that same import in a Node.js Docker container will silently fail or throw at runtime.

**Why it happens:** `@libsql/client/web` exports only the HTTP/WebSocket remote client, not the native Node.js SQLite binding. Local file access requires native SQLite bindings that only `@libsql/client` (bare) or `@libsql/client/node` provides.

**How to avoid:** The Docker entry point (`index.node.ts`) must import from `@libsql/client` (bare). Never share the same `createDbClient()` factory between Workers and Node.js builds — create `db/client.node.ts` separately.

**Warning signs:** `TypeError: not enough arguments at new Database` or `file: URL not supported` at container startup.

### Pitfall 2: Cloudflare Workflow Bindings in Node.js

**What goes wrong:** `c.env.HITL_WORKFLOW.create(...)` exists only on Cloudflare Workers — in Node.js, `c.env` won't have a `HITL_WORKFLOW` binding, causing a TypeError.

**Why it happens:** Cloudflare Workflows is a platform-specific feature. The Node.js entry point shares the same `index.ts` Hono app logic.

**How to avoid:** Add a guard in `index.ts` before Workflow creation: `if (!c.env?.HITL_WORKFLOW) { return c.json({ error: 'HITL not available in self-host mode' }, 501); }`. This keeps the same file working on both platforms.

**Warning signs:** `TypeError: c.env.HITL_WORKFLOW is not a function` in Docker logs.

### Pitfall 3: Python SDK `wrap()` with Async Clients

**What goes wrong:** `AsyncOpenAI` and `AsyncAnthropic` use `httpx.AsyncClient` internally. A `httpx.BaseTransport` (sync) cannot be passed to an async client — it requires `httpx.AsyncBaseTransport` and `handle_async_request()`.

**Why it happens:** httpx has separate sync/async transport hierarchies.

**How to avoid:** Phase 4 MVP supports sync clients only (`OpenAI`, `Anthropic`). Async support is deferred per CONTEXT.md. Document this limitation in the SDK README.

**Warning signs:** `TypeError: object AsyncHTTPTransport can't be used in 'await' expression`.

### Pitfall 4: Vite Dev Proxy vs Production Static Serving

**What goes wrong:** During Vite dev, the dashboard runs on port 5173 and needs to proxy API calls to the proxy on port 8787. In production (Docker), the proxy serves the built static files directly. These are two different URL configurations.

**Why it happens:** Vite's dev server is a separate process; in production everything runs from one container.

**How to avoid:** Configure `vite.config.ts` with a `server.proxy` rule for `/api/*` → `http://localhost:8787`. In Docker, the built `dist/` is served by the proxy via `serveStatic` — no proxy config needed.

### Pitfall 5: Drizzle Kit Still Uses `/web` for Migrations

**What goes wrong:** `drizzle-kit` CLI for running `db:generate` / `db:migrate` may use the `@libsql/client/web` path internally, which fails with `file:` URLs in some configurations.

**Why it happens:** Drizzle ORM v0.35.3+ added `drizzle-orm/libsql/node` import for Node.js, but `drizzle-kit` tooling has separate behavior. The programmatic `migrate()` function from `drizzle-orm/libsql/migrator` works correctly.

**How to avoid:** Run migrations programmatically on server startup (not via `drizzle-kit migrate`). Use: `import { migrate } from 'drizzle-orm/libsql/migrator'`.

---

## Code Examples

Verified patterns from official sources:

### Python Exception Classes (exact field parity with TypeScript SDK)

```python
# Source: TypeScript SDK errors.ts — must match these fields exactly

class BudgetExceeded(Exception):
    def __init__(self, error: dict):
        super().__init__(error['message'])
        self.code = 'BUDGET_EXCEEDED'
        self.spent: float = error['spent']
        self.limit: float = error['limit']
        self.budget_id: str = error['budgetId']

class HitlPending(Exception):
    def __init__(self, error: dict):
        super().__init__(error['message'])
        self.code = 'HITL_PENDING'
        self.approval_id: str = error['approvalId']
        self.agent_id: str = error['agentId']
        self.expires_at: int = error['expiresAt']  # Unix ms

class AgentError(Exception):
    def __init__(self, error: dict):
        super().__init__(error['message'])
        self.code = 'AGENT_ERROR'
        self.type: str = error['type']  # 'retry_exhausted' | 'permanent_error' | 'stuck_detected'
        self.agent_id: str = error['agentId']
        self.timestamp: int = error['timestamp']
        self.suggested_remediation: str = error['suggestedRemediation']
        self.context: dict = error.get('context', {})
```

### Minimal pyproject.toml

```toml
# Source: https://packaging.python.org/en/latest/guides/writing-pyproject-toml/
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "agentgov"
version = "0.1.0"
description = "Agent governance proxy SDK — cost enforcement and HITL for LLM agents"
requires-python = ">=3.8"
dependencies = ["httpx>=0.24.0"]

[project.optional-dependencies]
openai = ["openai>=1.0.0"]
anthropic = ["anthropic>=0.20.0"]
```

### Node.js Entry Point for Docker

```typescript
// packages/proxy/src/index.node.ts
// Source: https://hono.dev/docs/getting-started/nodejs
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import app from './index';

// Serve Vite build output as SPA
app.use('/*', serveStatic({ root: './dashboard-dist' }));
app.use('/*', (c) => {
  // SPA fallback — serve index.html for unknown routes
  return serveStatic({ path: './dashboard-dist/index.html' })(c);
});

const port = parseInt(process.env.PORT ?? '8787');
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`agentgov proxy listening on http://localhost:${info.port}`);
});
```

### Docker Compose Stack

```yaml
# docker/compose.yml
services:
  proxy:
    build:
      context: ..
      dockerfile: docker/Dockerfile.proxy
    ports:
      - "8787:8787"
    volumes:
      - agentgov-data:/data
    environment:
      DATABASE_URL: "file:/data/agentgov.db"
      OPENAI_API_KEY: "${OPENAI_API_KEY}"
      ANTHROPIC_API_KEY: "${ANTHROPIC_API_KEY}"
      AGENTGOV_ALERT_WEBHOOK_URL: "${AGENTGOV_ALERT_WEBHOOK_URL:-}"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8787/health"]
      interval: 10s
      timeout: 5s
      retries: 3

volumes:
  agentgov-data:
```

### Dockerfile for Proxy

```dockerfile
# docker/Dockerfile.proxy
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/proxy/package.json ./packages/proxy/
COPY packages/dashboard/package.json ./packages/dashboard/ 2>/dev/null || true
RUN npm install -g pnpm && pnpm install --frozen-lockfile

COPY packages/proxy ./packages/proxy
COPY packages/dashboard ./packages/dashboard 2>/dev/null || true
# Build dashboard SPA (if present)
RUN pnpm --filter @agentgov/dashboard build 2>/dev/null || true
# Copy dashboard build into proxy package
RUN cp -r packages/dashboard/dist packages/proxy/dashboard-dist 2>/dev/null || mkdir -p packages/proxy/dashboard-dist

FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/packages/proxy /app/packages/proxy
COPY --from=builder /app/node_modules /app/node_modules
WORKDIR /app/packages/proxy
CMD ["node", "--experimental-vm-modules", "src/index.node.ts"]
```

**Note:** The Dockerfile needs refinement for TypeScript compilation step — use `tsx` or compile with `tsc` first. The above is illustrative.

### TanStack Query Dashboard Hook

```typescript
// packages/dashboard/src/hooks/useDashboard.ts
// Source: https://tanstack.com/query/latest/docs/framework/react/examples/auto-refetching
import { useQuery } from '@tanstack/react-query';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export function useBudgets() {
  return useQuery({
    queryKey: ['budgets'],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/api/v1/dashboard/budgets`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    refetchInterval: 5_000,
    staleTime: 3_000,
  });
}

export function useAuditLog(limit = 100) {
  return useQuery({
    queryKey: ['audit', limit],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/api/v1/dashboard/audit?limit=${limit}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    refetchInterval: 5_000,
  });
}

export function usePendingApprovals() {
  return useQuery({
    queryKey: ['approvals'],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/api/v1/dashboard/approvals`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    refetchInterval: 5_000,
  });
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| setup.py / setup.cfg | pyproject.toml + hatchling | PEP 517 (2017), widely adopted by 2023 | No setup.py needed; hatchling has zero-config for src/ layout |
| httpx ≤0.23: transport kwarg | httpx ≥0.24: explicit `transport=` in httpx.Client() | 0.24.0 (2023) | Stable API; BaseTransport.handle_request() signature unchanged |
| @libsql/client global import | @libsql/client/web for Workers, bare for Node.js | libsql-client-ts 0.4+ | CRITICAL: must use correct subpath for each runtime |
| Cloudflare-only deployment | @hono/node-server for self-host | Hono 3.x (2023) | Same Hono app, two entry points |
| react-query v3 | TanStack Query v5 (@tanstack/react-query) | 2024 | Package renamed; v5 has improved TypeScript, no more `cacheTime` → `gcTime` |

**Deprecated/outdated:**
- `@libsql/client/http` subpath: Replaced by configuring the URL scheme in the main client. Not needed.
- `drizzle migrate` CLI for runtime migrations: Use programmatic `migrate()` in application startup instead.

---

## Open Questions

1. **HITL stub behavior in self-host mode**
   - What we know: `c.env.HITL_WORKFLOW` is Cloudflare Workflows — not available in Docker
   - What's unclear: Should self-host return 501 Not Implemented for HITL actions, or silently skip the HITL check?
   - Recommendation: Return 501 with `{ error: { code: 'HITL_NOT_AVAILABLE', message: 'HITL requires Cloudflare Workflows deployment' } }`. This is honest and actionable.

2. **Dashboard API endpoint placement**
   - What we know: Dashboard needs `/api/v1/dashboard/*` endpoints; proxy already has a Hono app
   - What's unclear: Should these endpoints be added to the Workers proxy too (serving dashboard from Cloudflare) or only in the Node.js build?
   - Recommendation: Add to the shared Hono `app` — works on both Workers and Node.js. Guards with `if (!dbUrl || !dbToken)` already exist in the proxy; same pattern applies.

3. **Python `wrap()` with Anthropic client internal structure**
   - What we know: Anthropic client accepts `base_url` and `http_client=httpx.Client(...)` at construction
   - What's unclear: Can the user pass a custom `http_client` AND rely on `base_url` being overridden simultaneously, or does `http_client` take precedence over `base_url`?
   - Recommendation: Set `base_url` via the constructor AND pass `http_client` with the custom transport. The transport rewrites URLs anyway; `base_url` is a belt-and-suspenders override. Test both OpenAI and Anthropic clients explicitly.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework (TypeScript) | vitest v2 (existing, two configs: Workers pool + Node.js) |
| Framework (Python) | pytest (new, in `packages/sdk-python/`) |
| Config file (TypeScript) | `packages/proxy/vitest.config.ts` + `vitest.config.node.ts` |
| Config file (Python) | `packages/sdk-python/pyproject.toml` `[tool.pytest.ini_options]` |
| Quick run command (TS) | `pnpm --filter @agentgov/sdk test` |
| Quick run command (Python) | `cd packages/sdk-python && pytest tests/ -x` |
| Full suite command | `pnpm test && cd packages/sdk-python && pytest` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| SDK-02 | `wrap(client)` rewrites base_url for OpenAI Python client | unit | `pytest tests/test_wrap.py::test_wrap_openai_rewrites_url -x` | ❌ Wave 0 |
| SDK-02 | `wrap(client)` injects X-Agent-Id header | unit | `pytest tests/test_wrap.py::test_wrap_injects_agent_id -x` | ❌ Wave 0 |
| SDK-02 | `BudgetExceeded` raised on 429+BUDGET_EXCEEDED response | unit | `pytest tests/test_wrap.py::test_budget_exceeded_raised -x` | ❌ Wave 0 |
| SDK-02 | `HitlPending` raised on 202+HITL_PENDING response | unit | `pytest tests/test_wrap.py::test_hitl_pending_raised -x` | ❌ Wave 0 |
| SDK-02 | `AgentError` raised on 502+AGENT_ERROR response | unit | `pytest tests/test_wrap.py::test_agent_error_raised -x` | ❌ Wave 0 |
| SDK-04 | Proxy Node.js entry starts without error | smoke | `node packages/proxy/src/index.node.js` exits 0 on health check | ❌ Wave 0 |
| SDK-04 | `docker compose up` stack responds on port 8787/health | integration | `docker compose -f docker/compose.yml up -d && curl http://localhost:8787/health` | ❌ Wave 0 |
| SDK-05 | `/api/v1/dashboard/budgets` returns JSON array | unit | `pnpm --filter @agentgov/proxy test:node -- dashboard` | ❌ Wave 0 |
| SDK-05 | `/api/v1/dashboard/audit` returns JSON array | unit | `pnpm --filter @agentgov/proxy test:node -- dashboard` | ❌ Wave 0 |
| SDK-05 | `/api/v1/dashboard/approvals` returns JSON array | unit | `pnpm --filter @agentgov/proxy test:node -- dashboard` | ❌ Wave 0 |
| SDK-05 | Dashboard SPA loads and renders budget balance | manual-only | Visual check in browser — no automated E2E in scope | N/A |

### Sampling Rate
- **Per task commit:** `pnpm --filter @agentgov/sdk test && pytest packages/sdk-python/tests/ -x`
- **Per wave merge:** `pnpm test && pytest packages/sdk-python/tests/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/sdk-python/` — directory and `pyproject.toml` do not exist
- [ ] `packages/sdk-python/tests/test_wrap.py` — covers SDK-02
- [ ] `packages/sdk-python/tests/conftest.py` — pytest-httpx fixtures
- [ ] `packages/proxy/src/dashboard/routes.ts` — covers SDK-05 (server-side)
- [ ] `packages/proxy/src/dashboard/routes.test.ts` — covers SDK-05
- [ ] `packages/proxy/src/index.node.ts` — covers SDK-04
- [ ] `docker/compose.yml` — covers SDK-04
- [ ] `packages/dashboard/` — directory and `vite.config.ts` do not exist
- [ ] Framework install: `pip install pytest pytest-httpx` — Python test framework not yet configured
- [ ] Framework install: `pnpm add @tanstack/react-query` — in new dashboard package

---

## Sources

### Primary (HIGH confidence)
- `https://www.python-httpx.org/advanced/transports/` — BaseTransport/AsyncBaseTransport interface, handle_request, close()
- `https://docs.turso.tech/sdk/ts/reference` — @libsql/client createClient, file: URL, authToken optional for local files, web subpath limitation
- `https://hono.dev/docs/getting-started/nodejs` — serve() signature, serveStatic import path
- `packages/sdk-typescript/src/errors.ts` — BudgetExceeded / HitlPending / AgentError field contracts (must match exactly)
- `packages/proxy/src/db/client.ts` — confirmed `@libsql/client/web` usage in Workers (NOT for Docker)
- `packages/proxy/migrations/` — confirmed migration SQL files exist and are current

### Secondary (MEDIUM confidence)
- `https://deepwiki.com/anthropics/anthropic-sdk-python/4-client-architecture` — Anthropic client accepts `base_url: str | httpx.URL | None` and `http_client: httpx.Client | None`
- `https://deepwiki.com/openai/openai-python/7.4-custom-http-clients-and-proxies` — OpenAI client accepts `base_url` and `http_client=DefaultHttpxClient(transport=...)`
- `https://github.com/drizzle-team/drizzle-orm/discussions/3122` — confirmed drizzle-orm v0.35.3+ has `/libsql/node` path; programmatic migrate() works
- `https://tanstack.com/query/latest/docs/framework/react/examples/auto-refetching` — refetchInterval pattern

### Tertiary (LOW confidence)
- Multiple WebSearch results on Docker + SQLite + Node.js — general pattern confirmed but no agentgov-specific Docker validation
- pyproject.toml + hatchling pattern — verified against Python Packaging User Guide (HIGH) but specific field interactions need runtime verification

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are well-documented; versions verified against npm/PyPI
- Architecture: HIGH — patterns match existing proxy codebase conventions; TypeScript SDK is the reference
- Pitfalls: HIGH — libSQL /web vs bare import is verified against Drizzle discussion thread; Cloudflare Workflow binding absence is verifiable from source code
- Python SDK field parity: HIGH — TypeScript SDK `errors.ts` is in-repo; field names are the ground truth

**Research date:** 2026-03-15
**Valid until:** 2026-06-15 (90 days — stable libraries; httpx transport API has not changed since 0.24)
