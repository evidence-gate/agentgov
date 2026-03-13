import { Hono } from 'hono';
import { createDbClient } from './db/client';
import { budgetGate } from './budget/gate';
import { forwardToLlm } from './passthrough/forward';
import { checkAndFireAlerts } from './budget/alerts';
import type { ChatCompletionRequest, BudgetExceededErrorBody } from './types';

const app = new Hono<{ Bindings: Env }>();

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

// OpenAI-compatible chat completions endpoint with budget enforcement
app.post('/v1/chat/completions', async (c) => {
  // Step 1: Require X-Agent-Id header
  const agentId = c.req.header('X-Agent-Id');
  if (!agentId) {
    return c.json({ error: 'X-Agent-Id header required' }, 400);
  }

  // Step 2: Parse request body
  let body: ChatCompletionRequest;
  try {
    body = await c.req.json<ChatCompletionRequest>();
  } catch {
    return c.json({ error: 'invalid JSON' }, 400);
  }

  // Step 3: Budget enforcement — initialize DB client
  // If bindings are missing (local dev without .dev.vars), skip enforcement and allow all.
  // This keeps local dev usable without a Turso database.
  const dbUrl = c.env?.TURSO_DATABASE_URL;
  const dbToken = c.env?.TURSO_AUTH_TOKEN;

  if (!dbUrl || !dbToken) {
    console.warn(
      'agentgov: TURSO_DATABASE_URL or TURSO_AUTH_TOKEN not configured — ' +
      'budget enforcement DISABLED (local dev mode). Set .dev.vars for local enforcement.'
    );
    // Passthrough stub (enforcement disabled for local dev)
    return c.json(makeStubResponse(body.model), 200);
  }

  const db = createDbClient(dbUrl, dbToken);

  // Step 4: Run budget gate (Hold/Settle pattern)
  const gateResult = await budgetGate({ db, agentId, request: body });

  if (gateResult.action === 'block') {
    if (gateResult.reason === 'unknown_model') {
      // 422 Unprocessable Entity — model not in pricing table
      return c.json(
        {
          error: {
            code: 'UNKNOWN_MODEL',
            message: `Model ${body.model} is not in the pricing table. agentgov fails closed on unknown models.`,
          },
        },
        422
      );
    }

    // 429 Too Many Requests — budget exceeded
    const errorBody: BudgetExceededErrorBody = {
      error: {
        code: 'BUDGET_EXCEEDED',
        message: `Budget exceeded for agent ${agentId}. Request blocked before forwarding.`,
        budgetId: agentId,
        spent: 0, // Will be populated accurately in a later plan with budget state lookup
        limit: 0, // Will be populated accurately in a later plan
      },
    };
    return c.json(errorBody, 429);
  }

  // Step 5: Gate passed — forward to real LLM provider
  const holdId = gateResult.holdId!;

  // Parse alert thresholds from env (default: 80% and 100%)
  const thresholdsRaw = c.env?.AGENTGOV_ALERT_THRESHOLDS ?? '0.80,1.00';
  const thresholds = thresholdsRaw
    .split(',')
    .map((t: string) => parseFloat(t.trim()))
    .filter((t: number) => !isNaN(t));

  const webhookUrl = c.env?.AGENTGOV_ALERT_WEBHOOK_URL || undefined;

  // Forward to LLM (streaming or non-streaming)
  const llmResponse = await forwardToLlm(body, holdId, agentId, db, {
    OPENAI_API_KEY: c.env?.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: c.env?.ANTHROPIC_API_KEY,
  });

  // Fire budget alerts fire-and-forget (not on the hot path)
  // Use executionCtx.waitUntil if available (Cloudflare Workers), else background promise
  const alertPromise = checkAndFireAlerts(db, agentId, webhookUrl, thresholds).catch(
    (err) => console.error('checkAndFireAlerts error:', err),
  );

  if (c.executionCtx && typeof c.executionCtx.waitUntil === 'function') {
    c.executionCtx.waitUntil(alertPromise);
  }
  // (If no executionCtx, the promise runs in background — fine for non-Workers environments)

  return llmResponse;
});

/**
 * Creates a stub OpenAI-compatible response.
 * Used only in local dev mode when DB credentials are not configured.
 */
function makeStubResponse(model: string) {
  return {
    id: `stub-${crypto.randomUUID()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: 'stub',
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

// Export app as default (Cloudflare Workers entry point convention)
export default app;
