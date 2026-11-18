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

/** A speech tag after a line of dialogue: « , dit-elle », « ? demanda Paul », « ! s’écria-t-il ». */
const SPEECH_TAG =
  /[,!?…]\s*(?:s['’]\s*)?(?:dit|dis|demand|répon|répond|murmur|cri|s['’]écri|souffl|lan[cç]|repri|repren|fit|ajout|chuchot|hurl|soupir|répliqu|interromp|poursuiv|continu|grogn|gémi|balbuti|bredouill|protest|insist|avou|admit|coup)\p{L}*(?:-t)?(?:-(?:il|elle|ils|elles|on|je|tu|nous|vous)\b|\s+\p{Lu})/iu;

/**
 * A line of dialogue: the dash of French dialogue (« — », « – », « -- ») then
 * speech. A single hyphen opens a list item (the Compagnon's questions to the
 * author), unless the line carries a speech tag (choice of the author,
 * 18 November 2026: a list of questions is not dialogue).
 */
function isDialogueLine(line: string): boolean {
  if (/^(?:—|–|-{2})\s*\p{Lu}/u.test(line)) return true;
  return /^-\s*\p{Lu}/u.test(line) && SPEECH_TAG.test(line);
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
    if (isDialogueLine(trimmed) && !fromAuthor(trimmed.replace(/^[—–-]+\s*/, '')))
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

/**
 * A correction fixes a few words: the passage it replaces and its own text
 * stay short, whatever the ratio allows on a long passage.
 */
export const MAX_CORRECTION_LENGTH = 200;
/** A correction may be this much longer than its passage (a missing word, an agreement). */
export const MAX_CORRECTION_GROWTH = 30;

/**
 * Sentences of a passage, counted by the closing punctuation that text
 * follows. Stricter than `sentencesOf`: a sentence added without its capital
 * counts, and giving a sentence the capital it lacked adds none.
 */
const sentenceCount = (text: string) => 1 + (text.match(/[.!?…]+(?=[^.!?…]*\p{L})/gu) ?? []).length;

/**
 * A language correction the author may accept (D-11): it stays a correction
 * of its passage and cannot carry new text. Short passage, short correction,
 * one line, no sentence more than the passage has, few characters added, and
 * a bounded share of the passage changed.
 */
export function isBoundedCorrection(quote: string, correction: string): boolean {
  const from = quote.trim();
  const to = correction.trim();
  if (!from || !/\p{L}/u.test(to)) return false;
  if ([...from].length > MAX_CORRECTION_LENGTH || [...to].length > MAX_CORRECTION_LENGTH)
    return false;
  if (/[\n\r\u2028\u2029]/.test(correction)) return false;
  if ([...to].length - [...from].length > MAX_CORRECTION_GROWTH) return false;
  if (sentenceCount(to) > sentenceCount(from)) return false;
  return changeRatio(from, to) <= MAX_CORRECTION_RATIO;
}
