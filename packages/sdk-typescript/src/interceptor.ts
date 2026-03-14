import { AgentError, type AgentErrorBody, BudgetExceeded, type BudgetExceededBody, HitlPending, type HitlPendingBody } from './errors';

export interface AgentgovOptions {
  proxyUrl: string;   // e.g., "http://localhost:8787" or "https://proxy.example.com"
  agentId: string;    // Injected as X-Agent-Id header on every request
}

export function buildProxyBaseUrl(proxyUrl: string): string {
  // Strip trailing slash
  return proxyUrl.replace(/\/$/, '');
}

export function createAgentgovFetch(options: AgentgovOptions): typeof fetch {
  const base = buildProxyBaseUrl(options.proxyUrl);
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // Rewrite URL: replace any https://api.openai.com or https://api.anthropic.com prefix
    // with the proxy base URL. If the URL is already relative or pointing elsewhere,
    // strip to path only and prepend proxy base.
    const originalUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    const url = new URL(originalUrl);
    const proxiedUrl = `${base}${url.pathname}${url.search}`;

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : {}));
    headers.set('X-Agent-Id', options.agentId);

    const response = await fetch(proxiedUrl, { ...init, headers });

    // Detect BudgetExceeded
    if (response.status === 429) {
      const clone = response.clone();
      try {
        const body = await clone.json() as { error?: { code?: string } };
        if (body?.error?.code === 'BUDGET_EXCEEDED') {
          const fullBody = body as BudgetExceededBody;
          throw new BudgetExceeded(fullBody.error.message, fullBody);
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'BudgetExceeded') throw e;
        // Not a BudgetExceeded — return original 429 response
      }
    }

    // Detect HitlPending
    if (response.status === 202) {
      const clone = response.clone();
      try {
        const body = await clone.json() as { error?: { code?: string } };
        if (body?.error?.code === 'HITL_PENDING') {
          const fullBody = body as HitlPendingBody;
          throw new HitlPending(fullBody.error.message, fullBody);
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'HitlPending') throw e;
        // Not a HitlPending — return original 202 response
      }
    }

    // Detect AgentError (502 with AGENT_ERROR code)
    if (response.status === 502) {
      const clone = response.clone();
      try {
        const body = await clone.json() as { error?: { code?: string } };
        if (body?.error?.code === 'AGENT_ERROR') {
          const fullBody = body as AgentErrorBody;
          throw new AgentError(fullBody.error.message, fullBody);
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AgentError') throw e;
        // Not an AgentError — return original 502 response
      }
    }

    return response;
  };
}
