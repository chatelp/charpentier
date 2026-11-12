// @ts-check
import { builtinModules } from 'node:module';
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Architecture guardrails (see CLAUDE.md and docs/SPEC.md §13, §21).
 *
 * Host-agnostic code must never reach for Node or Electron APIs: it has to run
 * unchanged in the browser, the Electron renderer, the Electron main process
 * and the server. The same rule is enforced a second time by the TypeScript
 * config (tsconfig.host-agnostic.json has no Node types), and
 * scripts/guard-selftest.mjs checks that both layers actually fire.
 */

const nodeBuiltins = builtinModules.filter((m) => !m.startsWith('_'));

const hostApiPaths = [
  ...nodeBuiltins.map((name) => ({
    name,
    message: 'Node APIs are host-specific: go through @charpentier/platform.',
  })),
  {
    name: 'electron',
    message: 'Electron APIs are host-specific: go through @charpentier/platform.',
  },
];

const hostApiPatterns = [
  { group: ['node:*'], message: 'Node APIs are host-specific: go through @charpentier/platform.' },
  { group: ['electron/*', '@electron/*'], message: 'Electron APIs are host-specific.' },
];

const nodeGlobals = [
  'process',
  'Buffer',
  'global',
  'require',
  'module',
  '__dirname',
  '__filename',
  'setImmediate',
  'clearImmediate',
].map((name) => ({
  name,
  message: `'${name}' is a Node global: host-agnostic code must go through @charpentier/platform.`,
}));

const browserOnlyGlobals = [
  'window',
  'document',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'navigator',
].map((name) => ({
  name,
  message: `'${name}' does not exist in the Electron main process or on the server, where agents run.`,
}));

/**
 * @param {string[]} forbiddenPackages workspace packages this layer must not import
 */
const restrictImports = (forbiddenPackages) => [
  'error',
  {
    paths: hostApiPaths,
    patterns: [
      ...hostApiPatterns,
      ...(forbiddenPackages.length
        ? [
            {
              group: forbiddenPackages,
              message: 'Forbidden dependency between layers (see docs/SPEC.md §20).',
            },
          ]
        : []),
    ],
  },
];

/** Layering: who may import whom. */
const layers = [
  { files: ['packages/schema/**'], forbidden: ['@charpentier/*'] },
  {
    files: ['packages/platform/**'],
    forbidden: ['@charpentier/core', '@charpentier/agents', '@charpentier/platform-*'],
  },
  { files: ['packages/core/**'], forbidden: ['@charpentier/agents', '@charpentier/platform-*'] },
  { files: ['packages/agents/**'], forbidden: ['@charpentier/core', '@charpentier/platform-*'] },
  { files: ['packages/platform-web/**'], forbidden: ['@charpentier/core', '@charpentier/agents'] },
  { files: ['apps/web/src/**'], forbidden: ['@charpentier/platform-desktop'] },
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.turbo/**',
      'scripts/fixtures/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.es2023 } },
  },
  // Node tooling: root config files and scripts.
  {
    files: ['*.{js,mjs,cjs,ts}', 'scripts/**', '**/vite.config.ts', '**/vitest.config.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  // Host-agnostic and browser code: no Node globals, no Node/Electron imports, layering.
  ...layers.map(({ files, forbidden }) => ({
    files,
    ignores: ['**/vite.config.ts', '**/vitest.config.ts'],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      'no-restricted-imports': restrictImports(forbidden),
      'no-restricted-globals': ['error', ...nodeGlobals],
    },
  })),
  // Agents also run in the Electron main process and on the server: no browser-only globals.
  {
    files: ['packages/agents/**'],
    rules: {
      'no-restricted-globals': ['error', ...nodeGlobals, ...browserOnlyGlobals],
    },
  },
);
