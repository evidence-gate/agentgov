# 3. AIエージェント・インフラの技術標準化動向（2026年3月時点）

## 3.1 はじめに -- 標準化がインフラ投資判断に与える影響

AIエージェント・インフラの構築を検討する際、「どの技術標準の上に構築するか」は最も重要な戦略的判断の一つである。成熟した標準の上に構築すればエコシステムの恩恵を受けられるが、未成熟な標準に賭ければ仕様変更による手戻りリスクを負う。

本セクションでは、2026年3月時点でAIエージェント・インフラに影響を与える主要な標準化の取り組みを整理し、それぞれの成熟度と「今すぐ構築可能か（build-now）」「様子見が必要か（wait-and-see）」を評価する。セクション1（プロトコル・ランドスケープ）がMCP・A2A・AG-UIのプロトコル仕様そのものを詳述したのに対し、本セクションはそれらのプロトコルを取り巻く**標準化プロセスと組織**に焦点を当てる。

---

## 3.2 AAIF（Agentic AI Foundation）-- エージェント標準のガバナンス拠点

### 3.2.1 設立経緯と構造

Agentic AI Foundation（AAIF）は、2025年12月9日にLinux Foundation傘下の directed fund として正式に設立された。設立時の主要プロジェクト貢献は以下の3つである。

| プロジェクト | 貢献元 | 概要 |
|------------|--------|------|
| **Model Context Protocol (MCP)** | Anthropic | エージェント-ツール間の標準プロトコル |
| **goose** | Block (旧Square) | エージェント・インフラの実践的ツールキット |
| **AGENTS.md** | OpenAI | コーディング・エージェント向けのオープンフォーマット。20,000以上のOSSプロジェクトが採用 |

設立時のファウンディング・メンバーはAnthropic、Block、OpenAIの3社。AIの最大手3社が**競合関係にありながら**共同で標準化組織を設立した点は、プロトコル標準化に対する業界のコミットメントの強さを示している。

### 3.2.2 メンバーシップの急拡大

AAIFのメンバーシップは設立後急速に拡大している。

| 時期 | メンバー数 | 主な追加メンバー |
|------|-----------|---------------|
| **2025年12月（設立時）** | 3 | Anthropic, Block, OpenAI（ファウンディング） |
| **プラチナメンバー追加** | 8+ | AWS, Bloomberg, Cloudflare, Google, Microsoft |
| **2026年2月** | 146 | 97新メンバーを歓迎。Gold: Akamai, American Express, Autodesk, Circle, Equinix, Hitachi, Huawei, JPMorgan Chase, Lenovo, Red Hat, ServiceNow, UiPath 等 |

2026年3月時点でAAIFは**146メンバー**を擁するコミュニティとなっている。メンバー構成はクラウドプロバイダー（AWS, Google, Microsoft）、インフラベンダー（Cisco, IBM, Oracle, SAP）、データ/AI企業（Hugging Face, Databricks, Snowflake）、金融機関（JPMorgan Chase, American Express）、通信（TELUS）と多岐にわたり、AIエージェント標準化への業界全体の関心の高さを示している。

ガバナンスにおいては、AWSのDavid Nalley（Developer Experience担当ディレクター、20年以上のOSSリーダーシップ経験）がガバニングボード議長に就任している。

### 3.2.3 イベントと活動

AAIFは2026年に本格的な活動を展開している。

- **MCP Dev Summit North America 2026**（2026年4月2-3日、ニューヨーク）: 95以上のセッションを予定。MCPの共同創設者、メンテナー、貢献者、本番運用組織からの発表が予定されている。

### 3.2.4 期待される成果物

AAIFから期待される最も重要な成果物は、**MCP/A2A共同相互運用仕様**である。

- **予想時期**: 2026年Q3（セクション1で言及）
- **内容**: MCPとA2Aの相互運用方法を標準化する仕様。現在、エージェントがMCP経由でツールを使い、A2A経由で他のエージェントにタスクを委譲する際のプロトコル間連携は各実装者に委ねられている。AAIFの共同仕様はこの連携を標準化する
- **影響評価**: この仕様が策定されれば、プロトコル境界のインフラ設計に大きな影響を与える。MCP GatewayがA2Aトラフィックも処理する必要が生じる可能性があり、インフラの設計前提が変わり得る

**影響シナリオ分析:**

| シナリオ | 確率 | インフラへの影響 |
|---------|------|----------------|
| AAIF共同仕様がQ3 2026に予定通りリリース | 中 | MCP/A2A統合インフラの需要が急増。早期参入者に優位性 |
| AAIF共同仕様が遅延（2027以降） | 中-高 | MCP単独のインフラで当面は十分。A2A対応は後回しでも良い |
| AAIF内で方向性の対立が発生 | 低 | プロトコル断片化のリスク。標準に依存しない設計が安全 |

### 3.2.5 インフラ構築者への示唆

AAIFの存在は「MCPとA2Aが業界標準として存続する」ことの強力なシグナルである。146メンバーを擁するLinux Foundation傘下の組織が支えている以上、これらのプロトコルが放棄されるリスクは極めて低い。インフラ構築者にとっては、MCP/A2Aを前提とした設計が安全であることの裏付けとなる。

ただし、AAIFの共同相互運用仕様の内容次第では、プロトコル間のインフラ設計が大きく変わる可能性がある。Q3 2026の動向を注視し、仕様ドラフトの段階から追跡することが推奨される。

---

## 3.3 OAuth 2.1 for MCP -- エージェント認証の標準化

### 3.3.1 MCP認証仕様の現在地

MCPの2025-11-25仕様は、リモートMCPサーバーとの通信にOAuth 2.1を標準認証方式として定めている（セクション1.2.4で概説済み）。本セクションでは、その実装状況と課題を掘り下げる。

MCPの認証アーキテクチャは以下のコンポーネントで構成される。

| コンポーネント | RFC / 仕様 | 役割 |
|-------------|-----------|------|
| **OAuth 2.1** | draft-ietf-oauth-v2-1 | 認証・認可の基盤フレームワーク |
| **PKCE** | RFC 7636 | パブリッククライアント向けの認可コード横取り攻撃対策 |
| **Dynamic Client Registration** | RFC 7591 | MCPクライアントが未知のサーバーに自動登録 |
| **Protected Resource Metadata** | RFC 9728 | MCPサーバーが認可サーバー情報を公開する仕組み |
| **Resource Indicators** | RFC 8707 | トークンの不正利用防止 |

### 3.3.2 Dynamic Client Registration (RFC 7591) の実装状況

Dynamic Client Registration（DCR）はMCPエコシステムの要となる技術である。ユーザーがClaude DesktopやChatGPTから新しいMCPサーバーに初めて接続する際、事前のクライアント登録なしにOAuthフローを自動的に開始できる仕組みを提供する。

**現在のMCP仕様での位置づけ:**
- MCPクライアントと認可サーバーはDCR（RFC 7591）をサポートしてもよい（MAY）
- 実際には、ChatGPT（OpenAI）は接続のたびにDCRを使って新しいOAuthクライアントを登録する
- DCRが利用できない場合のフォールバックメカニズムも仕様に含まれている

**参考実装の状況:**

| 実装 | 開発者 | 特徴 |
|------|--------|------|
| mcp-oauth-gateway | コミュニティ | 任意のMCPサーバーにコード変更なしでOAuth 2.1認証を追加するゲートウェイ |
| Stytch MCP統合 | Stytch | MCP認証・認可の包括的実装ガイド |
| Auth0 MCP統合 | Auth0 (Okta) | MCP仕様の認証要件に関する詳細な技術解説とライブラリ |
| OpenAI Apps SDK | OpenAI | OpenAI公式のMCP OAuth認証実装 |

### 3.3.3 Protected Resource Metadata (RFC 9728)

MCP仕様の draft バージョンでは、Protected Resource Metadata（PRM）が重要な追加要素として導入されている。

- MCPサーバーはOAuth 2.0 Protected Resource Metadata (RFC 9728) を実装**しなければならない**（MUST）
- MCPクライアントはPRMを使って認可サーバーを発見**しなければならない**（MUST）
- PRMにより、MCPサーバーは `/.well-known/oauth-protected-resource` エンドポイントで自身の認可要件を公開する

PRM の導入は、MCPサーバーを「自己記述的（self-describing）」にする重要なステップである。MCPクライアントは、PRMを参照するだけでどの認可サーバーを使うべきか、どのスコープが必要かを自動的に判断できる。

### 3.3.4 サードパーティ認可の分離

MCP OAuth 2.1の重要な設計特性として、MCPサーバーと認可サーバーの分離がある。MCPクライアントとサーバーは認可を**サードパーティのサービスに委譲**できる。これにより、MCP Gatewayやマネージド認証サービスが認証レイヤーとして挿入される自然なアーキテクチャが成立する。

この設計は、**認証管理をインフラサービスとして提供する**というビジネスモデルを直接的に支持している。

### 3.3.5 次期仕様リリース（2026年6月予定）

MCP仕様の次期リリースは**2026年6月**が暫定的に予定されている。主な改善点は以下の通り。

- **Streamable HTTPの改善**: ロードバランサーとの親和性向上、水平スケーリングの改善
- **ステートレスプロトコル設計**: プロトコル自体はステートレスに、アプリケーションレベルでステートフルセッションをサポート
- **Elicitationの成熟**: サーバーがクライアントを通じてユーザーに質問できる機能の安定化
- **Resource Indicators (RFC 8707) の必須化**: トークンの不正利用防止のためのリソースインジケーターをMCPクライアントに要求

### 3.3.6 課題と残存リスク

| 課題 | 深刻度 | 詳細 |
|------|--------|------|
| DCR参考実装の不足 | 中 | RFC 7591自体は2015年のRFCだが、MCP文脈での本番運用実績が少ない |
| サーバー開発者の実装負荷 | 高 | OAuth 2.1 + PKCE + DCR + PRM + Resource Indicatorsの全スタックを正しく実装する負荷が大きい |
| 仕様の流動性 | 中 | 2026年6月の次期リリースで認証周りの変更が予想される |
| OAuth 2.1自体がドラフト | 低 | OAuth 2.1はまだIETFドラフト段階だが、実質的にはOAuth 2.0 + ベストプラクティスの集約であり、内容は安定 |

**インフラ機会**: サーバー開発者のOAuth実装負荷の高さは、「認証をマネージドサービスとして提供する」というインフラ・ビジネスの需要を直接的に裏付けている。mcp-oauth-gatewayのようなプロジェクトが既に登場していることは、この需要の存在を示すシグナルである。

---

## 3.4 OpenTelemetry GenAI Semantic Conventions -- エージェント可観測性の標準化

### 3.4.1 概要と位置づけ

OpenTelemetry（OTel）のGenAI Semantic Conventionsは、AIエージェントの可観測性を標準化するための属性とスパン定義のセットである。「一度計装すれば、あらゆるバックエンドにエクスポートできる」というOTelの原則をAIエージェントに適用するものである。

### 3.4.2 現在のステータス

| 項目 | 詳細 |
|------|------|
| **全体ステータス** | Development（開発中） -- **Stableではない** |
| **ベースバージョン** | v1.37以降でGenAI属性をサポート |
| **環境変数** | `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental` で最新の実験的バージョンを有効化 |
| **デフォルト動作** | v1.36.0以前のバージョンを出力（互換性維持） |

**重要**: GenAI Semantic Conventionsは2026年3月時点で**まだStable（安定版）ではない**。遷移計画（transition plan）はStableバージョンのリリース前に更新される予定であるが、具体的な安定化時期は未定。

### 3.4.3 エージェント固有のセマンティック規約

GenAI Semantic Conventionsには、エージェント固有のスパン定義が含まれている。

**エージェントスパン属性 (gen_ai.agent.*):**

| 属性 | 説明 | 型 |
|------|------|-----|
| `gen_ai.agent.id` | エージェントの一意識別子 | string |
| `gen_ai.agent.name` | エージェントの人間可読な名前 | string |
| `gen_ai.agent.description` | エージェントの説明 | string |
| `gen_ai.agent.version` | エージェントのバージョン | string |

**オペレーション名:**
- `gen_ai.operation.name` = `invoke_agent` （エージェント呼び出し）
- スパン名: `invoke_agent {gen_ai.agent.name}`

**LLMクライアントスパン属性:**

| 属性 | 説明 |
|------|------|
| `gen_ai.request.model` | リクエストされたモデル名 |
| `gen_ai.usage.input_tokens` | 入力トークン数 |
| `gen_ai.usage.output_tokens` | 出力トークン数 |
| `gen_ai.provider.name` | プロバイダー名 |
| `gen_ai.operation.name` | オペレーション名（chat, text_completion等） |

### 3.4.4 可観測性ベンダーの採用状況

| ベンダー | サポート状況 | 詳細 |
|---------|------------|------|
| **Datadog** | ネイティブサポート（v1.37+） | GenAI属性をLLM Observabilityスキーマに自動マッピング。OTel Collector経由またはDatadog Agent OTLP直接取り込み |
| **Langfuse** | OTelバックエンドとして動作 | `/api/public/otel` (OTLP) エンドポイントでトレースを受信。GenAI semantic conventions準拠を目指す |
| **New Relic** | OTel GenAIサポート | 標準OTelコレクター経由での取り込みをサポート |

### 3.4.5 エージェントフレームワークの計装状況

2026年初頭時点で、エンタープライズAIエージェントデプロイメントの**70%以上**がOpenTelemetryをテレメトリの基盤として使用しているとされる。主要フレームワークの対応状況は以下の通り。

| フレームワーク | OTelサポート | 詳細 |
|-------------|------------|------|
| **CrewAI** | OTelフォーマットで出力 | GenAI semantic conventions準拠のトレース出力 |
| **Pydantic AI** | OTelフォーマットで出力 | 標準化されたスパン出力 |
| **Strands Agents** | OTelフォーマットで出力 | AWS提供のフレームワーク |
| **LangGraph** | LangSmith経由（独自形式）+ OTelエクスポート | LangSmithが主要だが、OTelエクスポートも可能 |
| **FastMCP 3.x** | OTel組み込み | MCPサーバーの計装にOTelを内蔵 |

### 3.4.6 ギャップ分析

現在のGenAI Semantic Conventionsにはいくつかの重要なギャップが残されている。

| ギャップ | 影響 | 予想される対応時期 |
|---------|------|-------------------|
| **Stable版未リリース** | 本番環境での採用に慎重さが必要。属性名の変更リスクあり | 未定（遷移計画が更新される予定） |
| **フレームワーク固有の属性が未標準化** | 各フレームワークが独自の追加属性を定義しており、横断的な比較が困難 | フレームワーク固有のセマンティック規約を定義する議論が進行中 |
| **マルチエージェント間のコンテキスト伝搬** | A2A経由でのエージェント間トレース伝搬は技術的に可能だが、標準的なパターンが未確立 | AAIFの共同仕様に依存する可能性 |
| **コスト属性の不足** | トークンコストの属性は定義されているが、エージェント全体のタスクコスト（複数LLM呼び出し + ツール呼び出しの合計）の標準的な集計方法がない | コスト・アトリビューション機能はインフラサービスの差別化ポイント |

### 3.4.7 インフラ構築者への示唆

OpenTelemetry GenAI Semantic Conventionsは「Stableではないが、デファクト標準になりつつある」という特殊な状況にある。DatadogやLangfuseのような主要ベンダーが既にサポートしており、主要フレームワークも対応を進めている。この状況は、OTelに基づく可観測性インフラを構築する上で以下を意味する。

1. **OTelは採用して問題ない**: デファクト標準としての地位は確立している。属性名の変更リスクはあるが、マッピングレイヤーで吸収可能
2. **コスト・アトリビューションは差別化機会**: トークンコストのスパン属性は存在するが、エージェント-タスク-ユーザーの階層でのコスト集計は標準化されていない。ここを解決するインフラサービスに価値がある
3. **マルチエージェント・トレーシングは未開拓**: A2A境界を跨ぐトレースの標準パターンが存在しない。AAIFの共同仕様待ちだが、先行して実装する価値がある

---

## 3.5 その他の標準化動向

### 3.5.1 A2A Agent Cardと Agent Registry

A2Aプロトコルにおけるエージェント発見メカニズム（Agent Card）とレジストリの標準化が進行中である。

- **Agent Card**: `/.well-known/agent.json` にJSON形式でエージェントのメタデータを公開する規約。能力、エンドポイント、認証要件を記述
- **Agent Registry**: エージェント・カードの集中管理と検索機能を提供するサービス。A2Aプロトコルは現時点ではレジストリの標準APIを定義していないが、コミュニティで標準化の議論が進行中
- **Mega Agent**: レジストリ内のAgent Cardを分析し、能力に基づいてエージェントを発見する「エージェント発見エージェント」の概念が登場
- **Google Cloud Marketplace**: Google CloudではA2AエージェントをMarketplaceから追加・管理する機能が提供されている

### 3.5.2 MCP次期仕様（2026年6月予定）

MCP仕様の次期リリースに向けて、複数のSpec Enhancement Proposals (SEPs) が議論されている。

- **トランスポートの改善**: ステートレスなプロトコル設計への移行。ロードバランサーとの親和性向上
- **サーバー発見メカニズム**: レジストリがMCPサーバーの機能を接続なしに学習できる仕組み
- **Q1 2026中にSEP確定** → **2026年6月に次期仕様リリース**（暫定スケジュール）

### 3.5.3 EU AI Act（2026年8月施行）

EU AI Actのhigh-risk AI規制が2026年8月2日に施行される。エージェント・インフラに直接的な影響を与える要件が含まれる。

| 要件 | インフラへの影響 |
|------|----------------|
| **リスク管理システム** (Article 9) | エージェントの行動を継続的にモニタリングするインフラが必要 |
| **データガバナンス** (Article 10) | エージェントが処理するデータの品質管理・記録が必要 |
| **技術文書** (Article 11) | エージェントの設計・動作の詳細な文書化が必要 |
| **ログ記録** (Article 12) | エージェントの意思決定プロセスの監査証跡が必要 |
| **人間による監視** (Article 14) | Human-in-the-loopまたはhuman-on-the-loopの仕組みが必要 |
| **適合性評価** (Article 43) | CE マーキング取得のための適合性評価が必要 |

**インフラ機会**: EU AI Actは、ログ記録、監査証跡、リスク管理、適合性評価のためのインフラ需要を直接的に生む。特に「エージェントの意思決定プロセスの監査証跡」は、MCP Gatewayレイヤーでのログ記録サービスとして提供できる。

### 3.5.4 NIST AI Risk Management Framework

NIST AI RMF (AI 100-1) はAIシステムのリスク管理に関する自主的フレームワークであり、EU AI Actほどの強制力はないが、米国企業のAIガバナンス基盤として広く参照されている。エージェント・インフラにおいては、以下の機能が NIST AI RMF の Map/Measure/Manage フレームワークと連携する。
- **Map**: エージェントの使用状況とリスクプロファイルの把握
- **Measure**: パフォーマンス、コスト、安全性の測定
- **Manage**: ポリシー適用、ガードレール、エスカレーション管理

---

## 3.6 成熟度評価と構築可否判定

以下の表は、各標準化の取り組みを統一的な軸で評価し、インフラ構築者が「今すぐ構築すべきか」を判断するための指針を提供する。

| 標準化の取り組み | 現在の成熟度 | 安定化までの予想期間 | 構築可否判定 | リスク評価 |
|-----------------|------------|-------------------|-------------|-----------|
| **MCP仕様（2025-11-25）** | 安定（Stable） | リリース済み | **Build Now** | 低。次期リリース（2026年6月）は後方互換の改善が中心 |
| **OAuth 2.1 for MCP** | 実質安定 | OAuth 2.1自体はドラフトだが内容は安定 | **Build Now** | 低-中。RFC 7591/9728は確立されたRFC。MCP固有の実装パターンは流動的 |
| **Dynamic Client Registration (RFC 7591)** | RFC確定済みだがMCP実装は初期段階 | 6-12ヶ月でMCP参考実装が成熟 | **Build Now (with caution)** | 中。参考実装が少なく、エッジケースの知見が不足 |
| **Protected Resource Metadata (RFC 9728)** | RFC確定済み、MCP draft仕様でMUST | 次期MCP仕様（2026年6月）で確定 | **Build Now** | 低。RFC自体は安定。MCP仕様での位置づけは次期リリースで確定 |
| **OpenTelemetry GenAI Semantic Conventions** | Development（実験的） | 安定化時期未定 | **Build Now (with abstraction layer)** | 中。属性名変更の可能性あるが、マッピングレイヤーで吸収可能。デファクト標準化は進行中 |
| **OTel Agent Spans (gen_ai.agent.*)** | Development（実験的） | 安定化時期未定 | **Prepare** | 中-高。エージェント固有のスパン定義はまだ流動的 |
| **AAIF MCP/A2A共同相互運用仕様** | 未リリース | Q3 2026予想（不確実） | **Monitor** | 高。仕様の方向性次第でインフラ設計が変わる |
| **A2A Agent Registry標準** | ディスカッション段階 | 12-24ヶ月以上 | **Monitor** | 高。標準APIが未定義。コミュニティ議論の段階 |
| **EU AI Act（高リスク規制）** | 法律確定、施行準備中 | 2026年8月2日施行 | **Prepare** | 低（施行は確定）。対応インフラの需要は確実 |
| **MCP次期仕様** | SEP議論中 | 2026年6月（暫定） | **Monitor** | 中。現行仕様からの破壊的変更は限定的と予想 |

### 構築可否判定の凡例

- **Build Now**: 現在の仕様で構築して問題ない。破壊的変更のリスクが低い
- **Build Now (with caution/abstraction)**: 構築可能だが、変更に備えた抽象化層を設けるべき
- **Prepare**: 仕様を深く理解し、設計は進めるが、本格的な構築は待つべき
- **Monitor**: 追跡し続けるが、まだ構築や設計の前提には使わない

---

## 3.7 主要な発見と示唆

1. **AAIFは「標準の標準」になりつつある**: 146メンバーを擁し、MCP/A2Aの両方を管轄する唯一の組織。AAIFの動向はプロトコル標準全体の方向性を左右する

2. **OAuth 2.1 for MCPは「Build Now」**: OAuth 2.1のコンポーネント（PKCE, DCR, PRM, Resource Indicators）はすべて確立されたRFCに基づいており、MCP固有の実装パターンも急速に成熟中。認証インフラの構築は今すぐ始められる

3. **OTel GenAIは「デファクト・スタンダードだがStableではない」**: Datadog、Langfuseが既にサポートし、主要フレームワークも対応済み。抽象化層を設ければ安全に構築可能

4. **コスト・アトリビューションは標準化のギャップ**: トークンレベルのコスト属性は存在するが、エージェント-タスク-ユーザーの階層でのコスト集計は標準化されていない。インフラサービスの差別化ポイント

5. **EU AI Actは確実な需要ドライバー**: 2026年8月のhigh-risk規制施行は、監査ログ・リスク管理・適合性評価のインフラ需要を確実に生む

6. **MCP次期仕様（2026年6月）に注意**: 認証とトランスポートの改善が予定されている。現行仕様で構築を始めつつ、次期仕様への対応を計画すべき

7. **Agent Registry標準は未成熟**: A2AのAgent Discovery/Registryは議論段階であり、標準APIは未定義。この領域への投資は時期尚早

---

## 3.8 出典

### AAIF（Agentic AI Foundation）
- [Linux Foundation AAIF設立発表](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation)
- [AAIF公式サイト](https://aaif.io/)
- [AAIF 97新メンバー歓迎](https://www.linuxfoundation.org/press/agentic-ai-foundation-welcomes-97-new-members)
- [MCP Dev Summit North America 2026 スケジュール](https://www.linuxfoundation.org/press/agentic-ai-foundation-unveils-mcp-dev-summit-north-america-2026-schedule)
- [OpenAI AAIF共同設立発表](https://openai.com/index/agentic-ai-foundation/)
- [Block AAIF共同設立発表](https://block.xyz/inside/block-anthropic-and-openai-launch-the-agentic-ai-foundation)
- [Solo.io -- AAIFとAgent Gateway](https://www.solo.io/blog/aaif-announcement-agentgateway)

### OAuth 2.1 / MCP認証
- [MCP Authorization仕様（draft）](https://modelcontextprotocol.io/specification/draft/basic/authorization)
- [MCP OAuth認証 -- Stack Overflow Blog](https://stackoverflow.blog/2026/01/21/is-that-allowed-authentication-and-authorization-in-model-context-protocol/)
- [MCP OAuth認証パターン -- Stytch](https://stytch.com/blog/MCP-authentication-and-authorization-guide/)
- [MCP OAuth Dynamic Client Registration -- Stytch](https://stytch.com/blog/mcp-oauth-dynamic-client-registration/)
- [Remote MCP OAuth 2.1 実装解説 -- Medium](https://medium.com/@yagmur.sahin/remote-mcp-in-the-real-world-oauth-2-1-9d149de6e475)
- [MCP仕様アップデート（2025年6月）-- Auth0](https://auth0.com/blog/mcp-specs-update-all-about-auth/)
- [MCP認証とRFC 8707 -- Oso](https://www.osohq.com/learn/authorization-for-ai-agents-mcp-oauth-21)
- [mcp-oauth-gateway -- GitHub](https://github.com/atrawog/mcp-oauth-gateway)
- [OAuth 2.1ドラフト仕様](https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/)
- [RFC 7591 -- Dynamic Client Registration](https://datatracker.ietf.org/doc/html/rfc7591)

### OpenTelemetry GenAI
- [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- [OTel GenAI Agent Spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/)
- [OTel GenAI Client Spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/)
- [OTel GenAI Metrics](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-metrics/)
- [AI Agent Observability -- OTel Blog](https://opentelemetry.io/blog/2025/ai-agent-observability/)
- [Datadog OTel GenAI Semantic Conventions サポート](https://www.datadoghq.com/blog/llm-otel-semantic-convention/)
- [Langfuse OpenTelemetry統合](https://langfuse.com/integrations/native/opentelemetry)

### MCP仕様ロードマップ
- [2026 MCP Roadmap](http://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/)
- [MCP Transport Future](http://blog.modelcontextprotocol.io/posts/2025-12-19-mcp-transport-future/)
- [MCP次期バージョンアップデート](https://modelcontextprotocol.info/blog/mcp-next-version-update/)
- [MCP仕様の新機能 -- Cisco Blog](https://blogs.cisco.com/developer/whats-new-in-mcp-elicitation-structured-content-and-oauth-enhancements)

### 規制
- [EU AI Act -- European Commission](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)
- [EU AI Act 2026コンプライアンスガイド](https://secureprivacy.ai/blog/eu-ai-act-2026-compliance)
- [EU AI Act high-risk要件 -- Dataiku](https://www.dataiku.com/stories/blog/eu-ai-act-high-risk-requirements)

### エージェント発見・レジストリ
- [A2A Agent Discovery](https://a2a-protocol.org/latest/topics/agent-discovery/)
- [A2A Agent Registry Proposal -- GitHub Discussion](https://github.com/a2aproject/A2A/discussions/741)
- [Agent Discovery -- Solo.io](https://www.solo.io/blog/agent-discovery-naming-and-resolution---the-missing-pieces-to-a2a)
- [Google Cloud A2A Agent Marketplace](https://docs.google.com/gemini/enterprise/docs/register-and-manage-marketplace-agents)

---
*本セクション作成: 2026年3月13日*
*データの基準時点: 2026年3月*
*次セクション: 04-multi-agent-trends.md（マルチエージェント・システムのトレンド）*
