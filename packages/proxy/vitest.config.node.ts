import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/db/schema.test.ts',
      'src/agent-auth.test.ts',
      'src/passthrough/forward.test.ts',
      'src/request-validation.test.ts',
      'src/budget/calculator.test.ts',
      'src/audit/writer.test.ts',
      'src/budget/gate.test.ts',
      'src/budget/provision.test.ts',
      'src/operator-budget.test.ts',
      'src/budget/alerts.test.ts',
      'src/hitl/hitl.test.ts',
      'src/hitl/routes.test.ts',
      'src/hitl/hitl-integration.test.ts',
      'src/error/classifier.test.ts',
      'src/error/reporter.test.ts',
      'src/error/retry.test.ts',
      'src/error/loop-detector.test.ts',
      'src/index.node.startup.test.ts',
    ],
  },
});
