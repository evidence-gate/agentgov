import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client/web';
import * as schema from './schema';

/**
 * Creates a Drizzle client configured for libSQL HTTP (Turso).
 *
 * CRITICAL: The default factory uses `@libsql/client/web` (not `@libsql/client`).
 * The /web sub-path is mandatory in Cloudflare Workers. The bare import pulls in
 * Node SQLite bindings and will fail at runtime in Workers, so it must not be
 * imported from this module.
 *
 * The Node entrypoint replaces this factory with the native client so `file:`
 * SQLite URLs work. Workers never call that setter.
 *
 * @param url - Turso database URL (e.g., libsql://my-db.turso.io)
 * @param authToken - Turso auth token
 */
function createWebDbClient(url: string, authToken: string) {
  const client = createClient({ url, authToken });
  return drizzle(client, { schema });
}

export type DbClient = ReturnType<typeof createWebDbClient>;

export type DbClientFactory = (url: string, authToken: string) => DbClient;

let dbClientFactory: DbClientFactory = createWebDbClient;

/** Install a process-local DB factory. Used by the Node entrypoint only. */
export function setDbClientFactory(factory: DbClientFactory): void {
  dbClientFactory = factory;
}

export function createDbClient(url: string, authToken: string): DbClient {
  return dbClientFactory(url, authToken);
}
