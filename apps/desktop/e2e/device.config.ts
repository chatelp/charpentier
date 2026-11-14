import { defineConfig } from 'vitest/config';

/**
 * End-to-end tests of an app already running, on the real X250 (docs/PLAN.md
 * phase 5.10 bis): `CHARPENTIER_DEVICE=http://127.0.0.1:9222` (the test
 * port, through an SSH tunnel), then `pnpm --filter @charpentier/desktop test:device`.
 */
export default defineConfig({
  test: {
    include: ['e2e/**/*.device.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
