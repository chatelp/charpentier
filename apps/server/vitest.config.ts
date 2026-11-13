import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: { label: '@charpentier/server', color: 'yellow' },
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
