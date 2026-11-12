import type { Editor } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import { ySyncPluginKey } from '@tiptap/y-tiptap';
import { useEffect, useState, type RefObject } from 'react';
import { countWords } from '../editor/word-count';

/** Words of the open variant, updated on every change. */
export function useWordCount(editor: Editor | null): number {
  const [words, setWords] = useState(0);
  useEffect(() => {
    if (!editor) {
      setWords(0);
      return;
    }
    const update = () => {
      const { doc } = editor.state;
      setWords(countWords(doc.textBetween(0, doc.content.size, ' ', ' ')));
    };
    update();
    editor.on('update', update);
    return () => {
      editor.off('update', update);
    };
  }, [editor]);
  return words;
}

/** Where the current line stays, as a share of the window's height. */
export const TYPEWRITER_LINE = 0.42;

/**
 * Typewriter scrolling (docs/DESIGN.md §4.1): while writing from the
 * keyboard, the current line stays around 42 % of the height. Clicks and
 * changes from another device never move the page.
 */
export function useTypewriterScroll(
  editor: Editor | null,
  scroller: RefObject<HTMLElement | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!editor || !enabled) return;
    const onTransaction = ({ transaction }: { transaction: Transaction }) => {
      if (transaction.getMeta('pointer')) return;
      // Changes merged from another replica.
      const sync = transaction.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean } | undefined;
      if (sync?.isChangeOrigin) return;
      if (!transaction.docChanged && !transaction.selectionSet) return;
      const element = scroller.current;
      if (!element || !editor.view.hasFocus()) return;
      try {
        const caret = editor.view.coordsAtPos(editor.state.selection.head);
        const box = element.getBoundingClientRect();
        const delta = caret.top - (box.top + box.height * TYPEWRITER_LINE);
        if (Math.abs(delta) > 1) element.scrollTop += delta;
      } catch {
        // No layout (e.g. a DOM without rendering): nothing to scroll.
      }
    };
    editor.on('transaction', onTransaction);
    return () => {
      editor.off('transaction', onTransaction);
    };
  }, [editor, enabled, scroller]);
}
