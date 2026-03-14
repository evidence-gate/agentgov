import { describe, it, expect } from 'vitest';
import { classifyHttpError } from './classifier';

describe('classifyHttpError — transient statuses', () => {
  it('classifies 429 as transient', () => {
    const result = classifyHttpError(429);
    expect(result.class).toBe('transient');
    expect(result.retryable).toBe(true);
    expect(result.status).toBe(429);
    expect(result.suggestedRemediation).toBeTruthy();
  });

  it('classifies 500 as transient', () => {
    const result = classifyHttpError(500);
    expect(result.class).toBe('transient');
    expect(result.retryable).toBe(true);
    expect(result.status).toBe(500);
    expect(result.suggestedRemediation).toBeTruthy();
  });

  it('classifies 502 as transient', () => {
    const result = classifyHttpError(502);
    expect(result.class).toBe('transient');
    expect(result.retryable).toBe(true);
    expect(result.status).toBe(502);
    expect(result.suggestedRemediation).toBeTruthy();
  });

  it('classifies 503 as transient', () => {
    const result = classifyHttpError(503);
    expect(result.class).toBe('transient');
    expect(result.retryable).toBe(true);
    expect(result.status).toBe(503);
    expect(result.suggestedRemediation).toBeTruthy();
  });

  it('classifies 504 as transient', () => {
    const result = classifyHttpError(504);
    expect(result.class).toBe('transient');
    expect(result.retryable).toBe(true);
    expect(result.status).toBe(504);
    expect(result.suggestedRemediation).toBeTruthy();
  });
});

describe('classifyHttpError — permanent statuses', () => {
  it('classifies 401 as permanent', () => {
    const result = classifyHttpError(401);
    expect(result.class).toBe('permanent');
    expect(result.retryable).toBe(false);
    expect(result.status).toBe(401);
    expect(result.suggestedRemediation).toBeTruthy();
  });

  it('classifies 403 as permanent', () => {
    const result = classifyHttpError(403);
    expect(result.class).toBe('permanent');
    expect(result.retryable).toBe(false);
    expect(result.status).toBe(403);
    expect(result.suggestedRemediation).toBeTruthy();
  });

  it('classifies 400 as permanent', () => {
    const result = classifyHttpError(400);
    expect(result.class).toBe('permanent');
    expect(result.retryable).toBe(false);
    expect(result.status).toBe(400);
    expect(result.suggestedRemediation).toBeTruthy();
  });

  it('classifies 404 as permanent', () => {
    const result = classifyHttpError(404);
    expect(result.class).toBe('permanent');
    expect(result.retryable).toBe(false);
    expect(result.status).toBe(404);
    expect(result.suggestedRemediation).toBeTruthy();
  });

  it('classifies 422 as permanent', () => {
    const result = classifyHttpError(422);
    expect(result.class).toBe('permanent');
    expect(result.retryable).toBe(false);
    expect(result.status).toBe(422);
    expect(result.suggestedRemediation).toBeTruthy();
  });
});

describe('classifyHttpError — unknown statuses', () => {
  it('classifies 418 as unknown', () => {
    const result = classifyHttpError(418);
    expect(result.class).toBe('unknown');
    expect(result.retryable).toBe(false);
    expect(result.status).toBe(418);
    expect(result.suggestedRemediation).toBeTruthy();
  });

  it('classifies 301 as unknown', () => {
    const result = classifyHttpError(301);
    expect(result.class).toBe('unknown');
    expect(result.retryable).toBe(false);
    expect(result.status).toBe(301);
    expect(result.suggestedRemediation).toBeTruthy();
  });
});

describe('classifyHttpError — remediation messages', () => {
  it('includes rate-limit specific remediation for 429', () => {
    const result = classifyHttpError(429);
    expect(result.suggestedRemediation).toMatch(/rate.limit|backoff|retry/i);
  });

  it('includes auth-specific remediation for 401', () => {
    const result = classifyHttpError(401);
    expect(result.suggestedRemediation).toMatch(/auth|key|credential|token/i);
  });

  it('includes auth-specific remediation for 403', () => {
    const result = classifyHttpError(403);
    expect(result.suggestedRemediation).toMatch(/auth|permission|access|key/i);
  });
});
