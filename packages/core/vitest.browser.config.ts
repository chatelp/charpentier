import { playwright } from '@vitest/browser-playwright';
import { defineProject } from 'vitest/config';

/** Tests that need a real browser (editing, IndexedDB), run in headless Chromium. */
export default defineProject({
  // Pre-bundle every dependency the tests load: a dependency discovered
  // mid-run makes Vite reload the page and the first run fails.
  optimizeDeps: {
    include: [
      '@tiptap/core',
      '@tiptap/react',
      '@tiptap/pm/model',
      '@tiptap/pm/state',
      '@tiptap/pm/view',
      '@tiptap/extension-blockquote',
      '@tiptap/extension-collaboration',
      '@tiptap/extension-document',
      '@tiptap/extension-hard-break',
      '@tiptap/extension-italic',
      '@tiptap/extension-paragraph',
      '@tiptap/extension-text',
      '@tiptap/extensions',
      '@tiptap/y-tiptap',
      '@testing-library/react',
      'i18next',
      'react',
      'react-dom',
      'react-dom/client',
      'react-i18next',
      'yjs',
      '@charpentier/schema > prosemirror-model',
      '@charpentier/schema > markdown-it',
      '@charpentier/schema > fractional-indexing',
    ],
  },
  test: {
    name: { label: '@charpentier/core (chromium)', color: 'magenta' },
    include: ['src/**/*.browser.test.{ts,tsx}'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
});
