# Requirements: Agent Governance Platform (agentgov)

**Defined:** 2026-03-13
**Core Value:** AIエージェントのコストを「追跡」ではなく「強制」する -- 予算超過時にリクエストを決定論的にブロックし、コスト暴走を構造的に防止すること。

## v1 Requirements

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
- [ ] **SDK-02**: Python SDK with equivalent `agentgov.wrap(client)` API
- [x] **SDK-03**: OpenAI-compatible API surface (proxy accepts standard chat/completions format)
- [ ] **SDK-04**: Docker Compose self-host deployment (5-minute setup)
- [ ] **SDK-05**: Basic dashboard — budget status, session cost, enforcement events, approval queue

## v2 Requirements

### Cost Control — Differentiators

- **COST-06**: Hold/Settle pessimistic budget reservation (banto pattern) — crash-safe budget state
- **COST-07**: Graceful degradation — auto-downgrade to cheaper model when budget threshold reached
- **COST-08**: Per-session budget isolation — independent budget per agent execution session

### HITL — Differentiators

- **HITL-06**: Risk-Graded static action classification (Reversible/Semi-Reversible/Irreversible/External)
- **HITL-07**: EU AI Act Article 14 compliance mode — evidence export with oversight documentation
- **HITL-08**: Cryptographic audit log integrity (SHA-256 hash chain for tamper detection)
- **HITL-09**: Slack Block Kit native approval integration

### Error Handling — Differentiators

- **ERR-05**: 3-tier timeout (soft warning → idle detection → hard stop)
- **ERR-06**: Error-type to handler static mapping (declarative config, not runtime LLM judgment)
- **ERR-07**: Partial result return on hard stop (preserve completed work)

### Infrastructure — Differentiators

- **INFRA-01**: Cloudflare Workers edge deployment (cloud version)
- **INFRA-02**: Capability-based security model (agent as untrusted contractor)
- **INFRA-03**: Multi-channel approval (Slack, email, SMS)

## Out of Scope

| Feature | Reason |
|---------|--------|
| LLM routing / load balancing | Commoditized (LiteLLM, Portkey). No differentiation possible. Let users choose their router |
| Guardrails / content filtering | Separate domain with different buyers. Highly competitive (Guardrails.ai, Lakera) |
| Agent framework features | Becomes competing framework, destroys "wrap any client" positioning |
| ML-based anomaly detection | High false positive rate. Deterministic thresholds are more trustworthy and auditable |
| Real-time WebSocket for all events | Significant infrastructure complexity. Polling + webhook sufficient for MVP |
| Fine-grained RBAC | Deep surface area. Small teams don't need it. Add only after PMF |
| Mobile approval app | Slack's mobile app handles this. No native app needed |
| Billing / invoicing | Financial-grade compliance required. Track costs for users, don't process payments |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| COST-01 | Phase 1 | Complete |
| COST-02 | Phase 1 | Complete |
| COST-03 | Phase 1 | Complete |
| COST-04 | Phase 1 | Complete |
| COST-05 | Phase 1 | Complete |
| SDK-01 | Phase 1 | Complete |
| SDK-03 | Phase 1 | Complete |
| HITL-01 | Phase 2 | Complete |
| HITL-02 | Phase 2 | Complete |
| HITL-03 | Phase 2 | Complete |
| HITL-04 | Phase 2 | Complete |
| HITL-05 | Phase 2 | Complete |
| ERR-01 | Phase 3 | Complete |
| ERR-02 | Phase 3 | Complete |
| ERR-03 | Phase 3 | Complete |
| ERR-04 | Phase 3 | Complete |
| SDK-02 | Phase 4 | Pending |
| SDK-04 | Phase 4 | Pending |
| SDK-05 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0

---
*Requirements defined: 2026-03-13*
*Last updated: 2026-03-13 after roadmap creation — traceability complete*
