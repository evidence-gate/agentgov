# Chat / budget adversarial remediation — 2026-10-18

Baseline: `d6a218aef43c6c63fc139a660c442b8c3dbcdbd2`, local branch `fix/node-chat-bindings`. This report supplements the earlier Node binding investigation. Synthetic databases and local providers only; no paid inference, production data, VM operations, merge or deployment.

## Reproduced problems and changes

- Real SQLite concurrent $0.60 reservations against $1 previously approved 10 times with ledger reservation only $0.60. Audit compare-and-swap plus transactional write batches now commit reservation/ledger/audit together. Stale snapshots retry. Concurrent settlements are idempotent and distinct settlements retain all costs.
- Concurrent audit appends previously branched from the same predecessor. The chain now serializes through an atomic sequence precondition; all stored hashes are recomputed in tests. Audit or later SQL failure rolls the batch back.
- Negative output tokens previously reached a provider with budget zero. Requests now restrict priced text/single-completion fields, positive integer output limits, 1 MiB bodies, and valid tool-call structure. The same default output limit4096 is both reserved and forwarded. UTF-8 JSON size plus overhead conservatively includes tool definitions and Unicode in input estimates.
- Unknown agent IDs no longer create a $10 budget. They return403. Operator budget PATCH requires `AGENTGOV_BUDGET_ADMIN_TOKEN` Bearer authentication (unset503, absent/wrong401), and limit/audit changes commit together. Existing registered identity authorization remains an ingress responsibility.
- Missing provider keys release undispatched reservations. Missing/invalid usage, uncertain transport errors, disconnects and deadlines consume the reserved estimate. Only429 retries; unknown statuses do not replay inference. Streaming parsing handles split lines and requires usage plus a terminal marker. Settlement is awaited. The deadline covers fetch, body and unconsumed streams (default60s, maximum120s via `AGENTGOV_PROVIDER_TIMEOUT_MS`).
- No configured database returns503. Node rejects unsupported HITL requests/control routes with501 before creating reservations.
- Workers HITL uses one ticket/workflow ID, idempotent terminal state/audit and zero settlement for undispatched work. Approval does not automatically invoke the provider. Late decisions expire. Direct decisions require `AGENTGOV_HITL_APPROVAL_TOKEN`; Slack signature verification remains. Migration journal now includes the existing HITL schema.

## Compatibility and operational requirements

Provision agent budgets before traffic; see `budget-provisioning.md`. The proxy must remain behind trusted identity/authorization ingress: `X-Agent-Id` by itself does not authenticate a caller, and read-only dashboard/audit endpoints are not newly access-controlled here. Separate operator tokens are required for budget changes and direct HITL decisions. No actual secrets were configured by this work.

Unsupported multimodal, multiple-completion and unknown pricing-related fields are rejected, including `max_completion_tokens`. Input estimates are conservative approximations, not independently verified provider invoices. Unknown-usage charging can overestimate actual spend. Model pricing and provider compliance with output limits remain assumptions.

Process termination or database outage can leave a reservation active. Such reservations must not be blindly released: reconcile against provider records before any operational adjustment. Existing corrupt ledger/audit data is not repaired. Remote Turso transaction behavior and deployed Cloudflare Workflow durability were not exercised; tests use real local SQLite and mocked Workflow steps. HITL approval/resume remains a separate unimplemented feature.

## Verification

Commands: `pnpm -r lint`, `pnpm -r build` (Workers dry-run only), `pnpm -r test`; proxy `test:startup`, `test:chat`, `test:adversarial`, `test:hitl`. Node22.23.3. CI source includes the new local-fixture tests; no GitHub Actions runs were started.

Independent reviewers reproduced two additional gaps: non429 unknown statuses were retried and real notification failures were swallowed. Both were sent back for correction and direct regression verification before final commit. Both reviewers independently confirmed those fixes and reported no additional blockers in their assigned scopes. Final tests: Workers42, Node199, TypeScript SDK37, real HTTP21, HITL lifecycle12; startup1 and chat1 also passed. All workspace type checks and builds passed. Existing nested vi.mock placement warnings remain in older HITL tests. No live notification service or real-time 10-second timeout test was performed.
