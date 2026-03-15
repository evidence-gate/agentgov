---
phase: 07-cloudflare-workers-production-deploy
verified: 2026-03-15T12:05:00Z
status: human_needed
score: 5/5 automated must-haves verified
re_verification: false
human_verification:
  - test: "wrangler deploy --env production succeeds"
    expected: "Deployment completes without error; worker name agentgov-proxy-production visible in Cloudflare dashboard"
    why_human: "Requires Cloudflare account with Workers Paid plan, wrangler secret put for all 10 secrets, and Turso cloud database. Cannot be verified without live credentials."
  - test: "Gemini smoke test returns HTTP 200"
    expected: "POST to https://agentgov-proxy-production.<subdomain>.workers.dev/v1/chat/completions with X-Agent-Id header and a Gemini model returns HTTP 200 with an OpenAI-compatible response body"
    why_human: "Requires live deployed Worker and valid GEMINI_API_KEY secret. Runtime behavior only verifiable against deployed edge."
  - test: "HITL smoke test returns HTTP 202 HITL_PENDING"
    expected: "POST with tool_calls containing send_email (or another irreversible action) returns HTTP 202 with error.code HITL_PENDING and an approvalId UUID"
    why_human: "Requires live deployed Worker with HitlWorkflow Cloudflare Workflow active. Workflow binding only resolves in the Workers runtime."
---

# Phase 7: Cloudflare Workers Production Deploy — Verification Report

**Phase Goal:** agentgov proxy is deployable to Cloudflare Workers edge as an alternative to Docker Compose, with all v1.1 features verified against the Workers runtime and Turso cloud.
**Verified:** 2026-03-15T12:05:00Z
**Status:** human_needed — all automated checks pass; deploy and smoke tests require human action
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | wrangler.jsonc env.production has workflows binding with class_name HitlWorkflow | VERIFIED | `env.production.workflows[0]`: name=agentgov-hitl-production, binding=HITL_WORKFLOW, class_name=HitlWorkflow |
| 2 | wrangler.jsonc env.production declares all 12 vars | VERIFIED | Python parse confirms exactly 12 vars: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, AGENTGOV_ALERT_WEBHOOK_URL, AGENTGOV_ALERT_THRESHOLDS, AGENTGOV_HITL_TTL_SECONDS, AGENTGOV_HITL_WEBHOOK_URL, SLACK_BOT_TOKEN, SLACK_CHANNEL_ID, SLACK_SIGNING_SECRET |
| 3 | No non-empty secret values committed in wrangler.jsonc | VERIFIED | All API key vars are empty strings; only AGENTGOV_ALERT_THRESHOLDS ("0.80,1.00") and AGENTGOV_HITL_TTL_SECONDS ("259200") carry values — both are non-secret operational defaults |
| 4 | worker-configuration.d.ts includes GEMINI_API_KEY | VERIFIED | GEMINI_API_KEY present in both `Cloudflare.Env` (base interface) and `ProductionEnv` interface in worker-configuration.d.ts |
| 5 | TypeScript production source compiles clean; all 172 tests pass | VERIFIED | `tsc --noEmit` shows zero errors in non-test source files; all errors are pre-existing test file issues (writer.test.ts, retry.test.ts) documented in SUMMARY; 148 Node.js pool + 24 Workers pool = 172 tests, all pass |

**Score:** 5/5 automated truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/proxy/wrangler.jsonc` | env.production block with workflows binding and all 12 vars | VERIFIED | Lines 46–79: complete env.production block; Worker name agentgov-proxy-production; HITL_WORKFLOW workflow pointing to HitlWorkflow class |
| `packages/proxy/worker-configuration.d.ts` | ProductionEnv interface + GEMINI_API_KEY in Env | VERIFIED | Lines 8–38 (grep match): ProductionEnv and Env both declare GEMINI_API_KEY and HITL_WORKFLOW as `Workflow<Parameters<HitlWorkflow['run']>[0]['payload']>` |
| `packages/proxy/src/index.ts` | HitlWorkflow export + GEMINI_API_KEY wiring | VERIFIED | Line 279: `export { HitlWorkflow } from './hitl/workflow'`; line 194: `GEMINI_API_KEY: c.env?.GEMINI_API_KEY` passed to forwardToLlm |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/index.ts` | `c.env.HITL_WORKFLOW.create()` | Cloudflare Workflow binding | VERIFIED (local); HUMAN NEEDED (runtime) | Line 104: `await c.env.HITL_WORKFLOW.create({ id: ticketId, params: {...} })` — binding wired in code; runtime resolution requires deployed Workers environment |
| `src/index.ts` | GEMINI_API_KEY | `forwardToLlm(body, holdId, agentId, db, { GEMINI_API_KEY: c.env?.GEMINI_API_KEY })` | VERIFIED | Line 193–195: GEMINI_API_KEY destructured from env and forwarded to passthrough layer |
| `wrangler.jsonc env.production` | `HitlWorkflow` class | `class_name: "HitlWorkflow"` | VERIFIED | wrangler.jsonc line 57 matches exported class name at index.ts line 279 |

---

## Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| DEPLOY-01 | `wrangler deploy` deploys to Cloudflare Workers with Turso cloud + Workflows binding; all v1.1 features work | PARTIAL — automated portion VERIFIED; live deploy portion HUMAN NEEDED | wrangler.jsonc fully configured; types regenerated; code compiles; tests pass. Runtime verification requires human Task 2 (deploy + smoke tests) |
| DEPLOY-02 | All secrets set via `wrangler secret put` — no secrets in wrangler.jsonc | VERIFIED | Grep scan and Python parse confirm all secret-bearing vars are empty strings in wrangler.jsonc; SUMMARY documents 10 keys requiring `wrangler secret put --env production` |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/proxy/src/index.ts` | 51 | Comment: `// Passthrough stub (enforcement disabled for local dev)` | Info | This is a legitimate local-dev fallback, not a production stub — guarded by `if (!dbUrl \|\| !dbToken)` check at line 46. No impact on production deploy. |

No blockers or warnings found. The single info-level item is a correctly-guarded local-dev code path, not a stub.

---

## Human Verification Required

### 1. wrangler deploy --env production

**Test:** After setting all 10 secrets with `wrangler secret put <KEY> --env production` for TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, AGENTGOV_ALERT_WEBHOOK_URL, AGENTGOV_HITL_WEBHOOK_URL, SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_CHANNEL_ID — run: `cd packages/proxy && wrangler deploy --env production`
**Expected:** Deploy succeeds (exit 0); Worker `agentgov-proxy-production` visible in Cloudflare dashboard; Workflow `agentgov-hitl-production` listed under Workers > Workflows
**Why human:** Requires live Cloudflare account with Workers Paid plan (Workflows binding requires Paid) and Turso cloud database with schema migrated

### 2. Gemini passthrough smoke test

**Test:** POST `https://agentgov-proxy-production.<subdomain>.workers.dev/v1/chat/completions` with headers `X-Agent-Id: smoke-test` and body `{"model": "gemini-1.5-flash", "messages": [{"role": "user", "content": "ping"}]}`
**Expected:** HTTP 200 with OpenAI-compatible response body (id, choices, usage fields present)
**Why human:** Requires live deployed Worker with GEMINI_API_KEY secret set and valid Turso budget row for agent `smoke-test`

### 3. HITL trigger smoke test

**Test:** POST to same endpoint with `tool_calls: [{"id": "tc1", "type": "function", "function": {"name": "send_email", "arguments": "{}"}}]` in a message
**Expected:** HTTP 202 with body `{ error: { code: "HITL_PENDING", approvalId: "<uuid>", agentId: "smoke-test", expiresAt: <timestamp> } }`
**Why human:** Requires live deployed Worker with Cloudflare Workflow `agentgov-hitl-production` active — Workflow.create() only resolves in Workers runtime

---

## Gaps Summary

No gaps. All automated verification criteria pass:

- wrangler.jsonc is correctly structured with a complete env.production block (12 vars + HITL_WORKFLOW binding with class_name: HitlWorkflow)
- No secret values are present in source — only empty-string placeholders and two non-secret config defaults
- worker-configuration.d.ts is current: GEMINI_API_KEY and ProductionEnv interface are present; HITL_WORKFLOW is precisely typed
- index.ts exports HitlWorkflow (line 279) and wires GEMINI_API_KEY to forwardToLlm (line 194); classifyToolCalls return type is correctly narrowed to RiskTier
- TypeScript production source compiles with zero errors; pre-existing test file errors are pre-Phase-7 and do not affect deployment
- 172 tests (148 Node.js + 24 Workers pool) pass with no regressions

Phase is deployment-ready. The only remaining items are the human Task 2 checkpoint: set wrangler secrets and run `wrangler deploy --env production` followed by smoke tests.

---

_Verified: 2026-03-15T12:05:00Z_
_Verifier: Claude (gsd-verifier)_
