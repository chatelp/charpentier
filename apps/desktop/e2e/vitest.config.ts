import { defineConfig } from 'vitest/config';

/** End-to-end tests of the built desktop app (run `pnpm build` first). */
export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
