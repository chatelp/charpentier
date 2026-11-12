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
/** Height of text (share of the window) over which the scrolling catches up with that line. */
export const TYPEWRITER_RAMP = 0.4;

/**
 * Where the page scrolls for a caret `offset` px below the top of the
 * content, the text starting at `start`, in a window `height` high. At the
 * start of a scene nothing moves (its opening stays in view); the line then
 * reaches 42 % gradually and stays there.
 */
export function typewriterScrollTop(offset: number, start: number, height: number): number {
  const pinned = offset - height * TYPEWRITER_LINE;
  if (pinned <= 0) return 0;
  const end = start + height * TYPEWRITER_RAMP;
  if (offset >= end) return pinned;
  return Math.max(0, (pinned * (offset - start)) / (end - start));
}

/**
 * Typewriter scrolling (docs/DESIGN.md §4.1): while writing from the
 * keyboard, the current line stays around 42 % of the height, once the
 * opening of the scene has been written past. Clicks and changes from
 * another device never move the page.
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
        const inContent = (y: number) => y - box.top + element.scrollTop;
        const target = typewriterScrollTop(
          inContent(caret.top),
          inContent(editor.view.dom.getBoundingClientRect().top),
          box.height,
        );
        if (Math.abs(target - element.scrollTop) > 1) element.scrollTop = target;
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

/** Keys that write or erase (not shortcuts, not moves). */
const isWriting = (event: KeyboardEvent) =>
  !event.metaKey &&
  !event.ctrlKey &&
  !event.altKey &&
  (event.key.length === 1 || ['Backspace', 'Delete', 'Enter'].includes(event.key));

/** After this pause the entry points come back by themselves. */
export const TYPING_PAUSE_MS = 3000;

/**
 * True from the first keystroke in the text until the mouse moves, Échap is
 * pressed or the author pauses (docs/DESIGN.md §4.8): the entry points fade
 * meanwhile, the counter, state and pastilles stay.
 */
export function useTypingFade(editor: Editor | null): boolean {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const dom = editor.view.dom;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      clearTimeout(timer);
      setTyping(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return stop();
      if (!isWriting(event)) return;
      setTyping(true);
      clearTimeout(timer);
      timer = setTimeout(stop, TYPING_PAUSE_MS);
    };
    // A real move of the mouse (not the page scrolling under a still pointer).
    const onMouseMove = (event: MouseEvent) => {
      if (event.movementX !== 0 || event.movementY !== 0) stop();
    };
    dom.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousemove', onMouseMove);
    return () => {
      clearTimeout(timer);
      dom.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, [editor]);
  return typing;
}
