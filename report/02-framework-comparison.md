# 2. AIエージェントフレームワーク比較

## 2.1 フレームワーク市場の現在地

2026年3月時点で、AIエージェントフレームワーク市場は急速に拡大しながらも「勝者なき戦国時代」が続いている。LangGraph、CrewAI、OpenAI Agents SDK、AutoGen、Google ADKという5つの主要フレームワークが異なるアーキテクチャモデルと設計思想で開発者の支持を競い合い、その周辺にはSemantic Kernel、SmolAgentsなどのニッチプレイヤーが存在する。

この断片化は偶然ではなく、AIエージェントの用途が多様であることの必然的帰結である。シンプルなチャットボットを構築する開発者と、複雑なマルチエージェントワークフローを設計するエンタープライズチームでは、フレームワークに求める要件が根本的に異なる。結果として、各フレームワークは特定のユースケースセグメントで強みを持ち、市場全体を支配するプレイヤーは存在しない。

この断片化がインフラストラクチャ戦略にとって持つ意味は重大である。特定のフレームワークに依存したインフラを構築すれば、アドレス可能な市場の一部しかカバーできない。プロトコルレベル（MCP、A2A）でフレームワーク非依存のインフラを構築することが、市場全体をターゲットにする唯一の防御可能なアプローチである。

---

## 2.2 主要フレームワークプロファイル

### 2.2.1 LangGraph（LangChain / LangChain Inc.）

**アーキテクチャモデル:** グラフベースオーケストレーション

LangGraphは、エージェントワークフローを有向グラフとしてモデル化する。ノードがタスク（LLM呼び出し、ツール実行、条件分岐）を表し、エッジが遷移を定義する。各ノード実行後にステートが永続化され、任意の時点から再開・分岐が可能なチェックポイントメカニズムを備える。この設計はステートマシンや有限オートマトンの概念をエージェントオーケストレーションに応用したものであり、複雑な分岐・ループ・条件付き遷移を宣言的に記述できる。

LangChain Inc.が開発・維持しており、LangChainエコシステム（LangSmith、LangServe、LangChain Hub）と密接に統合されている。2023年のLangChainフレームワークの批判（過度な抽象化、デバッグの困難さ）を受けて、LangGraphは「低レベルの制御を放棄しない」という設計哲学で2024年に独立フレームワークとして確立された。

**市場ポジション:** エージェントフレームワークの中で最大の市場シェアを持つ。PyPIでの`langgraph`パッケージの週間ダウンロード数は約300万回（2026年3月時点）に達し、GitHubリポジトリ（`langchain-ai/langgraph`）のスター数は約14,000。LangChainエコシステム全体では、`langchain-core`が月間3,000万回以上ダウンロードされており、エージェント開発のデファクト基盤として確立されている。LangSmith（オブザーバビリティ）の有料ユーザーも成長しており、エンタープライズ採用の強いシグナルとなっている。

| 指標 | 値 |
|------|-----|
| 言語 | Python, TypeScript (JS) |
| 最新安定版 | v0.3.x (Python), v0.2.x (JS) |
| PyPI週間DL | ~3M |
| GitHubスター | ~14,000 |
| ライセンス | MIT |
| MCP対応 | Yes（LangChain MCPアダプター経由） |
| A2A対応 | Community実装あり |

**強み:**
- プロダクションレベルの信頼性。ステート永続化、チェックポイント、Human-in-the-loopが組み込み
- 細粒度の制御。ノード・エッジレベルでの完全なカスタマイズが可能
- LangSmithとの統合によるエンドツーエンドのオブザーバビリティ
- 大規模なコミュニティとサードパーティ統合エコシステム

**弱み・批判:**
- 学習曲線が急。グラフ概念の理解が前提で、単純なタスクでも定型コードが多い
- LangChainエコシステムへの実質的な依存。LangSmithなしでの本番運用は困難
- 抽象化の複雑さ。デバッグ時にフレームワーク内部の挙動を理解する必要がある
- バージョン間の破壊的変更の頻度が批判されてきた（LangChain v0.1 -> v0.2で顕著）

---

### 2.2.2 CrewAI（CrewAI Inc.）

**アーキテクチャモデル:** 二層構造（Crews + Flows）

CrewAIは「ロール（役割）」メタファーに基づくマルチエージェントフレームワークである。Agent（役割・ゴール・バックストーリーを持つ）、Task（具体的な作業単位）、Crew（エージェント群のチーム）という直感的な階層で構成される。2025年には「Flows」レイヤーが追加され、Crewの実行を決定論的なワークフローとして制御できるようになった。これにより、AIの確率的な推論（Crew内）と決定論的なビジネスロジック（Flow制御）を分離する二層アーキテクチャが完成した。

CrewAI Inc.は2024年に設立され、急速に成長している。Enterprise版（マネージドプラットフォーム）も提供しており、UIベースのエージェント構築・デプロイメントが可能。

**市場ポジション:** LangGraphに次ぐ第2位の採用規模。PyPIでの`crewai`パッケージ週間ダウンロード数は約50万回。GitHubリポジトリ（`crewAIInc/crewAI`）のスター数は約26,000と、LangGraphを上回るGitHub人気を示している（ただしGitHubスターとプロダクション採用は必ずしも比例しない）。Discord/Slackコミュニティも活発で、特にプロトタイピング層での支持が強い。

| 指標 | 値 |
|------|-----|
| 言語 | Python |
| 最新安定版 | v0.102.x |
| PyPI週間DL | ~500K |
| GitHubスター | ~26,000 |
| ライセンス | MIT |
| MCP対応 | Yes（ネイティブ統合） |
| A2A対応 | Community実装あり |

**強み:**
- 直感的なロールメタファー。非エンジニアでもエージェント設計の概念を理解しやすい
- ラピッドプロトタイピング。数十行のコードでマルチエージェントシステムを構築可能
- Flowsレイヤーによる決定論的制御の追加でプロダクション対応力が向上
- CrewAI Enterprise（マネージドプラットフォーム）による低コードデプロイ

**弱み・批判:**
- Python限定。TypeScript/JS対応がないため、Webフロントエンド統合では追加の作業が必要
- 大規模・複雑なワークフローでのデバッグが困難。ロールメタファーが抽象化として限界を迎えるケース
- Flowsの追加で複雑性が増し、当初の「シンプルさ」が薄れつつある
- エンタープライズ機能はCrewAI Enterprise（有料プラットフォーム）に依存

---

### 2.2.3 OpenAI Agents SDK（OpenAI）

**アーキテクチャモデル:** エージェントループ + ハンドオフ

OpenAI Agents SDKは、2024年に実験的プロジェクトとして公開された「Swarm」を正式製品として進化させたものである。エージェントを「instructions（システムプロンプト）+ tools（関数） + handoff targets（委譲先エージェント）」の三要素で定義し、ランナーがエージェントループを管理する。ハンドオフ（あるエージェントから別のエージェントへの制御委譲）が一級概念として組み込まれており、マルチエージェントシステムの構築を簡潔に記述できる。

ガードレール（入力/出力バリデーション）、トレーシング（OpenAI組み込み + カスタムプロセッサ対応）、コンテキスト管理がフレームワークに統合されている。2025年3月の正式リリース以降、OpenAIプラットフォーム（Responses API、ファイルサーチ、Code Interpreter）との深い統合を強化し続けている。

**市場ポジション:** OpenAIのブランド力と既存ユーザーベースを活用し、急速に採用が拡大中。PyPIでの`openai-agents`パッケージ週間ダウンロード数は約15万回。GitHubリポジトリ（`openai/openai-agents-python`）のスター数は約15,000。ただし、OpenAI APIに最適化されていることは長所であると同時にベンダーロックインのリスクでもあり、マルチプロバイダー運用を志向する開発者にとっては制約となる。

| 指標 | 値 |
|------|-----|
| 言語 | Python |
| 最新安定版 | v0.1.x |
| PyPI週間DL | ~150K |
| GitHubスター | ~15,000 |
| ライセンス | MIT |
| MCP対応 | Yes（組み込み） |
| A2A対応 | 限定的 |

**強み:**
- OpenAIプラットフォームとのシームレスな統合。Responses API、ファイルサーチ、Web検索、Code Interpreterを直接利用可能
- シンプルなAPI設計。エージェント定義が数行で完了し、学習曲線が最も緩やか
- ハンドオフメカニズムによる直感的なマルチエージェント設計
- 組み込みのガードレールとトレーシング

**弱み・批判:**
- **OpenAIプロバイダーロックイン。** デフォルトではOpenAI APIのみ対応。他のLLMプロバイダーを使うにはカスタムモデルプロバイダーの実装が必要
- バージョンがv0.1.xであり、APIの安定性に懸念
- LangGraphやCrewAIほどの複雑なオーケストレーションパターン（サブグラフ、条件分岐の入れ子）には対応していない
- エコシステムが自社プラットフォーム中心で、サードパーティ統合が限定的

---

### 2.2.4 AutoGen（Microsoft）

**アーキテクチャモデル:** イベントドリブンメッセージング（Core + AgentChat）

AutoGenは、マイクロソフトが開発するマルチエージェント会話フレームワークであり、2024年後半にv0.4として大規模な再設計が行われた。新しいアーキテクチャは二層構成で、AutoGen Core（低レベルのイベント駆動メッセージングフレームワーク）とAgentChat（高レベルのマルチエージェント会話API）から成る。エージェント間の通信はすべてメッセージベースで、パブリッシュ/サブスクライブパターンをサポートする。

v0.4の再設計は、v0.2からの破壊的変更を伴い、コミュニティの一部は混乱を経験した。しかし、非同期ファースト、型安全性、モジュラー設計という新しいアーキテクチャの方向性は、大規模マルチエージェントシステムの構築に適している。Microsoft Azure AI、Semantic Kernelとの統合も深化している。

**市場ポジション:** 学術・研究コミュニティでの支持が強く、GitHubスター数は約41,000（`microsoft/autogen`）とフレームワーク中で最大だが、これはv0.2時代の蓄積であり、v0.4以降の実プロダクション採用は限定的。PyPIでの`autogen-agentchat`（v0.4系の新パッケージ）週間ダウンロード数は約12万回。`pyautogen`（v0.2系、レガシー）は約8万回のダウンロードが続いており、移行が進行中であることを示している。

| 指標 | 値 |
|------|-----|
| 言語 | Python, .NET |
| 最新安定版 | v0.4.x (Core + AgentChat) |
| PyPI週間DL | ~120K (agentchat) + ~80K (legacy pyautogen) |
| GitHubスター | ~41,000 |
| ライセンス | MIT (Creative Commons for docs) |
| MCP対応 | Yes（MCPワーカー経由） |
| A2A対応 | 実験的サポート |

**強み:**
- マルチエージェント会話パターンの先駆者。グループチャット、ネストされた会話、動的チーム編成をネイティブサポート
- 非同期ファーストの設計。大量のエージェント間メッセージングを効率的に処理
- Microsoft/Azureエコシステムとの統合（Semantic Kernel連携、Azure AI Foundry）
- 学術論文での引用が多く、研究コミュニティでの信頼性が高い

**弱み・批判:**
- **v0.4移行の混乱。** v0.2からの破壊的変更が大きく、既存ユーザーの移行コストが高い
- v0.2とv0.4の2系統が並存しており、ドキュメント・チュートリアルが混在
- プロダクション事例がLangGraphやCrewAIに比べて少ない
- AutoGen Studio（UIツール）の安定性に課題があり、ローコード体験が不安定

---

### 2.2.5 Google ADK（Agent Development Kit）

**アーキテクチャモデル:** マルチエージェントオーケストレーション + Google統合

Google ADKは、2025年4月にGoogle Cloud Next '25で発表されたエージェント開発キットである。Googleのエージェントインフラ戦略の中核をなし、Geminiモデル、Vertex AI、Google Cloud Servicesとのネイティブ統合を特徴とする。A2Aプロトコル（Googleが主導してLinux Foundationに寄贈）をネイティブサポートしており、マルチエージェントシステム間の相互運用性を設計の中心に据えている。

アーキテクチャは階層的で、LlmAgent（LLMベースの推論エージェント）を基本単位とし、SequentialAgent（逐次実行）、ParallelAgent（並列実行）、LoopAgent（ループ実行）などのオーケストレーションエージェントで構成する。各エージェントは独立したインストラクション、ツール、サブエージェントを持つ。

**市場ポジション:** 2025年4月のリリースから1年弱で急速にエコシステムを構築中。GitHubリポジトリ（`google/adk-python`）のスター数は約8,000。PyPIでの`google-adk`パッケージ週間ダウンロード数は約10万回。Google Cloudの法人顧客基盤を活用したエンタープライズ採用が始まっているが、Google Cloud外での独立利用は限定的。

| 指標 | 値 |
|------|-----|
| 言語 | Python, Java (experimental) |
| 最新安定版 | v1.x |
| PyPI週間DL | ~100K |
| GitHubスター | ~8,000 |
| ライセンス | Apache 2.0 |
| MCP対応 | Yes（ネイティブ） |
| A2A対応 | Yes（ネイティブ、設計の中核） |

**強み:**
- **A2Aネイティブサポート。** マルチエージェント相互運用性が設計の中心にある唯一のメジャーフレームワーク
- Geminiモデルとの深い統合。マルチモーダル（テキスト、画像、音声、動画）のネイティブ処理
- Google Cloudサービス（BigQuery、Cloud Storage、Vertex AI Search等）との統合
- 階層的エージェント構成（Sequential/Parallel/Loop）による構造化されたオーケストレーション

**弱み・批判:**
- **Google Cloud依存の懸念。** フレームワーク自体はOSSだが、フル機能はVertex AI上での実行を前提
- リリースから1年弱であり、コミュニティとエコシステムが他のフレームワークより未成熟
- Google製品の「サンセットリスク」に対する開発者の懸念（Googleのプロダクト終了の歴史）
- サードパーティLLMプロバイダーのサポートが限定的（Geminiファースト）

---

## 2.3 補足フレームワーク

### Semantic Kernel（Microsoft）

マイクロソフトのエンタープライズ向けフレームワーク。.NET、Python、Javaの3言語をサポートし、Azure AI Foundryとの統合が深い。セッション管理、型安全フィルター、テレメトリなどエンタープライズ要件を重視した設計。AutoGenとは補完関係にあり、Semantic KernelがプロセスオーケストレーションとAIサービス統合を担い、AutoGenがマルチエージェント会話パターンを担うという棲み分けが公式に推奨されている。GitHubスター数は約22,000（`microsoft/semantic-kernel`）。

### SmolAgents（Hugging Face）

Hugging Faceが開発する軽量エージェントフレームワーク。LLMがJSONツール呼び出しではなくPythonコードを直接生成する「Code Agent」パラダイムを特徴とする。オープンソースモデル（Llama、Mistral等）での動作に最適化されており、プロプライエタリAPIに依存しないエージェント構築が可能。ミニマリスト設計で、フレームワーク自体のオーバーヘッドが極めて小さい。研究・実験用途での採用が中心。GitHubスター数は約14,000（`huggingface/smolagents`）。

### Amazon Bedrock AgentCore

Amazon Bedrock AgentCoreは厳密にはフレームワークではなく、**フレームワーク非依存のマネージドランタイム**である。2025年のAWS re:Invent後にプレビュー提供が開始され、LangGraph、CrewAI、AutoGen、カスタムフレームワークなど、**任意のフレームワークで構築されたエージェントをAWS上で運用するためのインフラ層**を提供する。メモリ管理、ツール実行ランタイム、アイデンティティ管理、ガードレール適用、オブザーバビリティをフレームワーク非依存で提供する点が特徴的である。

AgentCoreの登場は、クラウドプロバイダーがフレームワーク選択を「開発者の自由」として受け入れ、その上のインフラ層で付加価値を提供する戦略にシフトしたことを示す市場シグナルである。これはフレームワーク断片化が今後も継続することの有力な傍証であると同時に、独立系インフラプロバイダーにとっては競合の脅威でもある。

---

## 2.4 フレームワーク比較表

| 項目 | LangGraph | CrewAI | OpenAI Agents SDK | AutoGen | Google ADK |
|------|-----------|--------|-------------------|---------|------------|
| **開発元** | LangChain Inc. | CrewAI Inc. | OpenAI | Microsoft | Google |
| **アーキテクチャ** | グラフベース（ノード＋エッジ） | 二層（Crews + Flows） | エージェントループ + ハンドオフ | イベントドリブンメッセージング | 階層的オーケストレーション |
| **主要言語** | Python, TypeScript | Python | Python | Python, .NET | Python, Java |
| **成熟度** | 高（プロダクション実績多数） | 中〜高（急成長中） | 低〜中（v0.1.x） | 中（v0.4再設計中） | 中（リリース約1年） |
| **PyPI週間DL** | ~3M | ~500K | ~150K | ~120K (agentchat) | ~100K |
| **GitHubスター** | ~14,000 | ~26,000 | ~15,000 | ~41,000 | ~8,000 |
| **MCP対応** | Yes（アダプター） | Yes（ネイティブ） | Yes（組み込み） | Yes（ワーカー） | Yes（ネイティブ） |
| **A2A対応** | Community | Community | 限定的 | 実験的 | ネイティブ（設計中核） |
| **LLMプロバイダー** | マルチプロバイダー | マルチプロバイダー | OpenAI中心 | マルチプロバイダー | Gemini中心 |
| **主な差別化要因** | 本番品質のステート管理 | 直感的ロールメタファー | OpenAI統合の深さ | マルチエージェント会話 | A2Aネイティブ + Google統合 |
| **最適ユースケース** | 複雑なワークフロー、本番運用 | 迅速なプロトタイプ、チーム型エージェント | OpenAIエコシステム内開発 | 研究、マルチエージェント実験 | Google Cloud上のエンタープライズ |

---

## 2.5 市場ダイナミクス分析

### 2.5.1 断片化の構造的要因

フレームワーク市場の断片化は一時的な現象ではなく、構造的な要因に根差している。

**1. ユースケースの多様性:** シンプルなRAGチャットボット、複雑なマルチステップワークフロー、マルチエージェント会話システム、リアルタイムストリーミングエージェントなど、AIエージェントの用途は多岐にわたる。単一のフレームワークがすべてのユースケースで最適解となることは、Webフレームワーク市場（React/Vue/Angular/Svelte）と同様に起こり得ない。

**2. ベンダーの戦略的投資:** OpenAI（Agents SDK）、Google（ADK）、Microsoft（AutoGen + Semantic Kernel）は、それぞれのクラウド/AIプラットフォームへのロックインを促進するための戦略的投資としてフレームワークを開発している。これらのプレイヤーが自社フレームワークを放棄して他社のフレームワークに統合される可能性は低い。

**3. オープンソースのダイナミクス:** LangGraphとCrewAIはOSSコミュニティの支持で成長しており、開発者の選好は「最良のツール」ではなく「最も慣れたツール」に基づくことが多い。一度エコシステムに投資した開発者は移行コストを嫌う。

**市場シェア推定（PyPIダウンロード数ベースのプロキシ指標）:**

```
LangGraph:          ████████████████████████░░  ~62%
CrewAI:             █████░░░░░░░░░░░░░░░░░░░░  ~10%
OpenAI Agents SDK:  ███░░░░░░░░░░░░░░░░░░░░░░  ~3%
AutoGen:            ███░░░░░░░░░░░░░░░░░░░░░░  ~4%
Google ADK:         ██░░░░░░░░░░░░░░░░░░░░░░░  ~2%
その他:             ████░░░░░░░░░░░░░░░░░░░░░  ~19%
```

*注: PyPIダウンロード数は市場シェアの近似指標であり、CI/CDパイプラインでの自動ダウンロード、依存関係としてのインストール等が含まれる。実際のアクティブ開発者数とは乖離がある。LangGraphの数値にはlangchain-coreへの依存インストールが含まれ、過大推計の可能性がある。*

### 2.5.2 フレームワーク収斂トレンド

断片化の一方で、アーキテクチャパターンの収斂も観察される。

**グラフベースオーケストレーションへの収斂:** LangGraphがグラフモデルを普及させた結果、CrewAI（Flows）、AutoGen（Core層のイベントグラフ）、Google ADK（Sequential/Parallel/Loop構成）のすべてがグラフ的な制御構造を取り入れている。エージェントワークフローを「ノードとエッジのグラフ」として表現することが業界標準になりつつある。

**ハイブリッドスタックの一般化:** 本番環境では、複数のフレームワークを組み合わせた「ハイブリッドスタック」が珍しくない。例えば、LangChainのツール呼び出しをCrewAIエージェントにラップしたり、Semantic KernelのプロセスオーケストレーションでAutoGenエージェントを管理したりするパターンが報告されている。これはフレームワークが相互排他的ではなく、レイヤーとして重ねて使えることを示している。

**MCPサポートの普遍化:** 2026年3月時点で、5つの主要フレームワークすべてがMCPをサポートしている。これはMCPがエージェント-ツール間の事実上の標準プロトコルとして確立したことを意味し、MCPレベルのインフラストラクチャがフレームワーク非依存であることを裏付けている。

### 2.5.3 Amazon Bedrock AgentCoreの市場的意味

Amazon Bedrock AgentCoreの登場は、フレームワーク市場のダイナミクスに重要な示唆を与えている。

**1. フレームワーク断片化の「公式承認」:** AWSがフレームワーク非依存のランタイムを構築したことは、「一つのフレームワークが勝つ」シナリオをAWSが想定していないことを意味する。逆に、フレームワークの多様性を前提としたインフラ市場が存在することのバリデーションである。

**2. インフラ層の分離:** AgentCoreは、メモリ管理、ツール実行、アイデンティティ管理、ガードレールといったインフラ関心事をフレームワークから分離し、独立したサービス層として提供している。これは「フレームワークは開発者の選択、インフラは標準化」というアーキテクチャパターンの定着を示している。

**3. 競合と機会の両面:** クラウドプロバイダーがこの層に参入したことは、独立系インフラプロバイダーにとっては競合の脅威である一方、「この層に市場が存在する」ことのバリデーションでもある。AgentCoreがAWS専用であることは、マルチクラウド対応のインフラサービスに差別化の余地を残している。

### 2.5.4 フレームワーク非依存インフラの必然性

上記の分析から、AIエージェントインフラストラクチャがフレームワーク非依存であるべき理由は明確である。

**1. アドレス可能な市場の最大化:** 最大シェアのLangGraphでも推定62%にすぎない。特定のフレームワークに依存したインフラは、残りの38%の開発者を最初から除外する。プロトコルレベル（MCP/A2A）で構築すれば、フレームワーク選択に関係なく全市場にリーチできる。

**2. ハイブリッドスタックへの対応:** 本番環境では複数フレームワークの組み合わせが一般的であり、フレームワーク固有のインフラは混在環境で機能しない。

**3. フレームワークの流動性:** 開発者のフレームワーク選好は急速に変化する。2024年にはLangChainが批判の矢面に立ち、CrewAIへの移行が起きた。2025年にはOpenAI Agents SDKの登場で再びシフトが起きている。インフラはこの流動性の影響を受けてはならない。

**4. MCPの普遍化:** 全主要フレームワークがMCPをサポートしたことで、MCPレベルのインフラは自動的にフレームワーク非依存となる。認証、コスト制御、オブザーバビリティなどの横断的関心事をMCPゲートウェイ層で実装すれば、どのフレームワークからのツール呼び出しにも適用される。

**5. クラウドプロバイダーの先例:** Amazon Bedrock AgentCoreがフレームワーク非依存のアプローチを採用したことは、この戦略の妥当性をバリデートしている。

---

## 2.6 インフラストラクチャ戦略への示唆

フレームワーク断片化は、インフラ事業者にとって**機会**である。フレームワークが乱立するからこそ、フレームワーク非依存のインフラレイヤーに価値がある。

### 実践的な指針

1. **プロトコルレベルで構築する。** MCP（エージェント-ツール間）とA2A（エージェント-エージェント間）のプロトコル境界でインフラサービスを提供すれば、フレームワーク選択に依存しない。

2. **薄いフレームワークアダプターを提供する。** 各フレームワーク向けのSDKアダプター（LangGraph用、CrewAI用等）を「便利な薄いラッパー」として提供するが、コア機能はプロトコルレベルに実装する。

3. **ダウンロード数ではなくMCP/A2A対応状況で市場を測る。** フレームワークの人気は変動するが、プロトコルサポートの有無は安定している。全主要フレームワークがMCPをサポートした時点で、MCPインフラの市場は「全フレームワーク市場」と同義になった。

4. **Bedrock AgentCoreをベンチマークにする。** AWSが提供するインフラ機能（メモリ、アイデンティティ、ガードレール）は、市場が認める「テーブルステークス」のリスト。これらと差別化できる深い専門性（例：コスト制御、クロスクラウド対応）が独立系の勝ち筋である。

---

## 2.7 ソース

### 公式リポジトリ・ドキュメント
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/) -- LangChain Inc.
- [LangGraph GitHub](https://github.com/langchain-ai/langgraph) -- ~14K stars
- [CrewAI Documentation](https://docs.crewai.com/) -- CrewAI Inc.
- [CrewAI GitHub](https://github.com/crewAIInc/crewAI) -- ~26K stars
- [OpenAI Agents SDK Documentation](https://openai.github.io/openai-agents-python/) -- OpenAI
- [OpenAI Agents SDK GitHub](https://github.com/openai/openai-agents-python) -- ~15K stars
- [AutoGen Documentation](https://microsoft.github.io/autogen/) -- Microsoft
- [AutoGen GitHub](https://github.com/microsoft/autogen) -- ~41K stars
- [Google ADK Documentation](https://google.github.io/adk-docs/) -- Google
- [Google ADK GitHub](https://github.com/google/adk-python) -- ~8K stars
- [Semantic Kernel GitHub](https://github.com/microsoft/semantic-kernel) -- ~22K stars
- [SmolAgents GitHub](https://github.com/huggingface/smolagents) -- ~14K stars

### パッケージレジストリ（ダウンロード数ソース）
- [langgraph on PyPI](https://pypi.org/project/langgraph/)
- [crewai on PyPI](https://pypi.org/project/crewai/)
- [openai-agents on PyPI](https://pypi.org/project/openai-agents/)
- [autogen-agentchat on PyPI](https://pypi.org/project/autogen-agentchat/)
- [google-adk on PyPI](https://pypi.org/project/google-adk/)

### 市場分析・比較記事
- [AI Agent Frameworks Compared 2026 -- Arsum](https://arsum.com/blog/posts/ai-agent-frameworks/)
- [AI Agent Infrastructure Landscape 2025-2026 -- Medium](https://medium.com/@vinniesmandava/the-agentic-ai-infrastructure-landscape-in-2025-2026-a-strategic-analysis-for-tool-builders-b0da8368aee2)
- [AI Agent Tools Landscape 120+ Tools Mapped -- StackOne](https://www.stackone.com/blog/ai-agent-tools-landscape-2026/)
- [Amazon Bedrock AgentCore -- AWS Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/agents-agentcore.html)
- [Enterprise AI Stack 2026 -- DextraLabs](https://dextralabs.com/blog/enterprise-ai-stack-2026-mcp-a2a-domain-models/)
- [The AI Agents Stack -- Letta](https://www.letta.com/blog/ai-agents-stack)

### プロトコル仕様
- [MCP Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)
- [A2A Protocol v1.0 Specification](https://a2a-protocol.org/latest/specification/)

---

*本セクションは2026年3月時点の情報に基づく。AIエージェントフレームワーク市場は急速に変化しており、ダウンロード数・スター数等の定量指標は継続的なモニタリングが推奨される。*
