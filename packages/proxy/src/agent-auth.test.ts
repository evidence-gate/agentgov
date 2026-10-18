import { describe, expect, it } from 'vitest';
import { authenticateAgent } from './agent-auth';
import app from './app';
const token = 'synthetic_auth_token_for_tests_0001';
async function entry() {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return { subject: 'alice', tokenSha256: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join(''), agentIds: ['alice-agent'] };
}
describe('agent identity boundary (same implementation Node and Workers)', () => {
  it('fails closed on absent and malformed configuration, including invalid sibling grants', async () => {
    const good = await entry();
    for (const raw of [undefined, '', 'bad-json', '{}', '[]', '[null]', JSON.stringify([good, good]),
      JSON.stringify([{ ...good, agentIds: ['*'] }]), JSON.stringify([{ ...good, tokenSha256: token }]),
      JSON.stringify([{ ...good, subject: '' }]), JSON.stringify([{ ...good, agentIds: ['x', 'x'] }]),
      JSON.stringify([good, { ...good, tokenSha256: 'a'.repeat(64), extra: true }])]) {
      expect(await authenticateAgent(raw, token)).toMatchObject({ ok: false, status: 503 });
    }
  });
  it('authenticates only matching credentials and rotates without accepting revoked tokens', async () => {
    const good = await entry();
    const config = JSON.stringify([good]);
    for (const supplied of [undefined, '', 'short', 'x'.repeat(257), 'x'.repeat(32), `${token},${token}`, `Bearer ${token}`]) {
      expect(await authenticateAgent(config, supplied)).toMatchObject({ ok: false, status: 401 });
    }
    expect(await authenticateAgent(config, token)).toEqual({ ok: true, identity: { subject: 'alice', agentIds: ['alice-agent'] } });
    expect(await authenticateAgent(JSON.stringify([{ ...good, tokenSha256: 'a'.repeat(64) }]), token)).toMatchObject({ ok: false, status: 401 });
  });
  it('rejects missing auth and cross-agent identity before DB or request parsing; allowed identity reaches DB gate', async () => {
    const config = JSON.stringify([await entry()]);
    for (const [auth, agent, status, code] of [
      ['', 'alice-agent', 401, 'AGENT_UNAUTHENTICATED'],
      [token, 'victim', 403, 'AGENT_FORBIDDEN'],
      [token, 'Alice-agent', 403, 'AGENT_FORBIDDEN'],
      [token, 'alice-agent,victim', 403, 'AGENT_FORBIDDEN'],
      [token, 'alice-agent', 503, 'GOVERNANCE_UNAVAILABLE'],
    ] as const) {
      const res = await app.request('/v1/chat/completions', { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Agent-Id': agent, 'X-Agentgov-Token': auth,
          Authorization: 'Bearer spoofed-provider-key', 'X-Authenticated-Subject': 'admin' },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'test' }] }),
      }, { AGENTGOV_AGENT_AUTH: config } as unknown as Env);
      expect(res.status).toBe(status); expect(await res.json()).toEqual(expect.objectContaining({ error: expect.objectContaining({ code }) }));
    }
    const res = await app.request('/v1/chat/completions', { method: 'POST' });
    expect(res.status).toBe(503);
  });
});
