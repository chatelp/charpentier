#!/usr/bin/env node
// Self-test of the "no host API in host-agnostic code" guardrail.
//
// For every host-agnostic package, a virtual fixture that leaks Node or
// Electron APIs is fed to both ESLint and the TypeScript compiler, using the
// package's real configuration. Every leaking line must be rejected by both
// layers, and a clean fixture must be accepted. If someone weakens a tsconfig
// or the ESLint config, this script fails.
//
// The same goes for the ways around the two core ESLint rules (dynamic import,
// require, the global object, code built from a string, relative paths into
// another package, the network): one fixture line per bypass. Last, every
// folder of every workspace package must be classified, as host-agnostic code
// (a target below) or as Node code (`nodeZones` of eslint.config.js).

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import ts from 'typescript';
import { nodeZones } from '../eslint.config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Host-agnostic code: package, source folder of the fixture, tsconfig. */
const targets = [
  ['packages/schema'],
  ['packages/platform'],
  ['packages/core'],
  ['packages/agents'],
  ['packages/platform-web'],
  ['apps/web'],
  ['packages/platform-desktop', 'src/renderer', 'tsconfig.renderer.json'],
  ['packages/platform-desktop', 'src/shared', 'tsconfig.renderer.json'],
  ['apps/desktop', 'src/renderer', 'tsconfig.json'],
].map(([pkg, src = 'src', tsconfig = 'tsconfig.json']) => ({
  pkg,
  src,
  tsconfig,
  name: src === 'src' ? pkg : `${pkg}/${src}`,
}));
const target = (pkg) => targets.find((t) => t.pkg === pkg);

// Each entry is one line of the leaking fixture.
const leaks = [
  "import { readFileSync } from 'node:fs';",
  "import { join } from 'path';",
  "import { app } from 'electron';",
  'export const a = process.env.HOME;',
  "export const b = Buffer.from('x');",
  "export const c = require('fs');",
  'export const d = __dirname;',
];

/**
 * Ways around `no-restricted-imports` and `no-restricted-globals`, one per line
 * (ESLint only: most of them are written to get past the type checker).
 */
const bypasses = [
  // The global object, cast or not, to reach a Node global.
  "export const a = (globalThis as { require?: (id: string) => unknown }).require?.('fs');",
  'export const b = (globalThis as unknown as { process: unknown }).process;',
  "export const c = (window as unknown as { require: (id: string) => unknown }).require('electron');",
  "export const d = globalThis['process' as keyof typeof globalThis];",
  "export const e = (globalThis as Record<string, unknown>)['pro' + 'cess'];",
  'export const f = self.window.process;',
  // The global object handed around: the property access is hidden from the linter.
  'export const g: Record<string, unknown> = globalThis;',
  "export const h = Reflect.get(globalThis, 'process');",
  'export const { process: i } = globalThis as unknown as { process: unknown };',
  // Code built from a string.
  "export const j = new Function('return process')();",
  "export const k = Function('return process')();",
  "export const l = eval('process');",
  "export const m = (0, eval)('process');",
  "export const n = globalThis.eval('process');",
  "export const o = setTimeout('process.exit()', 0);",
  // Dynamic imports and require, in every spelling.
  "export const p = import('node:fs');",
  "export const q = import('fs');",
  "export const r = import('electron');",
  'export const s = import(`electron`);',
  'export const t = (name: string) => import(name);',
  "export const u = import('node:' + 'fs');",
  "import v = require('fs');",
  "export type W = import('node:fs').Stats;",
  "export type X = typeof import('electron');",
  "export * from 'node:path';",
  "export { app } from 'electron';",
  "export const y = (load: (id: string) => unknown) => load('electron');",
  "export const z = (load: (id: string) => unknown) => load('node:fs');",
];

/** A relative path into another package (the Node side of the desktop platform, unless told otherwise). */
const relativeEscape = (t, module = 'packages/platform-desktop/src/main/doc-store') => {
  const from = path.join(root, t.pkg, t.src);
  const to = path.join(root, module);
  return `import '${path.relative(from, to).split(path.sep).join('/')}';`;
};

/** The network is closed to the packages that hold no host service. */
const networkLeaks = [
  "export const a = fetch('https://example.com');",
  'export const b = new XMLHttpRequest();',
  "export const c = new WebSocket('wss://example.com');",
  "export const d = new EventSource('https://example.com');",
  "export const e = globalThis.fetch('https://example.com');",
  "export const f = (globalThis as { fetch: typeof fetch }).fetch('https://example.com');",
];
const noNetwork = ['packages/schema', 'packages/platform', 'packages/core', 'packages/agents'];

const clean = [
  'export const ok: string = [1, 2].map(String).join();',
  // What the bypass rules must leave alone.
  "export const lazy = () => import('./lazy');",
  "export const inBrowser = typeof window !== 'undefined' && window === globalThis;",
  'export const later = globalThis.setTimeout(() => {}, 0);',
  'export const onKey = (event: globalThis.KeyboardEvent) => event.key;',
  "export const read = (map: Map<string, string>) => map.get('path') ?? map.get('url');",
];

/** Extra ESLint-only checks: layering and agent-specific globals. */
const layeringLeaks = {
  'packages/schema': ["import '@charpentier/core';"],
  'packages/core': ["import '@charpentier/platform-web';", "import '@charpentier/agents';"],
  'packages/agents': [
    "import '@charpentier/core';",
    'export const e = document.title;',
    'export const f = globalThis.document.title;',
    "export const g = import('@charpentier/core');",
  ],
  'packages/platform': ["import '@charpentier/platform-web';"],
  'packages/platform-web': [
    "import '@charpentier/platform-desktop';",
    "export const e = import('@charpentier/platform-desktop');",
    "import '@charpentier/core';",
  ],
  'apps/web': ["import '@charpentier/platform-desktop';"],
  'packages/platform-desktop/src/renderer': [
    "import '@charpentier/core';",
    "import '@charpentier/platform-web';",
    "import '../main/doc-store';",
  ],
  'packages/platform-desktop/src/shared': [
    "import '@charpentier/core';",
    "import '@charpentier/platform-web';",
    "import '../main/doc-store';",
  ],
  'apps/desktop': [
    "import '@charpentier/platform-web';",
    "import '../main/index';",
    "import '../preload/index';",
  ],
};

/** The rules that make up the guardrail: a leak caught by another rule is not caught. */
const guardRules = new Set([
  'no-restricted-imports',
  'no-restricted-globals',
  'no-eval',
  'no-implied-eval',
  'no-new-func',
  'charpentier/module-boundaries',
  'charpentier/no-host-global-access',
  'charpentier/transact-origin',
]);

const failures = [];

const eslint = new ESLint({ cwd: root });

/** @param {string} folder folder of the fixture, relative to the repository root */
async function lintLines(folder, lines) {
  const filePath = path.join(root, folder, '__guard_fixture__.ts');
  const [result] = await eslint.lintText(lines.join('\n') + '\n', { filePath });
  const flagged = new Set(
    result.messages.filter((m) => guardRules.has(m.ruleId)).map((m) => m.line),
  );
  return { result, flagged };
}

/** Every line must be rejected by a rule of the guardrail. */
async function mustReject(folder, lines, what, name = folder) {
  const { flagged } = await lintLines(folder, lines);
  lines.forEach((line, i) => {
    if (!flagged.has(i + 1)) failures.push(`${name}: ESLint accepts ${what}: ${line}`);
  });
  checked += lines.length;
}
let checked = 0;

function typecheck(t, lines) {
  const configPath = path.join(root, t.pkg, t.tsconfig);
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
  const fixturePath = path.join(root, t.pkg, t.src, '__guard_fixture__.ts');
  const fixtureText = lines.join('\n') + '\n';

  const host = ts.createCompilerHost(parsed.options);
  const { getSourceFile, fileExists, readFile } = host;
  host.fileExists = (f) => f === fixturePath || fileExists.call(host, f);
  host.readFile = (f) => (f === fixturePath ? fixtureText : readFile.call(host, f));
  host.getSourceFile = (f, lang, ...rest) =>
    f === fixturePath
      ? ts.createSourceFile(f, fixtureText, lang, true)
      : getSourceFile.call(host, f, lang, ...rest);

  const program = ts.createProgram({ rootNames: [fixturePath], options: parsed.options, host });
  const sourceFile = program.getSourceFile(fixturePath);
  const diagnostics = [
    ...program.getSyntacticDiagnostics(sourceFile),
    ...program.getSemanticDiagnostics(sourceFile),
  ];
  return new Set(
    diagnostics
      .filter((d) => d.file && d.start !== undefined)
      .map((d) => d.file.getLineAndCharacterOfPosition(d.start).line + 1),
  );
}

for (const t of targets) {
  const folder = path.join(t.pkg, t.src);

  // 1. Leaks must be caught by ESLint on every line.
  await mustReject(folder, leaks, 'a host API leak', t.name);

  // 2. Leaks must be caught by TypeScript on every line.
  const tsFlagged = typecheck(t, leaks);
  leaks.forEach((line, i) => {
    if (!tsFlagged.has(i + 1))
      failures.push(`${t.name}: TypeScript accepts a host API leak: ${line}`);
  });

  // 3. Clean code must pass both layers (positive control).
  const cleanLint = await lintLines(
    folder,
    // Agents have no `window`: that line is a leak there.
    clean.filter((line) => t.pkg !== 'packages/agents' || !line.includes('window')),
  );
  if (cleanLint.result.errorCount > 0) {
    failures.push(
      `${t.name}: ESLint rejects clean code: ${cleanLint.result.messages.map((m) => m.message).join('; ')}`,
    );
  }
  if (typecheck(t, [clean[0]]).size > 0) failures.push(`${t.name}: TypeScript rejects clean code`);

  // 4. Layering and agent-specific rules.
  await mustReject(folder, layeringLeaks[t.name] ?? [], 'a forbidden dependency', t.name);

  // 5. The ways around the core rules.
  await mustReject(folder, [...bypasses, relativeEscape(t)], 'a bypass', t.name);
  if (noNetwork.includes(t.pkg)) await mustReject(folder, networkLeaks, 'network access', t.name);
}

// 6. Node code: the Node side of the desktop platform stays free of Electron, a module
// is still named by a literal and reached by its package name, no code comes from a string.
await mustReject(
  'packages/platform-desktop/src/main',
  ["import { app } from 'electron';", "export const a = import('electron');"],
  'Electron outside apps/desktop',
);
for (const zone of nodeZones) {
  await mustReject(
    zone,
    [
      'export const a = (name: string) => import(name);',
      "export const b = new Function('return 1')();",
      relativeEscape({ pkg: zone, src: '.' }, 'packages/schema/src/index'),
    ],
    'a bypass',
  );
  const ok = await lintLines(zone, [
    "import { readFileSync } from 'node:fs';",
    'void readFileSync;',
  ]);
  if (ok.result.errorCount > 0) failures.push(`${zone}: ESLint rejects Node code in a Node zone`);
}

// 7. Every Yjs transaction names its origin (tests excepted: they build fixtures).
{
  const doc = 'declare const doc: { transact(f: () => void, origin?: unknown): void };';
  const Y = 'declare const Y: { transact(doc: unknown, f: () => void, origin?: unknown): void };';
  for (const folder of [
    'packages/schema/src',
    'packages/core/src',
    'packages/platform-desktop/src/main',
  ]) {
    const { flagged, result } = await lintLines(folder, [
      doc,
      Y,
      'doc.transact(() => {});',
      'doc.transact(() => {}, undefined);',
      'doc.transact(() => {}, null);',
      'Y.transact(doc, () => {});',
      "doc.transact(() => {}, { kind: 'system' });",
      "Y.transact(doc, () => {}, { kind: 'system' });",
    ]);
    for (const line of [3, 4, 5, 6])
      if (!flagged.has(line))
        failures.push(`${folder}: a transaction without origin is accepted (line ${line})`);
    for (const line of [7, 8])
      if (flagged.has(line)) failures.push(`${folder}: a transaction with an origin is rejected`);
    if (result.messages.some((m) => m.fatal))
      failures.push(`${folder}: transaction fixture does not parse`);
    checked += 4;
  }
}

// 8. Every folder of every workspace package is classified: host-agnostic (a target above,
// and ESLint applies the host-agnostic rules there) or Node (`nodeZones` of eslint.config.js).
{
  const covers = (zone, folder) => folder === zone || folder.startsWith(`${zone}/`);
  const agnosticZones = targets.map((t) => `${t.pkg}/${t.src}`);
  const workspace = ['apps', 'packages'].flatMap((group) =>
    readdirSync(path.join(root, group))
      .map((name) => `${group}/${name}`)
      .filter((pkg) => existsSync(path.join(root, pkg, 'package.json'))),
  );
  for (const pkg of workspace) {
    const src = `${pkg}/src`;
    if (!existsSync(path.join(root, src))) {
      failures.push(`${pkg}: no src folder, the guardrails cannot classify it`);
      continue;
    }
    const whole = [...agnosticZones, ...nodeZones].includes(src);
    const entries = readdirSync(path.join(root, src), { withFileTypes: true });
    const folders = whole
      ? [src]
      : [
          ...(entries.some((e) => e.isFile() && /\.[cm]?[jt]sx?$/.test(e.name)) ? [src] : []),
          ...entries.filter((e) => e.isDirectory()).map((e) => `${src}/${e.name}`),
        ];
    for (const folder of folders) {
      const asAgnostic = agnosticZones.some((zone) => covers(zone, folder));
      const asNode = nodeZones.some((zone) => covers(zone, folder));
      if (asAgnostic === asNode) {
        failures.push(
          `${folder}: ${asAgnostic ? 'classified twice' : 'not classified'} (a target of scripts/guard-selftest.mjs, or nodeZones of eslint.config.js)`,
        );
        continue;
      }
      const { rules = {} } = await eslint.calculateConfigForFile(
        path.join(root, folder, '__guard_fixture__.ts'),
      );
      const on = (rule) =>
        rules[rule] !== undefined && rules[rule][0] !== 0 && rules[rule][0] !== 'off';
      if (!on('charpentier/module-boundaries'))
        failures.push(`${folder}: eslint.config.js applies no module boundary there`);
      if (on('charpentier/no-host-global-access') !== asAgnostic)
        failures.push(
          `${folder}: ${asAgnostic ? 'host-agnostic for the self-test, but not' : 'Node code for the self-test, but host-agnostic'} for eslint.config.js`,
        );
    }
  }
  for (const zone of [...agnosticZones, ...nodeZones])
    if (!existsSync(path.join(root, zone)))
      failures.push(`${zone}: classified, but does not exist`);
}

// 9. No untranslated UI text in React code (all UI strings go through i18n).
for (const pkg of ['packages/core', 'apps/web', 'apps/desktop']) {
  const filePath = path.join(root, pkg, target(pkg).src, '__guard_fixture__.tsx');
  const uiLeaks = [
    'export const A = () => <p>Bonjour</p>;',
    "export const B = () => <p>{'Bonjour'}</p>;",
    'export const C = () => <button title="Fermer" />;',
    "export const D = () => <input aria-label={'Nom'} />;",
  ];
  const [result] = await eslint.lintText(uiLeaks.join('\n') + '\n', { filePath });
  const flagged = new Set(
    result.messages.filter((m) => m.ruleId === 'charpentier/no-ui-literal').map((m) => m.line),
  );
  uiLeaks.forEach((line, i) => {
    if (!flagged.has(i + 1)) failures.push(`${pkg}: ESLint accepts untranslated UI text: ${line}`);
  });
  const [ok] = await eslint.lintText(
    'export const E = ({ t }: { t: (k: string) => string }) => <p className="x">{t(\'k\')} 42</p>;\n',
    { filePath },
  );
  if (ok.messages.some((m) => m.ruleId === 'charpentier/no-ui-literal')) {
    failures.push(`${pkg}: no-ui-literal rejects translated text`);
  }
}

if (failures.length) {
  console.error('Guardrail self-test FAILED:\n' + failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
console.log(
  `Guardrail self-test passed: ${targets.length} host-agnostic zones, ${nodeZones.length} Node zones, ${checked} rejected fixture lines.`,
);
