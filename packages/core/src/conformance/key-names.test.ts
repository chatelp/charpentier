import { describe, expect, it } from 'vitest';
import fr from '../i18n/locales/fr.json';

declare global {
  // Vite's, declared here: the core has no types of its build tool.
  interface ImportMeta {
    glob<T>(
      pattern: string,
      options: { query: string; import: string; eager: true },
    ): Record<string, T>;
  }
}

// Vite gives the sources as text: every file of the core.
const sources = import.meta.glob<string>('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** The Mac's modifier signs, and the PC's names for the same keys. */
const MODIFIER = /[⌘⌥⌃⇧]|\b(Ctrl|Cmd|Maj|Alt)\+/;

const withoutComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

// DESIGN §5.0, rule 10: a shortcut shown is the one that works on the device that shows it.
// A modifier written in a text is right on one host and wrong on the others: every key name
// comes from the registry (`shortcutLabel`) or from the host's words (`useHostWords().key`).
describe('names of keys', () => {
  it('are never written in the catalogue', () => {
    const found: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (typeof node === 'string') {
        if (MODIFIER.test(node)) found.push(path);
      } else if (node && typeof node === 'object')
        for (const [key, value] of Object.entries(node)) walk(value, path ? `${path}.${key}` : key);
    };
    walk(fr, '');
    expect(found).toEqual([]);
  });

  it('are never written in the code, outside the two places that name them', () => {
    const found: string[] = [];
    // Not a check that passes for having read nothing.
    expect(Object.keys(sources).length).toBeGreaterThan(100);
    for (const [file, source] of Object.entries(sources)) {
      if (/\.test\.tsx?$/.test(file) || file.includes('/conformance/')) continue;
      // Where a chord becomes a label.
      if (file.endsWith('/commands/keybinding.ts')) continue;
      withoutComments(source)
        .split('\n')
        .forEach((line, index) => {
          if (!MODIFIER.test(line)) return;
          // The system's own key (⌃ on the Mac that simulates it, ⊞ on the X250), chosen by host.
          if (/primaryModifier === 'Meta' \?/.test(line)) return;
          found.push(`${file.replace('../', '')}:${index + 1}`);
        });
    }
    expect(found).toEqual([]);
  });
  // What broke the CI on 24 November 2026: a browser test that renders the app with the
  // machine's own modifier (⌘ on the Mac, Ctrl under Linux) and expects the Mac's sign. The
  // tests run on the Mac and under Linux: such an expectation says which machine it is for.
  it('are never expected in a browser test without saying for which machine', () => {
    const found: string[] = [];
    for (const [file, source] of Object.entries(sources)) {
      if (!file.endsWith('.browser.test.tsx')) continue;
      const lines = withoutComments(source).split('\n');
      lines.forEach((line, index) => {
        // A key's sign inside a string or a regular expression, not in a test's title.
        if (!/(['"`/])[^'"`/]*[⌘⌥⌃⇧][^'"`/]*\1/.test(line)) return;
        if (/^\s*(it|describe|test)(\.\w+)?\(/.test(line)) return;
        const around = lines.slice(Math.max(0, index - 2), index + 1).join('\n');
        if (/isMac|primary|'Meta'|"Meta"/.test(around)) return;
        found.push(`${file.replace('../', '')}:${index + 1}`);
      });
    }
    expect(found).toEqual([]);
  });
});
