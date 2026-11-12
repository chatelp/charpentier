import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: { label: '@charpentier/core', color: 'cyan' },
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['src/**/*.browser.test.{ts,tsx}'],
  },
});
