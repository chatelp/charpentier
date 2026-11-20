// @ts-check
import { builtinModules } from 'node:module';
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import architectureGuards from './tools/eslint/architecture-guards.js';
import noUiLiteral from './tools/eslint/no-ui-literal.js';

/** The local rules: tools/eslint. */
const charpentier = {
  meta: { name: 'charpentier' },
  rules: { ...noUiLiteral.rules, ...architectureGuards },
};

/**
 * Architecture guardrails (see CLAUDE.md and docs/SPEC.md §13, §21).
 *
 * Host-agnostic code must never reach for Node or Electron APIs: it has to run
 * unchanged in the browser, the Electron renderer, the Electron main process
 * and the server. The same rule is enforced a second time by the TypeScript
 * config (tsconfig.host-agnostic.json has no Node types), and
 * scripts/guard-selftest.mjs checks that both layers actually fire.
 *
 * `no-restricted-imports` and `no-restricted-globals` only see static imports
 * and bare global names. The local rules of tools/eslint/architecture-guards.js
 * close the ways around them (dynamic imports, require, the global object,
 * relative paths into another package), and `no-eval`, `no-implied-eval` and
 * `no-new-func` close code built from a string.
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
 * The network, closed to the packages that hold no host service: the only way out
 * is a service of @charpentier/platform (LLM calls go through its `LLM` service).
 */
const networkGlobals = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'WebTransport',
  'RTCPeerConnection',
  'Request',
].map((name) => ({
  name,
  message: `'${name}' reaches the network: this package goes through the services of @charpentier/platform.`,
}));

/** Code built from a string escapes every static check. */
const codeFromString = ['eval', 'Function'].map((name) => ({
  name,
  message: `'${name}' builds code from a string, which no guardrail can read.`,
}));

const nodeApiMessage = 'Node APIs are host-specific: go through @charpentier/platform.';
const electronModules = {
  match: ['electron', '@electron/*'],
  message: 'Electron APIs are host-specific: go through @charpentier/platform.',
};

/**
 * Options of `charpentier/module-boundaries` for host-agnostic code.
 * @param {string[]} forbiddenPackages workspace packages this layer must not import
 */
const agnosticBoundaries = (forbiddenPackages) => ({
  modules: [
    { match: [...nodeBuiltins, 'node:*'], message: nodeApiMessage },
    electronModules,
    ...(forbiddenPackages.length
      ? [
          {
            match: forbiddenPackages,
            message: 'Forbidden dependency between layers (see docs/SPEC.md §20).',
          },
        ]
      : []),
  ],
  zones: nodeZones,
  callArguments: true,
});

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

/**
 * Node code of the workspace: the Electron main process and preload, the Node
 * side of the desktop platform, the sync server. Host-agnostic code never
 * enters these folders, by a package name or by a relative path.
 * scripts/guard-selftest.mjs checks that every folder of every workspace
 * package is either here or in `layers`.
 */
export const nodeZones = [
  'apps/desktop/src/main',
  'apps/desktop/src/preload',
  'apps/server/src',
  'packages/platform-desktop/src/main',
  // The LLM service on Anthropic's API, for the desktop's main process and the server.
  'packages/anthropic/src',
];

/**
 * Layering: who may import whom. `network: false` closes fetch and its kin,
 * `browser: false` closes the globals that only a browser has.
 */
export const layers = [
  { files: ['packages/schema/**'], forbidden: ['@charpentier/*'], network: false },
  {
    files: ['packages/platform/**'],
    forbidden: ['@charpentier/core', '@charpentier/agents', '@charpentier/platform-*'],
    network: false,
  },
  {
    files: ['packages/core/**'],
    forbidden: ['@charpentier/agents', '@charpentier/platform-*'],
    network: false,
  },
  // Agents also run in the Electron main process and on the server: no browser-only globals.
  {
    files: ['packages/agents/**'],
    forbidden: ['@charpentier/core', '@charpentier/platform-*'],
    network: false,
    browser: false,
  },
  // The browser runs the agents in the page, the server relaying the calls (phase 4.7 b).
  {
    files: ['packages/platform-web/**'],
    forbidden: ['@charpentier/core', '@charpentier/platform-desktop'],
  },
  { files: ['apps/web/src/**'], forbidden: ['@charpentier/platform-desktop'] },
  // The renderer side of the desktop platform runs in the sandboxed renderer.
  {
    files: ['packages/platform-desktop/src/renderer/**', 'packages/platform-desktop/src/shared/**'],
    forbidden: ['@charpentier/core', '@charpentier/agents', '@charpentier/platform-web'],
  },
  { files: ['apps/desktop/src/renderer/**'], forbidden: ['@charpentier/platform-web'] },
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/out/**',
      '**/.turbo/**',
      'scripts/fixtures/**',
      // Worktrees of other sessions.
      '.claude/**',
    ],
  },
  // An allowance (`eslint-disable`) that no longer allows anything is an error.
  { plugins: { charpentier }, linterOptions: { reportUnusedDisableDirectives: 'error' } },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.es2023 } },
  },
  // Design mock scripts, injected into the app in a browser (docs/design).
  {
    files: ['docs/design/**/*.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
  // Node tooling: root config files and scripts.
  {
    files: [
      '*.{js,mjs,cjs,ts}',
      'scripts/**',
      'tools/**',
      '**/vite.config.ts',
      '**/vitest.config.ts',
      '**/electron.vite.config.ts',
      // Electron main process, preload, end-to-end tests, Node side of the desktop platform.
      'apps/desktop/src/main/**',
      'apps/desktop/src/preload/**',
      'apps/desktop/e2e/**',
      // The sync server.
      'apps/server/**',
      'packages/platform-desktop/src/main/**',
    ],
    languageOptions: { globals: { ...globals.node } },
  },
  // Every workspace package: a module is named by a string literal and reached by its
  // package name, no code is built from a string, every Yjs transaction names its origin.
  {
    files: ['packages/*/src/**', 'apps/*/src/**'],
    rules: {
      'charpentier/module-boundaries': ['error', {}],
      'charpentier/transact-origin': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  // Tests build their fixtures in bare transactions.
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/testing/**'],
    rules: { 'charpentier/transact-origin': 'off' },
  },
  // The Node side of the desktop platform is tested under plain Node: Electron stays in apps/desktop.
  {
    files: ['packages/platform-desktop/src/**'],
    rules: { 'charpentier/module-boundaries': ['error', { modules: [electronModules] }] },
  },
  // Host-agnostic and browser code: no Node globals, no Node/Electron imports, layering.
  ...layers.map(({ files, forbidden, network = true, browser = true }) => {
    const restricted = [
      ...nodeGlobals,
      ...(network ? [] : networkGlobals),
      ...(browser ? [] : browserOnlyGlobals),
    ];
    return {
      files,
      ignores: ['**/vite.config.ts', '**/vitest.config.ts'],
      languageOptions: { globals: { ...globals.browser } },
      rules: {
        'no-restricted-imports': restrictImports(forbidden),
        'no-restricted-globals': ['error', ...restricted],
        'charpentier/module-boundaries': ['error', agnosticBoundaries(forbidden)],
        'charpentier/no-host-global-access': [
          'error',
          { globals: [...restricted, ...codeFromString] },
        ],
      },
    };
  }),
  // React UI: hooks rules, and no user-facing literal string in JSX (all UI text goes through i18n).
  {
    files: ['packages/core/src/**/*.tsx', 'apps/web/src/**/*.tsx', 'apps/desktop/src/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'charpentier/no-ui-literal': 'error',
    },
  },
  {
    files: ['**/*.test.tsx', '**/testing/**'],
    rules: { 'charpentier/no-ui-literal': 'off' },
  },
);
