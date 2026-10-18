// Test-only preload. Rewrites provider fetches to a local fake so the Node
// entrypoint can be exercised without calling a real LLM API.
const originalFetch = globalThis.fetch.bind(globalThis);

const PROVIDER_HOSTS = new Set([
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
]);

function requestUrl(input) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

globalThis.fetch = async (input, init) => {
  const url = new URL(requestUrl(input));
  if (!PROVIDER_HOSTS.has(url.hostname)) return originalFetch(input, init);

  const origin = process.env.AGENTGOV_TEST_PROVIDER_ORIGIN;
  if (!origin) {
    throw new Error(`blocked outbound provider request to ${url.hostname}`);
  }
  const rewritten = new URL(`${url.pathname}${url.search}`, origin);
  if (input instanceof Request) return originalFetch(new Request(rewritten, input));
  return originalFetch(rewritten, init);
};
