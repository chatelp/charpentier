import { Schema } from 'prosemirror-model';

/**
 * ProseMirror schema of a scene's text (docs/SPEC.md §15.6, D-13).
 *
 * Deliberately small: paragraphs, italic, block quotes (letters, epigraphs),
 * a scene-internal break, and hard line breaks. The fewer constructs, the
 * safer the Markdown round trip.
 *
 * Node and mark names match TipTap's built-in extensions (`paragraph`,
 * `blockquote`, `hardBreak`, `italic`) so that the editor, y-prosemirror and
 * this schema agree on the Yjs representation. The editor's schema must stay
 * identical to this one (checked in phase 1.5).
 */
export const sceneSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    blockquote: {
      group: 'block',
      content: 'paragraph+',
      defining: true,
      parseDOM: [{ tag: 'blockquote' }],
      toDOM: () => ['blockquote', 0],
    },
    sceneBreak: {
      group: 'block',
      parseDOM: [{ tag: 'hr' }],
      toDOM: () => ['hr', { class: 'scene-break' }],
    },
    text: { group: 'inline' },
    hardBreak: {
      group: 'inline',
      inline: true,
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM: () => ['br'],
    },
  },
  marks: {
    italic: {
      parseDOM: [{ tag: 'em' }, { tag: 'i' }, { style: 'font-style=italic' }],
      toDOM: () => ['em', 0],
    },
  },
});

export type SceneSchema = typeof sceneSchema;
