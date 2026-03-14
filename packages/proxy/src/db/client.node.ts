import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { migrate } from 'drizzle-orm/libsql/migrator';
import * as schema from './schema';

/**
 * Creates a Drizzle client configured for embedded libSQL (file: URLs).
 *
 * CRITICAL: Use bare `@libsql/client` (NOT `@libsql/client/web`) — the bare import
 * uses native SQLite bindings that support file: URLs. The /web sub-path only supports
 * HTTP transport (Turso cloud) and will fail with file: URLs.
 *
 * This client is for Node.js/Docker deployments only. Never use in Cloudflare Workers.
 *
 * @param url - SQLite file URL (e.g., 'file:agentgov.db' or 'file:/data/agentgov.db')
 */
export function createDockerDbClient(url?: string) {
  const dbUrl = url ?? process.env['DATABASE_URL'] ?? 'file:agentgov.db';
  const client = createClient({ url: dbUrl });
  return drizzle(client, { schema });
}

export type DockerDbClient = ReturnType<typeof createDockerDbClient>;

/**
 * Runs Drizzle migrations against the provided db instance.
 * Idempotent — safe to call on every container startup.
 * Applies any pending migrations from the ./migrations folder.
 *
 * @param db - DockerDbClient instance
 */
export async function runMigrations(db: DockerDbClient): Promise<void> {
  await migrate(db, { migrationsFolder: './migrations' });
}
