import { defineConfig } from 'vitest/config';

/**
 * End-to-end tests of the web app (`pnpm test:web` builds it first): the built app in a real Chromium, served by a real sync server.
 */
export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.ts'],
    environment: 'node',
    testTimeout: 90_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
