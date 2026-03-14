import { describe, it, expect } from 'vitest';
import { fingerprintAction, createLoopDetector, recordAction } from './loop-detector';

describe('fingerprintAction', () => {
  it('produces a 64-char hex string (SHA-256)', async () => {
    const fp = await fingerprintAction('read_file', '{"path":"/tmp/a"}');
    expect(fp).toHaveLength(64);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — same inputs produce identical fingerprint', async () => {
    const fp1 = await fingerprintAction('read_file', '{"path":"/tmp/a"}');
    const fp2 = await fingerprintAction('read_file', '{"path":"/tmp/a"}');
    expect(fp1).toBe(fp2);
  });

  it('produces different fingerprint for different path', async () => {
    const fpA = await fingerprintAction('read_file', '{"path":"/tmp/a"}');
    const fpB = await fingerprintAction('read_file', '{"path":"/tmp/b"}');
    expect(fpA).not.toBe(fpB);
  });

  it('normalizes key order — reordered args produce same fingerprint', async () => {
    const fp1 = await fingerprintAction('read_file', JSON.stringify({ b: 1, a: 2 }));
    const fp2 = await fingerprintAction('read_file', JSON.stringify({ a: 2, b: 1 }));
    expect(fp1).toBe(fp2);
  });

  it('produces different fingerprint for different action names', async () => {
    const fp1 = await fingerprintAction('read_file', '{"path":"/tmp/a"}');
    const fp2 = await fingerprintAction('write_file', '{"path":"/tmp/a"}');
    expect(fp1).not.toBe(fp2);
  });

  it('handles non-JSON args (raw string fallback)', async () => {
    const fp1 = await fingerprintAction('tool', 'not-json');
    const fp2 = await fingerprintAction('tool', 'not-json');
    expect(fp1).toBe(fp2);
    expect(fp1).toHaveLength(64);
  });
});

describe('createLoopDetector', () => {
  it('returns a state with empty history Map', () => {
    const state = createLoopDetector();
    expect(state.history).toBeInstanceOf(Map);
    expect(state.history.size).toBe(0);
  });
});

describe('recordAction', () => {
  it('first occurrence returns { stuck: false }', async () => {
    const state = createLoopDetector();
    const fp = await fingerprintAction('read_file', '{"path":"/a"}');
    const result = recordAction(state, fp, 'read_file', 1000);
    expect(result.stuck).toBe(false);
  });

  it('second identical fingerprint triggers stuck detection', async () => {
    const state = createLoopDetector();
    const fp = await fingerprintAction('read_file', '{"path":"/a"}');
    const r1 = recordAction(state, fp, 'read_file', 1000);
    expect(r1.stuck).toBe(false);
    const r2 = recordAction(state, fp, 'read_file', 2000);
    expect(r2.stuck).toBe(true);
    if (r2.stuck) {
      expect(r2.repeatedFingerprint).toBe(fp);
      expect(r2.actionName).toBe('read_file');
      expect(r2.timestamps).toEqual([1000, 2000]);
      expect(typeof r2.suggestedRemediation).toBe('string');
      expect(r2.suggestedRemediation.length).toBeGreaterThan(0);
    }
  });

  it('third call with same fingerprint returns stuck: true with count 3 and all 3 timestamps', async () => {
    const state = createLoopDetector();
    const fp = await fingerprintAction('read_file', '{"path":"/a"}');
    recordAction(state, fp, 'read_file', 1000);
    recordAction(state, fp, 'read_file', 2000);
    const r3 = recordAction(state, fp, 'read_file', 3000);
    expect(r3.stuck).toBe(true);
    if (r3.stuck) {
      expect(r3.timestamps).toEqual([1000, 2000, 3000]);
      expect(r3.suggestedRemediation).toContain('3 times');
    }
  });

  it('two different fingerprints do NOT trigger stuck (no false positives)', async () => {
    const state = createLoopDetector();
    const fp1 = await fingerprintAction('read_file', '{"path":"/a"}');
    const fp2 = await fingerprintAction('read_file', '{"path":"/b"}');
    const r1 = recordAction(state, fp1, 'read_file', 1000);
    const r2 = recordAction(state, fp2, 'read_file', 2000);
    expect(r1.stuck).toBe(false);
    expect(r2.stuck).toBe(false);
  });

  it('suggestedRemediation mentions action name and count on second occurrence', async () => {
    const state = createLoopDetector();
    const fp = await fingerprintAction('write_file', '{"path":"/out"}');
    recordAction(state, fp, 'write_file', 1000);
    const r = recordAction(state, fp, 'write_file', 2000);
    expect(r.stuck).toBe(true);
    if (r.stuck) {
      expect(r.suggestedRemediation).toContain('write_file');
      expect(r.suggestedRemediation).toContain('2 times');
    }
  });
});
