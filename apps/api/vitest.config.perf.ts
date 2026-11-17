import { defineConfig } from 'vitest/config';

// Load test against the docker-compose database (foodcycle_test, wiped at start).
// Not part of the normal test run: npm run test:perf -w @foodcycle/api
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/perf/**/*.perf.ts'],
    fileParallelism: false,
    testTimeout: 300_000,
    hookTimeout: 300_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? 'postgres://foodcycle:foodcycle_dev@localhost:5433/foodcycle_test',
      JWT_SECRET: 'e2e-test-secret-e2e-test-secret-e2e-test',
      CORS_ORIGIN: 'http://localhost:5173',
      BULL_PREFIX: 'fc-perf',
    },
  },
});
