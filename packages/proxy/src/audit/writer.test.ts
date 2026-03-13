import { describe, it, expect, vi } from 'vitest';
import { appendAuditEvent } from './writer';
import type { AuditEvent } from '../types';

// ---- Mock DbClient ----
// The writer test uses a mock DbClient that records all SQL calls.

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    eventType: 'budget_hold',
    agentId: 'agent-test-01',
    model: 'gpt-4o',
    costDelta: 0.005,
    runningBalance: 9.995,
    ...overrides,
  };
}

// Minimal mock that captures insert calls
function makeMockDb() {
  const rows: Record<string, unknown>[] = [];

  return {
    rows,
    // Drizzle-style mock: execute() returns results for SELECT, nothing for INSERT
    _lastHash: null as string | null,
    execute: vi.fn(async (query: unknown) => {
      // Inspect the SQL string to determine what query is being run
      const sql = typeof query === 'string' ? query : (query as { sql?: string }).sql ?? '';
      if (sql.toLowerCase().includes('select') || sql.toLowerCase().includes('order by')) {
        // Return last row's hash for chain
        return {
          rows: rows.length > 0 ? [rows[rows.length - 1]] : [],
        };
      }
      return { rows: [] };
    }),
    insert: vi.fn(),
    select: vi.fn(),
    // Support fluent Drizzle ORM API for select().from().orderBy().limit()
    _selectResult: [] as unknown[],
  };
}

// A more realistic mock that supports the Drizzle ORM fluent API
function makeFluentMockDb() {
  const insertedRows: Record<string, unknown>[] = [];
  let selectResult: Record<string, unknown>[] = [];

  const db = {
    insertedRows,
    setSelectResult(rows: Record<string, unknown>[]) {
      selectResult = rows;
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn(async () => selectResult),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async (values: Record<string, unknown>) => {
        insertedRows.push(values);
        return { rows: [] };
      }),
    })),
  };

  return db;
}

describe('appendAuditEvent', () => {
  it('inserts a row into audit_log', async () => {
    const db = makeFluentMockDb() as unknown as Parameters<typeof appendAuditEvent>[0];
    const event = makeEvent();
    await appendAuditEvent(db, event);
    const mockDb = db as ReturnType<typeof makeFluentMockDb>;
    expect(mockDb.insertedRows).toHaveLength(1);
  });

  it('inserts a row with a non-empty hash field', async () => {
    const db = makeFluentMockDb() as unknown as Parameters<typeof appendAuditEvent>[0];
    await appendAuditEvent(db, makeEvent());
    const mockDb = db as ReturnType<typeof makeFluentMockDb>;
    const row = mockDb.insertedRows[0];
    expect(row).toBeDefined();
    expect(typeof row['hash']).toBe('string');
    expect((row['hash'] as string).length).toBeGreaterThan(0);
    // SHA-256 hex is 64 chars
    expect((row['hash'] as string).length).toBe(64);
  });

  it('uses the genesis sentinel for prevHash when no prior rows exist', async () => {
    const db = makeFluentMockDb() as unknown as Parameters<typeof appendAuditEvent>[0];
    // setSelectResult([]) simulates no prior rows
    await appendAuditEvent(db, makeEvent());
    const mockDb = db as ReturnType<typeof makeFluentMockDb>;
    const row = mockDb.insertedRows[0];
    expect(row['prevHash']).toBe(GENESIS_HASH);
  });

  it("sets prevHash to the previous entry's hash for chaining", async () => {
    const db = makeFluentMockDb() as unknown as Parameters<typeof appendAuditEvent>[0];
    const mockDb = db as ReturnType<typeof makeFluentMockDb>;

    // First insert (genesis)
    await appendAuditEvent(db, makeEvent());
    const firstHash = mockDb.insertedRows[0]['hash'] as string;
    expect(typeof firstHash).toBe('string');

    // Simulate DB now returning that first row on next SELECT
    mockDb.setSelectResult([{ hash: firstHash }]);

    // Second insert
    await appendAuditEvent(db, makeEvent({ eventType: 'budget_settle' }));
    const secondRow = mockDb.insertedRows[1];
    expect(secondRow['prevHash']).toBe(firstHash);
  });

  it('does NOT throw if insert fails — logs to console.error', async () => {
    // Make insert throw to simulate DB failure
    const db = makeFluentMockDb() as unknown as Parameters<typeof appendAuditEvent>[0];
    const mockDb = db as ReturnType<typeof makeFluentMockDb>;

    // Override insert to throw
    (mockDb as unknown as Record<string, unknown>).insert = vi.fn(() => ({
      values: vi.fn(() => Promise.reject(new Error('DB connection lost'))),
    }));

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Should NOT throw
    await expect(appendAuditEvent(db, makeEvent())).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('appendAuditEvent'),
      expect.any(Error)
    );
    errorSpy.mockRestore();
  });
});
