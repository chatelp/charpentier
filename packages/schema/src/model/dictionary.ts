import type * as Y from 'yjs';
import { AUTHOR, type Origin } from './origins';

/**
 * The project's own words (names, invented words), accepted by the author so
 * that the spellchecker no longer flags them. A top-level map keyed by word:
 * two devices adding words at once merge.
 */
const dictionary = (doc: Y.Doc) => doc.getMap<true>('dictionary');

export function addToDictionary(doc: Y.Doc, word: string, origin: Origin = AUTHOR): void {
  doc.transact(() => dictionary(doc).set(word.normalize('NFC'), true), origin);
}

export function removeFromDictionary(doc: Y.Doc, word: string, origin: Origin = AUTHOR): void {
  doc.transact(() => dictionary(doc).delete(word.normalize('NFC')), origin);
}

export function dictionaryWords(doc: Y.Doc): ReadonlySet<string> {
  return new Set(dictionary(doc).keys());
}
