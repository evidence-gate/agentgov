# Phase 2: HITL + Approval Channels — Context

## Vision

エージェントがリスクの高いアクション（外部API呼び出し、不可逆操作等）を実行しようとした際、人間に承認を求めて非同期に一時停止・再開する仕組みを提供する。承認判断はLLMではなく静的なリスク分類テーブルに基づき、決定論的に制御する。

## What Phase 1 Already Provides

### DB Schema (Turso/libSQL)
- `budget_ledger` — agent別予算状態（limitUsd, spentUsd, reservedUsd）
- `holds` — Hold/Settle用の悲観的予約レコード
- `audit_log` — append-only, SHA-256ハッシュチェーン付き監査ログ

### Proxy Infrastructure
- Hono app with `/v1/chat/completions` endpoint
- `budgetGate()` → `forwardToLlm()` → `budgetSettle()` パイプライン
- `X-Agent-Id` ヘッダーでエージェント識別
- `executionCtx.waitUntil()` パターンでバックグラウンド処理
- `checkAndFireAlerts()` — Webhook POST パターン確立済み

### SDK (@agentgov/sdk)
- `wrap(client, options)` — OpenAI clientのbase_url書換え + header inject
- `BudgetExceeded` error class — 429検出パターン確立済み
- `createAgentgovFetch()` — response.clone()パターンで特定エラー検出

## Phase 2 Requirements (REQUIREMENTS.md)

- **HITL-01**: 承認リクエストを外部チャネル（webhook）にルーティング
- **HITL-02**: approve/deny判断をエージェントのコンテキストにフィード
- **HITL-03**: 非同期承認 — エージェントが一時停止・再開（ノンブロッキング）
- **HITL-04**: 未回答の承認リクエストのタイムアウトとエスカレーション処理
- **HITL-05**: 承認履歴/監査証跡（actor, timestamp, action taken）

## Success Criteria (ROADMAP.md)

1. 承認が必要と分類されたアクションでエージェントが一時停止し、承認決定と共にコンテキストが再開される
2. 承認リクエストがWebhook/Slackに送信され、approve/denyがエージェントに非同期フィードバックされる
3. TTL内に応答がない承認リクエストは自動的にDENIEDに遷移し、エージェントは理由付きの拒否を受信する（プロキシ再起動後も孤立しない）
4. すべての承認決定がaudit_logに記録される（actor, timestamp, action classification, outcome）

## Architecture (from Research)

### New Components
1. **Action Classifier** — 静的リスク分類テーブル（action名 → RiskTier）、純粋関数、DB依存なし
2. **HITL Queue** — 非同期suspend/resume、Tursoに状態永続化、TTL expiry
3. **Approval Channels** — Webhook + Slack Block Kit、callback endpoint

### Data Flow (HITL Path)
```
Request → Auth → Budget Gate(PASS) → Action Classifier → RiskTier判定
  → HITL-REQUIRED → HITL Queue: suspend + persist + notify channels
  → SDK: 202 + { approvalId } → HitlPending exception
  → Human: approve/deny via Slack/webhook
  → Callback: POST /v1/hitl/:id/approve → resume → forward to LLM → settle
```

### New DB Tables Needed
- `hitl_queue` — pending/approved/denied/expired tickets (request payload, agentId, status, expiresAt, approver)
- `risk_classification` — 静的テーブル or config（action → tier mapping）
- `approver_config` — 誰がどのagent/risk tierの通知を受けるか（optional, Phase 2.x）

## Research Flags (NEEDS RESEARCH)

- **Cloudflare Workflows `waitForEvent`**: HITL pause/resumeにDurable Execution使用可能か。TTLとの相互作用、step timeout制限
- **Slack Block Kit interactive messages**: approve/denyボタン、`interactivity_request_url` callback、3秒レスポンス制約
- **Webhook HMAC verification**: Hono middlewareでのSlack署名検証パターン
- **Cloudflare Workflows step timeout vs long-running approvals**: 承認が数時間かかる場合の対応

## Carried Concerns

- Cloudflare Workflows step timeout limit vs long-running HITL approvals — 要検証
- 承認状態の孤立防止: Tursoに永続化してから通知送信（not after）

## Design Principles (from GSD-2)

- **LLMは判断、決定論的処理はコードで**: HITL判断はstatic classification、LLMに委ねない
- **Risk-Graded Action分類**: Reversible / Semi-Reversible / Irreversible / External
- **Capability-Based Security**: エージェントは「信頼されていない契約者」

## Integration Points with Phase 1

- `audit_log` テーブルに `hitl_suspended`, `hitl_approved`, `hitl_denied`, `hitl_expired` イベント追加
- `BudgetExceeded` と同じパターンで `HitlPending` エラークラスをSDKに追加
- Hold/Settle: HITL承認待ち中もbudget holdを維持（TTLと連動）
- `forwardToLlm()`: HITL approved後に同じ関数を使ってLLM転送

## Open Questions

1. Cloudflare Workflows vs Turso polling: どちらをPrimary HITLステートマシンにするか
2. SDK側のHitlPending処理: polling vs callback URL push notification vs SSE
3. Slack integration scope: Phase 2でSlack対応するか、WebhookのみでPhase 2をシンプルに保つか
4. Action classification granularity: tool_call名のみか、requestの構造も見るか

---
*Created: 2026-03-14*
*Sources: ROADMAP.md, REQUIREMENTS.md, ARCHITECTURE.md, FEATURES.md, PITFALLS.md*
