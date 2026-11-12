import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface KnownName {
  readonly entityId: string;
  /** Full name, then first name: the forms recognised in the text. */
  readonly forms: readonly string[];
}

export interface CharacterNamesOptions {
  readonly names: () => readonly KnownName[];
}

export interface PlacedName {
  readonly entityId: string;
  readonly from: number;
  readonly to: number;
}

interface State {
  readonly placed: readonly PlacedName[];
  readonly decorations: DecorationSet;
}

export const characterNamesKey = new PluginKey<State>('characterNames');

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function find(doc: PMNode, names: readonly KnownName[]): PlacedName[] {
  const forms = names
    .flatMap((n) =>
      n.forms.filter((f) => f.length > 2).map((form) => ({ form, entityId: n.entityId })),
    )
    // Longest first: « Hélène Varenne » before « Hélène ».
    .sort((a, b) => b.form.length - a.form.length);
  if (forms.length === 0) return [];
  const pattern = new RegExp(
    `(?<![\\p{L}])(${forms.map((f) => escape(f.form)).join('|')})(?![\\p{L}])`,
    'gu',
  );
  const placed: PlacedName[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true;
    for (const match of node.text.matchAll(pattern)) {
      const form = forms.find((f) => f.form === match[1]);
      if (!form || match.index === undefined) continue;
      placed.push({
        entityId: form.entityId,
        from: pos + match.index,
        to: pos + match.index + match[0].length,
      });
    }
    return false;
  });
  return placed;
}

/**
 * Names of known characters in the text, as decorations (docs/DESIGN.md
 * §4.5): a wash on hover, a click (or ⌥⏎) opens the sheet beside the text.
 */
export const CharacterNames = Extension.create<CharacterNamesOptions>({
  name: 'characterNames',

  addOptions() {
    return { names: () => [] };
  },

  addCommands() {
    return {
      refreshCharacterNames:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch)
            dispatch(tr.setMeta(characterNamesKey, true).setMeta('addToHistory', false));
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const { names } = this.options;
    const build = (doc: PMNode): State => {
      const placed = find(doc, names());
      return {
        placed,
        decorations: DecorationSet.create(
          doc,
          placed.map((p) =>
            Decoration.inline(p.from, p.to, { class: 'ch-who', 'data-entity-id': p.entityId }),
          ),
        ),
      };
    };
    return [
      new Plugin<State>({
        key: characterNamesKey,
        state: {
          init: (_config, state) => build(state.doc),
          apply: (tr, value) =>
            tr.docChanged || tr.getMeta(characterNamesKey) ? build(tr.doc) : value,
        },
        props: { decorations: (state) => characterNamesKey.getState(state)?.decorations },
      }),
    ];
  },
});

/** The character named at the cursor, if any. */
export function nameAtCursor(state: EditorState): PlacedName | undefined {
  const { from } = state.selection;
  return characterNamesKey.getState(state)?.placed.find((p) => p.from <= from && from <= p.to);
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    characterNames: {
      /** Recomputes the names shown (characters changed in the project). */
      refreshCharacterNames: () => ReturnType;
    };
  }
}
