/**
 * Words of a scene, as a writer counts them: runs of characters between
 * spaces (no-break spaces included) that contain a letter or a digit. Lone
 * punctuation (a dialogue dash, « », ?) is not a word; `l’Odyssée` is one.
 */
export function countWords(text: string): number {
  let count = 0;
  for (const token of text.split(/[\s\u00A0\u202F]+/u)) {
    if (/[\p{L}\p{N}]/u.test(token)) count++;
  }
  return count;
}
