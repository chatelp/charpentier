#!/usr/bin/env node
// Self-test of the "no host API in host-agnostic code" guardrail.
//
// For every host-agnostic package, a virtual fixture that leaks Node or
// Electron APIs is fed to both ESLint and the TypeScript compiler, using the
// package's real configuration. Every leaking line must be rejected by both
// layers, and a clean fixture must be accepted. If someone weakens a tsconfig
// or the ESLint config, this script fails.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const packages = [
  'packages/schema',
  'packages/platform',
  'packages/core',
  'packages/agents',
  'packages/platform-web',
  'apps/web',
];

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

const clean = ['export const ok: string = [1, 2].map(String).join();'];

/** Extra ESLint-only checks: layering and agent-specific globals. */
const layeringLeaks = {
  'packages/schema': ["import '@charpentier/core';"],
  'packages/core': ["import '@charpentier/platform-web';", "import '@charpentier/agents';"],
  'packages/agents': ["import '@charpentier/core';", 'export const e = document.title;'],
  'packages/platform': ["import '@charpentier/platform-web';"],
};

const failures = [];

const eslint = new ESLint({ cwd: root });

async function lintLines(pkg, lines, label) {
  const filePath = path.join(root, pkg, 'src', '__guard_fixture__.ts');
  const [result] = await eslint.lintText(lines.join('\n') + '\n', { filePath });
  const flagged = new Set(
    result.messages
      .filter((m) => m.ruleId === 'no-restricted-imports' || m.ruleId === 'no-restricted-globals')
      .map((m) => m.line),
  );
  return { result, flagged, label };
}

function typecheck(pkg, lines) {
  const configPath = path.join(root, pkg, 'tsconfig.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
  const fixturePath = path.join(root, pkg, 'src', '__guard_fixture__.ts');
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

for (const pkg of packages) {
  // 1. Leaks must be caught by ESLint on every line.
  const { flagged } = await lintLines(pkg, leaks);
  leaks.forEach((line, i) => {
    if (!flagged.has(i + 1)) failures.push(`${pkg}: ESLint accepts a host API leak: ${line}`);
  });

  // 2. Leaks must be caught by TypeScript on every line.
  const tsFlagged = typecheck(pkg, leaks);
  leaks.forEach((line, i) => {
    if (!tsFlagged.has(i + 1)) failures.push(`${pkg}: TypeScript accepts a host API leak: ${line}`);
  });

  // 3. Clean code must pass both layers (positive control).
  const cleanLint = await lintLines(pkg, clean);
  if (cleanLint.result.errorCount > 0) {
    failures.push(
      `${pkg}: ESLint rejects clean code: ${cleanLint.result.messages.map((m) => m.message).join('; ')}`,
    );
  }
  if (typecheck(pkg, clean).size > 0) failures.push(`${pkg}: TypeScript rejects clean code`);

  // 4. Layering and agent-specific rules.
  const extra = layeringLeaks[pkg] ?? [];
  if (extra.length) {
    const { flagged: extraFlagged } = await lintLines(pkg, extra);
    extra.forEach((line, i) => {
      if (!extraFlagged.has(i + 1))
        failures.push(`${pkg}: ESLint accepts a forbidden dependency: ${line}`);
    });
  }
}

// 5. No untranslated UI text in React code (all UI strings go through i18n).
for (const pkg of ['packages/core', 'apps/web']) {
  const filePath = path.join(root, pkg, 'src', '__guard_fixture__.tsx');
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
console.log(`Guardrail self-test passed for ${packages.length} host-agnostic packages.`);
