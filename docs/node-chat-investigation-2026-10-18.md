# Node chat pipeline: reproduced failure and candidate fix

Base: main `54dda831025f936ea8b53d7b093f12b05e48ac1a`.
Review: https://github.com/evidence-gate/agentgov/pull/3#discussion_r4305496405

## Reproduction and root cause

The real Node entry point was started with a temporary SQLite database, a
synthetic provider API key, and a test-only fetch interceptor. A localhost HTTP
server acted as the provider. The interceptor permits only the expected OpenAI
chat URL and redirects it to that localhost server; all other outbound fetches
throw. No paid API, production database, real API key, deployment, or VM was used.

The database contains an `allowed` agent with a $10 limit and an `exhausted`
agent with a $0 limit. Requests use `gpt-4o-mini`, `max_tokens: 100`, and synthetic
messages. A third request uses an unknown model.

| Candidate state | Exhausted budget | Allowed request | Unknown model | Provider calls |
| --- | --- | --- | --- | --- |
| Unmodified main | 200 synthetic `stub` | 200 synthetic `stub` | 200 synthetic `stub` | 0 |
| Bindings-only intermediate fix | 500 | 500 | 500 | 0 |
| Complete candidate | 429 `BUDGET_EXCEEDED` | 200 local-provider result | 422 `UNKNOWN_MODEL` | 1 |

The initial failure confirms the review finding: the shared app already has
routes when Node appends environment middleware. The chat handler returns before
that middleware, sees no DB bindings, and takes the local-development stub path.
This is a functional failure even though `/health` succeeds and dependency alerts
are zero. The test demonstrates disabled enforcement and omitted forwarding;
it does not demonstrate unauthorized paid-provider spending.

Fixing only bindings exposes a second real failure: `createDbClient` uses
`@libsql/client/web`, which throws `URL_SCHEME_NOT_SUPPORTED` for the Node
`file:` database URL. It cannot use the native database that startup migrated.

## Candidate implementation

- Construct a Node wrapper app. Register its DB context middleware before mounting
  the shared routes, using the already migrated native SQLite client.
- Pass the Node environment bindings directly to `app.fetch(request, bindings)`.
  Do not depend on later route middleware or mutate an absent `c.env`.
- The shared chat route uses the injected DB when present; Workers retains its
  existing web-client fallback. No native SQLite import enters the Workers graph.
- Add `pnpm --filter @agentgov/proxy test:chat` to the Node CI job for future use.
  No GitHub Actions were run or enabled during this work.

## Regression evidence

`test:chat` launches a real child Node process, local HTTP provider and new SQLite
file. The existing budget gate, forwarding code, audit and settlement code run
without mocks. Only the outbound provider transport is redirected.

Assertions confirm:

- Exhausted budget: 429 and no provider request.
- Allowed budget: provider receives the synthetic bearer key and model.
- At provider receipt: one active hold and a positive reservation already exist.
- Returned body is the local provider's result, not a synthetic stub.
- Unknown model: 422, with no additional provider call.
- Usage of 100 input / 50 output tokens is settled to $0.000045; reservation
  returns to zero; the only hold is settled for the allowed agent.
- `budget_hold`, `budget_blocked`, and `budget_settle` audit events exist.
- Child process, temporary DB directory and HTTP server are cleaned up.

Local Node 22.23.3 validation after candidate changes:

| Command | Result |
| --- | --- |
| `pnpm --filter @agentgov/proxy test:chat` | 1 real-process integration test passes |
| `pnpm --filter @agentgov/proxy test:startup` | 1 integration test passes |
| `pnpm --filter @agentgov/proxy test:node` | 148 tests pass |
| `pnpm --filter @agentgov/proxy test:workers` | 24 tests pass |
| `pnpm -r lint` | All packages pass |
| `pnpm -r build` | All packages pass; Worker build is dry-run |
| `git diff --check` | Pass |

## Scope and remaining limits

This is a local candidate for review, not a merged/deployed fix. Dependency files
and lockfile versions are unchanged; zero dependency alerts are distinct from
this new functional test result.

The real-process test covers non-streaming OpenAI-compatible chat, budget
allow/block, unknown models, and settlement. It does not certify streaming,
Anthropic/Gemini, provider retry/error paths, HITL, or all dashboard endpoints.
The existing missing-binding development stub is preserved for Workers local-dev
compatibility; changing that policy requires a separate decision. Node HITL has
pre-existing unsupported-workflow/error-handling and hold-lifecycle concerns,
and HITL sub-routes still construct their own web DB client. These are outside the
proved non-HITL chat path. Docker/Linux execution remains unverified because no
approved running Docker engine is available.

## Independent review and deployment-impact check

Independent review of candidate `d87ebf8ffbabc8406993e16291b110bd18968ee7`
against `54dda831025f936ea8b53d7b093f12b05e48ac1a` found no newly introduced
merge blocker. The reviewer independently ran the real Node chat test under
Node 22.23.3 (1/1 pass) and Workers tests (24/24 pass). Node native DB injection,
Workers web fallback, and absence of native SQLite imports in the Workers graph
were confirmed. No real secret was identified in the seven changed files;
credential-pattern scanning likewise found no match or secret-named file.

The reviewer noted that audit assertions originally checked only event types.
The follow-up strengthens these assertions to check four records, agent/model
attribution, positive hold cost, settled cost and remaining balance, hold-ID
correlation, actual usage, both blocked reasons, and absence of the synthetic
provider key in audit records. The strengthened local test passes. Production
implementation is unchanged by this test improvement.

Limits: Workers tests use stubs/mocks rather than a live Turso integration. Audit
hash-chain integrity under concurrent writes is not certified by this test.
Existing nontransactional budget reservation/settlement, HITL errors/hold lifecycle,
missing-provider-key holds, and other previously documented paths remain outside
this bounded fix. The dependency alert count is not functional validation.

Existing deployment impact was checked through available records only:

- GitHub deployment records: 0; environments: 0. Actions remains disabled.
  Available runs are CI and Dependabot, not recorded production deployments.
- `.planning/phases/07-cloudflare-workers-production-deploy/07-VERIFICATION.md`
  records `human_needed` for live deployment and smoke tests; its companion
  summary says human deployment steps are still awaited (2026-03-15 record).
- `.planning/phases/04-dashboard-python-sdk-self-host/04-02-SUMMARY.md` says
  Docker was unavailable and the files were inspected instead of a live build.
- These records do not prove that no one subsequently deployed manually. The
  currently running deployment, deployed SHA, configuration, and actual user
  impact remain **unconfirmed**. No production endpoint was probed.

The candidate is suitable for a merge decision scoped to correcting the confirmed
Node non-HITL chat path, with the above limits accepted. It is not evidence of
Docker/Linux readiness or all production business flows. No push, merge,
deployment, paid API request, or VM operation was performed for this review.

The reviewer also checked the added audit assertions and found no blocker. Its
minor suggestion to reject missing hold IDs was adopted: the audit hold ID must
be a nonempty string, match the actual `holds.id`, and match the settlement ID.
The final targeted integration test passed again after this change.
