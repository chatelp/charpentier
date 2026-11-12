import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/*',
      'apps/*',
      // Same packages, tests that need a real browser (headless Chromium).
      'packages/core/vitest.browser.config.ts',
      'packages/platform-web/vitest.browser.config.ts',
    ],
  },
});
