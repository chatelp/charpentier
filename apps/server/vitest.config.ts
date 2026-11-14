import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: { label: '@charpentier/server', color: 'yellow' },
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Each test gets a fresh database and a server: 2 to 4 s on the Mac, more
    // on GitHub's machines, where 5 s was once too short (netboot.test.ts).
    testTimeout: 20_000,
  },
});
