# Phase 3: Error Handling + Production Hardening — Context

## Vision

プロダクション環境でエージェントが決定論的に失敗するようにする。一時的エラー（rate limit, 5xx）は自動リトライ、永続エラー（auth, 4xx）は即停止、stuck/loopは検出して停止。エラー判断はLLMではなくコードで静的に制御。

## What Phase 1-2 Already Provides

### Proxy Pipeline (packages/proxy/src/index.ts)
- Request → Auth → Budget Gate → Action Classifier → HITL Check → forwardToLlm → budgetSettle
- `forwardToLlm()` が LLM プロバイダーにリクエスト転送、エラーはそのまま返却中
- `appendAuditEvent()` — never-throw監査ログライター
- `executionCtx.waitUntil()` パターンでバックグラウンド処理

### DB Schema (Turso/libSQL)
- `audit_log` — append-only, SHA-256ハッシュチェーン
- `budget_ledger` + `holds` — Hold/Settle予算パターン
- `hitl_queue` — HITL承認チケット

### SDK (@agentgov/sdk)
- `BudgetExceeded` + `HitlPending` エラークラスパターン確立済み
- `createAgentgovFetch()` — response.clone()パターンでエラー検出

## Phase 3 Requirements (REQUIREMENTS.md)

- **ERR-01**: エラー分類 — transient (retriable: rate limit, 5xx) vs permanent (non-retriable: auth, 4xx)
- **ERR-02**: 有限リトライ + exponential backoff + jitter、最大リトライ数設定可能
- **ERR-03**: Stuck/loop検出 — 同じアクション+同じ入力を進捗なく2回繰り返したエージェントを検出・停止
- **ERR-04**: 構造化エラーレポート — type, timestamp, agent context, suggested remediation

## Success Criteria (ROADMAP.md)

1. rate limit/5xx → 自動リトライ（exponential backoff + jitter、設定可能な最大回数）
2. auth/4xx → 即停止（リトライなし、予算浪費防止）
3. 同一アクション+同一入力を進捗なく2回 → 検出・停止（repeated action, timestamps, remediation付き）
4. すべてのエラーイベント（分類、リトライ、停止判断）が監査ログに記録

## Architecture (from Research)

### New Components
1. **Error Classifier** — LLMレスポンスのHTTPステータスをtransient/permanentに分類する純粋関数
2. **Retry Engine** — exponential backoff + jitter、設定可能な最大回数、budget hold維持
3. **Stuck/Loop Detector** — per-agent-sessionのaction history追跡、2-failure-stop rule
4. **Structured Error Reporter** — エラーイベントを構造化してaudit_log + SDK応答

### Data Flow
```
forwardToLlm() → LLM Response
  → Error? → Error Classifier (transient/permanent)
    → Transient → Retry Engine (backoff + jitter, max retries)
      → Still failing → Structured Error + audit_log
    → Permanent → Immediate halt + Structured Error + audit_log
  → Success → Stuck/Loop check (same action+input repeated?)
    → Stuck detected → Stop + Structured Error + audit_log
    → OK → budgetSettle → response
```

### Design Principles (GSD-2)
- **2-failure-stop rule**: 同じアクションが2回失敗で停止+診断情報
- **エラー分類と型別ルーティング**: エラー種別ごとに最適なハンドラーを静的マッピング
- **LLMは判断、決定論的処理はコードで**: リトライ/停止判断はコードで静的に制御

## Research Flag

**STANDARD PATTERNS** — エラー分類、exponential backoff、loop検出はwell-documented distributed systemsパターン。GSD-2設計原則が具体的仕様を提供。

## Integration Points

- `forwardToLlm()` をラップまたは拡張してリトライロジック追加
- `appendAuditEvent()` で `error_classified`, `retry_attempt`, `retry_exhausted`, `permanent_error`, `stuck_detected` イベント記録
- SDK: `AgentError` エラークラス追加（BudgetExceeded, HitlPendingと同パターン）
- Hold/Settle: リトライ中もbudget holdを維持

## Open Questions

1. Stuck/loop検出のスコープ: per-request vs per-session — Phase 3ではper-requestで十分か
2. リトライ設定: 環境変数 vs per-agent config — 環境変数がシンプル
3. Retry-After ヘッダー尊重: LLM provider指定のbackoff時間を使うか

---
*Created: 2026-03-14*
*Sources: ROADMAP.md, REQUIREMENTS.md, ARCHITECTURE.md, FEATURES.md, PITFALLS.md*
