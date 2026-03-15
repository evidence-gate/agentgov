# Requirements: Agent Governance Platform (agentgov)

**Defined:** 2026-03-13
**Core Value:** AIエージェントのコストを「追跡」ではなく「強制」する -- 予算超過時にリクエストを決定論的にブロックし、コスト暴走を構造的に防止すること。

## v1.0 Requirements (Complete)

### Cost Control

- [x] **COST-01**: Per-request cost calculation with maintainable pricing table (OpenAI, Anthropic, Google models)
- [x] **COST-02**: Multi-level spend aggregation (model, provider, team, agent)
- [x] **COST-03**: Budget definition at multiple scopes (global, per-provider, per-model)
- [x] **COST-04**: Hard enforcement — block requests when budget is exceeded
- [x] **COST-05**: Budget alert notifications (webhook) at configurable thresholds (e.g., 80%, 100%)

### HITL / Approval

- [x] **HITL-01**: Approval request routing to external channel (webhook)
- [x] **HITL-02**: Approve/deny response path that feeds decision back to agent context
- [x] **HITL-03**: Async approval — agent pauses and resumes without blocking (non-blocking wait)
- [x] **HITL-04**: Timeout and escalation handling for unanswered approval requests
- [x] **HITL-05**: Approval history / audit trail with actor, timestamp, and action taken

### Error Handling

- [x] **ERR-01**: Error classification — transient (retriable: rate limit, 5xx) vs permanent (non-retriable: auth, 4xx)
- [x] **ERR-02**: Finite retry with exponential backoff and jitter, configurable max retries
- [x] **ERR-03**: Stuck/loop detection — detect agents repeating the same action without progress
- [x] **ERR-04**: Structured error reporting with type, timestamp, agent context, and suggested remediation

### SDK & Integration

- [x] **SDK-01**: TypeScript SDK with `agentgov.wrap(client)` 1-line integration
- [x] **SDK-02**: Python SDK with equivalent `agentgov.wrap(client)` API
- [x] **SDK-03**: OpenAI-compatible API surface (proxy accepts standard chat/completions format)
- [x] **SDK-04**: Docker Compose self-host deployment (5-minute setup)
- [x] **SDK-05**: Basic dashboard — budget status, session cost, enforcement events, approval queue

## v1.1 Requirements

### Provider Completeness

- [ ] **PROV-01**: `gemini-*` モデルのリクエストがGemini OpenAI互換エンドポイント経由でLLMに転送され、非ストリーミング/ストリーミング両方で正確なトークン精算が行われる
- [ ] **PROV-02**: Gemini APIキー未設定時に503 + 明確なエラーメッセージが返る（既存OpenAI/Anthropicと同パターン）
- [ ] **PROV-03**: Anthropicストリーミングレスポンスの`message_start`/`message_delta`からinput/output tokensを抽出し、0トークンではなく実コストで精算する

### SDK Enhancement

- [x] **SDK-06**: Python `AsyncOpenAI`/`AsyncAnthropic`クライアントに対して`agentgov.wrap()`が動作し、async httpxトランスポート経由でプロキシにルーティングされる
- [x] **SDK-07**: Python async SDKで`BudgetExceeded`/`HitlPending`/`AgentError`例外がsync版と同一の契約で発生する

### Infrastructure

- [ ] **DEPLOY-01**: `wrangler deploy`でプロキシがCloudflare Workersにデプロイされ、Turso cloud + Workflows bindingで全機能が動作する
- [ ] **DEPLOY-02**: Cloudflare Workers環境で`GEMINI_API_KEY`を含む全シークレットが`wrangler secret put`で設定される
- [x] **BUDGET-01**: ダッシュボードからper-agentの予算上限を設定・変更でき、変更が即座にbudget_ledgerに反映される
- [x] **BUDGET-02**: 予算変更がaudit_logに記録され、変更履歴が追跡可能である

## Future Requirements

### Cost Control — Differentiators

- **COST-07**: Graceful degradation — auto-downgrade to cheaper model when budget threshold reached
- **COST-08**: Per-session budget isolation — independent budget per agent execution session

### HITL — Differentiators

- **HITL-07**: EU AI Act Article 14 compliance mode — evidence export with oversight documentation

### Error Handling — Differentiators

- **ERR-05**: 3-tier timeout (soft warning → idle detection → hard stop)
- **ERR-07**: Partial result return on hard stop (preserve completed work)

### SDK — Differentiators

- **SDK-08**: Anthropic prompt caching token awareness (cache_read_input_tokens discount)
- **SDK-09**: Extended thinking token handling (different billing rate)

## Out of Scope

| Feature | Reason |
|---------|--------|
| LLM routing / load balancing | Commoditized (LiteLLM, Portkey). No differentiation possible |
| Guardrails / content filtering | Separate domain, highly competitive |
| Agent framework features | Destroys "wrap any client" positioning |
| ML-based anomaly detection | Deterministic thresholds more trustworthy and auditable |
| Vertex AI / service account auth | GCP IAM complexity; use generativelanguage.googleapis.com with API key |
| Native Gemini API (generateContent) | OpenAI-compat layer sufficient; avoids format translation complexity |
| Anthropic cache/thinking token settle | HIGH complexity; defer to v1.2 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| COST-01 | Phase 1 (v1.0) | Complete |
| COST-02 | Phase 1 (v1.0) | Complete |
| COST-03 | Phase 1 (v1.0) | Complete |
| COST-04 | Phase 1 (v1.0) | Complete |
| COST-05 | Phase 1 (v1.0) | Complete |
| SDK-01 | Phase 1 (v1.0) | Complete |
| SDK-03 | Phase 1 (v1.0) | Complete |
| HITL-01 | Phase 2 (v1.0) | Complete |
| HITL-02 | Phase 2 (v1.0) | Complete |
| HITL-03 | Phase 2 (v1.0) | Complete |
| HITL-04 | Phase 2 (v1.0) | Complete |
| HITL-05 | Phase 2 (v1.0) | Complete |
| ERR-01 | Phase 3 (v1.0) | Complete |
| ERR-02 | Phase 3 (v1.0) | Complete |
| ERR-03 | Phase 3 (v1.0) | Complete |
| ERR-04 | Phase 3 (v1.0) | Complete |
| SDK-02 | Phase 4 (v1.0) | Complete |
| SDK-04 | Phase 4 (v1.0) | Complete |
| SDK-05 | Phase 4 (v1.0) | Complete |
| PROV-01 | Phase 5 (v1.1) | Pending |
| PROV-02 | Phase 5 (v1.1) | Pending |
| PROV-03 | Phase 5 (v1.1) | Pending |
| SDK-06 | Phase 6 (v1.1) | Complete |
| SDK-07 | Phase 6 (v1.1) | Complete |
| BUDGET-01 | Phase 6 (v1.1) | Complete |
| BUDGET-02 | Phase 6 (v1.1) | Complete |
| DEPLOY-01 | Phase 7 (v1.1) | Pending |
| DEPLOY-02 | Phase 7 (v1.1) | Pending |

**Coverage:**
- v1.0 requirements: 19 total — 19 complete
- v1.1 requirements: 9 total — 0 complete, 9 mapped
- Unmapped: 0

---
*Requirements defined: 2026-03-13*
*Last updated: 2026-03-15 after v1.1 roadmap (Phases 5–7)*
