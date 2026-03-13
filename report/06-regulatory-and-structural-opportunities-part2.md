# 6. 規制・構造的機会分析（後編：規制駆動の需要分析）

*前編（参入障壁とモート分析）は `06-regulatory-and-structural-opportunities-part1.md` を参照。*

---

## 6.5 EU AI Act -- インフラビルダーのための条文分析

### なぜ法律文書を分析するのか

本セクションは法的助言を提供するものではない。EU AI Actの条文を**インフラプロダクトの設計要件**として読み解き、「どの条文がどのインフラカテゴリへの需要を生むか」を特定することが目的である。

### Article 14: Human Oversight（人間の監視）-- HITL直結

**条文の要旨:**
高リスクAIシステムは、使用期間中、自然人による効果的な監視が可能なように設計・開発されなければならない。監視措置はリスクのレベル、自律性の度合い、使用のコンテキストに相応でなければならない。

**インフラプロダクトへの翻訳:**

| 条文要件 | プロダクト機能への翻訳 | カテゴリ |
|---------|-------------------|---------|
| 自然人による監視の有効化 | 承認ワークフロー（高リスク操作前の人間による確認） | HITL |
| AIシステムの能力と限界の理解 | 操作コンテキストの表示（何を、なぜ、どのリスクレベルで） | HITL + オブザーバビリティ |
| 自動化バイアスへの対処 | 承認疲れ防止メカニズム（リスクベースルーティング、自動承認ルール） | HITL |
| AIシステムの出力の正確な解釈 | 意思決定の説明・トレーシング | オブザーバビリティ |
| 特定状況でのAI不使用/出力無視の決定 | 「停止」ボタン + 手動オーバーライド + 理由の記録 | HITL |
| 生体認証: 2人以上の検証 | マルチレベル承認ワークフロー | HITL |

**重要な帰結:** Article 14は**HITL機能を「設計段階から」組み込むことを要求**している。事後的な追加ではなく、AIシステムのアーキテクチャの一部としてHITLが必要。これは、フレームワーク非依存のHITLインフラへの構造的需要を創出する。

### Article 9: Risk Management System（リスク管理システム）-- コスト制御 + エラーハンドリング関連

**条文の要旨:**
高リスクAIシステムのプロバイダーは、AIシステムのライフサイクル全体を通じて継続的に実施されるリスク管理システムを確立し、定期的に見直し・更新しなければならない。

**インフラプロダクトへの翻訳:**

| 条文要件 | プロダクト機能への翻訳 | カテゴリ |
|---------|-------------------|---------|
| 既知・予測可能なリスクの特定・分析 | エージェント障害パターンの検出・カタログ化 | エラーハンドリング |
| リスクの推定・評価 | リスクスコアリング（コスト超過リスク含む） | コスト制御 + エラーハンドリング |
| 適切なリスク管理措置の採用 | 予算強制（コスト超過時の自動縮退）、障害時の自動遮断 | コスト制御 |
| 設計・開発によるリスク排除/低減 | プロキシレイヤーでのガードレール（予算上限、ループ検出） | コスト制御 |
| 残余リスクへの対応 | HITL承認、ユーザーへの通知 | HITL |
| テストと評価 | 継続的な品質モニタリング | 評価/テスト |

**重要な帰結:** Article 9は「コスト暴走」を**リスク管理の文脈**で捉えることを可能にする。予算超過がビジネスリスクであるなら、コスト制御はリスク管理の一部として位置づけられる。

### Article 12: Record-Keeping（記録保持）-- 監査ログ直結

**条文の要旨:**
高リスクAIシステムは、そのライフスパン全体を通じてイベントの自動記録（ログ記録）を可能にする技術を備えなければならない。

**インフラプロダクトへの翻訳:**

| 条文要件 | プロダクト機能への翻訳 | カテゴリ |
|---------|-------------------|---------|
| イベントの自動記録 | HITL承認/拒否の自動ログ記録 | HITL（監査証跡） |
| トレーサビリティの確保 | 意思決定チェーンの完全なトレース | オブザーバビリティ |
| データベース照合の記録 | コスト帰属の記録（どのエージェントがどのAPIをいくらで呼んだか） | コスト制御 |
| 結果検証者の記録 | 承認者・検証者の記録 | HITL |

**重要な帰結:** Article 12は**HITL承認の監査証跡**と**コスト帰属の記録**を法的に要求する。これはHITLプロダクトとコスト制御プロダクトの両方に直接的な需要を創出する。

### Article 13: Transparency（透明性）-- オブザーバビリティ関連

**条文の要旨:**
高リスクAIシステムは、デプロイヤーがシステムの出力を適切に解釈し使用できる程度の透明性を持って設計・開発されなければならない。

**インフラプロダクトへの翻訳:**
- 意思決定の説明可能性 → トレーシング/オブザーバビリティ
- システムのパフォーマンス・制約の開示 → ダッシュボード/レポーティング
- ただし、このカテゴリは既存のオブザーバビリティツール（Langfuse等）でカバーされる領域が大きい

### Article 17: Quality Management System（品質管理システム）-- 評価/テスト関連

**条文の要旨:**
高リスクAIシステムのプロバイダーは、品質管理システムを確立し、コンプライアンスを確保しなければならない。

**インフラプロダクトへの翻訳:**
- 継続的な品質モニタリング → 評価/テストツール
- コンプライアンスの文書化 → レポーティングツール
- ただし、このカテゴリは既存のBraintrust/Patronus AIでカバーされつつある

### インフラ需要マトリクス -- EU AI Act条文 × カテゴリ

| AI Act条文 | コスト制御 | HITL/承認 | エラーハンドリング | オブザーバビリティ | 評価/テスト |
|-----------|-----------|-----------|----------------|----------------|-----------|
| **Art. 14（人間監視）** | ○ コストベーストリガー | **◎ 直接的義務** | ○ 障害時のHITL連携 | ○ 出力解釈支援 | - |
| **Art. 9（リスク管理）** | **◎ コストリスク管理** | ○ 残余リスク対応 | **◎ 障害検出・管理** | ○ 継続モニタリング | ○ テスト・評価 |
| **Art. 12（記録保持）** | ○ コスト帰属記録 | **◎ 承認記録・監査証跡** | ○ 障害ログ | **◎ イベントログ** | - |
| **Art. 13（透明性）** | ○ コスト可視化 | ○ 承認理由の開示 | - | **◎ 意思決定トレース** | - |
| **Art. 17（品質管理）** | - | ○ QMS文書化 | ○ 障害対応手順 | - | **◎ 継続的品質評価** |
| **直接的需要強度** | **High** | **Critical** | **High** | Medium | Medium |

◎ = 直接的な法的要件、○ = 間接的に支援、- = 関連弱い

---

## 6.6 EU AI Act 施行タイムラインと市場機会

### 段階的施行スケジュール

| 日付 | 内容 | 市場への影響 |
|------|------|-----------|
| **2025年2月2日** | 禁止されるAI慣行の禁止（施行済み） | 直接的な影響は限定的（汎用AIエージェントは対象外が多い） |
| **2025年8月2日** | Chapter III: 汎用AI（GPAI）モデルの義務 | GPAIプロバイダーへの透明性要件。インフラ需要は中程度 |
| **2025年8月2日** | Chapter IX: 行動規範（Code of Practice） | 自主的なコンプライアンス基準。先行者優位の形成開始 |
| **2026年8月2日** | **Annex III 高リスクAIシステムの義務（最重要）** | **HITL、リスク管理、記録保持の義務化。インフラ需要が急増** |
| **2027年8月2日** | 特定の高リスクAIシステム（Annex I製品関連） | 追加的な需要。医療機器、自動車等のセクター固有 |

### 2026年8月2日: 最も重要なデッドライン

**高リスクAIシステムの定義（Annex III）:**

| 領域 | 具体例 | エージェントとの関連性 |
|------|--------|-----------------|
| **雇用・労働者管理** | 採用選考AI、パフォーマンス評価AI | 高い: HR AIエージェントが直接対象 |
| **金融サービス** | 与信判定AI、保険引受AI | 高い: 金融AIエージェントが直接対象 |
| **教育・職業訓練** | 成績評価AI、入学選考AI | 中程度: 教育AIエージェントが対象 |
| **法執行** | 犯罪予測AI、証拠評価AI | 低い: 民間AIエージェントには直接影響少 |
| **移民・国境管理** | ビザ審査AI、リスク評価AI | 低い: 同上 |
| **司法・民主プロセス** | 判決AI、選挙関連AI | 低い: 同上 |
| **重要インフラ** | エネルギー管理AI、水道管理AI | 中程度: 産業AIエージェントが対象 |

**エージェントインフラに最も関連する領域:**
- 雇用・労働者管理（HR AIエージェント）
- 金融サービス（与信・保険AIエージェント）
- 教育（評価AIエージェント）
- 重要インフラ（産業AIエージェント）

### 影響を受ける組織数の推計

**推計ロジック:**

| 指標 | 数値 | 出典 |
|------|------|------|
| EU域内でAIを使用する組織 | 88%の組織がAI使用（McKinsey） | McKinsey Global AI Survey |
| EU域内の大企業（従業員250名+） | 約230,000社 | Eurostat |
| AIを使用する大企業 | 約200,000社（88%） | 推計 |
| 高リスクAIシステムを保有する割合 | 18-40%（appliedAI調査: 106システム中18%が明確に高リスク、40%が分類不明確） | appliedAI |
| **高リスクAI対象企業（推計）** | **36,000-80,000社** | 推計 |
| SME（中小企業）も含めた全体 | 数十万社に拡大する可能性 | -- |

**欧州委員会の当初推計**では、AIアプリケーションの5-15%が厳格なルールに直面するとされていた。しかし、appliedAIの実態調査では18%が明確に高リスクであり、40%が分類不明確であるため、**実際の対象範囲は当初推計よりも広い**。

### コンプライアンスコスト推計

**GDPR準拠コストとの比較（プロキシ推計）:**

| 指標 | GDPR（実績） | EU AI Act（推計） | 根拠 |
|------|------------|-----------------|------|
| 大企業の初期コンプライアンスコスト | $1.3-3M | $8-15M | EU AI Actの技術的要件がGDPRより複雑 |
| 中堅企業の初期コスト | $500K-1M | $2-5M | リスク管理システム構築が追加 |
| SMEの初期コスト | $100-300K | $500K-2M | 軽減措置あるが技術投資は必要 |
| 年間維持コスト | $200-500K | $500K-2M | 継続的モニタリング要件 |
| **インフラツール支出（推計）** | -- | **コスト全体の15-25%** | ツール vs コンサル vs 法務の配分 |

**コンプライアンスインフラ支出の推計:**

| セグメント | 対象企業数 | 年間インフラ支出/社 | セグメント市場 |
|-----------|-----------|------------------|-------------|
| 大企業（高リスクAI保有） | 36,000-80,000 | $120K-$3.75M | $4.3B-$300B（広すぎる範囲） |
| **現実的な推計（中央値）** | 50,000 | $50K-200K | **$2.5B-$10B** |

この推計は全コンプライアンス支出を含むため、**HITL + コスト制御 + エラーハンドリングの特定インフラセグメント**に限定すると:

| カテゴリ | コンプライアンス需要の割合 | EU AI Act駆動の追加市場（推計） |
|---------|---------------------|--------------------------|
| HITL/承認 | 30-40%（Art. 14が最重要義務） | $750M-$4B |
| コスト制御 | 10-15%（Art. 9リスク管理の一部） | $250M-$1.5B |
| エラーハンドリング | 10-15%（Art. 9リスク管理の一部） | $250M-$1.5B |

**注意:** これらは全コンプライアンスインフラ支出からの配分推計であり、Phase 5の市場規模推計（競合ギャップ起点）とは別の視点からの推計。Phase 5のSAMはエージェントインフラ市場全体からの切り出しであり、規制駆動の「追加需要」としてこれが加わる。

### ペナルティの抑止効果

| 違反の種類 | 最大ペナルティ | GDPRとの比較 |
|-----------|-------------|-------------|
| 禁止されるAI慣行の違反 | €35M or 売上高の7% | GDPR（€20M or 4%）の**1.75倍** |
| 高リスク要件の不遵守 | €15M or 売上高の3% | GDPRとほぼ同等 |
| 情報提供義務違反 | €7.5M or 売上高の1.5% | GDPRより低い |

**売上高1Bの企業の場合:**
- 最大ペナルティ: €70M（7%）
- これは「コンプライアンスツールに年$500K-2M投資する」動機として十分すぎる

---

## 6.7 EU AI Act以外のグローバル規制ドライバー

### 米国: 断片的だが影響力のある規制環境

**連邦レベル:**
- **EO 14110（Biden, 2023年10月）**: AI安全性に関する包括的大統領令。トランプ政権により2025年1月に撤回
- **新大統領令（Trump, 2025年12月）**: 「AIに関する国家政策フレームワークの確保」。州のAI法に対する連邦優先の方向性。DOJ AI訴訟タスクフォースを設置
- **NIST AI RMF 1.0**: 自発的・非拘束のフレームワーク。ただしColorado AI Actなど州法がNIST AI RMFへの準拠を「防御手段」として認めている
- **NIST GenAI Profile（2024年7月）**: AI RMFの生成AI向け補足。ミスインフォメーション、ディープフェイク、知的財産の各リスクに対応

**州レベル（2026年に発効する主要法）:**
- **Colorado AI Act（2026年6月30日発効）**: 高リスクAI意思決定における「合理的な」リスク管理プログラムを要求。NIST AI RMFへの準拠が肯定的抗弁として機能
- **California, Texas, Illinois等**: 2026年1月1日から複数のAI関連法が発効
- **1,000+のAI関連法案**: 2025年だけで州レベルで1,000以上のAI関連法案が提出

**インフラ需要への影響:**
- 米国は法的義務としてのHITL需要は弱い（連邦法なし）
- ただし、**セクター固有の規制**（SEC、FDA、CFPB、EEOC等）がAIの使用に関するガイダンスを強化中
- NIST AI RMFが「事実上の標準」として機能し、リスク管理ツールへの需要を間接的に創出
- Colorado AI Actが「先例」となり、他州が追随する可能性

### 日本: プリンシプルベースの促進的アプローチ

**規制フレームワーク:**
- **AIプロモーション法（2025年5月成立、9月施行）**: EU AI Actとは対照的に、AI技術の研究開発・利用を「促進」することを目的とした法律。規制よりも支援に重点
- **AI事業者ガイドライン v1.1（2025年3月更新）**: 経済産業省・総務省が発行。リスク評価、透明性、説明可能性、モニタリングに関する実務的期待を規定。法的拘束力なし
- **AI戦略本部**: AIプロモーション法に基づき内閣府に設置。AI基本計画の策定・更新を担当

**日本拠点のスタートアップへの影響:**
- 日本の規制は**非拘束的**であり、プロダクト開発の法的制約にならない
- EU AI Act準拠ツールを日本から構築することに法的障壁なし
- むしろ、**EU規制のエキスパートとして差別化可能**: 日本市場向けにはAI事業者ガイドラインへの対応も可能だが、グローバル市場では不要
- 日本のAIプロモーション法の「促進的」姿勢は、AIインフラスタートアップにとって友好的な環境

### 英国: 比例性原則

- AI Safety Institute（AISI）が安全性評価を主導
- セクター固有の規制アプローチ（金融、医療等の既存規制機関がAI規制を担当）
- 法的拘束力のあるAI包括法はまだ制定されていない
- インフラ需要: EUより弱いが、UK市場向けにもEU AI Act対応ツールが流用可能

### 中国: 強力だがドメスティック

- 生成AI規定（2023年8月施行）: 中国国内向け。グローバルプロダクトには直接影響少
- アルゴリズム推薦規則: 透明性と説明可能性を要求
- 中国市場特有のコンプライアンス要件は、グローバルプロダクトの設計には反映しにくい

### セクター固有の規制（グローバル）

| セクター | 規制機関/基準 | AI関連要件 | インフラ需要 |
|---------|------------|-----------|-----------|
| **金融** | Basel Committee, SEC, CFPB | AI意思決定の説明可能性、モデルリスク管理 | HITL（与信判定の承認）、コスト制御（AI支出管理） |
| **医療** | FDA, EU MDR | 臨床AI意思決定の人間監視 | HITL（臨床判断の承認）、記録保持 |
| **雇用/HR** | EEOC, EU AI Act Annex III | 採用AIの公平性・透明性 | HITL（採用判定の承認）、監査証跡 |
| **金融アドバイザリー** | FINRA, MiFID II | 投資アドバイスAIの適合性確認 | HITL（投資推奨の承認）、記録保持 |

**重要な帰結:** セクター固有の規制は、**EU AI Actと独立して**HITL需要を創出する。特に金融と医療のセクターでは、EU AI Act施行前から既にAI意思決定の人間監視が実務上求められている。

---

## 6.8 規制収束分析 -- グローバルな共通トレンド

### 各法域で共通する要件

| 要件テーマ | EU AI Act | 米国（州法+セクター） | 日本 | 英国 | 収束度 |
|-----------|-----------|-------------------|------|------|--------|
| **人間の監視（HITL）** | ◎ 法的義務（Art. 14） | ○ セクター規制で実務上要求 | △ ガイドラインで推奨 | ○ セクター規制 | **高** |
| **リスク管理** | ◎ 法的義務（Art. 9） | ◎ NIST AI RMF + Colorado AI Act | ○ ガイドラインで推奨 | ○ AISI評価 | **高** |
| **記録保持/監査証跡** | ◎ 法的義務（Art. 12） | ○ セクター規制 | △ ガイドライン | ○ セクター規制 | **中-高** |
| **透明性/説明可能性** | ◎ 法的義務（Art. 13） | ○ セクター規制 | ○ ガイドライン | ○ AISI推奨 | **中-高** |
| **リスクベースアプローチ** | ◎ 高リスク分類 | ◎ NIST AI RMF | ○ ガイドライン | ◎ セクター別 | **高** |

**収束の結論:**
1. **人間の監視（HITL）は全法域で共通**: EUは法的義務、米国・英国はセクター規制で実務上要求、日本はガイドラインで推奨。**HITL需要はEU限定ではなくグローバル**
2. **リスク管理は「事実上の標準」**: NIST AI RMFがグローバルなベンチマークとして機能。EU AI ActもNIST AI RMFと整合的
3. **記録保持は法的義務化の方向**: EU AI Actが先行し、他法域が追随する見込み

---

## 6.9 上位3カテゴリの規制需要スコアリング

### 規制駆動の需要評価

| 評価軸 | コスト制御 | HITL/承認 | エラーハンドリング |
|--------|-----------|-----------|----------------|
| **EU AI Act 直接的義務** | Medium（Art. 9リスク管理の一部） | **Critical（Art. 14直接義務）** | High（Art. 9継続モニタリング） |
| **米国 規制需要** | Low（直接的義務なし） | High（セクター規制で実務上要求） | Medium（NIST AI RMF推奨） |
| **グローバル 規制需要** | Low-Medium | **High（全法域で共通テーマ）** | Medium |
| **タイミング緊急度** | Medium（2026年Q3以降に間接的需要） | **Critical（2026年8月2日デッドライン）** | Medium（段階的需要） |
| **ペナルティ回避動機** | Medium（コスト管理不備は直接的ペナルティ対象外） | **Critical（Art. 14不遵守 → €15M or 3%）** | Medium（Art. 9不遵守 → €15M or 3%） |
| **「Must-have」判定** | **Should-have**: リスク管理のベストプラクティスだが法的義務は間接的 | **Must-have**: 非準拠は法的ペナルティ直結 | **Should-have**: リスク管理の一部として推奨 |
| **規制需要スコア** | **6/10** | **10/10** | **7/10** |

### 「Must-have」 vs 「Nice-to-have」の判定

**Must-have（法的義務 → 確実な需要）:**
- **HITL/承認ワークフロー**: EU AI Act Article 14が高リスクAIシステムに人間の監視を義務付ける。非準拠のペナルティは最大€15M or 売上高の3%。コンプライアンス支出は裁量ではなく義務

**Should-have（ベストプラクティス → 強い需要）:**
- **エラーハンドリング**: EU AI Act Article 9がリスク管理の一部として要求。継続的モニタリングと障害対応は法的義務の一部だが、「エラーハンドリングツール」の購入は直接的には義務付けられていない
- **コスト制御**: リスク管理（Art. 9）の一環としてコスト暴走の防止は合理的に解釈可能だが、条文はコスト制御を明示的に要求していない

**Nice-to-have（間接的 → 中程度の需要）:**
- 評価/テスト（Art. 17品質管理の一部）
- 透明性/説明可能性ツール（Art. 13だが既存オブザーバビリティでカバー可能）

---

## 6.10 タイミング優位性分析

### 2026年8月2日デッドライン -- 市場機会の時間窓

**現在の準備状況（2026年3月時点）:**
- 欧州委員会は高リスクAIシステムのガイダンス公表期限を既に過ぎている（IAPP報道）
- 組織の過半数がAIシステムの体系的インベントリを持っていない
- C-suiteリーダーの多数がAI規制の不遵守を最も緊迫するAIリスクと回答

**タイミング分析:**

| 時期 | 市場の状態 | プロダクト戦略 |
|------|-----------|-------------|
| **2026年3-6月（現在〜5ヶ月前）** | パニック期: デッドライン認知が急速に広がる。「何かしなければ」のフェーズ | MVP投入のベストタイミング。「最低限のコンプライアンス」を求める企業にセルフサーブで提供 |
| **2026年7-8月（直前）** | 駆け込み期: 未対応企業が急いでツールを導入 | 即時利用可能なテンプレート + セットアップガイドが高需要 |
| **2026年9-12月（直後）** | 最初の執行期: 初期の執行事例・制裁が報道される | 事例を基にしたマーケティング。「この企業は$Xの罰金。あなたは準備できていますか？」 |
| **2027年〜** | 定常期: コンプライアンスが日常業務に統合 | 継続的モニタリング + レポーティングの月額課金 |

**GDPR発効時の教訓:**
- GDPR（2018年5月施行）後、コンプライアンスツール市場が急成長
- OneTrust: GDPR発効後3年で$7.3B評価額に到達
- 規制施行の「恐怖」が最も効果的なセールストリガー
- 施行後6-12ヶ月で最初の大型制裁が出ると、第2波の需要が発生

**コスト制御のタイミング:**
- コスト制御は規制デッドラインに直接紐づかないが、2026年後半のエージェント採用急増（Gartnerの40%予測）に伴いコスト問題が顕在化
- 「エージェント・ガバナンス」としてHITLとバンドリングすることで、規制デッドラインのタイミング優位性を間接的に享受可能

---

## 6.11 Phase 6 総合統合 -- 参入障壁 × 規制需要

### 前編（参入障壁/モート）+ 後編（規制需要）の統合評価

| カテゴリ | 小規模チーム適合性（前編） | モート強度（前編） | 規制需要スコア（後編） | **総合判定** |
|---------|---------------------|---------------|-------------------|------------|
| **HITL/承認** | Feasible | ★★★★☆ (17/25) | **10/10 (Must-have)** | **最有望 -- 規制デッドラインが確実な需要を創出** |
| **コスト制御** | Feasible | ★★★★☆ (18/25) | 6/10 (Should-have) | **最有望 -- 最強のモート構造 + 最大のペインスコア** |
| **エラーハンドリング** | Feasible（バンドル前提） | ★★★☆☆ (13/25) | 7/10 (Should-have) | **有望 -- バンドリング戦略で価値最大化** |
| 評価/テスト | Challenging | ★★★☆☆ | 5/10 (Nice-to-have) | 条件付き -- 競合強すぎ |
| 認証/ID | Infeasible | ★★☆☆☆ | 4/10 | 非推奨 |
| その他9カテゴリ | Infeasible | -- | -- | 非推奨 |

### Phase 6の5つの核心的洞察

1. **HITLは「規制 × モート × 参入可能性」の三重交差点**: EU AI Act Article 14が法的義務としてHITLを要求し（Must-have需要）、監査証跡のロックインが強いモートを形成し、コアロジックは小規模チームでも構築可能。3つの条件すべてを満たす唯一のカテゴリ

2. **コスト制御は「ペイン × モート × 参入可能性」の三重交差点**: Phase 5で最高ペインスコア（88/125）を記録し、データネットワーク効果 + スイッチングコストが最も強いモートを形成し、ソロ開発者でも12ヶ月でMVP〜中級機能を構築可能。規制需要はHITLより弱いが、市場原動力（78%のITリーダーが予想外費用を報告）は十分

3. **「エージェント・ガバナンス」としての3カテゴリ統合が最強のポジション**: コスト制御 + HITL + エラーハンドリングを「エージェント・ガバナンス」プラットフォームとして統合することで、各カテゴリの個別モートが複合的に機能する。予算超過 → グレースフル縮退 → 障害検出 → HITL承認、という一連のフローは自然な統合ポイント

4. **SOC 2はDay 1の障壁ではない**: OSSファースト戦略では、セルフホスティングユーザーにSOC 2は不要。コミュニティが十分に成長してから（12-18ヶ月後）エンタープライズ向けクラウド版でSOC 2を取得すればよい。コスト$20-60K、期間6-9ヶ月は管理可能

5. **日本拠点は「Global-first」で機能する**: 英語ファースト + OSSコミュニティ駆動 + PLG（Product-Led Growth）の組み合わせにより、日本拠点のハンデを最小化。タイムゾーンの違いは非同期ファーストで対処可能。EU AI Act対応の知識はグローバル市場で差別化要因になる

### Gartner予測の裏付け

Gartnerは2026年2月に以下の予測を発表:
- **AIガバナンスプラットフォーム市場**: 2026年に$492M → 2030年に$1B超
- **2030年までに、AIエージェントデプロイメントの失敗の50%が不十分なAIガバナンスプラットフォームのランタイム強制に起因**
- **断片的なAI規制が4倍に成長し、世界経済の75%をカバー → 2030年に総コンプライアンス支出$1B**

これは本レポートの分析と完全に整合する: **コスト制御（予算強制 = ランタイム強制の一形態）+ HITL（規制準拠の中核）+ エラーハンドリング（リスク管理の実装）は、Gartnerが予測する$1B市場の中核セグメント**。

---

## 6.12 出典

### EU AI Act
- [Article 14: Human Oversight (EU AI Act)](https://artificialintelligenceact.eu/article/14/)
- [Article 9: Risk Management System (EU AI Act)](https://artificialintelligenceact.eu/article/9/)
- [Article 12: Record-Keeping (EU AI Act)](https://artificialintelligenceact.eu/article/12/)
- [Article 6: Classification Rules for High-Risk AI Systems (EU AI Act)](https://artificialintelligenceact.eu/article/6/)
- [High-level summary of the AI Act (EU AI Act)](https://artificialintelligenceact.eu/high-level-summary/)
- [Under EU AI Act, high-risk systems require a human touch (IAPP)](https://iapp.org/news/a/eu-ai-act-shines-light-on-human-oversight-needs)
- [European Commission misses deadline for AI Act guidance on high-risk systems (IAPP)](https://iapp.org/news/a/european-commission-misses-deadline-for-ai-act-guidance-on-high-risk-systems)
- [Human Oversight in Article 14 of the EU AI Act by Melanie Fink (SSRN)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5147196)

### EU AI Act コンプライアンスコスト
- [EU AI Act 2026 Compliance Guide (SecurePrivacy)](https://secureprivacy.ai/blog/eu-ai-act-2026-compliance)
- [EU AI Act 2026 Updates: Compliance Requirements and Business Risks (LegalNodes)](https://www.legalnodes.com/article/eu-ai-act-2026-updates-compliance-requirements-and-business-risks)
- [EU AI Act High-Risk Rules Hit August 2026: Your Compliance Countdown (AI2Work)](https://ai2.work/economics/eu-ai-act-high-risk-rules-hit-august-2026-your-compliance-countdown/)
- [5 Steps to Prepare for EU AI Act High-Risk Compliance (Sitnik AI)](https://sitnik.ai/blog/5-steps-eu-ai-act-high-risk-compliance-2026/)
- [EU AI Act: New Obligations for Companies (HeyData)](https://heydata.eu/en/magazine/how-the-eu-ai-act-will-reshape-corporate-compliance-starting-in-2026/)
- [EU AI Act High-Risk Requirements: What Companies Need to Know (Dataiku)](https://www.dataiku.com/stories/blog/eu-ai-act-high-risk-requirements)

### 米国 AI規制
- [U.S. AI Law Update: Navigating the Evolving Regulatory Landscape (Baker Botts)](https://www.bakerbotts.com/thought-leadership/publications/2026/january/us-ai-law-update)
- [Colorado AI Act Implementation Delayed (Baker Botts)](https://www.bakerbotts.com/thought-leadership/publications/2025/september/colorado-ai-act-implementation-delayed)
- [A First for AI: A Close Look at The Colorado AI Act (FPF)](https://fpf.org/blog/a-first-for-ai-a-close-look-at-the-colorado-ai-act/)
- [New State AI Laws Effective January 1, 2026 (King & Spalding)](https://www.kslaw.com/news-and-insights/new-state-ai-laws-are-effective-on-january-1-2026-but-a-new-executive-order-signals-disruption)

### 日本 AI規制
- [Japan's emerging framework for responsible AI (IBA)](https://www.ibanet.org/japan-emerging-framework-ai-legislation-guidelines)
- [Understanding Japan's AI Promotion Act (FPF)](https://fpf.org/blog/understanding-japans-ai-promotion-act-an-innovation-first-blueprint-for-ai-regulation/)
- [Japan AI Regulation 2026: Major Policy Shift (AI News Desk)](https://ainewsdesk.app/japan-ai-regulation-2026/)
- [Global AI Governance Law and Policy: Japan (IAPP)](https://iapp.org/resources/article/global-ai-governance-japan)
- [AI Regulation in Japan: Policy Framework & Governance (Nemko)](https://digital.nemko.com/regulations/ai-regulation-japan)

### AIガバナンス市場
- [Gartner: Global AI Regulations Fuel Billion-Dollar Market for AI Governance Platforms](https://www.gartner.com/en/newsroom/press-releases/2026-02-17-gartner-global-ai-regulations-fuel-billion-dollar-market-for-ai-governance-platforms)
- [AI governance tools: Selection and security guide for 2026 (Vectra)](https://www.vectra.ai/topics/ai-governance-tools)
- [Best AI Governance Platform in 2026 (Maxim)](https://www.getmaxim.ai/articles/best-ai-governance-platform-in-2026/)
- [How to get AI agent budgets right in 2026 (CIO)](https://www.cio.com/article/4099548/how-to-get-ai-agent-budgets-right-in-2026.html)

### PwC / その他
- [EU's AI Act: What regulators should know (PwC)](https://www.pwc.com/us/en/services/consulting/cybersecurity-risk-regulatory/library/tech-regulatory-policy-developments/eu-ai-act.html)
- [AI Risk & Compliance 2026: Enterprise Governance Overview (SecurePrivacy)](https://secureprivacy.ai/blog/ai-risk-compliance-2026)
- [Why the EU's AI Act is about to become every enterprise's biggest compliance challenge (Techpinions)](https://techpinions.com/why-the-eus-ai-act-is-about-to-become-every-enterprises-biggest-compliance-challenge/)

---
*本セクション作成: 2026年3月13日*
*データの基準時点: 2026年3月*
*前セクション: 06-regulatory-and-structural-opportunities-part1.md（参入障壁とモート分析）*
*次セクション: Phase 7（収益モデル分析）*
