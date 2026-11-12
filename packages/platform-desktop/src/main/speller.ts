import nspell from 'nspell';

/** Hunspell (nspell) over a dictionary's affix and word files (docs/SPEC.md §8, D-10). */
export function createSpeller(aff: Uint8Array, dic: Uint8Array) {
  const spell = nspell(Buffer.from(aff), Buffer.from(dic));
  // Typographic apostrophes: the dictionary is written with straight ones.
  const plain = (word: string) => word.replace(/’/g, "'");
  return {
    misspelled(words: readonly string[]): string[] {
      return [...new Set(words)].filter((w) => !spell.correct(w) && !spell.correct(plain(w)));
    },
    suggest(word: string): string[] {
      const typographic = word.includes('’');
      return spell
        .suggest(plain(word))
        .slice(0, 8)
        .map((s) => (typographic ? s.replace(/'/g, '’') : s));
    },
  };
}

export type Speller = ReturnType<typeof createSpeller>;

export type SpellQuery =
  | { readonly type: 'misspelled'; readonly words: readonly string[] }
  | { readonly type: 'suggest'; readonly word: string };

export type SpellRequest = SpellQuery & { readonly id: number };

export type SpellResponse =
  | { readonly id: number; readonly result: readonly string[] }
  | { readonly id: number; readonly error: string };
