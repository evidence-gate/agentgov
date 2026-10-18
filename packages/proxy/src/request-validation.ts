import type { ChatCompletionRequest } from './types';

const fields = new Set([
  'model', 'messages', 'max_tokens', 'stream', 'stream_options', 'n',
  'temperature', 'top_p', 'frequency_penalty', 'presence_penalty',
  'stop', 'seed', 'user', 'response_format', 'tools', 'tool_choice', 'parallel_tool_calls',
]);
const messageFields = new Set(['role', 'content', 'tool_calls', 'tool_call_id', 'name']);
const roles = new Set(['system', 'developer', 'user', 'assistant', 'tool']);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Limit forwarding to the text/single-completion pricing model we can reserve. */
export function validateChatRequest(value: unknown): ChatCompletionRequest {
  if (!record(value) || Object.keys(value).some(key => !fields.has(key))) {
    throw new Error('unsupported chat request field');
  }
  if (typeof value.model !== 'string' || value.model.length === 0 || value.model.length > 200) {
    throw new Error('model must be a nonempty string');
  }
  if (!Array.isArray(value.messages) || value.messages.length === 0 || value.messages.length > 1024) {
    throw new Error('messages must be a nonempty array');
  }
  for (const message of value.messages) {
    if (!record(message) || Object.keys(message).some(key => !messageFields.has(key)) ||
      typeof message.role !== 'string' || !roles.has(message.role) ||
      !(message.content === null || typeof message.content === 'string')) {
      throw new Error('only text chat messages are supported');
    }
    for (const key of ['tool_call_id', 'name']) {
      if (message[key] !== undefined && typeof message[key] !== 'string') throw new Error(`invalid message ${key}`);
    }
    if (message.tool_calls !== undefined) {
      if (!Array.isArray(message.tool_calls) || message.tool_calls.length > 128) throw new Error('invalid tool_calls');
      for (const call of message.tool_calls) {
        if (!record(call) || call.type !== 'function' || typeof call.id !== 'string' ||
          !record(call.function) || typeof call.function.name !== 'string' ||
          typeof call.function.arguments !== 'string') throw new Error('invalid tool call');
      }
    }
  }
  const maxTokens = value.max_tokens === undefined ? 4096 : value.max_tokens;
  if (!Number.isSafeInteger(maxTokens) || (maxTokens as number) <= 0 || (maxTokens as number) > 65536) {
    throw new Error('max_tokens must be an integer between 1 and 65536');
  }
  if (value.n !== undefined && value.n !== 1) throw new Error('only n=1 is supported');
  if (value.stream !== undefined && typeof value.stream !== 'boolean') throw new Error('stream must be boolean');
  // A caller cannot disable usage collection on streams.
  if (value.stream_options !== undefined && (!record(value.stream_options) ||
    Object.keys(value.stream_options).some(key => key !== 'include_usage'))) throw new Error('unsupported stream_options');
  return { ...value, max_tokens: maxTokens } as unknown as ChatCompletionRequest;
}
