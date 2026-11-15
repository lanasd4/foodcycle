import { defineConfig } from 'vitest/config';

// e2e tests run against the real PostGIS database from docker-compose
// (database foodcycle_test, wiped at the start of each run).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? 'postgres://foodcycle:foodcycle_dev@localhost:5433/foodcycle_test',
      JWT_SECRET: 'e2e-test-secret-e2e-test-secret-e2e-test',
      CORS_ORIGIN: 'http://localhost:5173',
      BULL_PREFIX: 'fc-test',
    },
  },
});
