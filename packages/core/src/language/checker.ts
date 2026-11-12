import type { SpellcheckService } from '@charpentier/platform';
import type { LanguageIssue } from './issues';
import { typographyIssues } from './typography';
import { hyphenParts, wordsOf } from './words';

export interface LanguageCheckerOptions {
  readonly spellcheck: SpellcheckService | null;
  readonly language: string;
  /** Words the project accepts (its dictionary, its characters' names). */
  readonly knownWords: () => ReadonlySet<string>;
}

/** Typography (always, offline) and spelling (when the host has a dictionary) of one paragraph. */
export function createLanguageChecker(options: LanguageCheckerOptions) {
  return async function check(text: string): Promise<LanguageIssue[]> {
    const issues = typographyIssues(text);
    const { spellcheck } = options;
    if (!spellcheck) return issues;
    const known = options.knownWords();
    const tokens = wordsOf(text).filter((t) => !known.has(t.word));
    if (tokens.length === 0) return issues;
    const candidates = new Set<string>();
    for (const token of tokens) {
      candidates.add(token.word);
      if (token.word.includes('-'))
        for (const part of hyphenParts(token.word)) candidates.add(part);
    }
    const unknown = new Set(await spellcheck.misspelled([...candidates], options.language));
    for (const token of tokens) {
      if (!unknown.has(token.word)) continue;
      // « demanda-t-elle »: fine when each part is.
      if (token.word.includes('-') && hyphenParts(token.word).every((p) => !unknown.has(p)))
        continue;
      issues.push({ from: token.from, to: token.to, kind: 'spelling', rule: token.word });
    }
    return issues.sort((a, b) => a.from - b.from);
  };
}

export type LanguageCheck = ReturnType<typeof createLanguageChecker>;
