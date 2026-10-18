import { describe, expect, it } from 'vitest';
import app from './app';

const secret = 'operator-secret';
const path = '/api/v1/operator/budgets/fresh-agent';
const payload = JSON.stringify({ limitUsd: 10 });

function put(pathName: string, headers: Record<string, string>, env?: Record<string, string>, body = payload) {
  return app.request(pathName, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  }, env as unknown as Env);
}

describe('operator budget route rejects unauthenticated grants', () => {
  it('fails closed when the operator token is unset, wrong, or replaced by a chat token', async () => {
    const unset = await put(path, { authorization: 'Bearer anything' });
    expect(unset.status).toBe(503);
    expect(await unset.json()).toEqual({ error: { code: 'ADMIN_AUTH_UNAVAILABLE' } });

    const env = { AGENTGOV_BUDGET_ADMIN_TOKEN: secret };
    const rejected: Record<string, string>[] = [
      {},
      { authorization: 'Bearer wrong-token' },
      { authorization: secret },
      { authorization: `bearer ${secret}` },
      { 'x-agentgov-token': secret },
      { 'x-agent-id': 'fresh-agent' },
    ];
    for (const headers of rejected) {
      const res = await put(path, headers, env);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: { code: 'UNAUTHORIZED' } });
    }
  });

  it('rejects invalid grants before touching an unconfigured database', async () => {
    const env = { AGENTGOV_BUDGET_ADMIN_TOKEN: secret };
    const auth = { authorization: `Bearer ${secret}` };
    const badAgent = await put('/api/v1/operator/budgets/agent%20id', auth, env);
    expect(badAgent.status).toBe(400);
    expect(await badAgent.json()).toEqual({ error: { code: 'INVALID_AGENT' } });

    for (const body of ['not-json', JSON.stringify({ limitUsd: -1 }), JSON.stringify({ limitUsd: 10, spentUsd: 0 }), JSON.stringify({})]) {
      const res = await put(path, auth, env, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: { code: 'INVALID_LIMIT' } });
    }

    const noDatabase = await put(path, auth, env);
    expect(noDatabase.status).toBe(503);
    expect(await noDatabase.json()).toMatchObject({ error: { code: 'GOVERNANCE_UNAVAILABLE' } });
  });
});
