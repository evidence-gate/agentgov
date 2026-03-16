# Agent Governance Platform (agentgov)

## What This Is

AIエージェントの「ガバナンス層」を提供するOSSプラットフォーム。コスト制御（予算強制）、HITL承認ワークフロー、エラーハンドリングの3つを統合し、開発者が`agentgov.wrap(client)`の1行でエージェントにガバナンスを追加できるSDKとプロキシを提供する。OpenAI / Anthropic / Geminiの3大LLMプロバイダーに完全対応し、Docker ComposeまたはCloudflare Workersでデプロイ可能。

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

<!-- v1.1 shipped and verified (2026-03-15) -->

- ✓ Geminiプロバイダー完全実装（OpenAI互換エンドポイント経由、ストリーミング対応） — v1.1
- ✓ Anthropicストリーミングのトークン精算（SSE message_start/message_delta parsing） — v1.1
- ✓ Python SDK async対応（AsyncAgentgovTransport + wrap_async） — v1.1
- ✓ Cloudflare Workersクラウドデプロイ（env.production + Turso cloud + Workflows） — v1.1
- ✓ per-agent予算設定UI（ダッシュボードからPATCH + inline edit + audit trail） — v1.1

### Active

<!-- v1.2 Developer Experience -->

- [ ] README.md — Quick Start、アーキテクチャ、プロバイダー対応表、デプロイ手順
- [ ] LICENSE (MIT) — OSS公開の法的基盤
- [ ] CHANGELOG.md — バージョン履歴の追跡（Keep a Changelog形式）
- [ ] .github/workflows/ — CI自動化（lint + test）

### Out of Scope

- モバイルアプリ — Web/SDK-Firstに集中
- エージェントフレームワーク自体の構築 — ガバナンス層に特化
- 金融ライセンスが必要な決済機能 — 構造的に参入不可能
- LLMゲートウェイ/ルーティング機能 — コモディティ化済み、差別化不可
- ガードレール/コンテンツフィルタリング — 競合過密、別領域
- Vertex AI / サービスアカウント認証 — GCP IAM複雑性回避; API keyで十分
- Anthropic cache/thinking token settle — 高複雑性; v1.2で検討

## Current Milestone: v1.2 Developer Experience

**Goal:** OSS公開に必要なドキュメントとCI/CDを整備し、開発者が発見→理解→導入→貢献できる状態にする

**Target features:**
- README.md（evidence-gate-actionのトーンを踏襲、プラットフォーム構成に適応）
- MIT LICENSE
- CHANGELOG.md（v1.0 + v1.1の履歴）
- GitHub Actions CI（lint + test自動化）

## Current State

**Shipped:** v1.1 Production Readiness (2026-03-15)
**Codebase:** ~20,000 LOC TypeScript/Python, 172 tests (24 Workers pool + 148 Node.js)
**Tech stack:** Hono + Cloudflare Workers + Turso/libSQL + React 19 + Python httpx

**Architecture:**
- Proxy: Hono on Cloudflare Workers (or Node.js via Docker Compose)
- DB: Turso cloud (Workers) / embedded libSQL (Docker)
- SDK: TypeScript (`agentgov.wrap()`) + Python (`agentgov.wrap()` / `wrap_async()`)
- Dashboard: React 19 SPA with TanStack Query (Docker Compose only for now)
- HITL: Cloudflare Workflows with Slack Block Kit + webhook

**Providers:** OpenAI (full), Anthropic (full + SSE settle), Gemini (full via OpenAI-compat)

## Context

### 市場調査レポート（report/ディレクトリ）

8フェーズの体系的リサーチ（2026年3月実施）により、AIエージェントインフラ14カテゴリを6軸でスコアリング。コスト制御（9.10/10）、HITL（8.85/10）、エラーハンドリング（7.25/10）がTop 3。4位以下（5.0未満）と大幅に分離。3カテゴリとも専用プロダクト完全不在。統合SAM $800M-1.9B。

### 先行プロジェクト banto（github.com/allnew-llc/banto）

予算ゲート型API鍵管理ツール（Python, macOS Keychain）。Hold/Settle予算パターン（悲観的予約）、多層予算階層（global/provider/model）、pricing.json管理の概念実証。公開済みOSSのため特許出願不可。知見をagentgovに移植するが、コードは再利用しない（Python→TypeScript、Keychain→プロキシ、ローカル→Edge）。

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
| MIT License | Langfuseの成功パターン: MIT→コミュニティ→買収 | ✓ Good |
| プロキシアーキテクチャ | `agentgov.wrap(client)`の1行統合を実現 | ✓ Good |
| TypeScript-First | フロント/バックエンド統一、Cloudflare Workers互換 | ✓ Good |
| Hold/Settle予算パターン | 悲観的予約によるクラッシュ安全性。bantoで実証済み | ✓ Good |
| GSD-2の決定論的制御パターン | 予算・HITL・エラーをLLM判断に委ねず静的制御 | ✓ Good |
| Gemini OpenAI-compat endpoint | format translation不要、processStreamAndSettle再利用 | ✓ Good |
| Anthropic SSE cumulative overwrite | output_tokens=で上書き（+=で加算しない）| ✓ Good |
| PATCH only limit_usd | spent/reserved は Hold/Settle が排他所有 | ✓ Good |
| Workers env.production non-inheritable | 全bindings再宣言必須、明示的Worker名で衝突回避 | ✓ Good |

| GitHub: evidence-gate/agentgov | CI/CD(開発時)+ランタイム(実行時)で包括的AIガバナンスブランド | ✓ Good |

---
*Last updated: 2026-03-16 after v1.2 milestone started*
