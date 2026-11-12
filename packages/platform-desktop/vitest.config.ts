import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: { label: '@charpentier/platform-desktop', color: 'magenta' },
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
