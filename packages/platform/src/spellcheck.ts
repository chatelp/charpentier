/**
 * Offline spelling (docs/SPEC.md §8, D-10): Hunspell with the French
 * dictionary. Core splits the text into words (elisions, hyphens) and asks
 * which ones are unknown; the host runs the dictionary (a worker thread on
 * the desktop).
 */
export interface SpellcheckService {
  /** The words of `words` the dictionary does not know (each listed once). */
  misspelled(words: readonly string[], language: string): Promise<readonly string[]>;
  suggest(word: string, language: string): Promise<readonly string[]>;
}
