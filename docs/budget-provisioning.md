# Budget provisioning

Chat requests do not create a budget. An authenticated agent with no `budget_ledger` row fails closed with `403 BUDGET_NOT_PROVISIONED` and an audited `unknown_agent` decision. Changing the request's agent ID cannot create spending authority. `ensureAgent` remains a test helper and is not on the request path.

A budget row is not a chat credential. The caller still needs `AGENTGOV_AGENT_AUTH` and `X-Agentgov-Token`, and the authenticated subject must list that agent ID. See `agent-authentication.md`.

Two operator paths create or update a budget. Both are idempotent. The first successful call inserts `spent_usd=0`, `reserved_usd=0` and appends `budget_provisioned`. Repeating the same limit does not write again and does not reset spend or reservations. A different limit changes only `limit_usd` and appends `budget_limit_changed`. `PATCH /api/v1/dashboard/budgets/:agentId` still updates an existing row only and returns `404 AGENT_NOT_FOUND` when the agent is absent.

The body is exactly `{"limitUsd": <non-negative finite number>}`. `spentUsd` and `reservedUsd` cannot be set by this API. Agent IDs use the same label rule as chat authentication.

## Authentication

The API reads `AGENTGOV_BUDGET_ADMIN_TOKEN` and requires `Authorization: Bearer <that token>`.

- Token unset or empty: `503 ADMIN_AUTH_UNAVAILABLE`. No row is written.
- Header missing, malformed, or wrong: `401 UNAUTHORIZED`. No row is written.
- An agent chat token, `X-Agentgov-Token`, or `X-Agent-Id` does not authorize this route.

The CLI does not use that bearer. It requires the database credential itself: a local `file:` URL, or a remote URL plus `TURSO_AUTH_TOKEN`. Do not commit either secret.

`DATABASE_URL` wins when both `DATABASE_URL` and `TURSO_DATABASE_URL` are set.

## Docker and Node

The Node server is `src/index.node.ts` (`@hono/node-server`). It installs the native `@libsql/client`, which accepts `file:` URLs. `docker/compose.yml` passes `AGENTGOV_BUDGET_ADMIN_TOKEN` through. Leave it empty to keep the API fail-closed.

From the repository root, with `AGENTGOV_BUDGET_ADMIN_TOKEN` and `AGENTGOV_AGENT_AUTH` set in the environment or `docker/.env` (neither file is committed):

```bash
docker compose -f docker/compose.yml up -d --build
curl -sS -X PUT "http://127.0.0.1:8787/api/v1/operator/budgets/agent-a" \
  -H "Authorization: Bearer ${AGENTGOV_BUDGET_ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"limitUsd":25}'
```

The same container can provision without the HTTP route. The image workdir is `/app/packages/proxy` and `DATABASE_URL` is already `file:/data/agentgov.db`:

```bash
docker compose -f docker/compose.yml exec -T proxy \
  npx tsx src/cli/provision-budget.ts --agent agent-a --limit-usd 25
```

For a host-side SQLite file, from the repository root:

```bash
DATABASE_URL="file:/tmp/agentgov.db" \
  pnpm --filter @agentgov/proxy budget:provision -- --agent agent-a --limit-usd 25
```

Or from `packages/proxy`:

```bash
DATABASE_URL="file:/tmp/agentgov.db" pnpm budget:provision -- --agent agent-a --limit-usd 25
```

The CLI applies migrations, then prints one JSON object (`agentId`, `limitUsd`, `spentUsd`, `reservedUsd`, `updatedAt`, `created`). Exit code 1 means nothing was granted.

## Cloudflare Workers

The Worker entry stays on `@libsql/client/web`. It serves the same `PUT /api/v1/operator/budgets/:agentId` route. Put the operator token in a secret, not in `wrangler.jsonc` `vars`:

```bash
cd packages/proxy
npx wrangler secret put AGENTGOV_BUDGET_ADMIN_TOKEN
curl -sS -X PUT "https://<worker-host>/api/v1/operator/budgets/agent-a" \
  -H "Authorization: Bearer ${AGENTGOV_BUDGET_ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"limitUsd":25}'
```

For `wrangler dev`, set `AGENTGOV_BUDGET_ADMIN_TOKEN` in `.dev.vars` (gitignored). The Worker database URL must be `libsql:` or `https:`/`http:`. A `file:` URL is rejected by the web client.

To provision that same Turso database from an operator machine, use the native client and leave `DATABASE_URL` unset so `TURSO_DATABASE_URL` is used:

```bash
cd packages/proxy
TURSO_DATABASE_URL="libsql://<database>.turso.io" \
TURSO_AUTH_TOKEN="<turso-token>" \
  pnpm budget:provision -- --agent agent-a --limit-usd 25
```

Repeat either command safely. Unprovisioned agents remain blocked until one of these paths commits a row.
