# 1. AIエージェント・プロトコル・ランドスケープ（2026年3月時点）

## 1.1 はじめに -- プロトコルがインフラ・ポジショニングを決める理由

AIエージェントの実用化が進む2025-2026年、エージェントが外部世界とやりとりする方法に3つの標準プロトコルが確立されつつある。

| プロトコル | 方向性 | 一言で言うと |
|------------|--------|-------------|
| **MCP** (Model Context Protocol) | Agent -> Tools | エージェントが外部ツール・データにアクセスする標準 |
| **A2A** (Agent2Agent Protocol) | Agent <-> Agent | エージェント同士がタスクを委譲し合う標準 |
| **AG-UI** (Agent-User Interaction Protocol) | Agent -> User | エージェントの動作をリアルタイムにUIへストリーミングする標準 |

これら3つのプロトコルは「競合」ではなく「補完」の関係にある。MCPはエージェントとツールの垂直統合、A2Aはエージェント間の水平連携、AG-UIはエージェントとユーザーのフロントエンド接続を担う。それぞれのプロトコル境界は、認証・課金・監視などのインフラサービスを挿入する自然なポイントとなる。

本セクションでは各プロトコルの技術仕様、成熟度、採用状況、2026年のロードマップを詳述し、インフラサービス参入の観点からどのプロトコル境界に最も大きな機会があるかを分析する。

---

## 1.2 MCP (Model Context Protocol) -- エージェントとツールの接続標準

### 1.2.1 概要と位置づけ

MCP (Model Context Protocol) は、AIエージェント（LLMアプリケーション）が外部のツール、データソース、サービスにアクセスするための標準プロトコルである。Anthropicが2024年11月にオープンソースとして公開し、2025年12月にLinux Foundation傘下のAgentic AI Foundation (AAIF) に寄贈された。

MCPの核となるアナロジーは「AI版のUSB」である。USB規格が任意のデバイスと任意のコンピュータの接続を標準化したように、MCPは任意のAIモデルと任意の外部ツールの接続を標準化する。これにより、M個のモデル x N個のツールの組み合わせで個別統合が必要だった状況が、M + N の統合で済むようになる。

### 1.2.2 仕様とガバナンス

| 項目 | 詳細 |
|------|------|
| **現行仕様バージョン** | 2025-11-25 (Spec Revision 2025-11-25) |
| **仕様URL** | https://modelcontextprotocol.io/specification/2025-11-25 |
| **ガバナンス** | Linux Foundation / Agentic AI Foundation (AAIF) |
| **寄贈時期** | 2025年12月（Anthropicから寄贈） |
| **メッセージフォーマット** | JSON-RPC 2.0 |
| **ライセンス** | Apache 2.0（仕様・SDK共に） |

AAIFへの寄贈は、MCPがAnthropicの一社プロトコルではなく業界標準であることを明確にした重要な転換点である。Linux Foundationのガバナンスにより、OpenAI、Google、MicrosoftなどAnthropicの競合企業も安心してMCPを採用・推進できる体制が整った。

### 1.2.3 トランスポート

MCPは2つのトランスポート層をサポートする。

**Streamable HTTP（推奨・リモート接続用）**

2025-11-25仕様で導入された新しいHTTPベースのトランスポート。従来のSSE (Server-Sent Events) トランスポートを置き換え、2025-06-18仕様でSSEは正式に非推奨化された。

主な特徴:
- 通常のHTTP POST/GETリクエストとしてMCPメッセージを送受信
- サーバーはレスポンスをSSEストリームにアップグレード可能（サーバー主導のプッシュ通知用）
- ステートレスなHTTPと、ステートフルなSSEストリームのハイブリッド
- 既存のHTTPインフラ（ロードバランサ、CDN、プロキシ）との親和性が高い
- OAuth 2.1による標準的な認証・認可が可能

**stdio（ローカル接続用）**

ローカルプロセス間通信。標準入出力を介してJSON-RPCメッセージを交換する。Claude Desktop、VS Code等のローカルMCPクライアントがローカルMCPサーバーと通信する際に使用される。

### 1.2.4 認証モデル

MCP仕様はリモートサーバーとの通信に **OAuth 2.1** を標準認証方式として定めている。

| 認証コンポーネント | 詳細 |
|-------------------|------|
| **OAuth 2.1** | 認証・認可の基盤プロトコル |
| **PKCE** (Proof Key for Code Exchange) | パブリッククライアント向けの認可コード横取り攻撃対策 |
| **Dynamic Client Registration** (RFC 7591) | MCP クライアントが未知のMCPサーバーに初回接続する際、手動でのクライアント登録なしにOAuthフローを開始できる仕組み |
| **Token Exchange** | サーバー間でのトークン委譲 |

Dynamic Client Registration (RFC 7591) は、MCPエコシステムの重要な技術要素である。ユーザーがClaude DesktopからカスタムMCPサーバーに初めて接続する場合、事前のクライアントID/Secret登録は不要で、クライアントが自動的にサーバーにクライアント登録を行い、OAuthフローを開始できる。ただし、RFC 7591の参考実装が少なく、実際のプロダクション環境での運用知見が限られている点は課題として残る。

### 1.2.5 ケーパビリティ

MCPはサーバー側とクライアント側でそれぞれ複数のケーパビリティを定義する。

**サーバー側ケーパビリティ（MCP Serverが提供するもの）:**

| ケーパビリティ | 説明 | 用途例 |
|---------------|------|--------|
| **Tools** | 実行可能な関数。副作用を伴う操作が可能 | API呼び出し、DB書き込み、メール送信 |
| **Resources** | 読み取り専用データソース | ファイル内容、DBレコード、設定値の参照 |
| **Prompts** | 再利用可能なインタラクション・テンプレート | システムプロンプト、Few-shotの例示 |

**クライアント側ケーパビリティ（MCP Clientが提供するもの）:**

| ケーパビリティ | 説明 | 用途例 |
|---------------|------|--------|
| **Sampling** | サーバーがクライアント側のLLMにプロンプトを送り、生成結果を得る | ツール実行中にLLMの判断を仰ぐ |
| **Roots** | サーバーがクライアント側のファイルシステムのルートディレクトリにアクセス | ワークスペースファイルの読み取り |
| **Elicitation** | サーバーがクライアントを通じてユーザーに直接質問し、入力を取得 | ツール実行中の確認・判断入力 |

### 1.2.6 採用状況

MCPは2026年3月時点でAIエージェントのツール接続における**デファクト標準**の地位を確立している。

| 指標 | 数値 / 詳細 |
|------|------------|
| **SDK月間ダウンロード数** | 9,700万回以上（npm + PyPI合計） |
| **依存パッケージ数** | 32,000以上（@modelcontextprotocol/sdk） |
| **公開MCPサーバー数** | 500以上 |
| **主要採用企業** | Anthropic, OpenAI, Google, Microsoft, Amazon, Cloudflare, Salesforce |

特筆すべきは、AI業界の全メジャープレイヤーがMCPを採用している点である:

- **Anthropic**: MCPの発案者。Claude Desktop、Claude Codeで標準搭載
- **OpenAI**: ChatGPT、Agents SDKでMCPサポートを追加（2025年3月発表）
- **Google**: Gemini APIでMCPツールサポートを追加。Google ADKもMCP互換
- **Microsoft**: Copilot Studio、Azure AI FoundryでMCPサポート。MCP Gatewayをオープンソース公開
- **Amazon**: Bedrock AgentCoreでMCPサーバーのホスティング基盤を提供
- **Cloudflare**: Workers + Agents SDKでMCPサーバーのネイティブ・ホスティングを提供

### 1.2.7 SDKエコシステム

| SDK | 言語 | バージョン (2026-03時点) | 備考 |
|-----|------|------------------------|------|
| **@modelcontextprotocol/sdk** | TypeScript | 1.27.x | 公式リファレンス実装。仕様の権威的スキーマ (schema.ts) はここで定義 |
| **mcp** (Python SDK) | Python | 1.7.x | 公式Python SDK |
| **FastMCP** | Python | 3.1.x | 全言語MCP サーバーの約70%を占めるデコレータベースの高生産性フレームワーク。v1.0がPython SDKに統合後、v3.0で独立進化 |
| その他 | Go, Rust, Java, .NET, Ruby, Kotlin | 各種 | コミュニティ開発。TS/Pythonより機能面で遅延 |

**SDK v2について**: MCP TypeScript SDK v2は2026年Q1-Q2にリリースが予想されている。Streamable HTTP対応の改善、より効率的なセッション管理、型安全性の向上が見込まれる。

### 1.2.8 2026年ロードマップ

MCPは仕様の安定化フェーズにあり、以下の動向が2026年に予想される:

1. **SDK v2リリース** (Q1-Q2 2026): TypeScript SDK のメジャーバージョンアップ
2. **AAIF共同相互運用仕様** (Q3 2026予想): Linux FoundationのAAIFがMCPとA2Aの相互運用仕様を策定する可能性。これが実現すればプロトコル・ランドスケープに大きな影響
3. **OAuth 2.1実装の成熟**: Dynamic Client Registration (RFC 7591) の参考実装の増加が期待される
4. **MCP Gatewayの競争激化**: Traefik Hub、Docker、Microsoft、Obotなどが初期参入しているが、まだ支配的プレイヤーは不在

---

## 1.3 A2A (Agent2Agent Protocol) -- エージェント間の相互運用標準

### 1.3.1 概要と位置づけ

A2A (Agent2Agent Protocol) は、異なるフレームワーク・ベンダーで構築されたAIエージェント同士がタスクを発見・委譲・実行するための標準プロトコルである。Google Cloudが発案し、Linux Foundationにオープンソース寄贈された。

MCPが「エージェントとツールの垂直統合」を担うのに対し、A2Aは「エージェント間の水平連携」を担う。MCPサーバーは特定の機能を公開する「道具」であるが、A2Aの対象は自律的に判断し行動する「エージェント」であり、相手の内部実装を知らなくても（opaque model）タスクを委託できる点が本質的な違いである。

### 1.3.2 仕様とガバナンス

| 項目 | 詳細 |
|------|------|
| **現行仕様バージョン** | v1.0 (Release) |
| **仕様URL** | https://a2a-protocol.org/latest/specification/ |
| **ガバナンス** | Linux Foundation（Google Cloudからオープンソース寄贈） |
| **メッセージフォーマット** | JSON-RPC 2.0 |
| **発案者** | Google Cloud |

v1.0は初期バージョン（v0.1-v0.3）から大幅な仕様整理を経てリリースされた。v0.3からv1.0への主な変更点:

- **Part型の統一**: TextPart / FilePart / DataPart が統一された `Part` 型に集約。型の複雑さを削減
- **バインディングの厳格化**: REST、gRPC、JSON-RPCの各バインディングが明確に規定され、実装のばらつきを減少
- **gRPCサポートの追加**: v0.3で導入されたgRPCバインディングがv1.0で正式化。高性能なバイナリ通信が可能に

### 1.3.3 トランスポート

A2Aは複数のトランスポートオプションを提供する:

| トランスポート | 方式 | 用途 |
|---------------|------|------|
| **HTTP + SSE** | HTTPリクエスト + Server-Sent Events によるストリーミング | 標準的なWebベース連携 |
| **JSON-RPC 2.0** | HTTP上のJSON-RPCメッセージ | MCP互換性を意識した選択 |
| **gRPC** | Protocol Buffersによるバイナリ通信 | 高性能が求められるサーバー間通信 |

MCPがJSON-RPC 2.0を採用しているのと同様に、A2AもJSON-RPC 2.0をベースとしている。これはプロトコル間の親和性を意図的に高めたものであり、将来のMCP/A2A統合インフラを構築しやすくしている。

### 1.3.4 認証モデル

| 認証コンポーネント | 詳細 |
|-------------------|------|
| **OAuth 2.0 with PKCE** | エージェント間認証の基盤 |
| **Device Code Flow** | CLIやIoTデバイスからのエージェント認証に対応 |
| **Agent Cardへの認証要件記述** | Agent Cardの `securitySchemes` フィールドにOAuthエンドポイント等を記述 |

MCPがOAuth 2.1を採用しているのに対し、A2AはOAuth 2.0 with PKCEを採用している。実質的な差異は小さいが、認証レイヤーのインフラを構築する際には両方のプロトコルに対応する必要がある。

### 1.3.5 コアコンセプト

A2Aプロトコルは4つのコアコンセプトで構成される:

**Agent Card（エージェント名刺）**

エージェントの能力・エンドポイント・認証要件をJSON形式で記述したメタデータ。`/.well-known/agent.json` に公開する規約があり、クライアントエージェントがリモートエージェントを「発見」するために使用する。DNS SRVレコードのエージェント版と考えられる。

```
// Agent Card の主要フィールド（概念例）
{
  "name": "Financial Analysis Agent",
  "description": "財務データの分析と報告を行うエージェント",
  "url": "https://agent.example.com",
  "capabilities": ["financial-analysis", "report-generation"],
  "securitySchemes": { ... },
  "version": "1.0"
}
```

**Task（タスク）**

A2Aにおける作業単位。ライフサイクルステートを持つ:

`submitted` -> `working` -> `input-required` -> `completed` / `failed`

クライアントエージェントがリモートエージェントにタスクを作成（POST）し、ステータスの変遷をSSEストリーミングまたはポーリングで監視する。`input-required` ステートにより、実行中のタスクがクライアントに追加情報を求めることも可能。

**Message（メッセージ）**

エージェント間でやり取りされる通信単位。テキスト、ファイル、構造化データを含む `Part` で構成される。

**Part（パート）**

メッセージやArtifactを構成するデータ単位。v1.0で TextPart / FilePart / DataPart が統一された `Part` 型に集約された。

### 1.3.6 採用状況

| 指標 | 数値 / 詳細 |
|------|------------|
| **支持組織数** | 150以上 |
| **発案者** | Google Cloud |
| **主要支持企業** | Google, Salesforce, SAP, Atlassian, ServiceNow, MongoDB 他 |
| **SDKの言語サポート** | Python, TypeScript, Java (コミュニティ実装含む) |
| **仕様ステージ** | v1.0リリース済み。プロダクション利用可能だが、実装事例はMCPより大幅に少ない |

A2Aは「仕様としての成熟度」と「実装・採用のの成熟度」に乖離がある点が特徴的である。150以上の組織が支持を表明しているが、実際にA2Aをプロダクション環境で運用している事例はまだ限定的。MCP がすでに数千万のSDKダウンロードを達成しているのに対し、A2Aは「業界が合意した方向性」の段階にある。

### 1.3.7 MCPとの関係

MCPとA2Aは競合ではなく補完関係にある:

| 観点 | MCP | A2A |
|------|-----|-----|
| **対象** | ツール（機能を公開するプログラム） | エージェント（自律的に判断する主体） |
| **透過性** | ツールの内部実装はクライアントに公開 | エージェントの内部はopaque（不透明） |
| **相互作用** | リクエスト-レスポンス（ツール呼び出しと結果） | タスクの委譲と非同期の結果返却 |
| **セッション性** | ステートレス寄り（接続単位） | ステートフル（タスクのライフサイクルを追跡） |

実際のマルチエージェントシステムでは、あるエージェントがA2A経由で他のエージェントにタスクを委譲し、そのエージェントがMCP経由でツールを使って実行する、というように両プロトコルが共存する。

### 1.3.8 2026年の動向

1. **v1.0以降の仕様安定化**: v1.0のフィードバックを受けたマイナーバージョンアップが予想される
2. **AAIF共同仕様**: MCPとA2Aの相互運用仕様がAAIFから発表される可能性（Q3 2026予想）
3. **実装事例の増加**: 仕様のv1.0リリースにより、フレームワーク（LangGraph, CrewAI等）でのネイティブA2Aサポートが本格化する見通し
4. **Agent Card署名の標準化**: v0.3で追加されたAgent Cardの暗号署名が、エージェント間の信頼モデルの基盤として成熟
5. **TBAC (Task-Based Access Control)**: 仕様レベルでは定義されているが、プロダクション実装はまだ不在。2026年後半に初期実装が出る可能性

---

## 1.4 AG-UI (Agent-User Interaction Protocol) -- エージェントとユーザーの接続標準

### 1.4.1 概要と位置づけ

AG-UI (Agent-User Interaction Protocol) は、AIエージェントのバックエンド処理をリアルタイムにフロントエンドUIへストリーミングするためのプロトコルである。CopilotKit（エージェントUIフレームワーク開発企業）が中心となり、OracleおよびGoogleとの共同で発表された。

MCPがエージェントの「手」（ツール使用）、A2Aがエージェントの「口」（エージェント間対話）を標準化するとすれば、AG-UIはエージェントの「顔」（ユーザーへの表示）を標準化するプロトコルと位置づけられる。

### 1.4.2 なぜAG-UIが必要か

従来、エージェントの動作をUIに反映するには、各エージェントフレームワークが独自のストリーミング方式を実装する必要があった。LangGraphのストリーミングAPI、CrewAIのコールバック、OpenAI Agents SDKのイベント形式はそれぞれ異なり、フロントエンド開発者は使用するバックエンドフレームワークごとに異なる統合コードを書く必要があった。

AG-UIはこの断片化を解消し、どのエージェントフレームワークからでも統一されたイベントストリームでUI更新を送信できるようにする。

### 1.4.3 技術特性

| 項目 | 詳細 |
|------|------|
| **通信方式** | イベントベースのストリーミング |
| **主要イベント種類** | テキスト差分、ツール呼び出し開始/終了、ステート・スナップショット、エラー通知 |
| **フロントエンド対応** | React (CopilotKit)、Angular（コミュニティ）等 |
| **バックエンド対応** | フレームワーク非依存（LangGraph, CrewAI, AutoGen等から出力可能） |
| **ガバナンス** | CopilotKit主導、Oracle・Google共同発表 |
| **ライセンス** | オープンソース |

AG-UIのイベントモデルは以下のような構造を持つ:

- **TEXT_DELTA**: エージェントの応答テキストの逐次更新
- **TOOL_CALL_START / TOOL_CALL_END**: ツール呼び出しの開始と完了
- **STATE_SNAPSHOT**: エージェントの内部状態のスナップショット
- **RUN_STARTED / RUN_FINISHED**: エージェント実行の開始と終了
- **ERROR**: エラー発生の通知

これらのイベントにより、フロントエンドは「エージェントが今何を考え、何をしているか」をリアルタイムにユーザーへ表示できる。

### 1.4.4 成熟度と採用状況

AG-UIはMCPやA2Aと比べて明らかに初期段階にある。

| 評価軸 | AG-UI | MCP (比較) | A2A (比較) |
|--------|-------|-----------|-----------|
| **仕様の成熟度** | 初期仕様（v0.x相当） | 安定（2025-11-25仕様） | 安定（v1.0リリース） |
| **ガバナンス** | CopilotKit主導 | Linux Foundation/AAIF | Linux Foundation |
| **採用企業数** | 数社（CopilotKit, Oracle, Google） | 全メジャーAI企業 | 150+組織 |
| **SDK** | CopilotKit React SDK | TypeScript/Python公式SDK | Python/TypeScript SDK |
| **プロダクション事例** | CopilotKit採用企業に限定 | 数千 | 限定的 |

AG-UIの重要性は「今すぐの採用規模」ではなく、「エージェントUIの標準化が不可避であるという方向性」にある。エージェントが複雑なワークフローを実行する際、「何が起きているか」をユーザーに見せるUXは必須要件であり、この領域の標準化需要は確実に存在する。ただし、CopilotKitのエコシステムに強く依存しており、Linux Foundationのようなベンダー中立のガバナンスに移行するかどうかが今後の普及を左右する。

### 1.4.5 MCP/A2Aとの関係

AG-UIはMCPやA2Aと直接競合しない。プロトコルスタック上の異なるレイヤーを担当する:

```
ユーザー層:   [AG-UI]  -- エージェント -> ユーザーUI
エージェント層: [A2A]    -- エージェント <-> エージェント
ツール層:     [MCP]    -- エージェント -> ツール/データ
```

あるエージェントがユーザーのリクエストを受けて:
1. MCP経由でツールを呼び出し
2. A2A経由で他のエージェントにタスクを委譲し
3. AG-UI経由で進行状況をユーザーのUIにストリーミング

という形で3つのプロトコルが同時に使われるシナリオが典型的である。

---

## 1.5 プロトコル比較サマリー

以下の表は、3つのプロトコルを統一的な軸で比較したものである。

| 評価軸 | MCP | A2A | AG-UI |
|--------|-----|-----|-------|
| **正式名称** | Model Context Protocol | Agent2Agent Protocol | Agent-User Interaction Protocol |
| **方向性** | Agent -> Tools | Agent <-> Agent | Agent -> User |
| **成熟度** | 成熟（デファクト標準） | 成長中（v1.0リリース） | 初期段階 |
| **仕様バージョン** | 2025-11-25 | v1.0 | v0.x相当 |
| **ガバナンス** | Linux Foundation / AAIF | Linux Foundation | CopilotKit主導（Oracle/Google共同） |
| **主要発案者** | Anthropic | Google Cloud | CopilotKit |
| **月間SDKダウンロード** | 9,700万回以上 | 非公開（限定的） | 非公開（CopilotKit依存） |
| **支持組織数** | 全メジャーAI企業 | 150+ | 数社 |
| **トランスポート** | Streamable HTTP, stdio | HTTP+SSE, JSON-RPC 2.0, gRPC | イベントベース・ストリーミング |
| **メッセージフォーマット** | JSON-RPC 2.0 | JSON-RPC 2.0 | カスタムイベント |
| **認証** | OAuth 2.1 + PKCE + Dynamic Client Registration | OAuth 2.0 + PKCE + Device Code | フレームワーク依存 |
| **主要ユースケース** | ツール呼び出し、データアクセス、プロンプト管理 | マルチエージェント・タスク委譲、エージェント発見 | リアルタイムUI更新、進行状況表示 |
| **インフラ挿入機会** | 高（MCP Gateway） | 中（A2A Boundary） | 低-中（ストリーミング層） |
| **市場競争状態** | Gateway市場が形成中（5-6社が初期参入） | 実装はまだ少ない | CopilotKitがほぼ独占 |

---

## 1.6 インフラ挿入ポイント分析

3つのプロトコルの境界は、それぞれインフラサービスを挿入する自然なポイントとなる。以下、各挿入ポイントの機会を分析する。

### 1.6.1 MCP Gatewayレイヤー（機会: 最大）

**位置**: MCPクライアントとMCPサーバーの間に挿入されるリバースプロキシ

```
[任意のエージェントフレームワーク]
         |
    [MCP Client]
         |
         v
  +-----------------+
  |  MCP Gateway    |  <-- インフラ挿入ポイント
  |  - OAuth管理    |
  |  - レート制限   |
  |  - コスト追跡   |
  |  - 監査ログ    |
  +-----------------+
         |
         v
  [MCP Server群]
```

**なぜ最大の機会か:**

1. **ユニバーサル・タッチポイント**: フレームワークに関係なく、全エージェントがツール使用時にMCPを通る。MCPは業界標準を確立済み
2. **認証が入口**: 5-20個のMCPサーバーそれぞれのOAuthトークン、APIキー、リフレッシュサイクルの管理は開発者の最大のペインポイント。ここを解決すれば自然なロックインが生まれる（PayPalの認証情報金庫パターン）
3. **課金が後続**: 全ツール呼び出しを見ている立場から、使用量計測・コスト制御は自然な拡張
4. **市場が初期段階**: Traefik Hub、Docker MCP Gateway、Microsoft MCP Gateway、Obotなど5-6社が初期参入しているが、支配的プレイヤーは不在

**現在の主要プレイヤー:**

| プレイヤー | 種類 | 特徴 |
|-----------|------|------|
| Traefik Hub | 商用 + OSSコア | TBAC (Task-Based Access Control)、セッション対応ルーティング |
| Docker MCP Gateway | OSS | 集中型プロキシ、クレデンシャル管理 |
| Microsoft MCP Gateway | OSS | Kubernetes向け、セッション対応 |
| Obot | OSS | 旧Acorn Labs。MCP Gateway機能を含むエージェントプラットフォーム |
| ContextForge (IBM) | OSS | AI Gateway with MCP統合 |
| Composio | 商用 | 500+コネクタ、認証管理に注力 |

### 1.6.2 A2A境界レイヤー（機会: 中）

**位置**: エージェント間のタスク委譲・通信の境界

| 挿入サービス | 説明 | 市場状態 |
|-------------|------|----------|
| エージェントID・信頼管理 | Agent Cardの検証、暗号署名 | 仕様レベル（v0.3で署名追加）。プロダクション実装なし |
| タスク課金 | エージェント間のタスク単位での課金 | 未開拓。現在対応するプレイヤーなし |
| クロスエージェント可観測性 | A2A境界を跨ぐトレース | OpenTelemetryのコンテキスト伝搬が技術的に適用可能だが、エージェント固有の実装なし |
| TBAC | タスクベースのアクセス制御 | 仕様のみ。プロダクション実装なし |

A2A境界は「今は小さいが将来有望」な領域。A2Aプロトコルの実採用が進めば、エージェント間課金・信頼管理の需要は急増する。ただし、プロトコル自体がまだ普及初期であるため、ここに今すぐ注力するのはタイミングリスクがある。

### 1.6.3 AG-UIストリーミング・レイヤー（機会: 低-中）

**位置**: エージェントバックエンドとフロントエンドUIの間

| 挿入サービス | 説明 | 市場状態 |
|-------------|------|----------|
| セッション管理 | ユーザー-エージェント間セッションの追跡・永続化 | CopilotKitが基本機能を提供。エンタープライズ要件は未対応 |
| 使用量計測 | ユーザー単位のインタラクション追跡（SaaS課金用） | 未開拓 |
| コンプライアンス・ログ | エージェントがユーザーに何を表示したかの監査証跡 | 未開拓 |

AG-UIレイヤーは、プロトコル自体がまだCopilotKitに強く依存しており、ベンダー中立の標準として確立されていない。この段階でインフラを構築するのはプロトコルリスクが高い。ただし、EU AI Act（2026年8月施行）による高リスクAIシステムの透明性要件が、コンプライアンス・ログの需要を生む可能性がある。

### 1.6.4 機会の優先順位まとめ

| 順位 | 挿入ポイント | 機会の大きさ | 理由 |
|------|-------------|-------------|------|
| **1** | MCP Gateway | 最大 | ユニバーサルなタッチポイント、市場初期、認証が自然な入口 |
| **2** | A2A境界 | 中（将来有望） | 課金・信頼管理の需要は確実だが、プロトコル普及待ち |
| **3** | AG-UI ストリーミング | 低-中 | プロトコル自体が未成熟、CopilotKit依存リスク |

---

## 1.7 主要な発見と示唆

1. **MCPはデファクト標準を確立した**: 全メジャーAI企業が採用し、月間9,700万以上のSDKダウンロード。インフラサービスはMCP対応が必須条件。

2. **A2Aは「合意された方向性」の段階**: 150+組織が支持し仕様はv1.0に到達したが、プロダクション実装はまだ限定的。インフラ投資はタイミングを見る必要がある。

3. **AG-UIは初期段階だが方向性は正しい**: エージェントUIの標準化需要は確実に存在する。ただしCopilotKit依存のリスクがあり、ベンダー中立のガバナンスへの移行を注視。

4. **MCP Gatewayが最大のインフラ機会**: 全エージェントのツールアクセスが通過するユニバーサル・タッチポイント。認証管理 -> 課金 -> 可観測性 -> テストの自然な拡張パスがある。

5. **認証がインフラの入口**: MCP (OAuth 2.1 + PKCE + RFC 7591)、A2A (OAuth 2.0 + PKCE)ともにOAuthベースの認証を要求しており、認証管理の集約はインフラサービスの自然なウェッジ（参入口）となる。

6. **JSON-RPC 2.0が共通基盤**: MCPとA2Aの両方がJSON-RPC 2.0をメッセージフォーマットとして採用。プロトコル横断のインフラツールを構築しやすい技術的基盤がある。

7. **AAIF共同相互運用仕様に注意**: Q3 2026にMCP/A2Aの相互運用仕様がAAIFから発表される可能性がある。これが実現すれば、プロトコル境界のインフラ設計に大きな影響を与える。

---

## 1.8 出典

### プロトコル公式仕様
- [MCP仕様 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)
- [MCP アーキテクチャ概要](https://modelcontextprotocol.io/docs/learn/architecture)
- [A2A プロトコル v1.0 仕様](https://a2a-protocol.org/latest/specification/)
- [A2A v1.0 新機能](https://a2a-protocol.org/latest/whats-new-v1/)
- [AG-UI プロトコル -- CopilotKit](https://www.copilotkit.ai/ag-ui)

### SDK・フレームワーク
- [MCP TypeScript SDK (GitHub)](https://github.com/modelcontextprotocol/typescript-sdk) -- v1.27.x
- [@modelcontextprotocol/sdk (npm)](https://www.npmjs.com/package/@modelcontextprotocol/sdk) -- 32K+依存パッケージ
- [MCP Python SDK (PyPI)](https://pypi.org/project/mcp/) -- v1.7.x
- [FastMCP 3.0](https://www.jlowin.dev/blog/fastmcp-3) -- v3.1.x

### ガバナンス・業界動向
- [MCP のLinux Foundation/AAIF寄贈](https://modelcontextprotocol.io/) -- 2025年12月
- [A2A プロトコルのアップグレード -- Google Cloud Blog](https://cloud.google.com/blog/products/ai-machine-learning/agent2agent-protocol-is-getting-an-upgrade)
- [A2A プロトコルとは -- IBM](https://www.ibm.com/think/topics/agent2agent-protocol)

### MCP Gateway・インフラ
- [Traefik MCP Gateway](https://traefik.io/solutions/mcp-gateway)
- [Docker MCP Gateway](https://docs.docker.com/ai/mcp-catalog-and-toolkit/mcp-gateway/)
- [Microsoft MCP Gateway (GitHub)](https://github.com/microsoft/mcp-gateway)
- [ContextForge AI Gateway -- IBM](https://ibm.github.io/mcp-context-forge/)
- [MCP Gateways 2026 -- TrueFoundry](https://www.truefoundry.com/blog/best-mcp-gateways)
- [MCP Gateways Guide -- Composio](https://composio.dev/content/mcp-gateways-guide)

### 認証・セキュリティ
- [MCP Authentication -- Stack Overflow Blog](https://stackoverflow.blog/2026/01/21/is-that-allowed-authentication-and-authorization-in-model-context-protocol/)
- [MCP Authentication Patterns -- Security Boulevard](https://securityboulevard.com/2026/03/mcp-authentication-and-authorization-patterns/)

### 市場分析
- [MCP Enterprise Adoption 2025-2026](https://guptadeepak.com/the-complete-guide-to-model-context-protocol-mcp-enterprise-adoption-market-trends-and-implementation-strategies/)
- [AI Agent Infrastructure Landscape 2025-2026 (Medium)](https://medium.com/@vinniesmandava/the-agentic-ai-infrastructure-landscape-in-2025-2026-a-strategic-analysis-for-tool-builders-b0da8368aee2)
- [MCP vs A2A Complete Guide -- DEV Community](https://dev.to/pockit_tools/mcp-vs-a2a-the-complete-guide-to-ai-agent-protocols-in-2026-30li)
- [Enterprise AI Stack 2026 -- DextraLabs](https://dextralabs.com/blog/enterprise-ai-stack-2026-mcp-a2a-domain-models/)

---
*本セクション作成: 2026年3月13日*
*データの基準時点: 2026年3月*
*次セクション: 02-framework-comparison.md（エージェントフレームワーク比較）*
