import { dictionaryWords, listEntities } from '@charpentier/schema';
import type * as Y from 'yjs';
import { wordsOf } from './words';

/** Words the spellchecker must accept: the project's dictionary and its characters' names. */
export function knownWordsOf(root: Y.Doc): ReadonlySet<string> {
  const known = new Set(dictionaryWords(root));
  for (const character of listEntities(root, 'characters')) {
    const name = character.fields['name'];
    const value = name?.value ?? name?.proposal?.value;
    if (typeof value === 'string') for (const token of wordsOf(value)) known.add(token.word);
  }
  return known;
}
