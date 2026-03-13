# Phase 4: Dashboard + Python SDK + Self-Host — Context

## Vision

TypeScript以外の開発者（Python）もagentgovを使えるようにし、すべてのユーザーがダッシュボードでガバナンス状態を視覚的に確認でき、Docker Composeで5分以内にセルフホスト環境を構築できるようにする。

## What Phase 1 Already Provides

### Data Sources (read-only for Dashboard)
- `budget_ledger` — agent別予算状態（limitUsd, spentUsd, reservedUsd）
- `holds` — アクティブな予算予約
- `audit_log` — すべてのガバナンスイベント（budget, HITL, error）の監査証跡

### SDK Pattern (Python SDK parity target)
- `wrap(client, options)` — client.fetch + client.baseURL書換え
- `BudgetExceeded` — code: 'BUDGET_EXCEEDED', spent, limit, budgetId
- `createAgentgovFetch()` — URL rewrite + X-Agent-Id inject + error detection

### Proxy Infrastructure
- Hono app — `@hono/node-server` で Node.js環境でも同一コードが動作
- Turso/libSQL — Workers（HTTP）とDocker（embedded replica）両対応

## Phase 4 Requirements (REQUIREMENTS.md)

- **SDK-02**: Python SDK with `agentgov.wrap(client)` equivalent API
- **SDK-04**: Docker Compose self-host deployment (5-minute setup)
- **SDK-05**: Basic dashboard — budget status, session cost, enforcement events, approval queue

## Success Criteria (ROADMAP.md)

1. Python開発者が `agentgov.wrap(client)` でAnthropicまたはOpenAI Python clientをラップし、TypeScript SDKと同じガバナンス動作を得られる
2. `docker compose up` で5分以内にフルスタック（proxy + database + dashboard）が動作する（外部依存なし）
3. ダッシュボードに予算残高、セッションコスト内訳、enforcement events、approval queueが表示される（ライブaudit_logクエリ、ページリロード不要）

## Architecture (from Research)

### Python SDK
- **httpx transport override**: Python版 `wrap()` はhttpxのカスタムtransportでbase_url書換え
- **BudgetExceeded / HitlPending exceptions**: TypeScript版と同じフィールド構造
- **Package**: PyPI: `agentgov`、pyproject.toml

### Dashboard
- **React 19 + Vite 6**: SPA、read-only
- **Pages**: costs.tsx（予算サマリー）、approvals.tsx（HITL queue）、audit.tsx（監査ログ）
- **Data**: Tursoからread-onlyクエリ、SELECT-only権限

### Self-Host (Docker Compose)
- **Proxy**: `@hono/node-server` で同じHonoコード
- **Database**: embedded libSQL（Turso不要）
- **Dashboard**: static build bundle

## Phase 4 Parallelization

Phase 4はPhase 1完了後に開始可能（Phase 2/3を待つ必要なし）。ただしPhase 2のHITL queueが完了していればダッシュボードのapproval queueページも実装可能。

**計画案:**
- **04-01**: Python SDK（Phase 1の機能のみ、HITL/Error機能はlater plans）
- **04-02**: Docker Compose self-host（proxy + embedded libSQL）
- **04-03**: Dashboard SPA（Phase 1/2の機能を表示）

## Research Flags

- **STANDARD PATTERNS**: React dashboard、Python httpx transport override、Docker Compose — すべて十分にドキュメント化済み
- **libSQL embedded mode**: WAL behavior under concurrent writes要確認
- **@hono/node-server**: 公式サポート、ドキュメント充実

## Integration Points

- Python SDK: TypeScript SDKの `BudgetExceeded` shape完全準拠（01-03-SUMMARYに文書化済み）
- Dashboard: `audit_log`, `budget_ledger`, `holds` テーブルからSELECT-only
- Self-Host: 同じHonoアプリを `@hono/node-server` adapter経由で起動

## Design Constraints

- Dashboard has NO write path — read-only queries only
- Python SDK must match TypeScript SDK behavior exactly（same HTTP contract）
- Docker Compose must work without any cloud dependencies（Turso不要、embedded libSQL）

---
*Created: 2026-03-14*
*Sources: ROADMAP.md, REQUIREMENTS.md, ARCHITECTURE.md, FEATURES.md*
