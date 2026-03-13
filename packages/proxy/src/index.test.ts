import { describe, it, expect } from 'vitest';
import app from './index';

describe('GET /health', () => {
  it('returns 200 with { status: "ok" }', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });
});

describe('POST /v1/chat/completions', () => {
  it('returns 200 with OpenAI-compatible stub response for valid JSON body', async () => {
    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body['id']).toBe('string');
    expect((body['id'] as string).startsWith('stub-')).toBe(true);
    expect(body['object']).toBe('chat.completion');
    const choices = body['choices'] as Array<{ message: { role: string; content: string } }>;
    expect(Array.isArray(choices)).toBe(true);
    expect(choices[0].message.role).toBe('assistant');
    expect(choices[0].message.content).toBe('stub');
  });

  it('returns 400 for non-JSON body', async () => {
    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'this is not json',
    });
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body['error']).toBe('invalid JSON');
  });
});
