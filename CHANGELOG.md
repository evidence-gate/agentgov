# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-03-15

### Added

- Gemini provider support via OpenAI-compatible endpoint (streaming + token settle)
- Anthropic SSE streaming token settlement (message_start / message_delta parsing)
- Python async SDK: `wrap_async()` with `AsyncAgentgovTransport` for async OpenAI/Anthropic clients
- Per-agent budget limit PATCH endpoint (`PATCH /api/v1/dashboard/budgets/:agentId`)
- Dashboard inline budget editing with optimistic updates
- Cloudflare Workers production environment (`wrangler.jsonc` env.production)

## [1.0.0] - 2026-03-15

### Added

- **Budget Enforcement**: Hold/Settle pattern — pessimistic cost reservation before forwarding to LLM provider
- **Proxy**: Hono-based OpenAI-compatible proxy (`/v1/chat/completions`) with budget gate, model pricing table
- **HITL Approval**: Risk-graded action classification (external / irreversible / semi-reversible tiers)
- **Approval Channels**: Slack Block Kit integration + webhook notifications via Cloudflare Workflows
- **Error Handling**: Error classifier (transient / permanent / unknown) with retry engine and exponential backoff
- **Loop Detection**: Fingerprint-based stuck detection — halts agents repeating identical tool calls
- **Audit Log**: Append-only SHA-256 hash chain for all governance events
- **TypeScript SDK**: `wrap()` convenience wrapper, `BudgetExceeded` / `HitlPending` / `AgentError` exceptions
- **Python SDK**: `wrap()` with httpx `AgentgovTransport`, matching exception classes
- **Dashboard**: React 19 SPA with cost overview, approval queue, and audit log viewer
- **Self-Host**: Docker Compose stack with embedded libSQL database
- **Budget Alerts**: Configurable threshold-based webhook notifications (default: 80% and 100%)

[Unreleased]: https://github.com/evidence-gate/agentgov/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/evidence-gate/agentgov/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/evidence-gate/agentgov/releases/tag/v1.0.0
