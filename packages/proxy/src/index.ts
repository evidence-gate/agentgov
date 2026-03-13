import { Hono } from 'hono';
import { createDbClient } from './db/client';
import { budgetGate } from './budget/gate';
import { forwardToLlm } from './passthrough/forward';
import { checkAndFireAlerts } from './budget/alerts';
import { classifyAction } from './hitl/classifier';
import { hitlRoutes } from './hitl/routes';
import type { ChatCompletionRequest, BudgetExceededErrorBody } from './types';

const app = new Hono<{ Bindings: Env }>();

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

// Mount HITL sub-routes (approve, deny, status, slack callback)
// Mounted before /v1/chat/completions to ensure HITL paths take priority
app.route('/', hitlRoutes);

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

  // Gate passed — budget hold is created
  const holdId = gateResult.holdId!;

  // Step 4.5: HITL action classification
  // Check if any tool_calls in the request require human approval.
  // IMPORTANT: Budget hold is created BEFORE this check (per locked decision).
  const toolCalls = extractToolCalls(body);
  if (toolCalls.length > 0) {
    const hitlResult = classifyToolCalls(toolCalls);
    if (hitlResult.required) {
      // Trigger HITL workflow — agent must pause until human approves/denies
      const ticketId = crypto.randomUUID();
      const ttlSeconds = parseInt(c.env?.AGENTGOV_HITL_TTL_SECONDS ?? '259200', 10);
      const expiresAt = Date.now() + ttlSeconds * 1000;
      const callbackBaseUrl = new URL(c.req.url).origin;

      // Create Workflow instance (uses ticketId as instance ID per research Pitfall 1)
      await c.env.HITL_WORKFLOW.create({
        id: ticketId,
        params: {
          ticketId,
          agentId,
          actionName: hitlResult.actionName,
          riskTier: hitlResult.tier,
          requestPayload: JSON.stringify(body),
          ttlSeconds,
          holdId,
          callbackBaseUrl,
          webhookUrl: c.env?.AGENTGOV_HITL_WEBHOOK_URL || undefined,
          slackBotToken: c.env?.SLACK_BOT_TOKEN || undefined,
          slackChannelId: c.env?.SLACK_CHANNEL_ID || undefined,
        },
      });

      // Return 202 Accepted — agent should pause and poll for approval
      return c.json(
        {
          error: {
            code: 'HITL_PENDING',
            message: `Action '${hitlResult.actionName}' requires human approval. Use approvalId to poll status.`,
            approvalId: ticketId,
            agentId,
            expiresAt,
          },
        },
        202
      );
    }
  }

  // Step 5: No HITL required — forward to real LLM provider
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

  try {
    if (c.executionCtx && typeof c.executionCtx.waitUntil === 'function') {
      c.executionCtx.waitUntil(alertPromise);
    }
  } catch {
    // executionCtx not available (Node.js test env) — alertPromise runs in background
  }
  // (If no executionCtx, the promise runs in background — fine for non-Workers environments)

  return llmResponse;
});

/**
 * Extract action names from tool_calls in all messages.
 * Returns array of 'tool_call:<function_name>' strings for classifier lookup.
 */
function extractToolCalls(body: ChatCompletionRequest): string[] {
  const names: string[] = [];
  for (const message of body.messages) {
    if (message.tool_calls && Array.isArray(message.tool_calls)) {
      for (const tc of message.tool_calls) {
        if (tc.function?.name) {
          names.push(`tool_call:${tc.function.name}`);
        }
      }
    }
  }
  return names;
}

/**
 * Classify extracted tool call names against the HITL risk table.
 * Returns the FIRST risky action found (priority: external > irreversible > semi-reversible).
 * Returns { required: false } if all actions are safe or unknown.
 */
function classifyToolCalls(
  toolCallNames: string[],
): { required: false } | { required: true; tier: string; actionName: string } {
  for (const name of toolCallNames) {
    const result = classifyAction(name);
    if (result.required) {
      return { required: true, tier: result.tier, actionName: name };
    }
  }
  return { required: false };
}

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

// Export HitlWorkflow alongside default app (required for Cloudflare to wire the Workflow binding)
export { HitlWorkflow } from './hitl/workflow';

// Export app as default (Cloudflare Workers entry point convention)
export default app;
