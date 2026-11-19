import type { Editor } from '@tiptap/core';

/**
 * A text of the Compagnon enters the manuscript on a gesture of the author
 * (D-11), as plain text in one transaction: it is never parsed (a string given to `insertContent` is read as HTML,
 * where `<p>Un.</p><p>deux</p>` makes two paragraphs).
 */

/** Inserts the example sentence at the cursor, as text. False when there is nothing to insert. */
export function insertExample(editor: Editor, example: string): boolean {
  const text = oneLine(example);
  if (!text) return false;
  return editor
    .chain()
    .focus()
    .command(({ tr }) => {
      tr.insertText(text);
      return true;
    })
    .run();
}

/**
 * Replaces the passage of a language correction, only while it still reads
 * what the correction was written for (`quote`, stored with the suggestion):
 * a passage the author has rewritten since is left alone. A correction
 * without its passage (raised before it was stored) cannot be checked, and is
 * not applied either. False when nothing was replaced.
 */
export function applyCorrection(
  editor: Editor,
  range: { readonly from: number; readonly to: number },
  quote: string | undefined,
  correction: string,
): boolean {
  const text = oneLine(correction);
  const { doc } = editor.state;
  if (!text || quote === undefined) return false;
  if (range.from < 0 || range.to > doc.content.size || range.to <= range.from) return false;
  // A block boundary inside the range reads as a line break, which no stored passage has.
  if (doc.textBetween(range.from, range.to, '\n', '\n') !== quote) return false;
  return editor
    .chain()
    .focus()
    .command(({ tr }) => {
      tr.insertText(text, range.from, range.to);
      return true;
    })
    .run();
}

/** One line of text: line and paragraph breaks become a space (no-break spaces are kept). */
const oneLine = (text: string) => text.replace(/[\n\r\t\u2028\u2029]+/g, ' ').trim();
