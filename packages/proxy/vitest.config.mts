import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
  test: {
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
      'src/hitl/hitl-integration.test.ts',
      'src/error/classifier.test.ts',
      'src/error/reporter.test.ts',
      'src/error/retry.test.ts',
      'src/error/loop-detector.test.ts',
    ],
  },
});
