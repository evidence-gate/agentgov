# Dependency and test-toolchain remediation (2026-10-18)

Base: `99a8d37` (main). No deployment, merge, repository protection change,
GitHub Actions execution, or pstack VM/CI operation is part of this change.

## Changes and rationale

- Replace `@cloudflare/vitest-pool-workers` 0.12.21 with
  `@cloudflare/vitest-plugin` 1.4.4 and use `cloudflareTest()` in an ESM
  `vitest.config.mts`. Keep the existing Node/Workers test split.
- Align both Vitest consumers and all runner packages on 4.1.12. The plugin's
  published peer range is `^4.1.0 || ^5.0.0`; choose the requested Vitest 4 line.
  This removes tinypool and the old Miniflare dependency graph entirely.
- Refresh dependencies within their existing major ranges, including Hono,
  its Node adapter, Vite 6, and dashboard transitive dependencies. Replace
  unbounded `tsup: latest` with `^9.0.0`.
- The official plugin and Wrangler 4.151.1 both require
  Miniflare 5.20261012.1-beta. Its sharp 0.35.5 and ws 8.21.0 replace the old
  affected versions, but it still pins undici 7.29.1. Override only affected
  undici 7 versions to 7.30.1 for GHSA-xjj6-f33q-929c.
- Drizzle Kit's deprecated `@esbuild-kit/core-utils` pulls esbuild 0.18.20.
  Override only that edge to 0.25.12 for GHSA-67mh-4wv8-2f99. This crosses a
  pre-1.0 minor boundary, so migration generation was smoke-tested. Remove
  both overrides when their parents supply fixed versions themselves.
- Use Node 22.23.3 in `.node-version`, CI, and both Docker stages. Enforce the
  supported Node range at install time; use Node 22 types explicitly. Wrangler
  requires Node >=22; tsup 9 requires ^22.18.0, ^24.11.0, or >=26.0.0.
  Docker now installs the same pnpm 10.0.0 as `packageManager`.
- Add a proxy build script that only bundles (`wrangler deploy --dry-run`) and
  include all package builds in the existing CI workflow for future runs.

## Local validation

Host: macOS arm64; actual runtime Node **22.23.3**, pnpm **10.0.0**.
Final dependency graph was tested after all manifest and lockfile edits.

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile --strict-peer-dependencies` | Pass |
| `pnpm -r lint` | Proxy, TypeScript SDK, dashboard pass |
| `pnpm --filter @agentgov/proxy test:node` | 12 files, 148 tests pass |
| `pnpm --filter @agentgov/proxy test:workers` | 2 files, 24 tests pass in workerd |
| `pnpm --filter @agentgov/sdk test` | 1 file, 37 tests pass |
| Python SDK `pytest packages/sdk-python/tests -q` in isolated venv | 29 tests pass |
| `pnpm -r build` | Worker dry-run, SDK ESM/CJS/declarations, dashboard pass |
| Drizzle Kit `generate --schema ./src/db/schema.ts --out ../../../drizzle-smoke --dialect sqlite` | 4 tables; SQL migration generated outside repo |
| `pnpm audit --json` | 0 critical/high/moderate/low/info |
| Lockfile inspection | No tinypool, old pool, old Miniflare, or Node 26 types |
| `git diff --check` | Pass |

Workers tests need localhost sockets; they passed with local execution permission.
No tests use production credentials. All validation was performed locally, with
`[skip ci]` on the commit to prevent push/pull_request Actions runs.

## Limits and follow-up

- GitHub API returned **85 open Dependabot alerts** on main before this change.
  Alerts 32/33/34 still reported Vitest <3.2.6, despite main's previous 3.2.7
  update. The candidate graph is now 4.1.12 and passes registry audit. This does
  **not** claim those server-side alerts are closed: recheck after a separately
  approved merge and GitHub dependency graph refresh. Do not dismiss them merely
  to make the count zero.
- Docker daemon is unavailable on this host; Docker image build/start and Linux
  native binary execution are not validated. Node/Workers suites passed on macOS.
- Miniflare's beta version is selected by the current official stable plugin and
  Wrangler; this is an upstream packaging constraint, not an independently chosen
  beta upgrade. Keep it under review as stable upstream versions arrive.
- Node tests retain existing warnings about nested hoisted `vi.mock` calls.
  All tests pass; a future Vitest release may require cleaning these up.
- npm audit covers known npm advisories at execution time, not every possible
  application vulnerability or Python dependency. No broad security guarantee is
  implied by a zero result.

## Primary sources

- [Cloudflare: migrate to Vitest plugin](https://developers.cloudflare.com/workers/testing/vitest-integration/migration-guides/migrate-to-vitest-plugin/)
- [Cloudflare: Vitest configuration](https://developers.cloudflare.com/workers/testing/vitest-integration/write-your-first-test/)
- [Published plugin 1.4.4 metadata](https://registry.npmjs.org/@cloudflare/vitest-plugin/1.4.4)
- [Published Vitest 4.1.12 metadata](https://registry.npmjs.org/vitest/4.1.12)
- [Published Miniflare dependency metadata](https://registry.npmjs.org/miniflare/5.20261012.1-beta)
- [Published tsup 9 requirements](https://registry.npmjs.org/tsup/9.0.0)
- [Undici advisory](https://github.com/advisories/GHSA-xjj6-f33q-929c)
- [esbuild advisory](https://github.com/advisories/GHSA-67mh-4wv8-2f99)

## Follow-up: real Node startup validation

A review identified a pre-existing startup failure missed by mocked unit tests:
`index.node.ts` imported `index.ts`, whose `HitlWorkflow` re-export loaded
`cloudflare:workers` in ordinary Node. Running the actual `start:node` command
under Node 22.23.3 reproduced `MODULE_NOT_FOUND` before migrations or HTTP startup.

The shared Hono app now lives in `src/app.ts`. `src/index.ts` remains the unchanged
Cloudflare entry-point path and re-exports both the app and `HitlWorkflow`.
The Node entry point imports the shared app directly. No request handler logic
was changed as part of this split.

Verification after the fix:

- Actual `pnpm --filter @agentgov/proxy start:node` with a disposable SQLite file:
  migrations applied, HTTP server started, `/health` returned **200** with
  `{"status":"ok"}`. The test server was stopped after validation.
- Added `test:startup`: an unmocked Node child process uses the real entry point,
  a fresh temporary DB, and a local HTTP port. It checks `/health`, verifies
  `audit_log`, `budget_ledger`, `holds`, and the migration journal, then restarts
  against the same DB and confirms no migration duplication. The test cleans up
  its child processes and temporary directory. **1 integration test passes**.
- Re-ran Node (148 tests), Workers (24 tests), all lint and all builds: pass.
- This verifies startup/migration/health on macOS, not all business endpoints.
  Docker remains unverified because its daemon is unavailable. No VM was started.

Independent review found no blocking issue in the follow-up diff and independently
re-ran the startup integration test under Node 22 (1/1 pass). It confirmed that
the shared app body is identical to the prior implementation. It also noted
pre-existing concerns outside this startup fix: Node environment middleware is
registered after existing routes, and the shared DB adapter uses the web client.
Therefore startup/health success is not evidence that every Node budget, LLM,
or HITL business route works end to end; those paths require separate validation.
