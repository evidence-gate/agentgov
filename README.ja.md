[English](README.md) | **日本語**

# agentgov

AIエージェントのためのガバナンスレイヤー — 予算強制、人間による承認、無限ループの検出を実現します。

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

---

## 課題

AIエージェントはLLM APIを自律的に呼び出します。ガードレールがなければ、暴走したエージェントが短時間で大きなコストを発生させる可能性があります。

既存のオブザーバビリティツールはコストを事後的に追跡するだけです。ダッシュボードの急上昇に気付いた時には、すでにお金は使われています。

大規模運用では、設定ミスや無限リトライループが、誰も気付かないうちに財務インシデントになります。

## agentgov の仕組み

agentgov は、エージェントとLLMプロバイダーの間に配置される透過プロキシです。

3つの制御メカニズム — すべてルールベースで、LLMベースのガードレールは使用しません：

1. **予算強制** — ホールド/決済パターン。リクエストごとに推定コストを事前に確保し、予算超過時はプロバイダーに到達する前にリクエストをブロックします。
2. **Human-in-the-Loop (HITL)** — リスクに応じたアクション分類。高リスクなツール呼び出し（例：`send_email`、`delete_file`）はSlackまたはwebhook経由で人間の承認を待ちます。
3. **エラー封じ込め** — 無限ループ検出 + リトライ上限。繰り返される同一のツール呼び出しは自動的に停止されます。

統合は1行で完了します：`agentgov.wrap(client)`

## クイックスタート

**前提条件:** Docker、OpenAI APIキー

**ステップ1: クローンして起動**

```bash
git clone https://github.com/evidence-gate/agentgov.git
cd agentgov
echo "OPENAI_API_KEY=sk-your-key" > docker/.env
docker compose -f docker/compose.yml up -d
```

**ステップ2: プロキシ経由でリクエストを送信**

```bash
curl http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Agent-Id: my-agent" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

**ステップ3: 既存のOpenAIクライアントをプロキシに向ける**

```typescript
import { wrap } from '@agentgov/sdk';
import OpenAI from 'openai';

const client = wrap(new OpenAI(), {
  proxyUrl: 'http://localhost:8787',
  agentId: 'my-agent',
});
// すべてのリクエストがagentgovを経由 -- 予算強制、アクション分類が有効
```

## アーキテクチャ

```
Agent (あなたのコード)
  |
  v
SDK (wrap)  -- X-Agent-Idの注入、ベースURLの書き換え
  |
  v
agentgov プロキシ (Hono)
  |-- Budget Gate (ホールド/決済)
  |-- HITL Classifier (リスク分類)
  |-- Loop Detector (フィンガープリント)
  |-- Audit Log (SHA-256チェーン)
  |
  v
LLMプロバイダー (OpenAI / Anthropic / Gemini)
```

主要コンポーネント：

- **プロキシ** (`packages/proxy/`) — Honoアプリ、Cloudflare WorkersまたはNode.js (Docker) で動作
- **TypeScript SDK** (`packages/sdk-typescript/`) — `wrap()` による簡易統合 + 上級者向けの `createAgentgovFetch()`
- **Python SDK** (`packages/sdk-python/`) — 同期クライアント用の `wrap()`、非同期クライアント用の `wrap_async()`
- **ダッシュボード** (`packages/dashboard/`) — 予算監視と承認キューのためのReact 19 SPA（Docker Compose環境のみ）

## プロバイダー対応状況

| プロバイダー | Chat Completions | Streaming | トークン決済             | 備考                               |
| ------------ | ---------------- | --------- | ------------------------ | ---------------------------------- |
| OpenAI       | 対応             | 対応      | 対応 (usage chunk)       | フルサポート                       |
| Anthropic    | 対応             | 対応      | 対応 (SSE message_delta) | /v1/messages パススルー経由        |
| Gemini       | 対応             | 対応      | 対応 (usage chunk)       | OpenAI互換エンドポイント経由       |

## SDKの使い方

### TypeScript

```typescript
import { wrap, BudgetExceeded, HitlPending } from '@agentgov/sdk';
import OpenAI from 'openai';

const client = wrap(new OpenAI(), {
  proxyUrl: 'http://localhost:8787',
  agentId: 'research-agent',
});

try {
  const res = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Summarize this document' }],
  });
  console.log(res.choices[0].message.content);
} catch (err) {
  if (err instanceof BudgetExceeded) {
    console.log(`Budget exhausted: $${err.spent} / $${err.limit}`);
  }
  if (err instanceof HitlPending) {
    console.log(`Awaiting approval: ${err.approvalId}`);
  }
}
```

本番パターン — SDKへの依存なし：

```typescript
// 本番パターン -- SDK依存なし
const client = new OpenAI({
  baseURL: 'https://your-agentgov-proxy.example.com/v1',
  defaultHeaders: { 'X-Agent-Id': 'my-agent' },
});
```

### Python

```python
import agentgov
from openai import OpenAI

client = agentgov.wrap(OpenAI(), proxy_url="http://localhost:8787", agent_id="research-agent")

try:
    res = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Summarize this document"}],
    )
    print(res.choices[0].message.content)
except agentgov.BudgetExceeded as e:
    print(f"Budget exhausted: ${e.spent} / ${e.limit}")
except agentgov.HitlPending as e:
    print(f"Awaiting approval: {e.approval_id}")
```

非同期クライアント：

```python
import agentgov
from openai import AsyncOpenAI

client = agentgov.wrap_async(AsyncOpenAI(), proxy_url="http://localhost:8787", agent_id="async-agent")
```

Anthropicクライアント：

```python
import agentgov
from anthropic import Anthropic

client = agentgov.wrap(Anthropic(), proxy_url="http://localhost:8787", agent_id="claude-agent")
```

## デプロイ

### Docker Compose（セルフホスト）

```bash
# 1. クローン
git clone https://github.com/evidence-gate/agentgov.git
cd agentgov

# 2. 設定
cp docker/.env.example docker/.env
# docker/.env を編集 -- OPENAI_API_KEY（必須）、ANTHROPIC_API_KEY（任意）を設定

# 3. 起動
docker compose -f docker/compose.yml up -d

# 4. 動作確認
curl http://localhost:8787/health
# {"status":"ok"}
```

### Cloudflare Workers

```bash
# 1. 依存関係のインストール
pnpm install

# 2. シークレットの設定
cd packages/proxy
wrangler secret put TURSO_DATABASE_URL --env production
wrangler secret put TURSO_AUTH_TOKEN --env production
wrangler secret put OPENAI_API_KEY --env production
# 任意: ANTHROPIC_API_KEY, GEMINI_API_KEY

# 3. デプロイ
wrangler deploy --env production

# 4. 動作確認
curl https://agentgov-proxy-production.<your-subdomain>.workers.dev/health
```

Cloudflare Workersへのデプロイには[Turso](https://turso.tech)データベースが必要です。turso.techでデータベースを作成し、提供されたURLと認証トークンを使用してください。

## プロジェクト構成

```
agentgov/
  packages/
    proxy/           # Honoプロキシ -- 予算ゲート、HITL、ループ検出、監査
    sdk-typescript/  # TypeScript SDK -- wrap(), BudgetExceeded, HitlPending
    sdk-python/      # Python SDK -- wrap(), wrap_async()
    dashboard/       # React 19 SPA -- コスト概要、承認キュー
  docker/
    compose.yml      # Docker Composeによるセルフホスト
    Dockerfile.proxy # マルチステージNode.jsビルド
```

## ライセンス

[Apache 2.0](LICENSE)
