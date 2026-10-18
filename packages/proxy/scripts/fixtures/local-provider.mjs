// Test-only network boundary: never contact an actual LLM provider.
const originalFetch = globalThis.fetch;
const provider = new URL(process.env.TEST_PROVIDER_URL);
if (provider.protocol !== 'http:' || provider.hostname !== '127.0.0.1') {
  throw new Error('Test provider must be localhost');
}
globalThis.fetch = (input, init) => {
  if (String(input) !== 'https://api.openai.com/v1/chat/completions') {
    throw new Error(`Unexpected outbound fetch blocked by test: ${String(input)}`);
  }
  return originalFetch(new URL('/v1/chat/completions', provider), init);
};
