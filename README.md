# agentgov

Governance layer for AI agents -- enforce budgets, require human approval, catch stuck loops.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## The Problem

AI agents make autonomous LLM API calls. Without guardrails, a stuck agent can burn through hundreds of dollars in minutes.

Existing observability tools track costs after the fact. By the time you see the dashboard spike, the money is already spent.

A single GPT-4 agent loop can consume $50+ in under 10 minutes. At scale, a misconfigured agent or an infinite retry loop becomes a financial incident before anyone notices.

## How agentgov Works

agentgov is a transparent proxy that sits between your agent and the LLM provider.

Three enforcement mechanisms -- each deterministic, no LLM-based guardrails:

1. **Budget Enforcement** -- Hold/Settle pattern. Every request reserves estimated cost before forwarding. Budget exceeded = request blocked before it reaches the provider.
2. **Human-in-the-Loop (HITL)** -- Risk-graded action classification. High-risk tool calls (e.g., `send_email`, `delete_file`) pause for human approval via Slack or webhook.
3. **Error Containment** -- Stuck loop detection + retry exhaustion. Repeated identical tool calls are halted automatically.

Integration is one line: `agentgov.wrap(client)`

## Quick Start

**Prerequisites:** Docker, an OpenAI API key

**Step 1: Clone and start**

```bash
git clone https://github.com/evidence-gate/agentgov.git
cd agentgov
echo "OPENAI_API_KEY=sk-your-key" > docker/.env
docker compose -f docker/compose.yml up -d
```

**Step 2: Send a request through the proxy**

```bash
curl http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Agent-Id: my-agent" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

**Step 3: Point your existing OpenAI client at the proxy**

```typescript
import { wrap } from '@agentgov/sdk';
import OpenAI from 'openai';

const client = wrap(new OpenAI(), {
  proxyUrl: 'http://localhost:8787',
  agentId: 'my-agent',
});
// All requests now go through agentgov -- budgets enforced, actions classified
```

## Architecture

```
Agent (your code)
  |
  v
SDK (wrap)  -- injects X-Agent-Id, rewrites base URL
  |
  v
agentgov Proxy (Hono)
  |-- Budget Gate (Hold/Settle)
  |-- HITL Classifier (Risk-Graded)
  |-- Loop Detector (Fingerprint)
  |-- Audit Log (SHA-256 chain)
  |
  v
LLM Provider (OpenAI / Anthropic / Gemini)
```

Three main components:

- **Proxy** (`packages/proxy/`) -- Hono app, runs on Cloudflare Workers or Node.js (Docker)
- **TypeScript SDK** (`packages/sdk-typescript/`) -- `wrap()` convenience + `createAgentgovFetch()` for advanced use
- **Python SDK** (`packages/sdk-python/`) -- `wrap()` for sync, `wrap_async()` for async clients
- **Dashboard** (`packages/dashboard/`) -- React 19 SPA for budget monitoring and approval queue (Docker Compose only)

## Provider Support

| Provider  | Chat Completions | Streaming | Token Settle          | Notes                              |
| --------- | ---------------- | --------- | --------------------- | ---------------------------------- |
| OpenAI    | Yes              | Yes       | Yes (usage chunk)     | Full support                       |
| Anthropic | Yes              | Yes       | Yes (SSE message_delta) | Via /v1/messages passthrough     |
| Gemini    | Yes              | Yes       | Yes (usage chunk)     | Via OpenAI-compatible endpoint     |
