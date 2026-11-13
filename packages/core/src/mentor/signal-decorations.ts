import type { Signal } from '@charpentier/schema';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { relativePositionToAbsolutePosition, ySyncPluginKey } from '@tiptap/y-tiptap';
import * as Y from 'yjs';

/** How strongly a pastille shows (docs/DESIGN.md §4.2): importance, never urgency. */
export const signalLevel = (kind: Signal['kind']): 1 | 2 | 3 =>
  kind === 'language' ? 1 : kind === 'craft' || kind === 'clue' ? 2 : 3;

export interface PlacedSignal {
  readonly signal: Signal;
  readonly from: number;
  readonly to: number;
  /** Start of the paragraph holding the passage. */
  readonly blockStart: number;
  /** Position right after that paragraph. */
  readonly blockAfter: number;
}

export interface SignalDecorationsOptions {
  /** Open signals anchored in this scene's active variant. */
  readonly signals: () => readonly Signal[];
  /** The signal whose note is unfolded (its passage gets the wash). */
  readonly openSignalId: () => string | undefined;
  readonly onPastille: (signalId: string) => void;
  /**
   * In a narrow window, where the unfolded note goes: under its paragraph, in
   * the flow of the text, which it pushes down (docs/DESIGN.md §4.2). Null in
   * a wide window (the note is in the margin).
   */
  readonly noteSlot?: () => HTMLElement | null;
}

interface State {
  readonly placed: readonly PlacedSignal[];
  readonly decorations: DecorationSet;
}

export const signalDecorationsKey = new PluginKey<State>('signalDecorations');

interface Binding {
  readonly doc: Y.Doc;
  readonly type: Y.XmlFragment;
  readonly mapping: Parameters<typeof relativePositionToAbsolutePosition>[3];
}

/** Where each signal's passage is now (relative positions follow concurrent edits). */
export function placeSignals(state: EditorState, signals: readonly Signal[]): PlacedSignal[] {
  const binding = (ySyncPluginKey.getState(state) as { binding?: Binding } | undefined)?.binding;
  if (!binding) return [];
  const placed: PlacedSignal[] = [];
  for (const signal of signals) {
    const anchor = signal.textAnchor;
    if (!anchor) continue;
    try {
      const from = relativePositionToAbsolutePosition(
        binding.doc,
        binding.type,
        Y.createRelativePositionFromJSON(anchor.start),
        binding.mapping,
      );
      const to = relativePositionToAbsolutePosition(
        binding.doc,
        binding.type,
        Y.createRelativePositionFromJSON(anchor.end),
        binding.mapping,
      );
      if (from === null || to === null || to <= from || to > state.doc.content.size) continue;
      const $from = state.doc.resolve(from);
      placed.push({
        signal,
        from,
        to,
        blockStart: $from.start($from.depth),
        blockAfter: $from.after($from.depth),
      });
    } catch {
      // A passage that no longer resolves is simply not shown in the text.
    }
  }
  return placed.sort((a, b) => a.from - b.from);
}

/**
 * The Compagnon's remarks in the text (docs/DESIGN.md §4.2): a pastille in
 * the margin at the paragraph, and a wash on the passage while its note is
 * unfolded. Decorations only: nothing is ever written into the text.
 */
export const SignalDecorations = Extension.create<SignalDecorationsOptions>({
  name: 'signalDecorations',

  addOptions() {
    return { signals: () => [], openSignalId: () => undefined, onPastille: () => {} };
  },

  addCommands() {
    return {
      refreshSignals:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch)
            dispatch(tr.setMeta(signalDecorationsKey, true).setMeta('addToHistory', false));
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    const build = (state: EditorState): State => {
      const placed = placeSignals(state, options.signals());
      const open = options.openSignalId();
      const decorations: Decoration[] = [];
      const perBlock = new Map<number, number>();
      for (const p of placed) {
        const rank = perBlock.get(p.blockStart) ?? 0;
        perBlock.set(p.blockStart, rank + 1);
        decorations.push(
          Decoration.widget(
            p.blockStart,
            () => {
              const pastille = document.createElement('button');
              pastille.type = 'button';
              pastille.tabIndex = -1;
              pastille.className = 'ch-pastille';
              pastille.dataset['level'] = String(signalLevel(p.signal.kind));
              pastille.dataset['signalId'] = p.signal.id;
              pastille.style.setProperty('--ch-pastille-rank', String(rank));
              pastille.setAttribute('aria-hidden', 'true');
              pastille.addEventListener('mousedown', (event) => {
                event.preventDefault();
                options.onPastille(p.signal.id);
              });
              return pastille;
            },
            { side: -1, key: `pastille-${p.signal.id}-${rank}`, ignoreSelection: true },
          ),
        );
        if (p.signal.id === open) {
          decorations.push(
            Decoration.inline(p.from, p.to, {
              class: `ch-anchor${p.signal.kind === 'language' ? ' is-language' : ''}`,
            }),
          );
          const slot = options.noteSlot?.();
          if (slot)
            decorations.push(
              Decoration.widget(p.blockAfter, () => slot, {
                side: 1,
                key: `note-slot-${p.signal.id}`,
                ignoreSelection: true,
                // The note handles its own keys and clicks.
                stopEvent: () => true,
              }),
            );
        }
      }
      return { placed, decorations: DecorationSet.create(state.doc, decorations) };
    };

    return [
      new Plugin<State>({
        key: signalDecorationsKey,
        state: {
          init: (_config, state) => build(state),
          apply: (tr, value, _old, state) =>
            tr.docChanged || tr.getMeta(signalDecorationsKey) ? build(state) : value,
        },
        props: { decorations: (state) => signalDecorationsKey.getState(state)?.decorations },
      }),
    ];
  },
});

export const placedSignals = (state: EditorState): readonly PlacedSignal[] =>
  signalDecorationsKey.getState(state)?.placed ?? [];

/** The signal whose passage holds the cursor, if any. */
export function signalAtCursor(state: EditorState): PlacedSignal | undefined {
  const { from } = state.selection;
  return placedSignals(state).find((p) => p.from <= from && from <= p.to);
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    signalDecorations: {
      /** Recomputes the remarks shown (signals changed in the project). */
      refreshSignals: () => ReturnType;
    };
  }
}
