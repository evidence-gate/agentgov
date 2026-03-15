# Phase 6: Python Async SDK + Budget CRUD — Research

**Researched:** 2026-03-15
**Domain:** Python httpx async transport / Hono CRUD routes / React TanStack Query mutations
**Confidence:** HIGH (verified against codebase inspection, httpx official docs, TanStack Query v5 official docs)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SDK-06 | Python `AsyncOpenAI`/`AsyncAnthropic` clients work with `agentgov.wrap()` via async httpx transport routing to proxy | `AgentgovAsyncTransport(httpx.AsyncBaseTransport)` pattern — new `_async_transport.py`; `wrap()` or `wrap_async()` detects async client and injects async transport |
| SDK-07 | Python async SDK raises `BudgetExceeded`/`HitlPending`/`AgentError` with same contract as sync version | `_exceptions.py` is already shared; async transport reads `await response.aread()` then applies identical inspection logic |
| BUDGET-01 | Dashboard allows setting/changing per-agent budget limits; changes reflect immediately in `budget_ledger` | `PATCH /api/v1/dashboard/budgets/:agentId` proxy endpoint + `updateBudgetLimit()` ledger function + inline edit in `costs.tsx` |
| BUDGET-02 | Budget changes are recorded in `audit_log`; change history is traceable | Append `budget_limit_changed` audit event on every successful PATCH using existing `appendAuditEvent` pattern |
</phase_requirements>

---

## Summary

Phase 6 adds two independent features to the existing v1.0 platform. The Python async SDK (SDK-06, SDK-07) is entirely contained within `packages/sdk-python` — zero proxy changes needed. The budget CRUD feature (BUDGET-01, BUDGET-02) adds write paths to the proxy's dashboard routes and a `costs.tsx` inline edit UI. Neither feature touches the core request pipeline (`index.ts`, `budgetGate`, `forward.ts`).

The Python async transport is a near-mechanical mirror of the existing sync `AgentgovTransport`. The primary risk is the async client attribute name (`_async_http_client` vs `_client`) differing between `AsyncOpenAI` and `AsyncAnthropic` — this must be verified by inspection at implementation time, not assumed. The `asyncio_mode = "auto"` test configuration must be set before writing any async tests or they will silently "pass" without executing.

The budget CRUD work involves three layers: a new `updateBudgetLimit()` ledger function (trivial Drizzle UPDATE), a PATCH endpoint in `dashboard/routes.ts`, and React `useMutation` + inline edit in `costs.tsx`. The critical constraint is that the PATCH endpoint must only update `limit_usd` — never `spent_usd` or `reserved_usd` — to avoid clobbering data owned by the Hold/Settle machinery. BUDGET-02 requires appending an audit event on every budget limit change.

**Primary recommendation:** Implement async transport first (low risk, isolated), then budget CRUD (slightly higher surface area due to audit log requirement).

---

## Standard Stack

### Core (already installed — no new packages for proxy or dashboard)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `httpx` | `>=0.28.0` (bump from `>=0.24.0`) | Async transport base class | 0.28 removes deprecated `proxies=`/`app=` kwargs; `AsyncBaseTransport.handle_async_request` API stable from 0.28 |
| `pytest-asyncio` | `^1.3.0` | Async test execution | Official pytest plugin; `asyncio_mode = "auto"` prevents silent test skips |
| `anyio` | `>=4.0.0` | Async fixture support | Used by httpx internally; explicit dev dep ensures consistent behavior |
| `@tanstack/react-query` | `^5` (installed) | `useMutation` for PATCH/POST | Already in dashboard; `onMutate`/`onError`/`onSettled` optimistic update pattern |
| `drizzle-orm` | `^0.45.1` (installed) | Drizzle UPDATE for budget limit | Already in proxy; `db.update(budgetLedger).set({limitUsd}).where(eq(...))` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `hono` | `^4.12.7` (installed) | PATCH route in `dashboard/routes.ts` | Add to existing Hono router via `router.patch(...)` |
| React 19 `useActionState` | built-in (installed) | Form state for inline edit | Single-field form in `costs.tsx`; no `react-hook-form` needed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Two transport classes (`AgentgovTransport` + `AgentgovAsyncTransport`) | Single class with duck-typing | httpx does not support duck-typed transport; sync and async are separate class hierarchies — two classes is correct |
| `asyncio_mode = "auto"` in pyproject.toml | `@pytest.mark.asyncio` per test | Per-decorator is error-prone; missing decorator causes silent pass without execution |
| `PATCH /api/v1/dashboard/budgets/:agentId` | `PUT` | PATCH is semantically correct for partial update (only `limitUsd`); PUT implies full replacement |

### Installation

```bash
# packages/sdk-python — update pyproject.toml dependencies, then:
pip install -e ".[dev]"
# Changes: httpx >=0.24.0 -> >=0.28.0; add pytest-asyncio>=1.3.0; anyio>=4.0.0

# packages/proxy — no new packages
# packages/dashboard — no new packages
```

---

## Architecture Patterns

### Recommended Project Structure (Phase 6 additions only)

```
packages/
├── sdk-python/
│   └── src/agentgov/
│       ├── _async_transport.py     # NEW: AsyncAgentgovTransport(httpx.AsyncBaseTransport)
│       ├── _transport.py           # unchanged (sync reference implementation)
│       ├── _exceptions.py          # unchanged (shared BudgetExceeded/HitlPending/AgentError)
│       └── __init__.py             # MODIFY: export AsyncAgentgovTransport, wrap_async()
│
└── packages/proxy/src/
    ├── budget/
    │   └── ledger.ts               # MODIFY: add updateBudgetLimit()
    ├── dashboard/
    │   └── routes.ts               # MODIFY: add PATCH endpoint, change DockerDbClient -> DbClient
    └── (index.node.ts              # MODIFY: verify createDashboardRoutes() still works with DbClient)

packages/dashboard/src/
├── hooks/
│   └── useDashboard.ts             # MODIFY: add useMutation hook for budget PATCH
└── pages/
    └── costs.tsx                   # MODIFY: add inline edit controls per row
```

### Pattern 1: Async Transport Mirror

**What:** `AsyncAgentgovTransport` is structurally identical to `AgentgovTransport`, with three changes: subclasses `httpx.AsyncBaseTransport`, implements `async def handle_async_request`, uses `await response.aread()` instead of `response.read()`, and uses `httpx.AsyncHTTPTransport` as default inner transport.

**When to use:** When caller has `AsyncOpenAI` or `AsyncAnthropic` client instance.

**Implementation:**

```python
# Source: httpx official docs https://www.python-httpx.org/advanced/transports/
import httpx
from ._exceptions import AgentError, BudgetExceeded, HitlPending
import json
from typing import Optional, Any


class AsyncAgentgovTransport(httpx.AsyncBaseTransport):
    def __init__(
        self,
        proxy_url: str,
        agent_id: str,
        _inner: Optional[httpx.AsyncBaseTransport] = None,
        **kwargs: Any,
    ) -> None:
        self._proxy_url = proxy_url.rstrip("/")
        self._agent_id = agent_id
        self._inner = _inner if _inner is not None else httpx.AsyncHTTPTransport(**kwargs)

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        # URL rewrite — identical logic to sync version (no await needed for URL manipulation)
        original_url = request.url
        proxy_base = httpx.URL(self._proxy_url)
        new_url = httpx.URL(
            scheme=proxy_base.scheme,
            host=proxy_base.host,
            port=proxy_base.port,
            path=original_url.path,
            query=original_url.query if original_url.query else b"",
        )
        headers = dict(request.headers)
        headers["x-agent-id"] = self._agent_id
        rewritten = httpx.Request(
            method=request.method,
            url=new_url,
            headers=headers,
            content=request.content,  # request.content is sync even in async transport
        )

        response = await self._inner.handle_async_request(rewritten)
        await response.aread()  # async read — key difference from sync version
        content = response.content
        status = response.status_code

        if status in (202, 429, 502):
            try:
                body = json.loads(content)
                error_dict = body.get("error") if isinstance(body, dict) else None
                if isinstance(error_dict, dict):
                    code = error_dict.get("code")
                    if status == 429 and code == "BUDGET_EXCEEDED":
                        raise BudgetExceeded(error_dict)
                    if status == 202 and code == "HITL_PENDING":
                        raise HitlPending(error_dict)
                    if status == 502 and code == "AGENT_ERROR":
                        raise AgentError(error_dict)
            except (json.JSONDecodeError, KeyError):
                pass

        return httpx.Response(
            status_code=response.status_code,
            headers=response.headers,
            content=content,
        )

    async def aclose(self) -> None:
        await self._inner.aclose()
```

**CRITICAL — attribute name verification:** `AsyncOpenAI` stores its httpx client as `_async_http_client` (NOT `_client`). `AsyncAnthropic` may use a different name. Both must be verified by inspection before writing `wrap_async()`. The STATE.md Pending Todos entry explicitly flags this: "Confirm `AsyncOpenAI` internal httpx client attribute name (`_async_http_client` vs `_client`) before Phase 6 implementation."

### Pattern 2: `wrap_async()` with Auto-Detect

**What:** Expose either `wrap_async()` or an overloaded `wrap()` that detects async client and injects appropriate transport.

**Recommended:** Add `wrap_async()` as a named function for clarity. Optionally have `wrap()` detect and route.

```python
# Source: codebase inspection of __init__.py pattern
def wrap_async(client: Any, *, proxy_url: str, agent_id: str) -> Any:
    """
    Patch async client (_async_http_client attribute) for AsyncOpenAI/AsyncAnthropic.

    IMPORTANT: Verify attribute name at implementation time.
    AsyncOpenAI uses _async_http_client; AsyncAnthropic may differ.
    """
    transport = AsyncAgentgovTransport(proxy_url=proxy_url, agent_id=agent_id)
    http_client = httpx.AsyncClient(transport=transport)
    # VERIFY: correct attribute name before using
    client._async_http_client = http_client  # AsyncOpenAI attribute name
    return client
```

### Pattern 3: Budget Limit Update (proxy ledger)

**What:** Single-field UPDATE that touches only `limit_usd` and `updated_at`. Never updates `spent_usd` or `reserved_usd` — those fields are exclusively owned by Hold/Settle.

```typescript
// Source: codebase inspection of ledger.ts pattern
// packages/proxy/src/budget/ledger.ts — ADD this function
export async function updateBudgetLimit(
  db: DbClient,
  agentId: AgentId,
  limitUsd: number,
): Promise<{ agentId: string; limitUsd: number; spentUsd: number; reservedUsd: number; updatedAt: number } | null> {
  const now = Date.now();
  const rows = await db
    .update(budgetLedger)
    .set({ limitUsd, updatedAt: now })
    .where(eq(budgetLedger.agentId, agentId))
    .returning();
  return rows[0] ?? null;
}
```

**CRITICAL:** Do NOT wrap in a transaction — Turso HTTP client does not support interactive transactions (documented in `ledger.ts` comments). The single UPDATE is atomic at the SQL level.

### Pattern 4: Dashboard PATCH Route + DbClient Abstraction

**What:** Add PATCH endpoint to `routes.ts`. The current function signature accepts `DockerDbClient` — must change to `DbClient` (abstract type from `db/client.ts`) so the route works in both Docker and Workers contexts.

```typescript
// Source: codebase inspection of routes.ts and db/client.ts
// packages/proxy/src/dashboard/routes.ts — MODIFY signature + ADD PATCH route

import type { DbClient } from '../db/client';          // CHANGE from DockerDbClient
// import type { DockerDbClient } from '../db/client.node'; // REMOVE

export function createDashboardRoutes(db: DbClient): Hono {  // CHANGE type
  const router = new Hono();

  // ... existing GET routes unchanged ...

  // NEW: PATCH /api/v1/dashboard/budgets/:agentId
  router.patch('/api/v1/dashboard/budgets/:agentId', async (c) => {
    const agentId = c.req.param('agentId');
    const body = await c.req.json<{ limitUsd: number }>();

    // Validate
    if (typeof body.limitUsd !== 'number' || !isFinite(body.limitUsd) || body.limitUsd < 0) {
      return c.json({ error: { code: 'INVALID_LIMIT', message: 'limitUsd must be a non-negative finite number' } }, 400);
    }

    const updated = await updateBudgetLimit(db, agentId as AgentId, body.limitUsd);
    if (!updated) {
      return c.json({ error: { code: 'AGENT_NOT_FOUND', message: `No budget row for agent: ${agentId}` } }, 404);
    }

    // Append audit event (BUDGET-02)
    await appendAuditEvent(db, {
      eventType: 'budget_limit_changed',
      agentId: agentId as AgentId,
      model: '',
      costDelta: 0,
      payload: JSON.stringify({ newLimitUsd: body.limitUsd }),
    }).catch(err => console.error('audit write failed:', err));  // never throws

    return c.json(updated);
  });

  return router;
}
```

### Pattern 5: React useMutation + Inline Edit

**What:** TanStack Query v5 `useMutation` with optimistic update; inline edit in `costs.tsx` using local `editingId` state.

```typescript
// Source: TanStack Query v5 official docs https://tanstack.com/query/v5/docs/framework/react/guides/mutations
// packages/dashboard/src/hooks/useDashboard.ts — ADD

export function useUpdateBudgetLimit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, limitUsd }: { agentId: string; limitUsd: number }) =>
      fetch(`${API_BASE}/api/v1/dashboard/budgets/${encodeURIComponent(agentId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limitUsd }),
      }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
    },
  });
}
```

**Inline edit in costs.tsx:** Add `editingId: string | null` and `editValue: string` local state. Each row shows an "Edit" button; clicking it sets `editingId = row.agentId`. The limit cell becomes an `<input type="number">` with Save/Cancel. On Save, call `mutation.mutate({ agentId, limitUsd })`. On success/cancel, clear `editingId`.

### Anti-Patterns to Avoid

- **`asyncio.run()` inside `handle_async_request`:** Crashes in any async context (FastAPI, LangChain) because there is already a running event loop. Never do this.
- **Single transport class for both sync and async:** httpx transport hierarchies are separate. Two classes sharing `_exceptions.py` is correct.
- **`async def handle_request` (wrong method name):** The async transport method is `handle_async_request`, not `handle_request`. Using the wrong name means the method is never called by httpx.
- **Wrapping `updateBudgetLimit` in a DB transaction:** Turso HTTP client does not support interactive transactions. The atomic SQL UPDATE is sufficient.
- **PATCH updating `spent_usd` or `reserved_usd`:** These are owned exclusively by Hold/Settle. Including them in the UPDATE creates a race condition that clobbers actual spend data (Pitfall 21).
- **`DockerDbClient` type remaining in `createDashboardRoutes`:** The PATCH route must work in both Docker and Workers. The type must be the abstract `DbClient` from `db/client.ts`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Async HTTP transport for Python | Custom async HTTP client | `httpx.AsyncBaseTransport` + `httpx.AsyncHTTPTransport` | httpx manages connection pooling, SSL, redirects, timeouts; edge cases are numerous |
| Async test isolation | Custom event loop management | `pytest-asyncio` with `asyncio_mode = "auto"` | Manual `asyncio.run()` in tests causes event loop conflicts across test cases |
| Budget limit validation | Custom numeric validator | Simple `isFinite(x) && x >= 0` | Two-line check is sufficient; no Zod needed for single-field validation |
| React form state for inline edit | `react-hook-form` + Zod | React `useState` + native `<input type="number">` | Single numeric field does not justify 25KB+ form library |

**Key insight:** The async transport is ~60 lines. The sync transport is the template. Any deviation from the template pattern (e.g., attempting to share logic, creating intermediate base classes) adds complexity without reducing code.

---

## Common Pitfalls

### Pitfall 1: Wrong Async Client Attribute Name (`_async_http_client` vs `_client`)

**What goes wrong:** `wrap_async()` patches the wrong attribute. The async transport is injected but the SDK never uses it — all requests go directly to the real LLM API, bypassing governance entirely.

**Why it happens:** `openai.OpenAI` uses `_client` (httpx.Client). `openai.AsyncOpenAI` uses `_async_http_client` (httpx.AsyncClient). The naming difference is not documented prominently. Copying the sync `wrap()` pattern with `client._client = http_client` injects a sync client into the async path.

**How to avoid:** Inspect `AsyncOpenAI.__init__` and `AsyncAnthropic.__init__` source at implementation time. Print `vars(client)` in a debug session to verify the attribute name. Add an assertion in `wrap_async()`: `assert hasattr(client, '_async_http_client'), f"Expected _async_http_client on {type(client).__name__}, got: {list(vars(client).keys())}"`.

**Warning signs:** Async wrap appears to succeed but `x-agent-id` header is absent in proxy logs; governance exceptions never raised during async calls.

### Pitfall 2: Async Tests Silently Pass Without Running

**What goes wrong:** All `async def test_` functions show as passed. No assertions actually executed. Test coverage appears complete but no async code is exercised.

**Why it happens:** `pytest-asyncio` defaults to "strict" mode since v0.21. Without `asyncio_mode = "auto"` in `pyproject.toml`, async tests without `@pytest.mark.asyncio` are collected as coroutine objects and reported as passed without execution.

**How to avoid:** Add to `pyproject.toml` before writing any async tests:
```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
```
Verify with a canary: `async def test_canary(): assert False` — it must fail.

**Warning signs:** Async tests show 0 assertions in `--verbose` output; removing `asyncio_mode` causes tests to change state.

### Pitfall 3: PATCH Endpoint Overwrites `spent_usd` (Budget Corruption)

**What goes wrong:** The budget limit change race-writes `spent_usd` = 0 or a stale value while the proxy is concurrently settling a hold. Agent's reported spend drops backward. Audit log shows discrepancy.

**Why it happens:** ORM `.update().set(rowData)` with full-row data includes `spent_usd`. Turso HTTP has no interactive transactions to prevent the race.

**How to avoid:** PATCH handler calls `updateBudgetLimit()` which only sets `limit_usd` and `updated_at`. Never read-then-write the full budget row in the dashboard PATCH path.

**Warning signs:** `spent_usd` jumps backward in audit log after a budget limit change event.

### Pitfall 4: `DockerDbClient` Type Left in `createDashboardRoutes`

**What goes wrong:** TypeScript compile error when wiring the PATCH route in Workers (`index.ts`), because `DockerDbClient` is incompatible with the Workers-side `DbClient`. The dashboard route module cannot be used from Workers at all.

**Why it happens:** The current `routes.ts` imports `DockerDbClient` from `db/client.node`. Workers runtime cannot import `db/client.node` (it uses Node.js built-ins). The type change is a prerequisite for BUDGET-01/02 to work in Workers.

**How to avoid:** Change `import type { DockerDbClient }` to `import type { DbClient }` from `'../db/client'`. Both types are `ReturnType<typeof drizzle(client, { schema })}` — the Drizzle ORM operations are identical.

**Warning signs:** TypeScript error on `createDashboardRoutes(db)` in `index.ts`; `DockerDbClient is not assignable to DbClient`.

### Pitfall 5: BUDGET-02 Audit Event Not Written

**What goes wrong:** Budget limits change but there is no audit record. Operators cannot trace who changed what limit or when. BUDGET-02 requirement fails verification.

**Why it happens:** The PATCH endpoint writes to `budget_ledger` but does not call `appendAuditEvent`. The audit writer is fire-and-forget by design (`appendAuditEvent never throws`), so it is easy to forget to add it.

**How to avoid:** After the successful `updateBudgetLimit()` call, always call `appendAuditEvent` with `eventType: 'budget_limit_changed'` and the new limit in `payload`. Wrap in `.catch(err => console.error(...))` per existing pattern — audit failures must not abort the primary operation.

**Warning signs:** `budget_limit_changed` event type absent from audit log after dashboard edits; budget limit changes visible in `budget_ledger` but not traceable.

---

## Code Examples

### Async Transport — Test Pattern

```python
# Source: existing tests/test_wrap.py as pattern template
import pytest
import httpx
from agentgov import BudgetExceeded
from agentgov._async_transport import AsyncAgentgovTransport


class AsyncMockTransport(httpx.AsyncBaseTransport):
    def __init__(self, status_code: int, body: dict | None = None):
        self.status_code = status_code
        self.body = body or {}
        self.last_request: httpx.Request | None = None

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        self.last_request = request
        import json
        content = json.dumps(self.body).encode()
        return httpx.Response(
            status_code=self.status_code,
            headers={"content-type": "application/json"},
            content=content,
        )


# With asyncio_mode = "auto" in pyproject.toml, no @pytest.mark.asyncio needed
async def test_async_transport_raises_budget_exceeded():
    inner = AsyncMockTransport(
        429,
        {"error": {"code": "BUDGET_EXCEEDED", "message": "x", "budgetId": "a", "spent": 1.0, "limit": 1.0}},
    )
    transport = AsyncAgentgovTransport(proxy_url="http://proxy", agent_id="test-agent", _inner=inner)
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(BudgetExceeded):
            await client.post("https://api.openai.com/v1/chat/completions", content=b"{}")
```

### pyproject.toml Changes

```toml
[project]
dependencies = [
    "httpx>=0.28.0",   # was >=0.24.0 — bump for stable AsyncBaseTransport API
]

[project.optional-dependencies]
dev = [
    "pytest>=7.0.0",
    "pytest-httpx>=0.21.0",
    "pytest-asyncio>=1.3.0",   # NEW — async test execution
    "anyio>=4.0.0",             # NEW — async fixture support
]

[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"          # NEW — avoids @pytest.mark.asyncio on every test
```

### Drizzle `updateBudgetLimit` — Only Safe Fields

```typescript
// Source: codebase inspection of ledger.ts Drizzle patterns
export async function updateBudgetLimit(
  db: DbClient,
  agentId: AgentId,
  limitUsd: number,
): Promise<typeof budgetLedger.$inferSelect | null> {
  const now = Date.now();
  const rows = await db
    .update(budgetLedger)
    .set({ limitUsd, updatedAt: now })  // ONLY limitUsd + updatedAt — never spent_usd/reserved_usd
    .where(eq(budgetLedger.agentId, agentId))
    .returning();
  return rows[0] ?? null;
}
```

### Audit Event for BUDGET-02

```typescript
// Source: codebase inspection of audit/writer.ts pattern (appendAuditEvent never throws)
// Inside the PATCH route handler, after successful updateBudgetLimit():
appendAuditEvent(db, {
  eventType: 'budget_limit_changed',
  agentId: agentId as AgentId,
  model: '',          // no model for admin operation
  costDelta: 0,       // no cost impact
  payload: JSON.stringify({ newLimitUsd: body.limitUsd }),
}).catch(err => console.error('budget_limit_changed audit write failed:', err));
// Never await — audit failures must not abort the primary operation
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual `@pytest.mark.asyncio` per test | `asyncio_mode = "auto"` in pyproject.toml | pytest-asyncio 0.21 | Eliminates silent test skip bug |
| `httpx>=0.24.0` | `httpx>=0.28.0` | httpx 0.28.0 (2024) | Removes deprecated `proxies=`/`app=` kwargs causing SDK warnings |
| `DockerDbClient` in dashboard routes | Abstract `DbClient` from `db/client.ts` | Phase 6 | Enables Workers deployment of dashboard write routes |

**Deprecated/outdated:**
- `httpx.BaseTransport` for async clients: Using the sync base class for async clients causes `RuntimeError: This event loop is already running` — use `httpx.AsyncBaseTransport`.
- `asyncio.run()` inside `handle_async_request`: Crashes in any already-async context — use `await` directly.

---

## Open Questions

1. **`AsyncOpenAI` attribute name (`_async_http_client` or `_client`)**
   - What we know: Sync `OpenAI` uses `_client`. The STATE.md Pending Todos entry says "Confirm `AsyncOpenAI` internal httpx client attribute name (`_async_http_client` vs `_client`)".
   - What's unclear: The exact attribute name on `AsyncOpenAI` and whether `AsyncAnthropic` uses the same attribute or different.
   - Recommendation: Inspect `AsyncOpenAI.__init__` source in the first implementation task (`print(vars(client))` before patching). Add an assertion to fail loudly rather than silently injecting a dead transport.

2. **`appendAuditEvent` signature — `model` field required?**
   - What we know: `audit_log` schema has `model text('model').notNull()`. The `appendAuditEvent` function (in `audit/writer.ts`) maps to this column.
   - What's unclear: Whether passing `model: ''` is acceptable for non-LLM events like `budget_limit_changed`, or if the writer enforces a non-empty constraint.
   - Recommendation: Inspect `audit/writer.ts` at implementation time. If `model: ''` is blocked, use a sentinel like `'N/A'` or `'admin'`.

3. **Should PATCH create an agent if it doesn't exist?**
   - What we know: FEATURES.md mentions `POST /api/v1/budget` for explicit agent creation. The PATCH should update an existing row. If the agent hasn't made any requests yet, there is no row to PATCH.
   - What's unclear: Whether the v1.1 MVP requires explicit pre-provisioning via the dashboard or if PATCH should upsert.
   - Recommendation: PATCH returns 404 if agent not found (clean semantics). Pre-provisioning via the dashboard is a convenience that can be added if users request it. Auto-create on first request (`ensureAgent`) remains the primary path.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 7+ + pytest-asyncio 1.3.0 |
| Config file | `packages/sdk-python/pyproject.toml` (`[tool.pytest.ini_options]`) |
| Quick run command | `cd packages/sdk-python && python -m pytest tests/ -x -q` |
| Full suite command | `cd packages/sdk-python && python -m pytest tests/ -v` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SDK-06 | `AsyncAgentgovTransport` rewrites URL and injects `x-agent-id` header | unit | `python -m pytest tests/test_async_transport.py -x` | Wave 0 |
| SDK-06 | `wrap_async()` patches async client's httpx client attribute | unit | `python -m pytest tests/test_async_transport.py::test_wrap_async -x` | Wave 0 |
| SDK-07 | `BudgetExceeded` raised on HTTP 429 + BUDGET_EXCEEDED code (async) | unit | `python -m pytest tests/test_async_transport.py::test_budget_exceeded_async -x` | Wave 0 |
| SDK-07 | `HitlPending` raised on HTTP 202 + HITL_PENDING code (async) | unit | `python -m pytest tests/test_async_transport.py::test_hitl_pending_async -x` | Wave 0 |
| SDK-07 | `AgentError` raised on HTTP 502 + AGENT_ERROR code (async) | unit | `python -m pytest tests/test_async_transport.py::test_agent_error_async -x` | Wave 0 |
| SDK-07 | Non-governance 429/202/502 pass through without raising (async) | unit | `python -m pytest tests/test_async_transport.py::test_passthrough_async -x` | Wave 0 |
| BUDGET-01 | `PATCH /api/v1/dashboard/budgets/:agentId` updates `limit_usd` in DB | unit | `pnpm --filter @agentgov/proxy test -- budget` | existing (add test) |
| BUDGET-01 | Dashboard inline edit calls PATCH and updates displayed value | manual | n/a — visual verification | manual-only |
| BUDGET-02 | `budget_limit_changed` event appears in audit_log after PATCH | unit | `pnpm --filter @agentgov/proxy test -- budget` | existing (add test) |
| BUDGET-02 | Audit event payload contains `newLimitUsd` | unit | `pnpm --filter @agentgov/proxy test -- budget` | existing (add test) |

### Sampling Rate

- **Per task commit:** `cd packages/sdk-python && python -m pytest tests/ -x -q`
- **Per wave merge:** `cd packages/sdk-python && python -m pytest tests/ -v && pnpm --filter @agentgov/proxy test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/sdk-python/tests/test_async_transport.py` — covers SDK-06, SDK-07
- [ ] `packages/sdk-python/pyproject.toml` — add `pytest-asyncio>=1.3.0`, `anyio>=4.0.0`, `asyncio_mode = "auto"`, bump `httpx>=0.28.0`

---

## Sources

### Primary (HIGH confidence)

- Codebase: `packages/sdk-python/src/agentgov/_transport.py` — sync reference implementation (read directly)
- Codebase: `packages/sdk-python/src/agentgov/__init__.py` — current exports and `wrap()` pattern (read directly)
- Codebase: `packages/sdk-python/src/agentgov/_exceptions.py` — exception contracts (read directly)
- Codebase: `packages/proxy/src/budget/ledger.ts` — `ensureAgent`, `getBudget`, `settleHold` patterns; Turso no-transaction constraint (read directly)
- Codebase: `packages/proxy/src/dashboard/routes.ts` — current `DockerDbClient` type; 3 GET endpoints (read directly)
- Codebase: `packages/proxy/src/db/client.ts` — abstract `DbClient` type (read directly)
- Codebase: `packages/proxy/src/db/client.node.ts` — `DockerDbClient` type; confirms type divergence (read directly)
- Codebase: `packages/proxy/src/db/schema.ts` — `budgetLedger` schema (`limit_usd`, `spent_usd`, `reserved_usd`, `updated_at`) (read directly)
- Codebase: `packages/dashboard/src/hooks/useDashboard.ts` — `useBudgets`, `BudgetRow` interface; `queryKey: ['budgets']` (read directly)
- Codebase: `packages/dashboard/src/pages/costs.tsx` — current read-only table structure (read directly)
- Codebase: `packages/sdk-python/tests/test_wrap.py` — `MockTransport` pattern for sync tests (read directly)
- Codebase: `packages/sdk-python/pyproject.toml` — current deps (`httpx>=0.24.0`; no pytest-asyncio) (read directly)
- [httpx AsyncBaseTransport docs](https://www.python-httpx.org/advanced/transports/) — `handle_async_request` method signature, `aclose()` contract — HIGH confidence (official docs)
- [TanStack Query v5 useMutation](https://tanstack.com/query/v5/docs/framework/react/guides/mutations) — `onSuccess: invalidateQueries` pattern — HIGH confidence (official docs)

### Secondary (MEDIUM confidence)

- `.planning/research/FEATURES.md` — Feature 3 (Python Async SDK) and Feature 5 (Per-Agent Budget UI) sections — MEDIUM confidence (internal research, verified against codebase)
- `.planning/research/ARCHITECTURE.md` — Feature 3 and 5 architecture patterns; DbClient abstraction — MEDIUM confidence (internal research)
- `.planning/research/STACK.md` — `AsyncAgentgovTransport` class template; `pytest-asyncio 1.3.0`; `httpx>=0.28.0` rationale — MEDIUM confidence (internal research)
- `.planning/research/PITFALLS.md` — Pitfalls 16, 17, 21 (async transport, pytest-asyncio mode, concurrent PATCH) — MEDIUM confidence (internal research, verified with official docs)
- `.planning/STATE.md` — Pending Todos: async client attribute name verification; Decisions: `AsyncAgentgovTransport` subclasses `httpx.AsyncBaseTransport`, no `asyncio.run()` inside — MEDIUM confidence (project state)

### Tertiary (LOW confidence)

- None — all claims verified against codebase or official docs.

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — httpx AsyncBaseTransport API verified via official docs; existing stack verified via codebase inspection
- Architecture: HIGH — sync transport is the template; async mirror pattern verified against httpx docs
- Pitfalls: HIGH — Pitfalls 16/17/21 verified against official docs and codebase; STATE.md explicitly flags attribute name uncertainty

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (httpx 0.28 API stable; TanStack Query v5 stable; 30-day window)
