import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
      },
    },
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', 'src/db/schema.test.ts'],
  },
});
