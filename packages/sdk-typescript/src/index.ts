export { wrap } from './wrap';
export { AgentError, BudgetExceeded, HitlPending } from './errors';
export type { AgentErrorBody, BudgetExceededBody, HitlPendingBody } from './errors';
export { createAgentgovFetch, buildProxyBaseUrl } from './interceptor';
export type { AgentgovOptions } from './interceptor';

/**
 * @agentgov/sdk — TypeScript SDK for agentgov governance proxy
 *
 * Quick start (base URL redirect — recommended for production):
 *   import OpenAI from 'openai';
 *   const client = new OpenAI({
 *     baseURL: 'https://your-agentgov-proxy.example.com/v1',
 *     defaultHeaders: { 'X-Agent-Id': 'my-agent' },
 *   });
 *
 * Quick start (wrap convenience — good for testing):
 *   import { wrap } from '@agentgov/sdk';
 *   import OpenAI from 'openai';
 *   const client = wrap(new OpenAI(), { proxyUrl: 'http://localhost:8787', agentId: 'my-agent' });
 */
