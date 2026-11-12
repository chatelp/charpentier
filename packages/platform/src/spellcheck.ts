/** Offline spelling check (docs/SPEC.md §8, D-10). Implemented in phase 3.1. */
export interface SpellcheckService {
  check(text: string, language: string): Promise<readonly Misspelling[]>;
  suggest(word: string, language: string): Promise<readonly string[]>;
}

export interface Misspelling {
  /** UTF-16 offsets into the checked text. */
  readonly from: number;
  readonly to: number;
  readonly word: string;
}
