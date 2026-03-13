import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client/web';
import * as schema from './schema';

/**
 * Creates a Drizzle client configured for libSQL HTTP (Turso).
 *
 * CRITICAL: Use `@libsql/client/web` (not `@libsql/client`) — the /web sub-path is
 * mandatory in Cloudflare Workers. The bare import will fail at runtime in Workers.
 *
 * @param url - Turso database URL (e.g., libsql://my-db.turso.io)
 * @param authToken - Turso auth token
 */
export function createDbClient(url: string, authToken: string) {
  const client = createClient({ url, authToken });
  return drizzle(client, { schema });
}

export type DbClient = ReturnType<typeof createDbClient>;
