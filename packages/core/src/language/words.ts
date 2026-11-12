/** A word to check, with its offsets in the text. */
export interface WordToken {
  readonly from: number;
  readonly to: number;
  readonly word: string;
}

/** French elided prefixes: l’, d’, qu’, jusqu’… are checked apart from the word. */
const ELISION = /^(?:[ldjmnstc]|qu|jusqu|lorsqu|puisqu|quoiqu|quelqu)[’']/iu;

/**
 * Words of a text for the spellchecker: letters, inner apostrophes and
 * hyphens. Elisions are split off (`l’Odyssée` → `Odyssée`); numbers and
 * single letters are skipped.
 */
export function wordsOf(text: string): WordToken[] {
  const tokens: WordToken[] = [];
  const pattern = /\p{L}+(?:[’'-]\p{L}+)*/gu;
  for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
    let from = m.index;
    let word = m[0];
    const elided = ELISION.exec(word);
    if (elided) {
      from += elided[0].length;
      word = word.slice(elided[0].length);
    }
    if (word.length > 1) tokens.push({ from, to: from + word.length, word });
  }
  return tokens;
}

/** Parts to try when a hyphenated word is unknown as a whole (« demanda-t-elle »). */
export function hyphenParts(word: string): string[] {
  return word.split('-').filter((part) => part.length > 1);
}
