import { describe, expect, it } from 'vitest';
import { createLanguageChecker } from './checker';

const dictionary = new Set(['il', 'pleuvait', 'sur', 'demanda', 't', 'elle', 'regarde', 'Odyssée']);
const spellcheck = {
  // Like Hunspell: a capitalized word is fine when its lower-case form is known.
  misspelled: async (words: readonly string[]) =>
    words.filter((w) => !dictionary.has(w) && !dictionary.has(w.toLowerCase())),
  suggest: async () => [],
};

describe('language checker', () => {
  it('finds spelling and typography issues, sparing known words and good hyphenations', async () => {
    const check = createLanguageChecker({
      spellcheck,
      language: 'fr',
      knownWords: () => new Set(['Hélène']),
    });
    const issues = await check('Il pleuvai sur Hélène, demanda-t-elle? Il regarde l’Odyssée.');
    expect(issues.map((i) => `${i.kind}:${i.rule}`)).toEqual([
      'spelling:pleuvai',
      'typography:space-before-high-punctuation',
    ]);
  });

  it('works without a dictionary (typography only)', async () => {
    const check = createLanguageChecker({
      spellcheck: null,
      language: 'fr',
      knownWords: () => new Set(),
    });
    expect((await check('Xyzzy?')).map((i) => i.kind)).toEqual(['typography']);
  });
});
