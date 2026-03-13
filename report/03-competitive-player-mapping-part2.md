# 3. 競合プレイヤーマッピング（後編：カテゴリ8-14 + 横断サマリー）

*前編（カテゴリ1-7）は `03-competitive-player-mapping-part1.md` を参照。*

---

## 3.11 カテゴリ8: メモリ / ステート永続化

**成熟度**: Growing（成長期）
**小規模チームの参入機会**: MEDIUM

### プレイヤー一覧

| プレイヤー | 資金調達額 | チーム規模（推計） | アプローチ | マルチエージェント対応 | 主な特徴 |
|-----------|-----------|-----------------|-----------|-------------------|---------|
| **Mem0** | $24M（Series A, 2025年10月） | ~30名 | マネージドメモリAPI | 限定的 | 月間186M API呼び出し、80,000+開発者、AWS Agent SDK独占メモリプロバイダー |
| **Zep** | ~$2.3M Seed | ~5名 | テンポラル知識グラフ | Yes | エピソード記憶、時系列構造化、グラフベースメモリ |
| **Letta** | $10M Seed | ~15名 | メモリ + エージェントフレームワーク（旧MemGPT） | Yes | 永続メモリエージェント、ツール統合 |
| **LangGraph** | LangChain Inc.の一部 | -- | 組み込みチェックポイント | フレームワーク内 | ステート永続化、リプレイ |
| **Chroma** | $18M Series A | ~20名 | ベクトルDB | N/A | エンベディングストレージ（メモリの下位レイヤー） |
| **Pinecone** | $138M+ | ~200名 | ベクトルDB | N/A | マネージドベクトル検索（メモリの下位レイヤー） |

### 詳細分析

**Mem0** は$24M Series A（Basis Set Ventures主導、Peak XV Partners、GitHub Fund、Y Combinator参加）を調達し、エージェントメモリ市場のリーダーポジションを確立。Q3 2025時点で月間186M API呼び出しを処理し、80,000以上の開発者が登録。AWSのAgent SDKの独占メモリプロバイダーに選定されたことは、プラットフォーム・パートナーシップの強力なシグナル。「メモリ・パスポート」というコンセプト（AIメモリがアプリ間を移動する）を推進。

**Zep** はテンポラル知識グラフベースのメモリアーキテクチャを採用。$2.3M Seedと小規模だが、エピソード記憶の時系列構造化という独自アプローチで差別化。人間の記憶に近いモデル（単純なフラットログではなく、意味のある時系列シーケンス）を提供。

**Letta** （旧MemGPT）は$10M Seedを調達し、メモリ付きエージェントフレームワークとして位置づけ。メモリとツール統合を一体化したアプローチで、フレームワーク兼インフラのポジション。

### 強み・弱み・ギャップ分析

**強み:**
- Mem0が$24Mの資金力でカテゴリリーダーを確立
- ベクトルDBレイヤー（Chroma、Pinecone）は成熟

**弱み・ギャップ:**
- **クロスエージェントメモリの共有・ガバナンスが未解決**: エージェントAの記憶をエージェントBがアクセスする際のアクセス制御・プライバシー管理が標準化されていない
- **メモリの品質評価が不在**: エージェントが保持する記憶の正確性・関連性・鮮度を評価する仕組みがない
- **セマンティックメモリ vs エピソードメモリ vs プロシージャルメモリの統合**: 各タイプのメモリを統合的に管理するソリューションがない
- **メモリのコスト帰属**: メモリの保持・検索にかかるコストをエージェント予算に統合する仕組みがない

**小規模チーム参入機会: MEDIUM** -- Mem0 ($24M) がリーダーだが、クロスエージェントメモリガバナンスやメモリ品質評価といったニッチは空白。ただし、メモリ専業での差別化よりも、コスト制御やオブザーバビリティとの統合が現実的。

---

## 3.12 カテゴリ9: ガードレール / 安全性

**成熟度**: Growing（成長期）
**小規模チームの参入機会**: MEDIUM

### プレイヤー一覧

| プレイヤー | 資金調達額 | チーム規模（推計） | アプローチ | 対応範囲 | エージェント固有機能 |
|-----------|-----------|-----------------|-----------|---------|-------------------|
| **Guardrails AI** | $7.5M Seed | ~20名 | OSSフレームワーク（Python） | 入力/出力バリデーション | バリデーション + 修正メカニズム |
| **Lakera** | $30M（$20M Series A含む） | ~40名 | リアルタイムAPI | プロンプトインジェクション防御 | Lakera Guard（リアルタイム保護） |
| **NVIDIA NeMo Guardrails** | NVIDIAの一部 | -- | OSSフレームワーク | 会話フロー制御 | Colangベースのルール記述 |
| **Prompt Security** | $5M Seed | ~15名 | ミドルウェア | プロンプト攻撃防御 | エンタープライズ統合 |
| **Arthur AI** | $42M | ~60名 | AIモニタリング + ガードレール | 包括的 | エンタープライズAIガバナンス |
| **Portkey** | $18M | ~40名 | ゲートウェイ統合 | 50+ガードレール | ゲートウェイレベルのポリシー適用 |

### 詳細分析

**Guardrails AI** は$7.5M Seedを調達し、PythonベースのOSSガードレールフレームワークとして確立。バリデーション（出力の検証）と修正（不適切な出力の自動修正）の両方を提供。月間10,000以上のダウンロード。ただし、LLMの出力バリデーションが中心で、エージェントの行動（ツール使用、データアクセス）に対するガードレールは限定的。

**Lakera** は$30M（$20M Series A、Atomico主導）を調達し、プロンプトインジェクション防御の専門企業として確立。Lakera Guardがリアルタイムでプロンプトインジェクションとデータ漏洩をブロック。100万人以上がGandalf（教育ツール）でAIセキュリティを学習。2026年はプライバシーから敵対的・エージェント的脅威への防御拡張にフォーカス。

**Portkey** はゲートウェイに50以上のガードレールを組み込み、ガードレール専用ツールなしでも基本的なポリシー適用を可能にしている。

### 強み・弱み・ギャップ分析

**強み:**
- プロンプトインジェクション防御はLakeraが先行
- OSSフレームワーク（Guardrails AI、NeMo）が利用可能
- カリフォルニア州の2026年AI法（SB 53等）が需要を加速

**弱み・ギャップ:**
- **汎用LLMガードレール vs エージェント固有ガードレールの分離が未解決**: 既存ソリューションはLLM出力の検証が中心。エージェントの行動（どのツールを呼ぶか、どのデータにアクセスするか）に対するポリシーベースのガードレールは不足
- **ハードガードレールの不在**: CSA（Cloud Security Alliance）が「現在のソフトガードレールは壊滅的に失敗している」と指摘。決定論的に強制可能なハードガードレールが不足
- **EU AI Act対応の統合ソリューション**: 2026年8月施行のEU AI Actに対応するコンプライアンス・ガードレールを提供するプレイヤーが不在

**小規模チーム参入機会: MEDIUM** -- Lakera ($30M)、Arthur AI ($42M) が大型調達済み。エージェント固有のポリシー強制やEU AI Act対応に特化すれば差別化の余地があるが、セキュリティ分野はエンタープライズの信頼構築が必須であり、小規模チームには不利な面も。

---

## 3.13 カテゴリ10: シークレット / クレデンシャル管理

**成熟度**: Mature（汎用）/ Early（エージェント固有）
**小規模チームの参入機会**: MEDIUM

### プレイヤー一覧

| プレイヤー | 資金調達額 | アプローチ | エージェント固有機能 | 主な特徴 |
|-----------|-----------|-----------|-------------------|---------|
| **HashiCorp Vault** | 上場企業（$484M+） | 汎用シークレット管理 | なし | 業界標準のシークレット管理 |
| **AWS Secrets Manager** | AWSの一部 | クラウドネイティブ | なし | AWSエコシステム統合 |
| **Scalekit** | $5.5M Seed | エージェント認証 + トークンボルト | Yes | 暗号化トークンボルト、MCP Auth |
| **Composio** | $29M | マネージドOAuth + トークン管理 | Yes | 3,000+アプリのOAuth管理 |
| **Nango** | ~$10M | OAuth管理 + API統合 | 部分的 | 700+ API OAuth対応 |
| **1Password** | $900M+ | パスワード管理 + 開発者ツール | なし | CLI統合、シークレット参照 |
| **Doppler** | $26M | 開発者向けシークレット管理 | なし | 環境変数管理、CI/CD統合 |

### 詳細分析

汎用シークレット管理（HashiCorp Vault、AWS Secrets Manager、1Password、Doppler）は完全に成熟した市場であり、新規参入の余地はない。

一方、エージェント固有のクレデンシャル管理は異なる要件セットを持つ:

1. **Just-in-Time（JIT）スコープ付きクレデンシャル**: エージェントがタスク実行時にのみ、必要最小限の権限でクレデンシャルを取得し、タスク完了後に自動失効
2. **エージェント単位・タスク単位のアクセス制御**: Agent Aはメール送信権限あり、Agent Bはなし、という粒度のアクセス管理
3. **エージェントライフサイクルに連動した自動ローテーション**: エージェントのデプロイ・アップデート・終了に応じたクレデンシャルローテーション
4. **監査証跡**: 「どのエージェントが、いつ、どのクレデンシャルを使い、何をしたか」のトレーサビリティ

Scalekitがこの方向に最も近いが、$5.5M Seedの段階であり、プロダクト機能はまだ限定的。Composioはクレデンシャル管理を含むが、ツール統合プラットフォームとしてのバンドリングであり、クレデンシャル管理の深さは二次的。

### 強み・弱み・ギャップ分析

**強み:**
- 汎用シークレット管理は完全に解決済み
- ScalekitがMCP Auth + トークンボルトで先行

**弱み・ギャップ:**
- **JITスコープ付きクレデンシャルが未実装**: エージェントのタスク実行中のみ有効な、最小権限クレデンシャルを動的に発行・失効するソリューションが不在
- **エージェントアクションのトレーサビリティ**: 組織の28%しかエージェントの行動を人間のスポンサーに追跡できない（Strata調査）
- **クレデンシャルコストの帰属**: 外部APIへのクレデンシャル使用がコスト（API呼び出し課金）を発生させるが、これをエージェント予算に統合する仕組みがない

**小規模チーム参入機会: MEDIUM** -- エージェント固有のクレデンシャル管理は空白だが、認証（カテゴリ3）との重複が大きい。独立カテゴリとしてよりも、MCP Gatewayの機能として統合されるのが自然な進化パス。

---

## 3.14 カテゴリ11: Human-in-the-Loop / 承認ワークフロー

**成熟度**: Early（初期）-- **高機会領域**
**小規模チームの参入機会**: HIGH

### プレイヤー一覧

| プレイヤー | 資金調達額 | アプローチ | 承認チャネル | フレームワーク非依存 | EU AI Act対応 |
|-----------|-----------|-----------|------------|-------------------|-------------|
| **HumanLayer** | ~$500K（Pre-Seed/Seed） | SDK + MCP | Slack, Email, Discord | Yes | なし |
| **LangGraph interrupt()** | LangChain Inc.の一部 | フレームワーク組み込み | コード内のみ | **No**（LangGraph専用） | なし |
| **Permit.io** | $14M | ポリシーベース認可 | Webhook, アクセスリクエスト | Yes | なし |
| **Inngest** | $16M | ワークフローエンジン | Webhook | Yes（汎用） | なし |
| **Temporal** | $200M+（$103M Series B） | ワークフローオーケストレーション | カスタム | Yes（汎用） | なし |

### 詳細分析

**HumanLayer** はYC F24出身で、AIエージェントのHuman-in-the-Loop（HITL）に最初にフォーカスしたスタートアップ。`@require_approval`デコレータでエージェントの重要なアクション前に人間の承認を要求する仕組みを提供。Slack、Email、Discordでの承認チャネルをサポート。ただし資金が~$500K（Pre-Seed/Seed）と極めて小規模であり、最近はCodeLayer（AIコーディングエージェント向けIDE）にピボットしている兆候がある。

**LangGraph interrupt()** はLangGraphフレームワーク内のHITL機能として最も使われているが、LangGraphに完全にロックインされる。コードレベルのinterruptであり、Slack/Email等の外部承認チャネルとの統合は開発者が自前で構築する必要がある。

**Permit.io** は$14M調達の認可プラットフォームで、Fine-Grained Authorization（FGAC）とアクセスリクエストMCPを提供。ポリシーベースで「この操作には人間の承認が必要」を定義可能。ただし、AIエージェントのHITLは機能の一部であり、主力は汎用認可。

### 規制の追い風: EU AI Act

EU AI Act（2026年8月施行）は、高リスクAIシステムに人間による監視（human oversight）を義務付ける。これは以下のHITLインフラ需要を創出する:

- **リスクベースの自動エスカレーション**: 全アクションではなく、リスクの高いアクションのみを人間にエスカレート
- **承認の監査証跡**: 誰が、いつ、何を承認したかの完全な記録
- **承認疲れ（approval fatigue）への対策**: 1日に数千件の承認リクエストが来ると、人間はゴム印的に承認してしまう。リスクベースのルーティングが必要

### 強み・弱み・ギャップ分析

**強み:**
- EU AI Actが明確な規制の追い風
- HumanLayerが市場を定義したが、小規模のまま

**弱み・ギャップ:**
- **承認疲れ（approval fatigue）の解決が不在**: 1日数千件の承認リクエストを処理する際の「ゴム印化」を防ぐソリューションがない。リスクベースルーティング（高リスクのみエスカレート）は全プレイヤーで未実装
- **フレームワーク非依存のプロダクションHITLが不在**: HumanLayerはフレームワーク非依存だが小規模。LangGraph interrupt()はフレームワークロック。汎用ワークフロー（Temporal、Inngest）はエージェント固有最適化がない
- **EU AI Act準拠のHITLテンプレートが不在**: 規制要件（人間の監視、監査証跡、リスク評価）をテンプレート化して提供するプレイヤーがいない
- **コスト制御とHITLの統合**: 「エージェントが$50以上のアクションを実行しようとしている。承認しますか？」というコストベースのHITLトリガーが未実装

**小規模チーム参入機会: HIGH** -- HumanLayer (~$500K) が唯一の専門プレイヤーだがピボット中。EU AI Actの規制圧力で需要が確実に増加する。承認疲れの解決（リスクベースルーティング）は差別化ポイントになり得る。コスト制御（カテゴリ5）との統合が自然なバンドリング戦略。

---

## 3.15 カテゴリ12: 評価 / テスト

**成熟度**: Growing（成長期）
**小規模チームの参入機会**: MEDIUM

### プレイヤー一覧

| プレイヤー | 資金調達額 | チーム規模（推計） | アプローチ | OSS/Proprietary | 主な特徴 |
|-----------|-----------|-----------------|-----------|----------------|---------|
| **DeepEval（Confident AI）** | 非公開 | ~15名 | OSSフレームワーク | OSS | Pytest風のLLM評価、v3.0でエージェント評価対応 |
| **Braintrust** | $80M（Series B） | ~50名 | プラットフォーム | Proprietary | LLM-as-a-Judge、統合オブザーバビリティ |
| **Arize Phoenix** | $70M（Series C） | ~100名 | OSSプラットフォーム | OSS | 評価 + オブザーバビリティ統合 |
| **Patronus AI** | $40.1M | ~30名 | 自動評価プラットフォーム | Proprietary | Glider LLM（Judge専用モデル）、マルチモーダル評価 |
| **Harbor** | 非公開 | ~5名 | ベンチマークランナー | OSS | 複数ベンチマークの統一実行 |
| **AWS AgentEval** | AWSの一部 | -- | マネージドサービス | Proprietary | AWS Bedrock統合 |

### 詳細分析

**DeepEval** はConfident AIが開発するOSSのLLM評価フレームワーク。v3.0でAIエージェント評価に対応し、PlanQualityMetric（エージェントの計画品質）とPlanAdherenceMetric（計画への忠実度）を追加。Pytestライクなインターフェースで開発者に馴染みやすい設計。

**Braintrust** ($80M Series B) とArize Phoenix ($70M Series C) は、オブザーバビリティと評価の統合プラットフォームとして位置づけ。両社とも大型調達を完了しており、評価はオブザーバビリティの拡張機能として提供。

**Patronus AI** は$40.1Mを調達し、評価専業として最大の資金力を持つ。Glider LLM（第三者モデルの「裁判官」として機能する専用モデル）とPercival（AI障害の自動修正モデル）を開発。マルチモーダルLLM-as-a-Judgeも業界初でリリース。

### 強み・弱み・ギャップ分析

**強み:**
- OSSフレームワーク（DeepEval）が利用可能
- LLM-as-a-Judgeパラダイムが評価の標準アプローチとして確立
- Patronus AIが専用Judgeモデル（Glider）で技術的リーダーシップ

**弱み・ギャップ:**
- **「エージェントCI/CD」のターンキーソリューションが不在**: Anthropicのエンジニアリングブログが「evalsが#1のボトルネック」と指摘。しかし、GitHub Actionsのようにエージェントの評価をCI/CDパイプラインに簡単に統合できるソリューションがない
- **プロダクション監視 vs オフライン評価のギャップ**: オフラインのベンチマーク評価はあるが、プロダクション環境でのリアルタイム品質監視との統合が弱い
- **マルチエージェント評価が未確立**: エージェントA-B-Cの連携品質を評価するフレームワークがない
- **コスト効率評価の不在**: 「このエージェントは正解あたり$Xのコスト」というコスト効率メトリクスを提供するプレイヤーがない

**小規模チーム参入機会: MEDIUM** -- Patronus AI ($40.1M)、Braintrust ($80M)、Arize ($70M) が大型調達済み。OSSのDeepEvalも品質が高い。「エージェントCI/CD」に特化したニッチは存在するが、評価ツールは差別化が困難な領域。

---

## 3.16 カテゴリ13: エージェント決済 / コマース

**成熟度**: Nascent（黎明期）
**小規模チームの参入機会**: LOW

### プレイヤー一覧

| プレイヤー | アプローチ | パートナーシップ | タイムライン | 参入障壁 |
|-----------|-----------|--------------|-----------|---------|
| **Visa** | Trusted Agent Protocol（HTTP Message Signature基盤） | 10+パートナー | 2026年ホリデーシーズンに数百万消費者利用予測 | 金融ライセンス、機関信用 |
| **Mastercard** | Agent Pay（Web Bot Auth統合） | DBS、UOB（シンガポール） | 2026年Q1パイロット | 金融ライセンス、機関信用 |
| **FIS** | AI Transaction Platform | 銀行パートナー | 提供中 | 金融ライセンス |
| **Cloudflare** | セキュアエージェントコマース基盤 | Visa、Shopify等 | 提供中 | インフラ規模 |
| **Skyfire** | エージェント間決済 | 限定的 | 初期段階 | 暗号資産規制 |

### 詳細分析

**Visa** は2025年10月にTrusted Agent Protocolを発表。HTTP Message Signature標準とWeb Bot Authに基づき、マーチャントがAIエージェントを正当なユーザー代理として識別する仕組みを提供。2025年中に数百件のセキュアなエージェント主導取引を完了し、2026年ホリデーシーズンには数百万消費者がAIエージェント経由で購入すると予測。

**Mastercard** はAgent Pay Merchant Acceptance Frameworkを発表し、シンガポールでDBS、UOBとのパイロットを2026年Q1に開始。Web Bot AuthをMastercard Agent Payに統合。

**Cloudflare** はVisaおよびShopifyと協業し、AIエージェントが安全に取引を行うためのインフラ基盤を提供。Durable ObjectsとWorkers AIを活用したエージェントコマース環境を構築中。

### 強み・弱み・ギャップ分析

**このカテゴリへの小規模チーム参入は構造的に困難**:

1. **金融ライセンス要件**: 決済処理には各国の金融ライセンスが必要
2. **機関信用**: Visa/Mastercardのブランド信用が商取引の前提
3. **規制コンプライアンス**: PCI DSS、各国決済法規への準拠が必須
4. **パートナーシップの必要性**: マーチャント側の対応が必要で、ネットワーク効果が支配的

**小規模チーム参入機会: LOW** -- 決済インフラは金融機関が支配。小規模チームが参入できるのは「エージェントの支出管理」（カテゴリ5: コスト制御）であり、決済レールそのものではない。

---

## 3.17 カテゴリ14: デプロイメント / ホスティング

**成熟度**: Mature（成熟期）
**小規模チームの参入機会**: LOW

### プレイヤー一覧

| プレイヤー | 資金調達額 | エージェント固有機能 | GPU対応 | 価格モデル |
|-----------|-----------|-------------------|--------|-----------|
| **Modal** | $111M+（$1.1B評価額） | サンドボックス、サーバレスGPU | Yes | 使用量ベース |
| **Koyeb** | $17M Series A | MCP Server対応 | Yes | 使用量ベース |
| **Cerebrium** | $10M+ | AIワークロード最適化 | Yes | 使用量ベース |
| **RunPod** | $20M+ | GPUコンピュート | Yes | 時間ベース |
| **Fly.io** | $110M+ | Machinesベース | Yes | 使用量ベース |
| **Railway** | $30M+ | 開発者体験重視 | 限定的 | 使用量ベース |
| **Render** | $70M+ | マネージドインフラ | 限定的 | 使用量ベース |
| **Cloudflare Workers** | Cloudflareの一部 | Durable Objects、Agents SDK | なし（CPU） | 使用量ベース |
| **Vercel** | $750M+ | AI SDK、エッジファンクション | 限定的 | 使用量ベース |

### 詳細分析

デプロイメント/ホスティングは完全にコモディティ化した市場であり、AIエージェント固有の差別化は限定的。Modal ($111M+、$1.1B→$2.5B評価額見込み) が「AIネイティブコンピュート」として最大の成長を見せているが、エージェント専用ではなくAIワークロード全般をカバー。

Cloudflare Workersは特筆に値する。Durable Objects（エッジでのステートフルコンピュート）とAgents SDK（Workers上でのAIエージェント構築フレームワーク）の組み合わせにより、MCP Gateway + エージェントインフラの統合プラットフォームとしてのポジショニングを強化。MCP認証（OAuth 2.1）のネイティブサポートも含む。

### 小規模チーム参入機会: LOW

コンピュートインフラはスケールとコスト効率が差別化要因であり、Cloudflare、AWS、Modal等の大資本プレイヤーには対抗不可能。小規模チームは自社インフラを構築するのではなく、これらのプラットフォーム上にインフラサービスを構築すべき。

---

## 3.18 カテゴリ横断 競合ランドスケープ・サマリー

### 全14カテゴリ 成熟度・機会マトリクス

| # | カテゴリ | 成熟度 | 資金調達済みプレイヤー数 | カテゴリ最大調達額 | 小規模チーム機会 |
|---|---------|--------|---------------------|-------------------|---------------|
| 1 | LLMゲートウェイ | Mature | 7+ | $18M（Portkey） | LOW |
| 2 | オブザーバビリティ | Mature | 6+ | $80M（Braintrust） | LOW |
| 3 | 認証/アイデンティティ | Early | 6+ | $29M（Composio） | MEDIUM |
| 4 | ツール統合 | Growing | 6+ | $29M（Composio） | MEDIUM |
| 5 | **コスト制御** | **Early** | **0（専用）** | **N/A** | **HIGH** |
| 6 | **エラーハンドリング** | **Fragmented** | **0（専用）** | **N/A** | **HIGH** |
| 7 | サンドボックス | Growing | 6+ | $111M+（Modal） | LOW |
| 8 | メモリ | Growing | 5+ | $24M（Mem0） | MEDIUM |
| 9 | ガードレール | Growing | 6+ | $42M（Arthur AI） | MEDIUM |
| 10 | シークレット管理 | Mature/Early | 5+ | $29M（Composio） | MEDIUM |
| 11 | **HITL/承認** | **Early** | **1（HumanLayer~$500K）** | **~$500K** | **HIGH** |
| 12 | 評価/テスト | Growing | 5+ | $80M（Braintrust） | MEDIUM |
| 13 | 決済/コマース | Nascent | 0（スタートアップ） | N/A（金融機関） | LOW |
| 14 | デプロイメント | Mature | 8+ | $111M+（Modal） | LOW |

### 最もアンダーサーブドなカテゴリ Top 5

**1. コスト制御 / 予算管理（カテゴリ5）** -- 機会: HIGH
- **根拠**: 専用プロダクトが事実上不在（AgentBudgetは個人OSSプロジェクト）。全ゲートウェイ/オブザーバビリティがコスト追跡を提供するが、コスト強制（予算超過時のエージェント停止）を提供するプレイヤーはいない。78%のITリーダーが予想外のAI費用を報告し、エンタープライズのAIエージェントは月$3.2K-$13Kの運用費を生む
- **規制の追い風**: なし（ただし、コスト管理はガバナンスの基本要件）

**2. Human-in-the-Loop / 承認ワークフロー（カテゴリ11）** -- 機会: HIGH
- **根拠**: 唯一の専門スタートアップ（HumanLayer）が~$500Kと極めて小規模で、別方向にピボット中。LangGraph interrupt() はフレームワークロック。承認疲れのソリューションが全プレイヤーで不在
- **規制の追い風**: EU AI Act（2026年8月施行）が高リスクAIシステムに人間の監視を義務付け

**3. エラーハンドリング / 信頼性（カテゴリ6）** -- 機会: HIGH
- **根拠**: スタンドアロン・プロダクトが完全に不在。開発者はゲートウェイレベルのリトライ + フレームワーク固有のエラーハンドリング + カスタムコードの組み合わせで対応
- **規制の追い風**: なし

**4. エージェント認証 / アイデンティティ（カテゴリ3）** -- 機会: MEDIUM-HIGH
- **根拠**: 標準がまだ流動的（OpenID Foundation策定中）。インディ開発者向けのMCP認証管理が空白。ただし、Scalekit ($5.5M)、Arcade.dev ($12M)、Composio ($29M) が積極投資中
- **規制の追い風**: Gartnerの予測（2028年までにエンタープライズ侵害の25%がAIエージェント起因）

**5. 評価 / テスト（カテゴリ12）** -- 機会: MEDIUM
- **根拠**: 「エージェントCI/CD」のターンキーソリューションが不在。ただし、Patronus AI ($40.1M)、Braintrust ($80M)、DeepEval（OSS）が市場をカバーしつつある
- **規制の追い風**: EU AI Actが高リスクAIのテスト・検証を要求

### 避けるべき混雑カテゴリ

**1. LLMゲートウェイ（カテゴリ1）**: Portkey ($18M)、Braintrust ($80M)、Arize ($70M) が大型調達済み。OSSのLiteLLM/Heliconeも品質が高く、差別化が極めて困難。

**2. デプロイメント / ホスティング（カテゴリ14）**: Cloudflare、AWS、Modal ($111M+)、Fly.io ($110M+) 等のスケールプレイヤーが支配。コモディティインフラであり、資本力がない小規模チームは不利。

**3. 決済 / コマース（カテゴリ13）**: Visa/Mastercardが支配。金融ライセンス・機関信用・規制準拠の壁が構造的に参入を阻む。

**4. サンドボックス（カテゴリ7）**: E2B ($32M)、Daytona ($31M)、Modal ($111M+) がVC支援で急成長中。コンピュートインフラのスケーリングは大資本ゲーム。

### クロスカッティング観察

**1. マルチカテゴリ・プレイヤー**

一部のプレイヤーが複数カテゴリにまたがって事業を展開している:

| プレイヤー | カバーするカテゴリ |
|-----------|----------------|
| **Portkey** | ゲートウェイ(1), オブザーバビリティ(2), ガードレール(9) |
| **Composio** | 認証(3), ツール統合(4), シークレット(10) |
| **Braintrust** | オブザーバビリティ(2), 評価(12) |
| **Arize** | オブザーバビリティ(2), 評価(12) |
| **Cloudflare** | デプロイメント(14), 認証(3, MCP Auth), 決済(13, エージェントコマース) |

この統合トレンドは、隣接カテゴリへの拡張が自然な成長パスであることを示す。コスト制御（カテゴリ5）に参入する場合も、HITL（カテゴリ11）やオブザーバビリティ（カテゴリ2）との統合を視野に入れるべき。

**2. 統合トレンド**

- **オブザーバビリティ + 評価**: Braintrust ($80M) とArize ($70M) の大型調達は、「観測 + 評価」の統合プラットフォームが市場に支持されていることを示す
- **認証 + ツール統合**: Composio ($29M) がOAuth管理とツール統合をバンドリング
- **ゲートウェイ + ガードレール**: Portkey ($18M) がゲートウェイにガードレールを統合

**3. MCP効果（MCP Effect）**

MCPの普及がカテゴリ境界を再定義している:
- **カテゴリ3（認証）× カテゴリ4（ツール統合）**: MCP仕様がOAuth 2.1を要求するため、認証とツール統合が不可分に
- **カテゴリ1（ゲートウェイ）→ MCP Gateway**: LLM APIゲートウェイとMCPツールゲートウェイは別レイヤーだが、統合される方向
- **カテゴリ5（コスト制御）**: MCPツール呼び出しレベルのコスト追跡・制御は、LLM API呼び出しだけのコスト追跡より粒度が細かい新しい機会

---

## 3.19 出典（後編）

### 資金調達・企業情報
- [Mem0 $24M Series A (2025年10月)](https://techcrunch.com/2025/10/28/mem0-raises-24m-from-yc-peak-xv-and-basis-set-to-build-the-memory-layer-for-ai-apps/)
- [Zep AI Funding](https://www.crunchbase.com/organization/zep-ai)
- [Guardrails AI $7.5M Seed](https://www.globenewswire.com/news-release/2024/02/15/2830261/0/en/Guardrails-AI-is-Solving-the-LLM-Reliability-Problem-for-AI-Developers-With-7-5-Million-in-Seed-Funding.html)
- [Lakera $20M Series A](https://www.lakera.ai/news/lakera-raises-20m-series-a-to-deliver-real-time-genai-security)
- [Patronus AI $17M Series A + 追加調達](https://siliconangle.com/2024/05/22/patronus-ai-reels-17m-llm-reliability-testing-platform/)
- [Braintrust $80M Series B (2026年2月)](https://siliconangle.com/2026/02/17/braintrust-lands-80m-series-b-funding-round-become-observability-layer-ai/)
- [Permit.io $14M funding](https://siliconangle.com/2024/02/15/full-stack-authorization-startup-permit-io-raises-8m-scale-platform/)
- [HumanLayer (YC F24)](https://www.ycombinator.com/companies/humanlayer)
- [Modal $87M Series B ($1.1B評価額)](https://siliconangle.com/2025/09/29/modal-labs-raises-80m-simplify-cloud-ai-infrastructure-programmable-building-blocks/)

### 決済・コマース
- [Visa Trusted Agent Protocol (2025年10月)](https://usa.visa.com/about-visa/newsroom/press-releases.releaseId.21961.html)
- [Mastercard Agent Pay](https://www.mastercard.com/us/en/business/artificial-intelligence/mastercard-agent-pay.html)
- [Cloudflare Secure Agentic Commerce](https://blog.cloudflare.com/secure-agentic-commerce/)

### 市場分析
- [Strata Identity: 28% of orgs can trace agent actions](https://www.strata.io/blog/agentic-identity/the-ai-agent-identity-crisis-new-research-reveals-a-governance-gap/)
- [Gartner: 25% of enterprise breaches will involve AI agents by 2028](https://www.securityweek.com/scalekit-raises-5-5-million-to-secure-ai-agent-authentication/)
- [EU AI Act: human oversight requirements](https://www.permit.io/blog/human-in-the-loop-for-ai-agents-best-practices-frameworks-use-cases-and-demo)
- [AI Agent Evaluation (Anthropic Engineering)](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [DeepEval v3.0](https://deepeval.com/)
- [Patronus AI Generative Simulators](https://siliconangle.com/2025/12/17/patronus-ais-debuts-generative-simulators-support-continuous-evolution-improvement-ai-agents/)

---
*本セクション作成: 2026年3月13日*
*データの基準時点: 2026年3月*
*前セクション: 03-competitive-player-mapping-part1.md（カテゴリ1-7）*
*次セクション: 04（Phase 4: 競合分析とギャップ -- Big Tech吸収リスク、OSS vs SaaS）*
