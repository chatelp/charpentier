import { describe, expect, it } from 'vitest';
import { createI18n } from './i18n';
import fr from './locales/fr.json';

function texts(node: unknown, path: string[] = []): { key: string; text: string }[] {
  if (typeof node === 'string') return [{ key: path.join('.'), text: node }];
  if (node === null || typeof node !== 'object') return [];
  return Object.entries(node).flatMap(([key, child]) => texts(child, [...path, key]));
}

const catalogue = texts(fr);
const failing = (pattern: RegExp, except: readonly string[] = []) =>
  catalogue
    .filter(({ key, text }) => !except.includes(key) && pattern.test(text))
    .map((e) => e.key);

/**
 * The catalogue is read on a Mac and on the X250 (Linux, no ⌘): what depends
 * on the host is interpolated, from the commands registry for the keys.
 */
describe('the French catalogue and the host', () => {
  it('names no Mac modifier key: shortcuts are interpolated', () => {
    expect(failing(/[⌘⌥⌃]/u)).toEqual([]);
  });

  it('names the Finder in one place only, the Mac’s file manager', () => {
    expect(failing(/Finder/u, ['library.fileManager.mac'])).toEqual([]);
  });

  it('writes the Enter and Escape keys one way: « ⏎ », « Échap »', () => {
    expect(failing(/↵|\béchap\b|\bEsc\b|Echap/u)).toEqual([]);
  });

  it('says where the library folder is shown, per host', async () => {
    const { t } = await createI18n('fr');
    expect(t('library.revealFolder', { fileManager: t('library.fileManager.mac') })).toBe(
      'Afficher dans le Finder',
    );
    expect(t('commands.revealLibraryFolder', { fileManager: t('library.fileManager.other') })).toBe(
      'Afficher la bibliothèque dans le gestionnaire de fichiers',
    );
  });
});
