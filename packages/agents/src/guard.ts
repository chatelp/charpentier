/**
 * The « AI never writes the novel » guardrails (docs/SPEC.md §18, D-11),
 * applied to every answer of the Compagnon before it reaches the author.
 * An answer that breaks them is rejected (another attempt, or a refusal),
 * never silently cut.
 */

/** At most one sentence, and a short one. */
export const MAX_EXAMPLE_LENGTH = 280;
/** A quotation longer than this must come from the author's own text. */
const MAX_FOREIGN_QUOTE = 80;

const normalize = (s: string) =>
  s
    .normalize('NFC')
    .replace(/[’']/g, "'")
    .replace(/[«»“”"]/g, '"')
    .replace(/[\s\u00A0\u202F]+/g, ' ')
    .trim()
    .toLowerCase();

/**
 * Sentences of a text. French dialogue keeps going after « ? » or « ! » when
 * the next word is lower-case (« Tu viens ? demanda-t-elle. » is one sentence).
 */
export function sentencesOf(text: string): string[] {
  const flat = text.replace(/\s+/g, ' ').trim();
  const sentences: string[] = [];
  const boundary =
    /[.!?…]+(?:[\s\u00A0\u202F]*[»"”)])?(?=[\s\u00A0\u202F]+[«"“—–-]?[\s\u00A0]*\p{Lu}|[\s\u00A0\u202F]*$)/gu;
  let start = 0;
  for (const match of flat.matchAll(boundary)) {
    const end = (match.index ?? 0) + match[0].length;
    sentences.push(flat.slice(start, end).trim());
    start = end;
  }
  if (start < flat.length) sentences.push(flat.slice(start).trim());
  return sentences.filter((s) => /\p{L}/u.test(s));
}

/** An example sentence the author may insert (D-11): one sentence, bounded. */
export function isOneSentence(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= MAX_EXAMPLE_LENGTH &&
    !/\n/.test(trimmed) &&
    sentencesOf(trimmed).length === 1
  );
}

export interface ProseViolation {
  readonly kind: 'dialogue' | 'quote' | 'example';
  readonly excerpt: string;
}

/**
 * Narrative text the Compagnon must not produce: lines of dialogue, or
 * passages presented as text (quotes, quoted blocks) that are not the
 * author's own words.
 */
export function narrativeProseIn(answer: string, authorText: string): ProseViolation[] {
  const author = normalize(authorText);
  const fromAuthor = (s: string) => author.includes(normalize(s));
  const violations: ProseViolation[] = [];

  for (const line of answer.split('\n')) {
    const trimmed = line.trim();
    // A dialogue line: dash then speech.
    if (/^(?:—|–|-{1,2})\s*\p{Lu}/u.test(trimmed) && !fromAuthor(trimmed.replace(/^[—–-]+\s*/, '')))
      violations.push({ kind: 'dialogue', excerpt: trimmed.slice(0, 120) });
    // A quoted block.
    if (/^>/.test(trimmed)) {
      const quoted = trimmed.replace(/^>\s*/, '');
      if (quoted.length > MAX_FOREIGN_QUOTE && !fromAuthor(quoted))
        violations.push({ kind: 'quote', excerpt: quoted.slice(0, 120) });
    }
  }
  for (const match of answer.matchAll(/«\s*([^»]+?)\s*»|“([^”]+)”|"([^"\n]+)"/gu)) {
    const quoted = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (quoted.length > MAX_FOREIGN_QUOTE && sentencesOf(quoted).length > 1 && !fromAuthor(quoted))
      violations.push({ kind: 'quote', excerpt: quoted.slice(0, 120) });
  }
  return violations;
}

/** Edit distance ratio between a segment and its correction (a correction must stay a correction). */
export function changeRatio(original: string, corrected: string): number {
  const a = [...original];
  const b = [...corrected];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++)
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    previous = current;
  }
  return (previous[b.length] ?? 0) / Math.max(1, a.length);
}

/** A language correction may change at most this share of its segment. */
export const MAX_CORRECTION_RATIO = 0.35;
