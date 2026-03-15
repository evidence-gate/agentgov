# Milestones

## v1.1 — Production Readiness (Shipped: 2026-03-15)

**Goal:** v1.0で残った5つのギャップを解消し、Cloudflare Workersエッジデプロイに対応

**Phases:** 3 phases (5-7), 5 plans

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 5 | Provider Completeness | 2 | 2026-03-15 |
| 6 | Python Async SDK + Budget CRUD | 2 | 2026-03-15 |
| 7 | Cloudflare Workers Production Deploy | 1 | 2026-03-15 |

**Requirements completed:** 9/9 (PROV-01~03, SDK-06~07, BUDGET-01~02, DEPLOY-01~02)

**Key accomplishments:**
- Gemini provider forwarding via OpenAI-compat endpoint — reuses processStreamAndSettle unchanged
- Anthropic SSE streaming settle — processAnthropicStreamAndSettle extracts real input/output tokens (overwrite, not sum)
- Python async SDK — AsyncAgentgovTransport + wrap_async() with 11 async tests
- Per-agent budget CRUD — PATCH endpoint + dashboard inline edit + audit trail
- Cloudflare Workers env.production config — all non-inheritable bindings redeclared, types regenerated

**Key artifacts:**
- `forwardToGemini()` + `processAnthropicStreamAndSettle()` in forward.ts
- `AsyncAgentgovTransport` + `wrap_async()` in Python SDK
- `updateBudgetLimit()` + PATCH endpoint + `budget_limit_changed` audit event
- `env.production` block in wrangler.jsonc with HITL workflow binding

---

## v1.0 — Core Governance Platform (completed 2026-03-15)

**Goal:** AIエージェントのガバナンス層MVP — コスト制御、HITL承認、エラーハンドリング、SDK、ダッシュボード

**Phases:** 4 phases, 10 plans

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Budget Engine + Proxy Foundation | 3 | 2026-03-13 |
| 2 | HITL + Approval Channels | 2 | 2026-03-13 |
| 3 | Error Handling + Production Hardening | 2 | 2026-03-14 |
| 4 | Dashboard + Python SDK + Self-Host | 3 | 2026-03-15 |

**Requirements completed:** 19/19 (COST-01~05, HITL-01~05, ERR-01~04, SDK-01~05)

**Last phase number:** 4

**Key artifacts:**
- Hono proxy on Cloudflare Workers + Turso/libSQL
- Hold/Settle budget enforcement with SHA-256 audit chain
- HITL via Cloudflare Workflows + Slack Block Kit
- Error classifier + retry engine + loop detector
- TypeScript + Python SDK (`agentgov.wrap()`)
- React 19 dashboard SPA
- Docker Compose self-host stack

---
*Archived: 2026-03-15*
