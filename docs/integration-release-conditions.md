# 統合・公開条件と強制終了予約の照合

更新: 入口chat認証を追加した後続候補では、下記の「IDだけで利用可能」という問題を是正した。現在の判定・設定は `agent-authentication.md` を参照。以下は1869d0c時点の再現根拠と、引き続き有効な強制終了予約の照合手順を保存したもの。

2026-10-18。対象: f917c60のローカル修正版。実クラウド・VM・実認証情報にはアクセスしていない。

## 判定

- **修正コードの統合: 条件付き可。** 既存より予算・精算・監査の不整合を改善する。統合を契機に自動配備しないこと、入口認証が未実装であることを未解消の重要問題として管理することが条件。既存公開先があるなら安全とは判定できず、接続制限の確認・対策が先決。
- **未認証のインターネット公開／相互に信頼しない利用者への提供: 不可。** 未登録ID拒否はなりすまし対策にはならない。今回の修正によってNodeで実provider呼出が動くため、旧stubと同じ安全性とみなせない。
- **単一管理主体の閉じたローカル検証: 可。** 信頼された利用者のみ、事前登録予算・合成providerを使用。Composeはホスト公開を127.0.0.1に限定したが、同じDockerネットワークやローカル利用者を認証する機能ではない。直接Node起動とWorkersにはこの制限は適用されない。

## 根拠と局所修正の限界

`src/app.ts`はX-Agent-Idの存在だけを確認し、chatでAuthorizationを検証しない。SDKも同ヘッダーを注入するのみ。providerへのAuthorizationはサーバー保有キーで上書きされる。`src/hitl/routes.ts`の承認secret、Slack署名、dashboard予算変更secret、Turso tokenは別目的であり、利用者とagent IDの対応を表す機構ではない。これらをchatキーとして流用してもagent間の権限制御にはならない。

ローカル実Node＋使い捨てDBで登録済みvictimに対し、Authorizationなし、X-Agent-IdのみでHTTP200、模擬provider1回、victim支出0.0000315 USDを確認。実課金なし。旧Composeは8787:8787で全ホストinterface公開、READMEは直接workers.devへの配備を案内し、認証入口の設定手順はない。既存設計・設定から『既に入口認証済み』とは判定できない。

局所対策としてComposeのホストportを127.0.0.1:8787:8787へ変更し、両READMEへ公開条件を追記。既存のagent認証機構は見つからないため、アプリ内認証は新設していない。

公開には運用責任者による次の決定・実装が必要:

1. 認証主体と方式を選択（既存組織の認証gateway、またはagentごとの資格情報等）。利用者→許可agent ID対応、失効・ローテーション責任者を定める。
2. 入口が資格情報を検証し、任意のX-Agent-Idを拒否または信頼できる値へ置換する。共通Bearer一つだけではagent間のなりすましを防げない。
3. proxyへの迂回接続を遮断し、dashboard GET／audit／HITL statusにも役割別アクセス制御を設定する。NodeとWorkersの双方で未認証・他agent指定・直接origin接続拒否を確認する。

新規鍵発行、権限変更、公開設定、push、配備は実施していない。

## 強制終了後の予約: 二重課金させない方針

予約と監査は同一DB batchで永続化し、プロセス終了時にも消えない。expires_atは存在するが、自動解放jobはない。時刻超過だけで解放してはいけない。現schemaには耐久的なdispatch状態・provider request IDがないため、未送信か、provider課金済みで応答を失ったかをDB単独では確定できない。

運用手順（実DBへの操作は今回未実施）:

1. 対象agentの受付を停止し、DBを保全する。active holdsとbudget_hold／budget_settle監査、HITL ticketを照合する。生きたWorkflowや処理中要求の予約を回収しない。
2. provider側記録等と対応を確認する。元のLLM要求は再送しない。再送するとprovider側の二重課金を防げない。
3. 未実行の確実な証拠があれば0、費用の確実な証拠があればその額を既存settleHoldで一回精算する。証拠不十分なら予約を保持する。予約額による保守計上は実費確定ではないため、責任者が許容した場合のみnull精算を選ぶ。
4. 同じhold IDでの再実行は既存のsettled判定で無操作になり、監査・spentを重複加算しない。応答喪失時は再送信でなくDBの監査を読み直す。
5. 精算理由・証拠参照・実行責任者を運用記録に残す。直接SQLでreserved/spentや既存監査を書き換えない。誤った額でsettledになった後の訂正用監査APIは未実装であり、異なる額でsettleHoldを再実行しても修正されない。

公開運用では照合担当・監視頻度・provider記録との対応方法を決める必要がある。無人の完全自動復旧を提供できる段階ではない。予算予約が残って止まることはあるが、期限切れの自動解放による追加支出は発生させない方針。

## 検証と残存範囲

`pnpm --filter @agentgov/proxy test:recovery`: 子プロセスで実SQLiteへ3予約をcommit直後SIGKILL。別プロセス側から再接続し、全予約の保持、既知費用0.2／不明費用0.6／未実行0の精算を確認。再接続後に同じholdへ異なる額で再精算してもspent不変、budget_settleは各1件。外部fetch・provider再送なし。この試験はprovider実費の照合精度を保証するものではない。

前回の型検査・Workers42／Node199／SDK37／HTTP21／HITL12・build成功に加え、今回recovery1件成功。Docker daemon、実Turso transport、実Cloudflare Workflow、実入口認証の配備検証は未実施。
