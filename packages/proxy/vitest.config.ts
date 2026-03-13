import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
      },
    },
    include: ['src/**/*.test.ts'],
    exclude: [
      'node_modules/**',
      'src/db/schema.test.ts',
      'src/budget/calculator.test.ts',
      'src/audit/writer.test.ts',
      'src/budget/gate.test.ts',
      'src/budget/alerts.test.ts',
      'src/hitl/hitl.test.ts',
      'src/hitl/routes.test.ts',
    ],
  },
});
