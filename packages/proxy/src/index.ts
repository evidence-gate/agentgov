import { Hono } from 'hono';

const app = new Hono();

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

// OpenAI-compatible chat completions endpoint (stub — budget logic added in later plans)
app.post('/v1/chat/completions', async (c) => {
  let _body: unknown;
  try {
    _body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON' }, 400);
  }

  // Stub response in OpenAI chat completion format
  const stubResponse = {
    id: `stub-${crypto.randomUUID()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'stub',
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

  return c.json(stubResponse, 200);
});

// Export app as default (Cloudflare Workers entry point convention)
export default app;
