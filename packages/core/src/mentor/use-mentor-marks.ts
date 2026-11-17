import { listVersionSignals, type Signal } from '@charpentier/schema';
import type { Editor } from '@tiptap/core';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type * as Y from 'yjs';
import { useDocSnapshot } from '../hooks/use-doc-snapshot';
import { placedSignals, signalAtCursor, type SignalDecorationsOptions } from './signal-decorations';

/** The open remarks the active working version shows (DESIGN 1.20). */
const readOpenSignals = (doc: Y.Doc) => listVersionSignals(doc, { state: 'open' });

export interface OpenNote {
  readonly id: string;
  /** Opened from the keyboard or a click: the note takes the focus. */
  readonly focus: boolean;
}

/**
 * State of the Compagnon's marks in the writing surface: which remarks are
 * open, which note is unfolded (after a pause with the cursor in its passage,
 * or on request), and where it goes in the margin.
 */
export function useMentorMarks(options: {
  readonly root: Y.Doc;
  readonly sceneId: string;
  readonly variantId: string;
  readonly editor: Editor | null;
  readonly page: RefObject<HTMLElement | null>;
  /** Pause before a note unfolds by itself (docs/DESIGN.md §3.4; the slider sets it). */
  readonly pauseMs: number | null;
  /** Narrow window: the note unfolds under its paragraph, in this element (docs/DESIGN.md §4.2). */
  readonly noteSlot: HTMLElement | null;
}) {
  const { root, sceneId, variantId, editor, page, pauseMs, noteSlot } = options;
  const openSignals = useDocSnapshot(root, readOpenSignals);
  const sceneSignals = useMemo(
    () =>
      openSignals.filter(
        (s) => s.textAnchor?.sceneId === sceneId && s.textAnchor.variantId === variantId,
      ),
    [openSignals, sceneId, variantId],
  );
  const [note, setNote] = useState<OpenNote | null>(null);
  const [noteTop, setNoteTop] = useState<number | null>(null);

  // The editor extension reads the latest values through refs (its options are fixed).
  const signalsRef = useRef<readonly Signal[]>(sceneSignals);
  const noteRef = useRef(note);
  const slotRef = useRef(noteSlot);
  useLayoutEffect(() => {
    signalsRef.current = sceneSignals;
    noteRef.current = note;
    slotRef.current = noteSlot;
  });
  const signalOptions: SignalDecorationsOptions = useMemo(
    () => ({
      signals: () => signalsRef.current,
      openSignalId: () => noteRef.current?.id,
      onPastille: (id) => setNote({ id, focus: true }),
      noteSlot: () => slotRef.current,
    }),
    [],
  );

  // Signals changed (here or on another device), or another note unfolded: redraw.
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.commands.refreshSignals();
  }, [editor, sceneSignals, note?.id, noteSlot]);

  // A note whose signal was closed goes away.
  const noteSignal = note ? openSignals.find((s) => s.id === note.id) : undefined;
  useEffect(() => {
    if (note && !noteSignal) setNote(null);
  }, [note, noteSignal]);

  // The cursor rests in a passage: its note unfolds; it leaves: the note folds.
  useEffect(() => {
    if (!editor) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onSelection = () => {
      clearTimeout(timer);
      const here = signalAtCursor(editor.state);
      const current = noteRef.current;
      if (current && !current.focus && here?.signal.id !== current.id) setNote(null);
      if (here && pauseMs !== null && here.signal.id !== current?.id)
        timer = setTimeout(() => setNote({ id: here.signal.id, focus: false }), pauseMs);
    };
    editor.on('selectionUpdate', onSelection);
    editor.on('update', onSelection);
    return () => {
      clearTimeout(timer);
      editor.off('selectionUpdate', onSelection);
      editor.off('update', onSelection);
    };
  }, [editor, pauseMs]);

  // Where the note goes: level with its paragraph.
  useLayoutEffect(() => {
    if (!editor || editor.isDestroyed || !note || !page.current) {
      setNoteTop(null);
      return;
    }
    const placed = placedSignals(editor.state).find((p) => p.signal.id === note.id);
    if (!placed) {
      setNoteTop(null);
      return;
    }
    try {
      const top = editor.view.coordsAtPos(placed.blockStart).top;
      setNoteTop(top - page.current.getBoundingClientRect().top);
    } catch {
      setNoteTop(null);
    }
  }, [editor, note, page, sceneSignals]);

  const openNote = useCallback((id: string, focus: boolean) => setNote({ id, focus }), []);
  const closeNote = useCallback(() => setNote(null), []);

  return {
    openSignals,
    sceneSignals,
    signalOptions,
    note,
    noteSignal,
    noteTop,
    openNote,
    closeNote,
  };
}
