#!/usr/bin/env node
// Checks the license of every installed dependency (all workspace packages).
// Permissive licenses pass. Anything else must be listed, with a reason, in
// licenses.exceptions.json. Strong copyleft is always rejected.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ALLOWED = new Set([
  'MIT',
  'MIT-0',
  'ISC',
  '0BSD',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'CC0-1.0',
  'CC-BY-4.0',
  'Unlicense',
  'Python-2.0',
  'Zlib',
]);

const STRONG_COPYLEFT = /\b(A?GPL|SSPL|EUPL|OSL|CPAL|RPL|Commons-Clause|BUSL)/i;

const list = (prodOnly) => {
  const args = ['-r', 'licenses', 'list', '--json', ...(prodOnly ? ['--prod'] : [])];
  const out = execFileSync('pnpm', args, { encoding: 'utf8' }).trim();
  if (!out.startsWith('{')) return [];
  return Object.entries(JSON.parse(out)).flatMap(([license, pkgs]) =>
    pkgs.map((p) => ({ name: p.name, versions: p.versions, license })),
  );
};

const { exceptions } = JSON.parse(
  readFileSync(new URL('../licenses.exceptions.json', import.meta.url), 'utf8'),
);
const matches = (pattern, name) =>
  pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : pattern === name;
const findException = (dep) =>
  exceptions.find((e) => matches(e.package, dep.name) && e.license === dep.license);

// An SPDX expression like "(MIT OR Apache-2.0)" passes if one alternative is allowed.
const isAllowed = (license) =>
  license
    .replace(/[()]/g, '')
    .split(/\s+OR\s+/i)
    .some((l) => ALLOWED.has(l.trim()));

const all = list(false);
const prodNames = new Set(list(true).map((d) => d.name));
const problems = [];

for (const dep of all) {
  const label = `${dep.name}@${dep.versions.join(',')} (${dep.license})`;
  if (isAllowed(dep.license)) continue;
  if (STRONG_COPYLEFT.test(dep.license)) {
    problems.push(`${label}: strong copyleft or non-open license, refused`);
    continue;
  }
  const exception = findException(dep);
  if (!exception) {
    problems.push(
      `${label}: not in the allowlist and no reviewed exception in licenses.exceptions.json`,
    );
  } else if (exception.scope === 'dev' && prodNames.has(dep.name)) {
    problems.push(`${label}: exception is dev-only but the package is a production dependency`);
  }
}

if (problems.length) {
  console.error('License check FAILED:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log(`License check passed: ${all.length} dependencies (${prodNames.size} in production).`);
