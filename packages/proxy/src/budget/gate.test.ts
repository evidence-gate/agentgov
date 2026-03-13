import { describe, it, expect, vi, beforeEach } from 'vitest';
import { budgetGate } from './gate';
import type { DbClient } from '../db/client';
import type { ChatCompletionRequest } from '../types';

// ---- Mock factory helpers ----

/**
 * Creates a mock DbClient that supports the fluent Drizzle ORM API.
 *
 * The mock tracks all inserts and updates. For selects, it returns
 * budget data for budget_ledger queries and empty arrays for audit_log queries.
 *
 * We use a call-count strategy to distinguish budget_ledger selects from
 * audit_log selects: ledger queries use .where(), audit queries use .orderBy().
 */
function makeMockDb(options: {
  budget?: { limitUsd: number; spentUsd: number; reservedUsd: number; agentId?: string } | null;
}) {
  const insertedRows: Record<string, unknown>[] = [];
  const updatedSets: Record<string, unknown>[] = [];

  const budget = options.budget ?? { limitUsd: 10.0, spentUsd: 0, reservedUsd: 0 };

  const db = {
    insertedRows,
    updatedSets,
    // select().from(table).where(...).limit(n) — returns budget row
    // select().from(table).orderBy(...).limit(n) — returns [] for audit_log
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => (budget ? [{ ...budget, agentId: budget.agentId ?? 'agent-01' }] : [])),
        })),
        orderBy: vi.fn(() => ({
          limit: vi.fn(async () => []),
        })),
      })),
    })),
    // insert(table).values(row).onConflictDoNothing() — records the row
    // Drizzle ORM chains: insert(table) → values(row) → onConflictDoNothing()
    insert: vi.fn(() => ({
      values: vi.fn((row: Record<string, unknown>) => {
        insertedRows.push(row);
        return {
          onConflictDoNothing: vi.fn(async () => {
            // Mark as ensure-agent insert for distinguishing from hold inserts
            insertedRows[insertedRows.length - 1] = { ...insertedRows[insertedRows.length - 1], _isEnsureAgent: true };
            return { rows: [] };
          }),
          // Direct await support (for hold inserts that don't use onConflictDoNothing)
          then: (resolve: (v: unknown) => void) => resolve({ rows: [] }),
        };
      }),
    })),
    // update(table).set({...}).where(...) — records the set values
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          updatedSets.push(values);
          return { rows: [] };
        }),
      })),
    })),
  };

  return db as unknown as DbClient & {
    insertedRows: Record<string, unknown>[];
    updatedSets: Record<string, unknown>[];
  };
}

// ---- Mock appendAuditEvent ----
vi.mock('../audit/writer', () => ({
  appendAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import { appendAuditEvent } from '../audit/writer';

// ---- Helper: make a valid ChatCompletionRequest ----
function makeRequest(model = 'gpt-4o'): ChatCompletionRequest {
  return {
    model,
    messages: [{ role: 'user', content: 'Hello, world!' }],
  };
}

// ---- budgetGate tests ----

describe('budgetGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns { action: "pass", holdId } when budget is sufficient', async () => {
    const db = makeMockDb({ budget: { limitUsd: 10.0, spentUsd: 0, reservedUsd: 0 } });
    const result = await budgetGate({ db, agentId: 'agent-01', request: makeRequest() });
    expect(result.action).toBe('pass');
    expect(typeof result.holdId).toBe('string');
    expect(result.holdId!.length).toBeGreaterThan(0);
  });

  it('returns { action: "block", reason: "unknown_model" } for unknown model', async () => {
    const db = makeMockDb({ budget: { limitUsd: 10.0, spentUsd: 0, reservedUsd: 0 } });
    const result = await budgetGate({
      db,
      agentId: 'agent-01',
      request: makeRequest('totally-unknown-model-xyz'),
    });
    expect(result.action).toBe('block');
    expect(result.reason).toBe('unknown_model');
  });

  it('returns { action: "block", reason: "budget_exceeded" } when budget is insufficient', async () => {
    // Budget nearly exhausted — gpt-4-turbo is expensive ($10/1M input + $30/1M output)
    // Even a small request with 4096 output tokens will exceed the remaining $0.001
    const db = makeMockDb({ budget: { limitUsd: 10.0, spentUsd: 9.999, reservedUsd: 0 } });
    const result = await budgetGate({
      db,
      agentId: 'agent-01',
      request: makeRequest('gpt-4-turbo'),
    });
    expect(result.action).toBe('block');
    expect(result.reason).toBe('budget_exceeded');
  });

  it('calls appendAuditEvent with "budget_hold" eventType when gate passes', async () => {
    const db = makeMockDb({ budget: { limitUsd: 10.0, spentUsd: 0, reservedUsd: 0 } });
    await budgetGate({ db, agentId: 'agent-01', request: makeRequest() });
    expect(appendAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: 'budget_hold' })
    );
  });

  it('calls appendAuditEvent with "budget_blocked" eventType when gate blocks (unknown model)', async () => {
    const db = makeMockDb({ budget: { limitUsd: 10.0, spentUsd: 0, reservedUsd: 0 } });
    await budgetGate({
      db,
      agentId: 'agent-01',
      request: makeRequest('unknown-model-xyz'),
    });
    expect(appendAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: 'budget_blocked' })
    );
  });

  it('calls appendAuditEvent with "budget_blocked" eventType when gate blocks (budget exceeded)', async () => {
    const db = makeMockDb({ budget: { limitUsd: 10.0, spentUsd: 9.999, reservedUsd: 0 } });
    await budgetGate({
      db,
      agentId: 'agent-01',
      request: makeRequest('gpt-4-turbo'),
    });
    expect(appendAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: 'budget_blocked' })
    );
  });
});

// ---- Ledger / hold atomicity tests ----
import { ensureAgent, createHold, settleHold } from './ledger';

describe('ensureAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls insert with onConflictDoNothing (INSERT OR IGNORE semantics)', async () => {
    const db = makeMockDb({ budget: null });
    const insertSpy = vi.spyOn(db as unknown as { insert: () => unknown }, 'insert');
    await ensureAgent(db, 'agent-new', 10.0);
    expect(insertSpy).toHaveBeenCalledTimes(1);
    // Should have recorded a row via the onConflictDoNothing path
    expect((db as unknown as { insertedRows: unknown[] }).insertedRows).toHaveLength(1);
  });
});

describe('createHold', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns { approved: true, holdId } when budget is sufficient', async () => {
    const db = makeMockDb({ budget: { limitUsd: 10.0, spentUsd: 0, reservedUsd: 0 } });
    const result = await createHold(db, 'agent-01', 'gpt-4o', 0.01);
    expect(result.approved).toBe(true);
    if (result.approved) {
      expect(typeof result.holdId).toBe('string');
      expect(result.holdId.length).toBeGreaterThan(0);
    }
  });

  it('returns { approved: false, remaining } when budget is insufficient', async () => {
    const db = makeMockDb({ budget: { limitUsd: 10.0, spentUsd: 9.999, reservedUsd: 0 } });
    const result = await createHold(db, 'agent-01', 'gpt-4-turbo', 5.0);
    expect(result.approved).toBe(false);
    if (!result.approved) {
      expect(result.remaining).toBeCloseTo(0.001, 3);
    }
  });

  it('does NOT insert a hold row when budget is insufficient', async () => {
    const db = makeMockDb({ budget: { limitUsd: 10.0, spentUsd: 9.999, reservedUsd: 0 } });
    await createHold(db, 'agent-01', 'gpt-4-turbo', 5.0);
    const insertedRows = (db as unknown as { insertedRows: Record<string, unknown>[] }).insertedRows;
    // Should be empty — no hold inserted when denied
    expect(insertedRows).toHaveLength(0);
  });

  it('inserts a hold row when approved', async () => {
    const db = makeMockDb({ budget: { limitUsd: 10.0, spentUsd: 0, reservedUsd: 0 } });
    await createHold(db, 'agent-01', 'gpt-4o', 0.01);
    const insertedRows = (db as unknown as { insertedRows: Record<string, unknown>[] }).insertedRows;
    // Should have one hold row inserted
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]['estimatedCost']).toBe(0.01);
    expect(insertedRows[0]['status']).toBe('active');
  });

  it('second hold that exceeds limit returns approved: false (sequential budget check)', async () => {
    // reservedUsd already $9.995 — a second hold for $0.01 would exceed $10.0 limit
    const db = makeMockDb({ budget: { limitUsd: 10.0, spentUsd: 0, reservedUsd: 9.995 } });
    const result = await createHold(db, 'agent-01', 'gpt-4o', 0.01);
    expect(result.approved).toBe(false);
  });
});

describe('settleHold', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls update twice (holds + budget_ledger)', async () => {
    const db = makeMockDb({ budget: { limitUsd: 10.0, spentUsd: 0.01, reservedUsd: 0.01 } });
    const updateSpy = vi.spyOn(db as unknown as { update: () => unknown }, 'update');
    await settleHold(db, 'hold-uuid-123', 0.0095);
    expect(updateSpy).toHaveBeenCalledTimes(2);
  });
});
