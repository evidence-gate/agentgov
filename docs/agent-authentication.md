# Agent認証と候補の公開条件

2026-10-18。1869d0cに対する追加是正。実資格情報の生成・配備・権限変更は実施していない。

## 設計と互換性

chat `/v1/chat/completions`は、サーバー設定`AGENTGOV_AGENT_AUTH`にある資格情報のSHA-256と、要求ヘッダー`X-Agentgov-Token`のSHA-256を照合する。認証subjectの`agentIds`に`X-Agent-Id`が完全一致する場合だけ予算処理へ進む。大文字小文字を区別し、wildcard・prefix許可はない。認証subjectはbudget_hold監査payload.subjectへ保存される。秘密token・hashは監査やproviderへ送らない。

設定はJSON配列。各要素は`subject`、`tokenSha256`、`agentIds`の3フィールドのみ。subjectとagent IDは英数字で始まり、以降は英数字と`_.:@/-`のみ、最大128文字。tokenSha256は64文字の小文字hex。最大128資格情報、各128agent、全体262144文字以内。重複hash・同一要素内の重複agent・不正要素を含む設定は全体を拒否する。同じsubjectに異なるtokenを一時併存させたrotationは可能。agentを複数subjectへ許可する場合も明示指定する。

資格情報はprovider API keyや管理tokenと別に発行し、**少なくとも32ランダムbytesから作るbase64url token**を使う。受理形式は`[A-Za-z0-9_-]`の32〜256文字だが、この形式検査は強度を保証しない。実tokenの配布・保管・失効責任者と許可agent一覧の承認は運用で必要。今回は生成していない。

digestはtokenのUTF-8 bytesにSHA-256を適用し、小文字hex化する（改行を含めない）。承認後に運用側で、たとえば`hashlib.sha256(os.environ["AGENTGOV_TOKEN"].encode("utf-8")).hexdigest()`で算出できる。raw tokenをコマンドライン引数やリポジトリへ置かず、適切な秘密管理経路から渡す。この作業では合成tokenのhashのみ作成した。

設定の形（プレースホルダーは実値へ置換しない限り有効設定ではない）:

```json
[{"subject":"service-a","tokenSha256":"<lowercase SHA-256 hex of independently provisioned token>","agentIds":["agent-a"]}]
```

Nodeはprocess環境、Composeは同名環境変数、Workersは同名bindingから読む。Nodeの環境変更は再起動、Workersは設定反映が必要。token削除は次の有効設定で新規要求を拒否するが、すでに開始した処理を取り消さない。全設定を削除・破損すると全chat要求が503になる。ローカル認証省略やprovider keyによる代替認証は設けていない。

- 設定欠落・不正・暗号処理失敗:503 AGENT_AUTH_UNAVAILABLE。
- token欠落・不正・不一致:401 AGENT_UNAUTHENTICATED。
- 許可されないagent:403 AGENT_FORBIDDEN。
- 認証済みだが予算未登録:403 BUDGET_NOT_PROVISIONED。

予算行は chat では作らない。運用者は `AGENTGOV_BUDGET_ADMIN_TOKEN` の Bearer を付けた `PUT /api/v1/operator/budgets/:agentId`、または DB 資格情報を持つ `pnpm --filter @agentgov/proxy budget:provision` で登録する。手順と Docker / Node / Workers のコマンドは budget-provisioning.md。未設定は 503、token 不一致は 401 で、いずれも行を作らない。chat token や `X-Agentgov-Token` では予算を付与できない。予算行だけでは chat を認可しない。

拒否はDB・予約・provider呼出の前。認証失敗をDB監査へ保存していないため、必要な認証失敗監視は秘密を除去した入口ログで行う。要求主体が送るAuthorizationやX-Authenticated-Subjectは権限を与えない。管理用BearerやSlack署名は別経路のまま。

既存SDKは任意ヘッダーを維持するため、SDKのAPI変更なしで利用できる。例（AGENTGOV_TOKENは別途承認済み手順で配布される値）:

```ts
const client = agentgov.wrap(new OpenAI({
  defaultHeaders: { 'X-Agentgov-Token': process.env.AGENTGOV_TOKEN! },
}), { proxyUrl: 'https://trusted-proxy.example', agentId: 'agent-a' });
```

```python
client = agentgov.wrap(OpenAI(default_headers={
    "X-Agentgov-Token": os.environ["AGENTGOV_TOKEN"]
}), proxy_url="https://trusted-proxy.example", agent_id="agent-a")
```

Authorizationはprovider SDK互換のため別扱い。proxy→providerはサーバー保有provider keyと既知ヘッダーだけで構成する。ログ・reverse proxy・APMでX-Agentgov-Tokenを記録しないこと。リモート経路はHTTPS必須。Bearer資格情報なので盗難・漏洩したtokenの再利用は防げず、失効が必要。

## 統合可否と保証範囲

**コード統合可。** 合成資格情報でNodeとWorkersの共通境界を検証し、無資格のID指定や他subjectの許可外IDではprovider支出を起こせない。未設定の既存環境はchatが503となる互換性変更なので、設定準備なしの配備は不可。

**実公開の準備完了とは判定しない。** 実資格情報の発行・配布、権限一覧、HTTPS、秘密のログ除外、dashboard GET/auditとHITL statusのアクセス制限は未構成。これら参照経路の認証は今回のchat支出認可とは別の残件であり、無制限公開できない。管理書込みtoken・HITL直接承認tokenも別途必要。広範なIAMやネットワーク変更は行っていない。

強制終了予約は既存の原子的・再試行可能な精算を利用する。元要求を再送せず、実費と照合し、不明なら保持する。自動照合は未実装。手順・SIGKILL検証はintegration-release-conditions.mdを参照。

実Turso、実Cloudflare Workflow、実配備の認証設定、資格情報管理基盤は未検証。合成tokenによる検証はこれらの代替保証ではない。

## ローカル検証・独立レビュー

- Workers45件、Node202件、TypeScript SDK37件、Python SDK29件成功。
- 実Node HTTP（chat＋敵対試験）25件成功。設定欠落・不正、token欠落・不一致・長さ違反、他agent指定をDB変更／provider呼出なしで拒否。認証subjectの監査記録、token非転送・非記録、新設定で旧token拒否／新token受理を確認。
- 起動・migration1件、SIGKILL予約復旧1件成功。全workspace lint/build成功（Workersはdry-runのみ）。
- 独立レビューで認可迂回の具体例は見つからず、fixture互換性と移行文書の指摘を是正後、Node202件を独立再実行して追加ブロッカーなし。
- 既存HITLテストのnested vi.mock警告は残存。認証失敗のrate limit、盗難tokenの検知、実クラウドの設定確認はこの検証に含めない。
