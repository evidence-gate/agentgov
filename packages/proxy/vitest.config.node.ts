import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/db/schema.test.ts',
      'src/budget/calculator.test.ts',
      'src/audit/writer.test.ts',
      'src/budget/gate.test.ts',
      'src/budget/alerts.test.ts',
      'src/hitl/hitl.test.ts',
    ],
  },
});
