import { playwright } from '@vitest/browser-playwright';
import { defineProject } from 'vitest/config';

/** Tests that need a real browser (editing, IndexedDB), run in headless Chromium. */
export default defineProject({
  test: {
    name: { label: '@charpentier/platform-web (chromium)', color: 'magenta' },
    include: ['src/**/*.browser.test.{ts,tsx}'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
});
