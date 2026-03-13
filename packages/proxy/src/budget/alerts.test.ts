/**
 * Tests for checkAndFireAlerts — budget threshold webhook notifications.
 *
 * These tests run in Node.js environment (not Cloudflare Workers pool)
 * because they test pure logic with mocked DB and fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkAndFireAlerts } from './alerts';
import type { DbClient } from '../db/client';

// ---- Mock helpers ----

/**
 * Creates a mock DbClient for alerts tests.
 *
 * Supports:
 * - getBudget: select().from().where().limit() → budget row
 * - audit_log check: select().from().where().limit() → rows (to check if alert already fired)
 * - insert().values() for audit log writes
 */
function makeMockDb(options: {
  budget?: { limitUsd: number; spentUsd: number; reservedUsd: number } | null;
  alertFiredRows?: Record<string, unknown>[];
}) {
  const insertedRows: Record<string, unknown>[] = [];

  const budget = options.budget ?? { limitUsd: 10.0, spentUsd: 0, reservedUsd: 0 };
  const alertFiredRows = options.alertFiredRows ?? [];

  // Track number of select() calls: first = getBudget, subsequent = alert check queries
  let selectCallCount = 0;

  const db = {
    insertedRows,
    select: vi.fn(() => {
      selectCallCount++;
      const callNum = selectCallCount;
      return {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              if (callNum === 1) {
                // getBudget call
                return budget ? [budget] : [];
              }
              // alert fired check
              return alertFiredRows;
            }),
          })),
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => []),
          })),
        })),
      };
    }),
    insert: vi.fn(() => ({
      values: vi.fn((row: Record<string, unknown>) => {
        insertedRows.push(row);
        return {
          onConflictDoNothing: vi.fn(async () => ({ rows: [] })),
          then: (resolve: (v: unknown) => void) => resolve({ rows: [] }),
        };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => ({ rows: [] })),
      })),
    })),
  };

  return db as unknown as DbClient & {
    insertedRows: Record<string, unknown>[];
  };
}

// ---- Mock appendAuditEvent ----
vi.mock('../audit/writer', () => ({
  appendAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import { appendAuditEvent } from '../audit/writer';

// ---- Tests ----

describe('checkAndFireAlerts', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns immediately if webhookUrl is undefined', async () => {
    const db = makeMockDb({ budget: { limitUsd: 10.0, spentUsd: 9.0, reservedUsd: 0 } });
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;

    await checkAndFireAlerts(db, 'agent-1', undefined, [0.80, 1.0]);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not fire alert if ratio is below 80% threshold', async () => {
    const db = makeMockDb({ budget: { limitUsd: 10.0, spentUsd: 7.9, reservedUsd: 0 } });
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;

    await checkAndFireAlerts(db, 'agent-1', 'https://webhook.example.com/alerts', [0.80, 1.0]);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fires 80% alert when ratio >= 0.80 and not yet fired', async () => {
    const db = makeMockDb({
      budget: { limitUsd: 10.0, spentUsd: 8.0, reservedUsd: 0 },
      alertFiredRows: [], // no alerts fired yet
    });
    const fetchSpy = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    global.fetch = fetchSpy;

    await checkAndFireAlerts(db, 'agent-1', 'https://webhook.example.com/alerts', [0.80, 1.0]);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://webhook.example.com/alerts');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.event).toBe('budget_alert');
    expect(body.threshold).toBe(0.80);
    expect(body.agentId).toBe('agent-1');
  });

  it('does not fire 80% alert again if already fired (idempotent)', async () => {
    const db = makeMockDb({
      budget: { limitUsd: 10.0, spentUsd: 8.0, reservedUsd: 0 },
      alertFiredRows: [{ count: 1 }], // already fired at 80%
    });
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;

    await checkAndFireAlerts(db, 'agent-1', 'https://webhook.example.com/alerts', [0.80, 1.0]);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fires 100% alert when ratio >= 1.0 and not yet fired', async () => {
    const db = makeMockDb({
      budget: { limitUsd: 10.0, spentUsd: 10.0, reservedUsd: 0 },
      alertFiredRows: [], // neither alert fired
    });
    const fetchSpy = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    global.fetch = fetchSpy;

    await checkAndFireAlerts(db, 'agent-1', 'https://webhook.example.com/alerts', [0.80, 1.0]);

    // Should fire both 100% and 80% since neither is recorded yet
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const bodies = fetchSpy.mock.calls.map((c) => JSON.parse(c[1].body));
    const thresholds = bodies.map((b) => b.threshold);
    expect(thresholds).toContain(1.0);
    expect(thresholds).toContain(0.80);
  });

  it('fires 100% alert even if 80% was already fired', async () => {
    // selectCallCount-based mock: first call = getBudget, then alternates for threshold checks
    // We need custom logic here: 80% check returns [already fired], 100% check returns []
    let alertCheckCallCount = 0;
    const insertedRows: Record<string, unknown>[] = [];
    let selectCallCount = 0;

    const db = {
      insertedRows,
      select: vi.fn(() => {
        selectCallCount++;
        const callNum = selectCallCount;
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => {
                if (callNum === 1) {
                  // getBudget — budget is at 100%
                  return [{ limitUsd: 10.0, spentUsd: 10.0, reservedUsd: 0 }];
                }
                // threshold check — alternates: 100% (not fired), 80% (fired)
                alertCheckCallCount++;
                if (alertCheckCallCount === 1) {
                  return []; // 100% alert not yet fired
                }
                return [{ count: 1 }]; // 80% alert already fired
              }),
            })),
            orderBy: vi.fn(() => ({ limit: vi.fn(async () => []) })),
          })),
        };
      }),
      insert: vi.fn(() => ({
        values: vi.fn((row: Record<string, unknown>) => {
          insertedRows.push(row);
          return {
            then: (resolve: (v: unknown) => void) => resolve({ rows: [] }),
          };
        }),
      })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => ({ rows: [] })) })) })),
    } as unknown as DbClient & { insertedRows: Record<string, unknown>[] };

    const fetchSpy = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    global.fetch = fetchSpy;

    await checkAndFireAlerts(db, 'agent-1', 'https://webhook.example.com/alerts', [0.80, 1.0]);

    // Only 100% alert fires; 80% is skipped (already fired)
    expect(fetchSpy).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.threshold).toBe(1.0);
  });

  it('catches webhook POST failure without propagating error', async () => {
    const db = makeMockDb({
      budget: { limitUsd: 10.0, spentUsd: 8.0, reservedUsd: 0 },
      alertFiredRows: [],
    });
    const fetchSpy = vi.fn().mockRejectedValue(new Error('network error'));
    global.fetch = fetchSpy;

    // Should NOT throw
    await expect(
      checkAndFireAlerts(db, 'agent-1', 'https://webhook.example.com/alerts', [0.80, 1.0]),
    ).resolves.toBeUndefined();
  });

  it('appends alert_fired audit event after firing alert', async () => {
    const db = makeMockDb({
      budget: { limitUsd: 10.0, spentUsd: 8.0, reservedUsd: 0 },
      alertFiredRows: [],
    });
    const fetchSpy = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    global.fetch = fetchSpy;

    await checkAndFireAlerts(db, 'agent-1', 'https://webhook.example.com/alerts', [0.80, 1.0]);

    expect(appendAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'alert_fired',
        agentId: 'agent-1',
        meta: expect.objectContaining({ threshold: 0.80 }),
      }),
    );
  });

  it('includes spent, limit, timestamp in the alert payload', async () => {
    const db = makeMockDb({
      budget: { limitUsd: 10.0, spentUsd: 8.5, reservedUsd: 0 },
      alertFiredRows: [],
    });
    const fetchSpy = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    global.fetch = fetchSpy;

    await checkAndFireAlerts(db, 'agent-1', 'https://webhook.example.com/alerts', [0.80]);

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.spent).toBe(8.5);
    expect(body.limit).toBe(10.0);
    expect(typeof body.timestamp).toBe('string');
    // Should be ISO8601
    expect(new Date(body.timestamp).getTime()).toBeGreaterThan(0);
  });
});
