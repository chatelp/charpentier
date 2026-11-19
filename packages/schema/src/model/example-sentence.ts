/**
 * The example sentence (docs/SPEC.md §18, D-11): the only text of the
 * Compagnon that may enter the manuscript, on the author's gesture. One
 * sentence, and a short one. The bound lives here, in the agnostic schema,
 * so that whoever produces an example, stores it or inserts it checks the
 * same thing: the agents when the model answers, the mentor document when
 * the answer is stored, the interface when the author inserts it.
 */

/** At most one sentence, and a short one. */
export const MAX_EXAMPLE_LENGTH = 280;

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

/** An example sentence the author may insert (D-11): one sentence, bounded, on one line. */
export function isOneSentence(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= MAX_EXAMPLE_LENGTH &&
    !/[\n\r\u2028\u2029]/.test(trimmed) &&
    sentencesOf(trimmed).length === 1
  );
}

/**
 * The example as it may be stored and inserted: trimmed, or undefined when
 * it is not one bounded sentence (rejected whole, never cut).
 */
export function exampleSentence(text: unknown): string | undefined {
  if (typeof text !== 'string') return undefined;
  const trimmed = text.trim();
  return isOneSentence(trimmed) ? trimmed : undefined;
}
