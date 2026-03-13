---
phase: 01-budget-engine-proxy-foundation
plan: "01"
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - pnpm-workspace.yaml
  - packages/proxy/package.json
  - packages/proxy/wrangler.jsonc
  - packages/proxy/src/index.ts
  - packages/proxy/src/types.ts
  - packages/proxy/src/db/schema.ts
  - packages/proxy/src/db/client.ts
  - packages/proxy/migrations/0000_initial.sql
  - packages/proxy/vitest.config.ts
  - packages/proxy/tsconfig.json
autonomous: true
requirements:
  - SDK-03

must_haves:
  truths:
    - "wrangler dev starts the proxy locally without errors"
    - "POST /v1/chat/completions returns 200 with a stub response (before any budget logic)"
    - "drizzle-kit generate produces a migration SQL file with budget_ledger, holds, and audit_log tables"
    - "The audit_log table has a DB-level trigger that REJECTs UPDATE and DELETE statements"
    - "vitest runs and passes (even zero tests is a green run)"
  artifacts:
    - path: "packages/proxy/src/index.ts"
      provides: "Hono app with /v1/chat/completions route"
      contains: "new Hono"
    - path: "packages/proxy/src/db/schema.ts"
      provides: "Drizzle schema: budget_ledger, holds, audit_log"
      exports: ["budgetLedger", "holds", "auditLog"]
    - path: "packages/proxy/migrations/0000_initial.sql"
      provides: "SQL migration with CREATE TABLE and anti-mutation trigger"
      contains: "CREATE TRIGGER"
    - path: "packages/proxy/wrangler.jsonc"
      provides: "Wrangler config with Turso DB binding"
  key_links:
    - from: "packages/proxy/src/index.ts"
      to: "packages/proxy/src/db/client.ts"
      via: "import db from ./db/client"
      pattern: "from.*db/client"
    - from: "packages/proxy/src/db/schema.ts"
      to: "packages/proxy/migrations/0000_initial.sql"
      via: "drizzle-kit generate"
---

<objective>
Bootstrap the agentgov monorepo and lay the immutable foundation: an OpenAI-compatible Hono proxy endpoint that accepts chat completion requests, a Drizzle schema for the three core tables (budget_ledger, holds, audit_log), and a migration with a DB-level trigger that makes the audit_log truly append-only at the database level — not just by convention.

Purpose: Everything in Phase 1 (cost calculation, Hold/Settle, SDK) depends on this scaffold existing. The schema is the contract all other plans write to. The anti-mutation trigger on audit_log is a Phase 1 requirement that cannot be retrofitted — a mutable audit log is architecturally broken for EU AI Act Article 12 compliance.

Output: A running `wrangler dev` proxy that accepts POST /v1/chat/completions and returns a stub response; three Drizzle-typed tables with a checked-in migration; a passing Vitest run.
</objective>

<execution_context>
@/Users/masa/.config/claude/get-shit-done/workflows/execute-plan.md
@/Users/masa/.config/claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/research/STACK.md
@.planning/research/ARCHITECTURE.md
@.planning/research/PITFALLS.md
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Monorepo scaffold, Hono proxy entry, wrangler config</name>
  <files>
    package.json,
    pnpm-workspace.yaml,
    packages/proxy/package.json,
    packages/proxy/tsconfig.json,
    packages/proxy/wrangler.jsonc,
    packages/proxy/src/index.ts,
    packages/proxy/src/types.ts,
    packages/proxy/vitest.config.ts
  </files>
  <behavior>
    - GET /health returns 200 JSON { status: "ok" }
    - POST /v1/chat/completions with valid JSON body returns 200 JSON stub: { id: "stub-...", object: "chat.completion", choices: [{ message: { role: "assistant", content: "stub" } }] }
    - POST /v1/chat/completions with a body that is not valid JSON returns 400
    - Hono app is exported as default from src/index.ts (Cloudflare Workers convention)
  </behavior>
  <action>
    Initialize a pnpm workspace monorepo at the repo root:
    - root `package.json`: private: true, pnpm workspaces config
    - `pnpm-workspace.yaml`: packages: ["packages/*"]
    - `packages/proxy/package.json`: name "@agentgov/proxy", private: true, module: "src/index.ts", devDependencies: hono@^4.12.7, wrangler@^4, typescript@^5, vitest@^4, @cloudflare/vitest-pool-workers@latest

    `packages/proxy/tsconfig.json`:
    - target: ES2022, module: ES2022, moduleResolution: Bundler
    - lib: ["ES2022"]
    - types: [] (use wrangler types, not @cloudflare/workers-types)
    - strict: true

    `packages/proxy/wrangler.jsonc`:
    - name: "agentgov-proxy"
    - compatibility_date: "2025-01-01"
    - main: "src/index.ts"
    - Include a [vars] section placeholder for TURSO_DATABASE_URL and TURSO_AUTH_TOKEN (will be secrets in prod; use .dev.vars for local dev, do NOT commit secrets)
    - Add comment: "// Use wrangler types to regenerate worker-configuration.d.ts after editing"

    `packages/proxy/src/types.ts`:
    Define and export these TypeScript types that ALL other plans depend on:
    ```typescript
    export type AgentId = string;
    export type HoldId = string;

    export interface ChatCompletionRequest {
      model: string;
      messages: Array<{ role: string; content: string }>;
      stream?: boolean;
      max_tokens?: number;
    }

    export interface BudgetHold {
      holdId: HoldId;
      agentId: AgentId;
      estimatedCost: number;
      model: string;
      createdAt: number;
      expiresAt: number;
    }

    export type AuditEventType =
      | 'budget_hold'
      | 'budget_settle'
      | 'budget_blocked'
      | 'request_forwarded'
      | 'alert_fired';

    export interface AuditEvent {
      eventType: AuditEventType;
      agentId: AgentId;
      model: string;
      costDelta: number;
      runningBalance: number;
      meta?: Record<string, unknown>;
    }

    export interface GateResult {
      action: 'pass' | 'block';
      holdId?: HoldId;
      reason?: string;
    }

    export interface BudgetExceededErrorBody {
      error: {
        code: 'BUDGET_EXCEEDED';
        message: string;
        budgetId: string;
        spent: number;
        limit: number;
      };
    }
    ```

    `packages/proxy/src/index.ts`:
    - Create a Hono app
    - GET /health → 200 { status: "ok" }
    - POST /v1/chat/completions → parse body as JSON (if parse fails → 400 { error: "invalid JSON" }), return 200 stub response in OpenAI chat completion format
    - Export `app` as default (Cloudflare Workers entry point)
    - DO NOT import DB yet (DB wiring comes from Task 2)

    `packages/proxy/vitest.config.ts`:
    ```typescript
    import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
    export default defineWorkersConfig({
      test: {
        poolOptions: { workers: { wrangler: { configPath: './wrangler.jsonc' } } },
      },
    });
    ```

    Write a minimal test file `packages/proxy/src/index.test.ts` with the behavior cases above. Tests must FAIL before implementation, then PASS after.

    After files exist: run `cd packages/proxy && wrangler types` to generate worker-configuration.d.ts. If wrangler types fails because there are no bindings yet, this is acceptable — skip and note it.
  </action>
  <verify>
    <automated>cd /Users/masa/gsd-workspace/packages/proxy && npx vitest run --reporter=verbose 2>&1 | tail -20</automated>
  </verify>
  <done>
    All behavior tests pass. `wrangler dev` starts without TypeScript errors (verified by running `wrangler dev --dry-run` or equivalent). types.ts exports all interfaces listed above.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Drizzle schema — budget_ledger, holds, audit_log — with append-only trigger</name>
  <files>
    packages/proxy/package.json,
    packages/proxy/drizzle.config.ts,
    packages/proxy/src/db/schema.ts,
    packages/proxy/src/db/client.ts,
    packages/proxy/migrations/0000_initial.sql
  </files>
  <behavior>
    - schema.ts exports three Drizzle table definitions: budgetLedger, holds, auditLog
    - auditLog table has columns: seq (integer primary key autoincrement), event_type (text not null), agent_id (text not null), model (text not null), cost_delta (real not null), running_balance (real not null), payload (text), prev_hash (text), hash (text not null), ts (integer not null)
    - holds table has columns: id (text primary key), agent_id (text not null), model (text not null), estimated_cost (real not null), status (text, default 'active'), created_at (integer not null), expires_at (integer not null)
    - budget_ledger table has columns: agent_id (text primary key), limit_usd (real not null), spent_usd (real not null default 0), reserved_usd (real not null default 0), updated_at (integer not null)
    - Migration SQL contains CREATE TABLE statements for all three tables
    - Migration SQL contains a CREATE TRIGGER that fires BEFORE UPDATE or DELETE on audit_log and raises an error: "audit_log is append-only"
    - client.ts exports a createClient function that accepts env bindings and returns a Drizzle client configured for libSQL HTTP (import from '@libsql/client/web', NOT '@libsql/client')
  </behavior>
  <action>
    Install additional packages in packages/proxy:
    `drizzle-orm@^0.45`, `@libsql/client` (Drizzle needs this peer dep), and devDependency `drizzle-kit@latest`.

    CRITICAL import note: In Cloudflare Workers, use `import { createClient } from '@libsql/client/web'` — the `/web` sub-path is mandatory. Using `@libsql/client` directly (without `/web`) will fail at runtime in Workers.

    `packages/proxy/drizzle.config.ts`:
    ```typescript
    import type { Config } from 'drizzle-kit';
    export default {
      schema: './src/db/schema.ts',
      out: './migrations',
      dialect: 'sqlite',
    } satisfies Config;
    ```

    `packages/proxy/src/db/schema.ts` — define tables using drizzle-orm/sqlite-core:
    - `budget_ledger`: agentId as primary key, limitUsd, spentUsd (default 0), reservedUsd (default 0), updatedAt
    - `holds`: id (text PK, UUID), agentId, model, estimatedCost, status (text, default 'active' — values: 'active' | 'settled' | 'expired'), createdAt, expiresAt
    - `audit_log`: seq (integer PK autoincrement), eventType, agentId, model, costDelta, runningBalance, payload (text, for JSON metadata), prevHash (text, nullable for genesis), hash (text not null), ts (integer)

    `packages/proxy/src/db/client.ts`:
    ```typescript
    import { drizzle } from 'drizzle-orm/libsql';
    import { createClient } from '@libsql/client/web';
    import * as schema from './schema';

    export function createDbClient(url: string, authToken: string) {
      const client = createClient({ url, authToken });
      return drizzle(client, { schema });
    }

    export type DbClient = ReturnType<typeof createDbClient>;
    ```

    After writing schema.ts, run:
    `cd /Users/masa/gsd-workspace/packages/proxy && npx drizzle-kit generate`

    This creates `migrations/0000_initial.sql`. After generation, MANUALLY EDIT the migration file to add the anti-mutation trigger immediately after the `CREATE TABLE audit_log` statement:
    ```sql
    CREATE TRIGGER audit_log_no_mutate
    BEFORE UPDATE ON audit_log
    BEGIN
      SELECT RAISE(ABORT, 'audit_log is append-only: UPDATE is not permitted');
    END;

    CREATE TRIGGER audit_log_no_delete
    BEFORE DELETE ON audit_log
    BEGIN
      SELECT RAISE(ABORT, 'audit_log is append-only: DELETE is not permitted');
    END;
    ```

    Write a test `packages/proxy/src/db/schema.test.ts` that verifies:
    - All three table objects are exported from schema.ts (import them and check they are not undefined)
    - The audit_log table name is 'audit_log'
    - The migration file exists at `../../migrations/0000_initial.sql` (relative to test file)
    - The migration file content includes 'CREATE TRIGGER audit_log_no_mutate'
    - The migration file content includes 'CREATE TRIGGER audit_log_no_delete'

    Note: The trigger test reads the migration file content — use `fs.readFileSync` in the test. This is a Node.js test (schema structure, not Workers runtime), so configure vitest to run schema.test.ts outside the Workers pool if needed (add `exclude` pattern in vitest.config.ts for the Workers pool, run this test with standard vitest).
  </action>
  <verify>
    <automated>cd /Users/masa/gsd-workspace/packages/proxy && npx vitest run --reporter=verbose 2>&1 | tail -30</automated>
  </verify>
  <done>
    All tests pass. `migrations/0000_initial.sql` exists and contains CREATE TABLE for all three tables plus both anti-mutation triggers. `src/db/schema.ts` exports budgetLedger, holds, auditLog. `src/db/client.ts` exports createDbClient.
  </done>
</task>

</tasks>

<verification>
After both tasks complete:
1. `cd /Users/masa/gsd-workspace/packages/proxy && npx vitest run` — all tests green
2. `cd /Users/masa/gsd-workspace/packages/proxy && wrangler dev --dry-run` — no TypeScript errors
3. Inspect `migrations/0000_initial.sql` — confirm three CREATE TABLE statements and two CREATE TRIGGER statements for audit_log
4. Grep for `@libsql/client/web` in `src/db/client.ts` — must NOT be `@libsql/client` (bare)
5. Confirm `src/types.ts` exports BudgetExceededErrorBody, GateResult, AuditEvent, BudgetHold, ChatCompletionRequest
</verification>

<success_criteria>
- POST /v1/chat/completions returns a stub 200 response with OpenAI chat completion format
- Three Drizzle tables defined in schema.ts with correct column types
- Migration SQL checked in with two anti-mutation triggers on audit_log
- All vitest tests pass
- No @cloudflare/workers-types npm package used (wrangler types only)
- No bare @libsql/client import (must be @libsql/client/web)
</success_criteria>

<output>
After completion, create `.planning/phases/01-budget-engine-proxy-foundation/01-01-SUMMARY.md` covering:
- Monorepo structure created
- Three table schemas (with column names and types used)
- Migration file path and trigger names
- Key import pattern: @libsql/client/web
- Any deviations from plan (e.g., if wrangler types was skipped)
- Test file locations
</output>
