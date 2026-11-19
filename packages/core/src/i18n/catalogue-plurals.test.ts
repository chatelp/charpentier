import { describe, expect, it } from 'vitest';
import { createI18n } from './i18n';
import fr from './locales/fr.json';

function texts(node: unknown, path: string[] = []): { key: string; text: string }[] {
  if (typeof node === 'string') return [{ key: path.join('.'), text: node }];
  if (node === null || typeof node !== 'object') return [];
  return Object.entries(node).flatMap(([key, child]) => texts(child, [...path, key]));
}

describe('the French catalogue’s plurals', () => {
  it('gives a singular to every text that counts something', () => {
    // Texts only shown from two up (the call site says so).
    const alwaysPlural = [
      'versions.firstTypingMany',
      'notebook.source.interviewMany',
      'notebook.source.conversationMany',
    ];
    const counted = texts(fr)
      .filter(({ text }) => /\{\{count\}\} \p{L}/u.test(text))
      .map(({ key }) => key)
      .filter((key) => !alwaysPlural.includes(key) && !/_(one|other)$/.test(key));
    expect(counted).toEqual([]);
  });

  it('agrees with one: « 1 autre », « 1 scène lue », « 1 mot »', async () => {
    const { t } = await createI18n('fr');
    expect(t('work.others', { count: 1 })).toBe('et 1 autre ›');
    expect(t('work.others', { count: 2 })).toBe('et 2 autres ›');
    expect(t('work.read', { count: 1, total: 1 })).toBe('1 scène lue sur 1');
    expect(t('work.read', { count: 3, total: 12 })).toBe('3 scènes lues sur 12');
    expect(t('work.scenes', { count: 1 })).toBe('1 scène');
    expect(t('work.words', { count: 1, formatted: '1' })).toBe('1 mot');
    expect(t('work.words', { count: 1200, formatted: '1 200' })).toBe('1 200 mots');
    expect(t('overview.variants', { count: 1 })).toBe('1 variante');
    expect(
      t('overview.previewWordsLess', { count: 1, words: '1', delta: '1', variant: 'Principale' }),
    ).toBe('1 mot, soit 1 de moins qu’aujourd’hui · Principale');
    expect(
      t('overview.previewWordsMore', { count: 40, words: '40', delta: '2', variant: 'Principale' }),
    ).toBe('40 mots, soit 2 de plus qu’aujourd’hui · Principale');
  });
});
