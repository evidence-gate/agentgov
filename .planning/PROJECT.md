# Agent Governance Platform (agentgov)

## What This Is

AIエージェントの「ガバナンス層」を提供するOSSプラットフォーム。コスト制御（予算強制）、HITL承認ワークフロー、エラーハンドリングの3つを統合し、開発者が`agentgov.wrap(client)`の1行でエージェントにガバナンスを追加できるSDKとプロキシを提供する。PayPalが決済インフラとしてデファクトになったように、AIエージェント開発において「常に必要だがメイン機能ではない」インフラのポジションを目指す。

## Core Value

AIエージェントのコストを「追跡」ではなく「強制」する -- 予算超過時にリクエストを決定論的にブロックし、開発者が意図しないコスト暴走を構造的に防止すること。

## Requirements

### Validated

<!-- v1.0 shipped and verified (2026-03-15) -->

- ✓ SDK（TypeScript/Python）で`agentgov.wrap(client)`による1行統合 — v1.0
- ✓ プロキシレイヤーでのリアルタイム予算強制（Hold/Settle） — v1.0
- ✓ Risk-Graded Action分類によるHITLトリガー（静的・決定論的） — v1.0
- ✓ マルチチャネル承認（Slack/Webhook） — v1.0
- ✓ Append-Only監査ログ（SHA-256ハッシュチェーン） — v1.0
- ✓ エラー分類と型別ルーティング（ループ検出、Stuck検出） — v1.0
- ✓ Docker Composeによるセルフホスト — v1.0
- ✓ 基本ダッシュボード（コスト概要、予算残高、承認キュー） — v1.0

### Active

<!-- v1.1 scope -->

- [ ] Geminiプロバイダー完全実装（503スタブ → Vertex AI / Gemini API変換+ストリーミング）
- [ ] Anthropicストリーミングのトークン精算（SSE message_delta usage parsing）
- [ ] Python SDK async対応（httpx.AsyncBaseTransport）
- [ ] Cloudflare Workersクラウドデプロイ（wrangler.toml + Turso cloud + Workflows）
- [ ] per-agent予算設定UI（ダッシュボードからCRUD、デフォルト$10固定 → 設定可能）

## Current Milestone: v1.1 Production Readiness

**Goal:** v1.0のスタブ/制限を解消し、3大LLMプロバイダー完全対応+クラウドデプロイ+予算管理UIで本番投入可能な状態にする

**Target features:**
- Geminiプロバイダー完全実装（OpenAI互換 → Gemini API変換）
- Anthropicストリーミング精算（SSEからusage抽出）
- Python SDK async対応
- Cloudflare Workersクラウドデプロイ
- per-agent予算設定ダッシュボード

### Out of Scope

- モバイルアプリ — Web/SDK-Firstに集中
- エージェントフレームワーク自体の構築 — ガバナンス層に特化
- 金融ライセンスが必要な決済機能 — 構造的に参入不可能
- LLMゲートウェイ/ルーティング機能 — コモディティ化済み、差別化不可
- ガードレール/コンテンツフィルタリング — 競合過密、別領域

## Context

### 市場調査レポート（report/ディレクトリ）

8フェーズの体系的リサーチ（2026年3月実施）により、AIエージェントインフラ14カテゴリを6軸でスコアリング。コスト制御（9.10/10）、HITL（8.85/10）、エラーハンドリング（7.25/10）がTop 3。4位以下（5.0未満）と大幅に分離。3カテゴリとも専用プロダクト完全不在。統合SAM $800M-1.9B。

### 先行プロジェクト banto（github.com/allnew-llc/banto）

予算ゲート型API鍵管理ツール（Python, macOS Keychain）。Hold/Settle予算パターン（悲観的予約）、多層予算階層（global/provider/model）、pricing.json管理の概念実証。公開済みOSSのため特許出願不可。知見をagentgovに移植するが、コードは再利用しない（Python→TypeScript、Keychain→プロキシ、ローカル→Edge）。

### GSD-2の設計原則（github.com/gsd-build/gsd-2）

以下の設計原則をagentgovのアーキテクチャに組み込む:
- **「LLMは判断、決定論的処理はコードで」**: 予算強制・ループ検出・HITL判断は決定論的コード
- **Risk-Graded Action分類**: 操作をReversible/Semi-Reversible/Irreversible/Externalに静的分類。HITL判断をLLMの裁量に委ねない
- **ファイルベース状態マシン**: 予算状態・承認状態をディスク上に保持。クラッシュ回復可能な設計
- **Append-Only監査ログ**: 予算判断・承認判断の完全な監査証跡。EU AI Act Article 14対応
- **Capability-Based Security**: エージェントは「信頼されていない契約者」として扱う
- **エラー分類と型別ルーティング**: エラー種別ごとに最適なハンドラーを静的マッピング
- **Stuck検出 + 有限リトライ**: 2回失敗で停止+診断情報。無限ループ防止
- **3層タイムアウト**: ソフト警告→アイドル検出→ハード停止

### 規制環境

EU AI Act Article 14が高リスクAIシステムに人間の監視を義務付け（2026年8月2日施行）。ペナルティ最大7% of turnover。GDPR後にOneTrustが3年で$7.3B評価額に達した先例。

## Constraints

- **チーム**: 個人/小規模チーム（日本拠点）— ソロファウンダーの実行速度に最適化
- **技術スタック**: TypeScript + Cloudflare Workers + Hono + Turso — 月$5の低コスト、グローバルエッジ
- **ライセンス**: MIT — 最大採用を保証（Langfuseモデル）
- **予算**: 月$75-294（M1-3）→ $600-1,300（M10-12）— 12ヶ月ランウェイ$17K-24K
- **タイムライン**: EU AI Act施行（2026年8月2日）まで5ヶ月 — SDK-Firstで4-8週最速投入
- **SDK配布**: npm（TypeScript）+ PyPI（Python）— 2大エコシステムをカバー

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| MIT License（bantoのdual licenseではなく） | Langfuseの成功パターン: MIT→コミュニティ→買収。商用制限はOSS採用を阻害 | — Pending |
| プロキシアーキテクチャ（bantoの鍵ゲートではなく） | `agentgov.wrap(client)`の1行統合を実現。鍵ゲートはプロダクション環境（Linux）で使えない | — Pending |
| TypeScript-First（bantoのPythonではなく） | フロント/バックエンド統一、Cloudflare Workers互換、SDK配布に最適 | — Pending |
| コスト制御をエントリーポイントに | ペイン深度88/125（1位）、Big Techの構造的不整合で吸収リスク最低 | — Pending |
| GSD-2の決定論的制御パターン採用 | 予算強制・HITL判断・エラーハンドリングをLLM判断に委ねず、コードで静的に制御 | — Pending |
| Hold/Settle予算パターンをbantoから移植 | 悲観的予約によるクラッシュ安全性。bantoで概念実証済み | — Pending |

---
*Last updated: 2026-03-15 after v1.1 milestone start*
