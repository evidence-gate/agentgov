import { createAgentgovFetch, type AgentgovOptions } from './interceptor';

/**
 * Wrap an OpenAI-compatible client to route through the agentgov proxy.
 *
 * PRIMARY INTEGRATION PATH (recommended for production):
 *   const client = new OpenAI({ baseURL: "https://your-proxy.example.com/v1", fetch: agentgovFetch });
 *   // No agentgov.wrap() needed — just point baseURL at the proxy.
 *
 * CONVENIENCE WRAPPER (for quick integration / testing):
 *   const client = agentgov.wrap(new OpenAI(), { proxyUrl: "...", agentId: "agent-1" });
 */
export function wrap<T extends { baseURL?: string; fetch?: typeof fetch }>(
  client: T,
  options: AgentgovOptions,
): T {
  const agentgovFetch = createAgentgovFetch(options);
  // Patch the client's fetch and baseURL in place.
  // OpenAI SDK accepts a custom fetch parameter and baseURL at construction time,
  // but we can also set them post-construction for convenience.
  (client as Record<string, unknown>)['fetch'] = agentgovFetch;
  (client as Record<string, unknown>)['baseURL'] = options.proxyUrl.replace(/\/$/, '') + '/v1';
  return client;
}
