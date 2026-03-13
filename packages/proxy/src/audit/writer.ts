/**
 * Append-only audit log writer for agentgov proxy.
 *
 * Every budget decision (allow, block, hold, settle) must write a row here.
 * Rows are hash-chained (SHA-256) for tamper evidence per EU AI Act Article 12/14.
 *
 * IMPORTANT: This function MUST NOT throw if the audit insert fails.
 * A failed audit write must NOT abort a budget allow decision.
 * Errors are logged to console.error for monitoring.
 */

import { eq, desc } from 'drizzle-orm';
import { auditLog } from '../db/schema';
import type { DbClient } from '../db/client';
import type { AuditEvent } from '../types';

/**
 * Genesis sentinel hash — used as prevHash for the very first audit_log entry.
 * Consistent with Bitcoin's genesis block convention.
 */
const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Compute SHA-256 hash of a string, returning a lowercase hex string.
 *
 * Uses Web Crypto API (crypto.subtle) — compatible with both Cloudflare Workers
 * and Node.js 20+ (globalThis.crypto.subtle).
 */
async function sha256Hex(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Append an audit event to audit_log with hash chaining.
 *
 * Algorithm:
 * 1. Query audit_log for the most recent row's hash
 * 2. prevHash = last row's hash OR genesis sentinel
 * 3. Construct payload JSON with event data + prevHash + timestamp
 * 4. Compute SHA-256 of payload
 * 5. Insert row with all fields including hash and prevHash
 *
 * Error handling: catches and logs any DB errors — does NOT rethrow.
 */
export async function appendAuditEvent(db: DbClient, event: AuditEvent): Promise<void> {
  try {
    // Step 1: Get the most recent hash for chaining
    const lastRows = await (db as unknown as {
      select: () => {
        from: (table: unknown) => {
          orderBy: (col: unknown) => {
            limit: (n: number) => Promise<Array<{ hash: string }>>;
          };
        };
      };
    }).select().from(auditLog).orderBy(desc(auditLog.seq)).limit(1);

    const prevHash = lastRows.length > 0 && lastRows[0].hash
      ? lastRows[0].hash
      : GENESIS_HASH;

    // Step 3: Construct the payload that will be hashed
    const ts = Date.now();
    const payload = JSON.stringify({ ...event, prevHash, ts });

    // Step 4: Compute SHA-256
    const hash = await sha256Hex(payload);

    // Step 5: Insert the row
    await (db as unknown as {
      insert: (table: unknown) => {
        values: (row: Record<string, unknown>) => Promise<unknown>;
      };
    }).insert(auditLog).values({
      eventType: event.eventType,
      agentId: event.agentId,
      model: event.model,
      costDelta: event.costDelta,
      runningBalance: event.runningBalance,
      payload: JSON.stringify(event.meta ?? {}),
      prevHash,
      hash,
      ts,
    });
  } catch (err) {
    // MUST NOT throw — a failed audit write must not abort budget enforcement.
    // Log for monitoring/alerting.
    console.error('appendAuditEvent: failed to write audit row:', err);
  }
}
