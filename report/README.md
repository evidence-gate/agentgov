# AIエージェントインフラ市場調査レポート

**個人/小規模チームのための参入機会分析**

- **作成日**: 2026年3月13日
- **データ基準時点**: 2026年3月
- **調査方法**: 二次情報に基づく定性・定量分析
- **対象読者**: AIインフラ領域への参入を検討する技術系創業者

---

## 読み方ガイド

| 読了時間 | 読むべきファイル | 得られるもの |
|---------|---------------|------------|
| **5分** | `00-executive-summary.md` のみ | 推薦領域、スコアリング結果、GTM概要、リスク |
| **30分** | `00-executive-summary.md` + `09-decision-matrix.md` + `09-next-actions.md` | Go/No-Go判断 + 90日間アクションプラン |
| **3-4時間** | 全20セクションを下記の順序で | 全エビデンスの検証と理解 |

---

## レポート構成 -- 全20セクション

### Phase 9: 最終成果物（まずここから）

| ファイル | タイトル | 一文サマリー | 要件 |
|---------|---------|-------------|------|
| `00-executive-summary.md` | エグゼクティブサマリー | 5分で読める全体要約。Agent Governance推薦とGo/No-Go判断 | DLVR-01 |
| `09-competitive-map.md` | 競合マップ | 14カテゴリの競合密度・機会を視覚的に整理 | DLVR-02 |
| `09-decision-matrix.md` | 意思決定マトリクス | 6軸スコアリングの全データと感度分析 | DLVR-03 |
| `09-next-actions.md` | 次のアクション | 90日間週次プラン + 12ヶ月マイルストーン + 撤退判断 | DLVR-04 |

### Phase 1: プロトコル・フレームワーク基盤

| ファイル | タイトル | 一文サマリー | 要件 |
|---------|---------|-------------|------|
| `01-protocol-landscape.md` | プロトコルランドスケープ | MCP/A2A/AG-UIの3プロトコル分析。MCP Gatewayが最大のインフラ機会 | TECH-01 |
| `02-framework-comparison.md` | フレームワーク比較 | LangGraph/CrewAI/OpenAI Agents SDK等の市場シェアとアーキテクチャ比較 | TECH-02 |

### Phase 2: 標準化・トレンド

| ファイル | タイトル | 一文サマリー | 要件 |
|---------|---------|-------------|------|
| `03-standardization-efforts.md` | 標準化動向 | AAIF、OAuth 2.1 for MCP、OTel GenAI。コストガバナンスが最緊急需要 | TECH-03 |
| `04-multi-agent-trends.md` | マルチエージェントトレンド | 2026年はマルチエージェント基盤年。50%がサイロ = オーケストレーション需要 | TECH-04 |

### Phase 3: 競合マッピング

| ファイル | タイトル | 一文サマリー | 要件 |
|---------|---------|-------------|------|
| `03-competitive-player-mapping-part1.md` | 競合マッピング前編 | カテゴリ1-7のプレイヤー詳細。LLMゲートウェイは成熟、コスト制御は空白 | COMP-01 |
| `03-competitive-player-mapping-part2.md` | 競合マッピング後編 | カテゴリ8-14 + 横断サマリー。HITL唯一のプレイヤーがピボット中 | COMP-02 |

### Phase 4: 競合分析・ギャップ

| ファイル | タイトル | 一文サマリー | 要件 |
|---------|---------|-------------|------|
| `04-competitive-analysis-part1-bigtech.md` | Big Tech分析 | AWS Bedrock AgentCore最包括（9/14カテゴリ）だがコスト強制なし | COMP-03 |
| `04-competitive-analysis-part2-oss-saas.md` | OSS vs SaaS分析 | OSS-first（Langfuseモデル）がコスト制御・HITL・エラーハンドリングに最適 | COMP-04 |

### Phase 5: 市場規模・ペインポイント

| ファイル | タイトル | 一文サマリー | 要件 |
|---------|---------|-------------|------|
| `05-developer-pain-points-and-market-sizing-part1.md` | 市場規模推計 | コスト制御SAM $500M-1.2B。AIインフラ市場全体$1.5-2.5B | MRKT-01 |
| `05-developer-pain-points-and-market-sizing-part2.md` | ペインポイント分析 | コスト制御ペイン88/125（1位）。「予算超過のサイレント蓄積」125/125（満点） | MRKT-02 |

### Phase 6: 規制・構造的機会

| ファイル | タイトル | 一文サマリー | 要件 |
|---------|---------|-------------|------|
| `06-regulatory-and-structural-opportunities-part1.md` | 参入障壁・モート分析 | 3/14カテゴリがFeasible。コスト制御モート18/25が最強 | MRKT-03 |
| `06-regulatory-and-structural-opportunities-part2.md` | 規制需要分析 | EU AI Act Art.14→HITL必須。36,000-80,000社が対象 | MRKT-04 |

### Phase 7: 収益モデル

| ファイル | タイトル | 一文サマリー | 要件 |
|---------|---------|-------------|------|
| `07-revenue-model-analysis-part1.md` | 収益モデル分析 | ハイブリッドモデル最適。粗利率70-85%（SaaS型、AI推論コストなし） | REV-01, REV-02 |
| `07-revenue-model-analysis-part2.md` | OSS成功事例 | Langfuse/PostHog/Helicone等5社のGTMパターン。SDK-Firstが共通 | REV-03 |

### Phase 8: 戦略統合・推薦

| ファイル | タイトル | 一文サマリー | 要件 |
|---------|---------|-------------|------|
| `08-strategic-synthesis-part1.md` | 推薦領域・GTM | コスト制御9.10/10、HITL 8.85/10。Agent Governanceプラットフォーム統合 | STRT-01, STRT-02 |
| `08-strategic-synthesis-part2.md` | 実行計画・リスク | 90日クイックスタート + 12ヶ月ロードマップ + 11リスク評価 | STRT-03, STRT-04 |

---

## 核心的結論

1. **何を作るか**: Agent Governance プラットフォーム（コスト制御 + HITL + エラーハンドリング）
2. **どう作るか**: SDK-First → OSS（MIT）→ セルフホスト → Cloud → Enterprise（Langfuseモデル）
3. **いつ始めるか**: 2026年Q2（今すぐ）。EU AI Act施行（8月2日）まで5ヶ月
4. **リスクは**: 管理可能。深刻リスク1件、3つのピボットオプション、3つの撤退シグナル
5. **いつ撤退するか**: M6 Stars<200、M9 有料<5、M12 MRR<$2,000

---

## データの鮮度と再評価のタイミング

| データポイント | 基準時点 | 再評価推奨時期 | 理由 |
|-------------|---------|-------------|------|
| MCP仕様バージョン | 2026年3月 | 2026年6月 | MCP次期仕様リリース予定 |
| AAIF相互運用性仕様 | 策定中 | 2026年Q3 | 公表予定 |
| EU AI Act高リスクガイダンス | 未公表 | 2026年Q2-Q3 | 欧州委員会が遅延中 |
| 競合資金調達状況 | 2026年3月 | 毎月 | Crunchbase/PitchBook |
| フレームワーク市場シェア | 2026年3月 | 四半期 | PyPI/npm DL数 |

---

## 方法論と制約

**情報源**:
- アナリストレポート（Gartner, Forrester, Deloitte）
- 資金調達データベース（Crunchbase, Tracxn, PitchBook）
- 開発者データ（GitHub stars, PyPI/npm DL数, Discordメンバー数）
- 規制テキスト（EU AI Act, Colorado AI Act, 日本AIプロモーション法）
- 製品ドキュメント、プレスリリース、技術ブログ

**制約**:
- 一次情報（ユーザーインタビュー、創業者インタビュー）は未実施。推薦領域決定後に実施予定
- 非公開ラウンドの資金調達額は含まれない
- チーム規模はLinkedIn/Tracxn等の推計値
- 市場規模推計はBottom-up + Top-down分析による推計値（実測データではない）
- 本レポートは法的助言ではない。EU AI Act対応は法律専門家への相談を推奨

---
*レポート作成: 2026年3月13日*
*全23要件中23要件完了（100%）*
