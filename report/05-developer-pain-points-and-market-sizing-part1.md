# 5. 市場規模推計（全14カテゴリ TAM/SAM/SOM）

## 5.1 はじめに -- AIエージェントインフラの市場機会

AIエージェント市場は2026年、実験段階から本格的な本番展開へと移行する転換期にある。本セクションでは、Phase 3で特定した14のインフラカテゴリそれぞれの市場規模を推計し、各カテゴリの機会の大きさを定量的に評価する。

### 全体市場コンテキスト

**AIエージェント市場全体:**
- 2025年: USD 7.29B → 2026年: USD 9.14B → 2034年: USD 139.19B（CAGR 40.5%）（Fortune Business Insights）
- MarketsandMarketsは2030年にUSD 52.62Bと予測（やや保守的）
- Mordor Intelligenceは2026年 USD 9.89B → 2031年 USD 57.42B（CAGR 42.1%）

**AI支出全体:**
- Gartnerは2026年の世界AI支出をUSD 2.53T（兆ドル）と予測（前年比44%増）
- AIインフラ市場: 2026年 USD 90B → 2033年 USD 465B（CAGR 24%）（Coherent Market Insights）

**エージェント採用率:**
- Gartner: 2026年末までにエンタープライズアプリの40%がタスク特化型AIエージェントを搭載（2025年の5%未満から急増）
- IDC: 2026年にAIコパイロットがエンタープライズ職場アプリの80%に組み込まれる
- 93%のITリーダーが今後2年以内に自律型エージェントを導入予定（約半数はすでに実装済み）

### エージェントインフラ市場の位置づけ

AIエージェントインフラは、AIエージェント市場（2026年 ~USD 9-10B）のサブセグメントである。エージェント自体の開発・運用に必要な基盤サービス（ゲートウェイ、認証、コスト管理、オブザーバビリティ等）を提供する市場であり、エージェント市場全体のインフラ層として15-25%程度を占めると推定する。

**推定ロジック:**
- エンタープライズAIエージェントの運用費: 月$3,200-$13,000/デプロイメント
- うちインフラ関連（API費用除く）: 15-25%（月$480-$3,250）
- 内訳: オブザーバビリティ($200-$1,000), ベクトルDB($500-$2,500), セキュリティ/認証($100-$500), その他

**2026年エージェントインフラ市場推定: USD 1.5-2.5B**

---

## 5.2 市場規模推計の方法論

### Bottom-Up推計アプローチ

本レポートでは、トップダウンのアナリスト予測とボトムアップの積算を併用する。

**ボトムアップの基礎データ:**

| 指標 | 数値 | 出典 |
|------|------|------|
| 世界のAI/ML開発者数 | 1,740万人（2024年） | Arcade.dev / Evans Data |
| エージェントを構築中の開発者（推定） | ~200-300万人（2026年） | IDC, Gartner採用率から推計 |
| エージェント本番運用率 | 57.3%（LangChain調査） | LangChain State of Agent Engineering |
| エンタープライズ月間運用費 | $3,200-$13,000 | HyperSense Software |
| 中小規模月間AI支出 | $20,000-$100,000/年 | Zylo |
| 平均月間AI支出（全規模） | $85,521（2025年） | 複数調査の集計 |

**セグメント定義:**

| セグメント | 推定組織数 | 月間インフラ支出 | 年間支出 |
|-----------|-----------|---------------|---------|
| インディ開発者/個人 | ~200万人 | $0-50 | $0-600 |
| スタートアップ（1-50名） | ~50,000社 | $200-2,000 | $2,400-24,000 |
| ミッドマーケット（51-1,000名） | ~20,000社 | $2,000-10,000 | $24,000-120,000 |
| エンタープライズ（1,000名+） | ~5,000社 | $10,000-100,000+ | $120,000-1,200,000+ |

### トップダウン検証

アナリスト各社のAIエージェント市場予測（2026年 USD 9-10B）のうち、インフラサービスが占める割合を15-25%と仮定すると、USD 1.4-2.5Bとなり、ボトムアップ推計と整合する。

### 信頼度スケール

| レベル | 定義 |
|--------|------|
| HIGH | 公開データ（上場企業IR、大型調達PR）に基づく推計 |
| MEDIUM | アナリスト予測 + 類似市場からの外挿 |
| LOW | 限定的なデータからの仮説ベース推計 |

---

## 5.3 カテゴリ1: LLMゲートウェイ / ルーティング

**成熟度**: Mature | **Phase 3評価**: LOW opportunity

### 市場規模推計

| 指標 | 推計値 | 信頼度 |
|------|--------|--------|
| **TAM** | $800M-1.2B | MEDIUM |
| **SAM** | $200-400M | MEDIUM |
| **SOM（小規模チーム）** | $1-3M | LOW |
| **CAGR** | 25-30% | MEDIUM |

**推計根拠:**
- Portkey: 年間$180M以上のLLMスペンドを管理、2.5兆以上のトークンを処理。ゲートウェイ手数料が管理スペンドの0.5-2%とすると、Portkey単体で$1-3.6M/年の売上ポテンシャル
- LLMゲートウェイ利用企業650+社（Portkey）、開発者40,000+人（Langfuse）
- エンタープライズLLM API支出の平均が月$1K-5K+であり、ゲートウェイ利用料はその5-15%
- API管理市場（Kong、Apigee等）のAIサブセグメントとして位置づけ

**小規模チーム評価**: 市場は大きいが、Portkey($18M調達)、LiteLLM(OSS)、Helicone(OSS)が占有。差別化困難。

---

## 5.4 カテゴリ2: オブザーバビリティ / トレーシング

**成熟度**: Mature | **Phase 3評価**: LOW opportunity

### 市場規模推計

| 指標 | 推計値 | 信頼度 |
|------|--------|--------|
| **TAM** | $1.5-2.5B | MEDIUM |
| **SAM** | $400-800M | MEDIUM |
| **SOM（小規模チーム）** | $1-5M | LOW |
| **CAGR** | 30-35% | MEDIUM |

**推計根拠:**
- 89%の組織がエージェントオブザーバビリティを実装済み（LangChain調査）
- Langfuse: 40,000+アクティブユーザー、700万+月間SDKインストール。ClickHouseが買収（金額非公開だが推定$50-100M）
- Braintrust: $80M Series B、$800M評価額。Notion、Replit、Cloudflare等が採用
- Arize: $70M Series C。月間200万DL
- Datadogが4社（LangChain、Arize、Braintrust、Patronus AI）に投資 -- 隣接市場の巨人が参入準備
- オブザーバビリティ市場全体（Datadog、Splunk等）はUSD 20B+。AI特化はそのサブセグメント

**小規模チーム評価**: Braintrust($800M評価額)、Arize($70M調達)が支配。OSSのLangfuseがデファクト標準。参入余地は極めて限定的。

---

## 5.5 カテゴリ3: エージェント認証 / アイデンティティ

**成熟度**: Early | **Phase 3評価**: MEDIUM opportunity

### 市場規模推計

| 指標 | 推計値 | 信頼度 |
|------|--------|--------|
| **TAM** | $2-4B | MEDIUM |
| **SAM** | $300-600M | LOW |
| **SOM（小規模チーム）** | $3-10M | LOW |
| **CAGR** | 45-55% | MEDIUM |

**推計根拠:**
- GartnerがIAMのAIエージェント対応を2026年のサイバーセキュリティ6大トレンドに選定
- Gartner予測: 2028年までにエンタープライズ侵害の25%がAIエージェント起因
- NHI（Non-Human Identity）比率: 人間1人あたり82-144のマシンID（CyberArk/Entro Security調査）
- Palo AltoがCyberArkを$25Bで買収 -- NHI市場の巨大さを示すシグナル
- Composio($29M)、Arcade.dev($12M)、Scalekit($5.5M)の調達規模
- IAM市場全体はUSD 15-20B。エージェント固有レイヤーはそのサブセット

**小規模チーム評価**: 市場は急成長するが、Composio($29M)とエンタープライズIAMベンダーの競争が激しい。インディ開発者向けMCP認証のニッチは存在するが、市場規模は限定的。

---

## 5.6 カテゴリ4: ツール統合 / 管理

**成熟度**: Growing | **Phase 3評価**: MEDIUM opportunity

### 市場規模推計

| 指標 | 推計値 | 信頼度 |
|------|--------|--------|
| **TAM** | $1-2B | MEDIUM |
| **SAM** | $200-500M | LOW |
| **SOM（小規模チーム）** | $2-5M | LOW |
| **CAGR** | 40-50% | MEDIUM |

**推計根拠:**
- Composio: 3,000+コネクタ、$29M調達
- MCP採用: SDK月間9,700万DL。Gartner: 2026年末までにAPIゲートウェイベンダーの75%がMCP機能搭載
- iPaaS市場（Zapier、Make等）のAIエージェント版として位置づけ。iPaaS市場はUSD 10B+
- ただし、MCP標準化によりツール統合のコモディティ化が進行
- コネクタ数の競争はO(n)保守コスト問題により小規模チーム不利

**小規模チーム評価**: Composioが支配的。コネクタ数での競争は不可能。MCP Gatewayのガバナンスレイヤーに特化すれば差別化余地あるが、市場はCategory 1（ゲートウェイ）と重複。

---

## 5.7 カテゴリ5: コスト制御 / 予算管理 -- 最大の機会領域

**成熟度**: Early | **Phase 3評価**: HIGH opportunity

### 市場規模推計

| 指標 | 推計値 | 信頼度 |
|------|--------|--------|
| **TAM** | $2-5B | MEDIUM |
| **SAM** | $500M-1.2B | MEDIUM |
| **SOM（小規模チーム、3年）** | $5-20M | LOW |
| **CAGR** | 50-70% | LOW |

**推計根拠 -- ボトムアップ3段階:**

**Stage 1: コスト問題の規模**
- 78%のITリーダーが予想外のAI費用を報告（Zylo調査）
- エンタープライズAIエージェント運用費: 月$3,200-$13,000/デプロイメント
- 大規模デプロイメント: 月$50,000-$200,000
- 推論コスト（inference）がエンタープライズAI予算の85%を占める（2026年）
- 多くの予算が40-60%過少見積もり（HyperSense Software）
- AI関連支出がIT予算の5-8% → 20-25%へ拡大中

**Stage 2: コスト削減ツールへの支払意思**
- コスト最適化ツールは通常、実現する節約の5-10%を課金
- セマンティックキャッシングで20-50%のトークン削減可能（Redis）
- インテリジェントルーティングで30-50%のコスト削減可能
- 合計で最大70%以上のコスト削減ポテンシャル
- エンタープライズの平均月間AI支出$85,521のうち、10-30%の節約 = 月$8,552-$25,656/組織

**Stage 3: 市場規模の積算**

| セグメント | 対象組織数 | 年間支払意思額 | セグメント市場 |
|-----------|-----------|-------------|-------------|
| スタートアップ | 50,000 | $1,200-6,000 | $60-300M |
| ミッドマーケット | 20,000 | $6,000-36,000 | $120-720M |
| エンタープライズ | 5,000 | $36,000-360,000 | $180M-1.8B |
| **合計** | | | **$360M-2.8B** |

中央値を取ると**SAM ~$800M-1.2B**。成長率はエージェント採用率（CAGR 40%+）に連動。

**なぜ誰も解決していないか（Phase 3で詳述）:**
1. リアルタイム意思決定のレイテンシ問題
2. ゲートウェイ事業者のインセンティブ不整合（トラフィック減少）
3. グレースフルな縮退パターンの複雑さ
4. マルチエージェントのコスト帰属問題

**小規模チーム評価**: **最大の機会**。専用プロダクトが不在（AgentBudgetは個人OSS）。市場規模が大きく、需要が明確で、既存プレイヤーが構造的に参入しにくい。

---

## 5.8 カテゴリ6: エラーハンドリング / 信頼性

**成熟度**: Fragmented | **Phase 3評価**: HIGH opportunity

### 市場規模推計

| 指標 | 推計値 | 信頼度 |
|------|--------|--------|
| **TAM** | $500M-1B | LOW |
| **SAM** | $100-300M | LOW |
| **SOM（小規模チーム）** | $2-8M | LOW |
| **CAGR** | 40-50% | LOW |

**推計根拠:**
- エージェントの品質問題が本番展開の最大障壁（LangChain調査: 32%が品質を最大の障壁と回答）
- 85%の組織で「メンテナンストラップ」（修正に節約より多くの人時を要する）が懸念
- 10ステップのワークフローで各ステップ85%の精度 → 全体の成功率20%
- エージェント障害のコスト: ダウンタイム + 誤った意思決定 + 手動修復工数
- SRE/信頼性エンジニアリング市場（USD 5B+）のAIエージェント版として位置づけ

**小規模チーム評価**: スタンドアロン・プロダクトが不在で機会はあるが、明確な需要シグナル（開発者が積極的に購入を探しているか）が弱い。コスト制御とのバンドリングが現実的。

---

## 5.9 カテゴリ7: サンドボックス / 実行環境

**成熟度**: Growing | **Phase 3評価**: LOW opportunity

### 市場規模推計

| 指標 | 推計値 | 信頼度 |
|------|--------|--------|
| **TAM** | $2-4B | MEDIUM |
| **SAM** | $500M-1B | MEDIUM |
| **SOM（小規模チーム）** | $1-3M | LOW |
| **CAGR** | 30-40% | MEDIUM |

**推計根拠:**
- E2B: Fortune 100の88%が登録。$150/月Pro〜。$32M調達
- Daytona: $24M Series A。3ヶ月で$1M ARR達成、6週間で2倍成長。$0.067/hr
- Modal: $111M+調達、$1.1B → $2.5B評価額見込み
- サーバレスコンピュート市場（USD 15-20B）のAIエージェント向けサブセグメント
- エージェントのコード実行需要はコーディングエージェント普及に連動

**小規模チーム評価**: E2B($32M)、Daytona($31M)、Modal($111M+)が大型調達済み。コンピュートインフラはスケールゲーム。参入不可。

---

## 5.10 カテゴリ8: メモリ / ステート永続化

**成熟度**: Growing | **Phase 3評価**: MEDIUM opportunity

### 市場規模推計

| 指標 | 推計値 | 信頼度 |
|------|--------|--------|
| **TAM** | $1.5-3B | MEDIUM |
| **SAM** | $300-700M | LOW |
| **SOM（小規模チーム）** | $2-5M | LOW |
| **CAGR** | 35-45% | MEDIUM |

**推計根拠:**
- Mem0: 月間186M API呼び出し、80,000+開発者。$24M Series A
- ベクトルDB市場: 2025年 USD 2.38B → 2035年 USD 18.86B（CAGR 23%+）
- Pinecone: $138M+調達。Qdrant: $28M Series A
- エージェントメモリはベクトルDB + アプリケーション層の組み合わせ

**小規模チーム評価**: Mem0がAWS Agent SDKの独占メモリプロバイダーに選定され、リーダーを確立。ニッチ（クロスエージェントメモリガバナンス）は存在するが、市場規模は限定的。

---

## 5.11 カテゴリ9: ガードレール / 安全性

**成熟度**: Growing | **Phase 3評価**: MEDIUM opportunity

### 市場規模推計

| 指標 | 推計値 | 信頼度 |
|------|--------|--------|
| **TAM** | $2-4B | MEDIUM |
| **SAM** | $400-900M | MEDIUM |
| **SOM（小規模チーム）** | $3-8M | LOW |
| **CAGR** | 40-50% | MEDIUM |

**推計根拠:**
- 87%のエンタープライズが包括的なAIセキュリティフレームワークを欠いている
- Lakera: $30M調達。プロンプトインジェクション防御の専門企業
- Arthur AI: $42M調達。エンタープライズAIガバナンス
- AIセキュリティ市場はサイバーセキュリティ市場（USD 200B+）のサブセグメント
- EU AI Act（2026年8月施行）がコンプライアンス需要を加速
- CISOs調査: 「AI世界のID保証」が2026年の第2位優先事項（5点中4.46点）
- AIゲートウェイ層がLLM、エージェント、ツール横断のポリシー強制の中心に

**小規模チーム評価**: Lakera($30M)、Arthur AI($42M)が大型調達済み。セキュリティ分野はエンタープライズ信頼構築が必須で小規模チーム不利。EU AI Act対応のニッチは存在。

---

## 5.12 カテゴリ10: シークレット / クレデンシャル管理

**成熟度**: Mature（汎用）/ Early（エージェント固有） | **Phase 3評価**: MEDIUM opportunity

### 市場規模推計

| 指標 | 推計値 | 信頼度 |
|------|--------|--------|
| **TAM（エージェント固有）** | $500M-1B | LOW |
| **SAM** | $100-300M | LOW |
| **SOM（小規模チーム）** | $1-5M | LOW |
| **CAGR** | 30-40% | LOW |

**推計根拠:**
- HashiCorp Vault: 上場企業（$484M+調達）。エンタープライズ版 $0-$51.2K/月
- NHI比率: 人間1人あたり82-144のマシンID
- エージェント固有レイヤー（JITスコープ付きクレデンシャル、エージェント単位アクセス制御）は汎用シークレット管理のサブセット
- Scalekit($5.5M)がMCP Auth + トークンボルトで先行
- 組織の28%のみがエージェントの行動を人間のスポンサーに追跡可能

**小規模チーム評価**: 汎用シークレット管理は成熟市場。エージェント固有レイヤーは認証（カテゴリ3）と重複が大きく、独立カテゴリとしての参入は非効率。

---

## 5.13 カテゴリ11: Human-in-the-Loop / 承認ワークフロー -- 高成長領域

**成熟度**: Early | **Phase 3評価**: HIGH opportunity

### 市場規模推計

| 指標 | 推計値 | 信頼度 |
|------|--------|--------|
| **TAM** | $1.5-3B | LOW |
| **SAM** | $300-700M | LOW |
| **SOM（小規模チーム、3年）** | $5-15M | LOW |
| **CAGR** | 60-80% | LOW |

**推計根拠 -- ボトムアップ:**

**規制ドライバー（EU AI Act）:**
- 2026年8月2日から高リスクAIシステムのプロバイダー義務が適用
- 人間の監視（human oversight）義務: HITL、HOTL、HIC
- 適合性評価手数料はSME/スタートアップ向けに軽減されるが、コンプライアンスインフラ投資は必須
- EU域内でAIを運用する全組織が対象 -- 市場創出効果は確実

**需要サイド:**
- 高リスクAI決定に対する承認ワークフロー: 医療、金融、HR、法務
- 承認疲れ（approval fatigue）が未解決 -- 1日数千件の承認でゴム印化
- コストベースのHITLトリガー（「$50以上のアクション → 承認要求」）はコスト制御との自然な統合ポイント
- HumanLayer(~$500K)が唯一の専門プレイヤーだがCodeLayerにピボット中

**市場規模の積算:**

| セグメント | 対象組織数 | 年間支払意思額 | セグメント市場 |
|-----------|-----------|-------------|-------------|
| EU域内エンタープライズ（高リスクAI） | 10,000 | $12,000-60,000 | $120-600M |
| 金融/医療/法務（グローバル） | 15,000 | $6,000-36,000 | $90-540M |
| その他エンタープライズ | 20,000 | $2,400-12,000 | $48-240M |
| **合計** | | | **$258M-1.38B** |

**小規模チーム評価**: **コスト制御に次ぐ第2の機会**。規制の追い風（EU AI Act）が需要を確実に創出。唯一の専門プレイヤーがピボット中で空白が拡大。コスト制御とのバンドリングが自然。

---

## 5.14 カテゴリ12: 評価 / テスト

**成熟度**: Growing | **Phase 3評価**: MEDIUM opportunity

### 市場規模推計

| 指標 | 推計値 | 信頼度 |
|------|--------|--------|
| **TAM** | $1-2B | MEDIUM |
| **SAM** | $200-500M | LOW |
| **SOM（小規模チーム）** | $2-8M | LOW |
| **CAGR** | 35-45% | MEDIUM |

**推計根拠:**
- Bessemer Venture Partners: 評価は「エンタープライズAIデプロイメントの最大の未解決ボトルネック」
- Patronus AI: $40.1M調達。専用Judgeモデル（Glider）開発
- Braintrust: CI/CDクオリティゲート（GitHub Action連携で品質スコア低下時にマージをブロック）
- Datadog: LangChain、Arize、Braintrust、Patronus AIの4社に投資
- ソフトウェアテスト/品質保証市場（USD 40B+）のAIエージェント版サブセグメント

**小規模チーム評価**: Patronus AI($40.1M)、Braintrust($80M)が大型調達済み。OSSのDeepEvalも品質が高い。差別化は困難だが、「エージェントCI/CD」に特化したニッチは未開拓。

---

## 5.15 カテゴリ13: エージェント決済 / コマース

**成熟度**: Nascent | **Phase 3評価**: LOW opportunity

### 市場規模推計

| 指標 | 推計値 | 信頼度 |
|------|--------|--------|
| **TAM** | $10B+（長期） | LOW |
| **SAM** | $50-200M（2026年） | LOW |
| **SOM（小規模チーム）** | $0-1M | LOW |
| **CAGR** | 100%+（2026-2030） | LOW |

**推計根拠:**
- McKinsey: エージェント経済は$1T+の可能性
- Visa: 2026年ホリデーシーズンに数百万消費者がAIエージェント経由で購入と予測
- Mastercard: Agent Payをシンガポールでパイロット開始（DBS、UOB）
- ただし2026年時点では極めて初期段階。実取引量は限定的

**小規模チーム評価**: 金融ライセンス・機関信用の壁が構造的に参入を阻む。参入不可。

---

## 5.16 カテゴリ14: デプロイメント / ホスティング

**成熟度**: Mature | **Phase 3評価**: LOW opportunity

### 市場規模推計

| 指標 | 推計値 | 信頼度 |
|------|--------|--------|
| **TAM** | $5-10B | MEDIUM |
| **SAM** | $1-3B | MEDIUM |
| **SOM（小規模チーム）** | $0-2M | LOW |
| **CAGR** | 20-30% | MEDIUM |

**推計根拠:**
- Modal: $111M+調達、$1.1B → $2.5B評価額見込み
- Cloudflare Workers + Durable Objects + Agents SDKの統合プラットフォーム
- サーバレスコンピュート市場（USD 15-20B）のサブセグメント
- コンピュートインフラはスケール・価格競争であり、コモディティ化が進行

**小規模チーム評価**: 大資本プレイヤーが支配。自社インフラ構築ではなく、これらのプラットフォーム「上」にサービスを構築すべき。

---

## 5.17 カテゴリ横断 市場規模ランキング

### 全14カテゴリ SAM順ランキング

| 順位 | カテゴリ | 推定SAM（2026年） | CAGR | Phase 3競合ギャップ | 信頼度 |
|------|---------|-------------------|------|-------------------|--------|
| 1 | デプロイメント/ホスティング | $1-3B | 20-30% | LOW（飽和） | MEDIUM |
| 2 | オブザーバビリティ | $400-800M | 30-35% | LOW（飽和） | MEDIUM |
| 3 | **コスト制御** | **$500M-1.2B** | **50-70%** | **HIGH（空白）** | **MEDIUM** |
| 4 | ガードレール | $400-900M | 40-50% | MEDIUM | MEDIUM |
| 5 | サンドボックス | $500M-1B | 30-40% | LOW（飽和） | MEDIUM |
| 6 | **HITL/承認** | **$300-700M** | **60-80%** | **HIGH（空白）** | **LOW** |
| 7 | メモリ | $300-700M | 35-45% | MEDIUM | LOW |
| 8 | 認証/アイデンティティ | $300-600M | 45-55% | MEDIUM-HIGH | LOW |
| 9 | ツール統合 | $200-500M | 40-50% | MEDIUM | LOW |
| 10 | 評価/テスト | $200-500M | 35-45% | MEDIUM | LOW |
| 11 | LLMゲートウェイ | $200-400M | 25-30% | LOW（飽和） | MEDIUM |
| 12 | エラーハンドリング | $100-300M | 40-50% | HIGH（空白） | LOW |
| 13 | 決済/コマース | $50-200M | 100%+ | LOW（参入障壁） | LOW |
| 14 | シークレット管理 | $100-300M | 30-40% | MEDIUM | LOW |

### 機会ヒートマップ: 市場規模 × 競合ギャップ

```
               競合ギャップ: HIGH（空白）
                    ▲
                    │
    ★ コスト制御    │   ★ HITL/承認
    (SAM $500M-1.2B)│   (SAM $300-700M)
                    │
                    │   △ エラーハンドリング
                    │   (SAM $100-300M)
                    │
───────────────────┼────────────────────►
    市場規模: 小     │              市場規模: 大
                    │
    △ シークレット   │   ○ 認証/ID
    (SAM $100-300M) │   (SAM $300-600M)
                    │
                    │   ○ 評価/テスト
                    │   (SAM $200-500M)
                    │
               競合ギャップ: LOW（飽和）

★ = Sweet Spot（大市場 × 大ギャップ）
○ = Hidden Gem候補（中市場 × 中ギャップ）
△ = 要注意（小市場 or 参入障壁）
```

### Sweet Spot（高優先度）

1. **コスト制御（カテゴリ5）**: SAM $500M-1.2B × 競合空白 × CAGR 50-70%。最も魅力的な交差点。
2. **HITL/承認（カテゴリ11）**: SAM $300-700M × 競合空白 × CAGR 60-80% × 規制の追い風（EU AI Act）。第2の有望領域。

### Hidden Gem候補

3. **認証/アイデンティティ（カテゴリ3）**: SAM $300-600M × 標準形成中 × Gartner重要トレンド。ただしComposio($29M)が積極投資中。
4. **評価/テスト（カテゴリ12）**: SAM $200-500M × 「エージェントCI/CD」ニッチ未開拓。ただしBraintrust($80M)が市場をカバーしつつある。

### Trap（回避すべき領域）

5. **デプロイメント/ホスティング**: SAMは最大だが完全にコモディティ化。大資本ゲーム。
6. **オブザーバビリティ**: 同上。Braintrust/Arize/Langfuseが支配。
7. **決済/コマース**: 巨大市場だが金融ライセンスの壁。

---

## 5.18 重要な示唆

本市場規模分析から導出される3つの重要な示唆:

1. **コスト制御は「市場規模 × 競合空白」の最適交差点**: SAM $500M-1.2Bの市場に専用プロダクトが不在。78%のITリーダーが予想外のAI費用を報告し、エージェント運用費は月$3,200-$13,000。需要は明確で定量化可能。

2. **HITL/承認は規制が市場を創出する希少なケース**: EU AI Act（2026年8月施行）が高リスクAIシステムに人間の監視を義務付ける。コンプライアンス需要は予測可能で、タイミングも明確。HumanLayerのピボットにより専門プレイヤーが事実上不在に。

3. **コスト制御 + HITL のバンドリングが最も戦略的**: 「$50以上のアクション → 人間の承認」というユースケースが両カテゴリの自然な接点。合算SAM $800M-1.9B。Phase 3のクロスカッティング観察（マルチカテゴリ統合トレンド）とも整合。

*本セクション（市場規模推計）のデータと分析は、Part 2（開発者ペインポイント分析）で需要サイドの分析と統合される。*

---

## 5.19 出典

### 市場規模・予測
- [AI Agents Market Size, Share & Trends (DemandSage)](https://www.demandsage.com/ai-agents-market-size/)
- [Agentic AI Market (Fortune Business Insights)](https://www.fortunebusinessinsights.com/agentic-ai-market-114233)
- [AI Agents Market worth $52.62 billion by 2030 (MarketsandMarkets)](https://www.marketsandmarkets.com/PressReleases/ai-agents.asp)
- [Agentic AI Market (Mordor Intelligence)](https://www.mordorintelligence.com/industry-reports/agentic-ai-market)
- [AI Infrastructure Market Size 2026-2033 (Coherent Market Insights)](https://www.coherentmarketinsights.com/industry-reports/ai-infrastructure-market)
- [Gartner: Worldwide AI Spending $2.5 Trillion in 2026](https://www.gartner.com/en/newsroom/press-releases/2026-1-15-gartner-says-worldwide-ai-spending-will-total-2-point-5-trillion-dollars-in-2026)
- [Gartner: 40% of Enterprise Apps Will Feature AI Agents by 2026](https://www.gartner.com/en/newsroom/press-releases/2025-08-26-gartner-predicts-40-percent-of-enterprise-apps-will-feature-task-specific-ai-agents-by-2026-up-from-less-than-5-percent-in-2025)
- [Vector Database Market 2026-2035 (Fundamental Business Insights)](https://www.fundamentalbusinessinsights.com/industry-report/vector-database-market-13287)

### エンタープライズ支出・コスト
- [AI Agent Development Cost 2026: Hidden TCO (HyperSense Software)](https://hypersense-software.com/blog/2026/01/12/hidden-costs-ai-agent-development/)
- [AI Pricing: True AI Cost for Businesses 2026 (Zylo)](https://zylo.com/blog/ai-cost/)
- [Inference Economics: 2026 Enterprise AI Cost Crisis (AnalyticsWeek)](https://analyticsweek.com/inference-economics-finops-ai-roi-2026/)
- [How to Get AI Agent Budgets Right 2026 (CIO)](https://www.cio.com/article/4099548/how-to-get-ai-agent-budgets-right-in-2026.html)
- [AI Agent Costs 2026: Complete TCO Guide (SearchUnify)](https://www.searchunify.com/resource-center/blog/ai-agent-costs-in-customer-service-the-complete-breakdown/)

### 開発者・採用統計
- [Global AI Developer Community Statistics (Arcade.dev)](https://blog.arcade.dev/global-ai-developer-community-statistics)
- [AI Agent Adoption 2026: What the Data Shows (Joget)](https://joget.com/ai-agent-adoption-in-2026-what-the-analysts-data-shows/)
- [State of Agent Engineering (LangChain)](https://www.langchain.com/state-of-agent-engineering)
- [150+ AI Agent Statistics (Master of Code)](https://masterofcode.com/blog/ai-agent-statistics)
- [50+ AI Agents Statistics 2026 (Second Talent)](https://www.secondtalent.com/resources/ai-agents-statistics/)

### セキュリティ・認証
- [AI Agent Security Market 2026 (CyberArk)](https://www.cyberark.com/resources/machine-identity-security/whats-shaping-the-ai-agent-security-market-in-2026)
- [AI Agents Identity Security Crisis 2026 (IANS Research)](https://www.iansresearch.com/resources/all-blogs/post/security-blog/2026/02/24/ai-agents-are-creating-an-identity-security-crisis-in-2026)
- [Identity Security Predictions 2026 (The Hacker News)](https://thehackernews.com/expert-insights/2026/02/9-identity-security-predictions-for-2026.html)

### 規制
- [EU AI Act Article 14: Human Oversight](https://artificialintelligenceact.eu/article/14/)
- [EU AI Act 2026 Compliance Guide (SecurePrivacy)](https://secureprivacy.ai/blog/eu-ai-act-2026-compliance)

### 企業情報
- [Braintrust $80M Series B (Silicon Angle)](https://siliconangle.com/2026/02/17/braintrust-lands-80m-series-b-funding-round-become-observability-layer-ai/)
- [Mem0 $24M Series A (TechCrunch)](https://techcrunch.com/2025/10/28/mem0-raises-24m-from-yc-peak-xv-and-basis-set-to-build-the-memory-layer-for-ai-apps/)
- [Daytona $24M Series A (PR Newswire)](https://www.prnewswire.com/news-releases/daytona-raises-24m-series-a-to-give-every-agent-a-computer-302680740.html)
- [E2B Sandbox Comparison (Northflank)](https://northflank.com/blog/daytona-vs-e2b-ai-code-execution-sandboxes)

---
*本セクション作成: 2026年3月13日*
*データの基準時点: 2026年3月*
*次セクション: 05-developer-pain-points-and-market-sizing-part2.md（開発者ペインポイント分析）*
