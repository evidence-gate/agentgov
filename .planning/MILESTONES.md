# Milestones

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
