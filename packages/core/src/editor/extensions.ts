import Blockquote from '@tiptap/extension-blockquote';
import Collaboration from '@tiptap/extension-collaboration';
import Document from '@tiptap/extension-document';
import HardBreak from '@tiptap/extension-hard-break';
import Italic from '@tiptap/extension-italic';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { Placeholder } from '@tiptap/extensions';
import { markInputRule, type AnyExtension } from '@tiptap/core';
import type * as Y from 'yjs';
import { CurrentBlock } from './current-block';
import { LanguageCheck } from './language-check';
import type { LanguageCheck as LanguageCheckFn } from '../language/checker';
import { SanitizePaste } from './sanitize-paste';
import { SceneBreak } from './scene-break';

/**
 * Nodes and marks of the scene editor. They must produce exactly the scene
 * schema of `@charpentier/schema` (checked by schema-conformity.test.ts):
 * only these, nothing else — no bold, no headings, no lists.
 */
/**
 * `*mot*` becomes italic when the opening star follows a space, an apostrophe
 * or opening punctuation: French writes « l’*Odyssée* », where TipTap's rule
 * (space required) would not fire. A lookbehind keeps the preceding
 * character out of the match, so it is not deleted.
 */
const ITALIC_STAR = /(?<=^|[\s\u00A0\u202F’'«“([—–-])(\*(?!\s+\*)((?:[^*]+))\*(?!\s+\*))$/;
const ITALIC_UNDERSCORE = /(?:^|\s)(_(?!\s+_)((?:[^_]+))_(?!\s+_))$/;

const FrenchItalic = Italic.extend({
  addInputRules() {
    return [
      markInputRule({ find: ITALIC_STAR, type: this.type }),
      markInputRule({ find: ITALIC_UNDERSCORE, type: this.type }),
    ];
  },
});

export const sceneSchemaExtensions: AnyExtension[] = [
  Document,
  Paragraph,
  Text,
  FrenchItalic,
  Blockquote.extend({ content: 'paragraph+' }),
  HardBreak.configure({ keepMarks: true }),
  SceneBreak,
];

/** Full editor setup, bound to one variant's Yjs fragment. */
export function sceneEditorExtensions(options: {
  fragment: Y.XmlFragment;
  placeholder: string;
  /** Spelling and typography, when available. */
  languageCheck?: LanguageCheckFn | null;
}): AnyExtension[] {
  return [
    ...sceneSchemaExtensions,
    // Binds the editor to the CRDT and provides undo/redo (Yjs undo manager).
    Collaboration.configure({ fragment: options.fragment }),
    Placeholder.configure({ placeholder: options.placeholder }),
    SanitizePaste,
    CurrentBlock,
    LanguageCheck.configure({ check: options.languageCheck ?? null, delayMs: 800 }),
  ];
}
