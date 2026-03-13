import { Hono } from 'hono';
import { createDbClient } from './db/client';
import { budgetGate } from './budget/gate';
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
    // Fetch current budget state for the error body
    // (We don't have the exact values here, so we use what we know)
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

  // Step 5: Gate passed — return stub response
  // NOTE: budgetSettle is NOT called here — it will be called after the real LLM response
  // arrives in plan 01-03 (LLM forwarding).
  return c.json(makeStubResponse(body.model), 200);
});

/**
 * Creates a stub OpenAI-compatible response.
 * Used while LLM forwarding is not yet implemented (completed in 01-03).
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
