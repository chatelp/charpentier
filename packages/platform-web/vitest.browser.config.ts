import { playwright } from '@vitest/browser-playwright';
import { defineProject } from 'vitest/config';

/** Tests that need a real browser (editing, IndexedDB), run in headless Chromium. */
export default defineProject({
  // Pre-bundle every dependency the tests load: a dependency discovered
  // mid-run makes Vite reload the page and the first run fails.
  optimizeDeps: {
    include: ['y-indexeddb', 'yjs'],
  },
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
