import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { LanguageCheck as LanguageCheckFn } from '../language/checker';
import type { LanguageIssue } from '../language/issues';

export interface LanguageCheckOptions {
  /** Null: no language check (the extension stays inert). */
  readonly check: LanguageCheckFn | null;
  /** Pause in typing before the text is checked again (nothing moves while typing). */
  readonly delayMs: number;
}

/** An issue placed in the document (ProseMirror positions). */
export interface PlacedIssue extends LanguageIssue {
  readonly pos: { readonly from: number; readonly to: number };
}

interface State {
  readonly decorations: DecorationSet;
}

export const languageCheckKey = new PluginKey<State>('languageCheck');

/** The text of a textblock, and for each of its characters the document position. */
function blockText(node: PMNode, start: number): { text: string; positions: number[] } {
  let text = '';
  const positions: number[] = [];
  node.forEach((child, offset) => {
    const pos = start + offset;
    if (child.isText) {
      const value = child.text ?? '';
      for (let i = 0; i < value.length; i++) positions.push(pos + i);
      text += value;
    } else {
      // A line break inside a paragraph.
      positions.push(pos);
      text += '\n';
    }
  });
  positions.push(start + node.content.size);
  return { text, positions };
}

/**
 * Language issues as decorations (never marks in the content): wavy for
 * spelling, dotted for typography. The text is checked after a pause; while
 * typing, existing underlines just follow the text.
 */
interface LanguageCheckStorage {
  /** Issues by paragraph text: an unchanged paragraph is not checked again. */
  readonly cache: Map<string, LanguageIssue[]>;
  /** Schedules a check (set by the plugin view). */
  refresh: () => void;
}

export const LanguageCheck = Extension.create<LanguageCheckOptions, LanguageCheckStorage>({
  name: 'languageCheck',

  addOptions() {
    return { check: null, delayMs: 800 };
  },

  addStorage() {
    return { cache: new Map<string, LanguageIssue[]>(), refresh: () => {} };
  },

  addCommands() {
    return {
      refreshLanguageCheck: () => () => {
        this.storage.cache.clear();
        this.storage.refresh();
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const { check, delayMs } = this.options;
    if (!check) return [];
    const storage = this.storage;
    const { cache } = storage;

    return [
      new Plugin<State>({
        key: languageCheckKey,
        state: {
          init: () => ({ decorations: DecorationSet.empty }),
          apply(tr: Transaction, state: State): State {
            const next = tr.getMeta(languageCheckKey) as DecorationSet | undefined;
            if (next) return { decorations: next };
            return { decorations: state.decorations.map(tr.mapping, tr.doc) };
          },
        },
        props: {
          decorations: (state) => languageCheckKey.getState(state)?.decorations,
        },
        view(view: EditorView) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          let destroyed = false;

          const run = async () => {
            const doc = view.state.doc;
            const blocks: { text: string; positions: number[] }[] = [];
            doc.descendants((node, pos) => {
              if (!node.isTextblock) return true;
              blocks.push(blockText(node, pos + 1));
              return false;
            });
            const missing = [...new Set(blocks.map((b) => b.text))].filter(
              (t) => t.trim() && !cache.has(t),
            );
            try {
              const results = await Promise.all(missing.map((t) => check(t)));
              missing.forEach((t, i) => cache.set(t, results[i] ?? []));
            } catch {
              return; // The dictionary failed: try again after the next pause.
            }
            // Typed meanwhile: the next pause checks again.
            if (destroyed || view.state.doc !== doc) return;
            const decorations: Decoration[] = [];
            for (const block of blocks) {
              for (const issue of cache.get(block.text) ?? []) {
                const from = block.positions[issue.from];
                const to = block.positions[issue.to - 1];
                if (from === undefined || to === undefined) continue;
                decorations.push(
                  Decoration.inline(
                    from,
                    to + 1,
                    { class: `ch-lang ch-lang-${issue.kind}` },
                    { issue, inclusiveStart: false, inclusiveEnd: false },
                  ),
                );
              }
            }
            view.dispatch(
              view.state.tr
                .setMeta(languageCheckKey, DecorationSet.create(doc, decorations))
                .setMeta('addToHistory', false),
            );
          };

          const schedule = () => {
            clearTimeout(timer);
            timer = setTimeout(() => void run(), delayMs);
          };
          storage.refresh = schedule;
          schedule();
          return {
            update(updated, previous) {
              if (updated.state.doc !== previous.doc) schedule();
            },
            destroy() {
              destroyed = true;
              clearTimeout(timer);
            },
          };
        },
      }),
    ];
  },
});

/** Every issue currently shown, in document order. */
export function placedIssues(state: EditorState): PlacedIssue[] {
  const set = languageCheckKey.getState(state)?.decorations;
  if (!set) return [];
  return set
    .find()
    .map((d) => ({
      ...(d.spec as { issue: LanguageIssue }).issue,
      pos: { from: d.from, to: d.to },
    }))
    .sort((a, b) => a.pos.from - b.pos.from);
}

/** The issue under the cursor (or right before it), if any. */
export function issueAtCursor(state: EditorState): PlacedIssue | undefined {
  const { from } = state.selection;
  return placedIssues(state).find((i) => i.pos.from <= from && from <= i.pos.to);
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    languageCheck: {
      /** Checks the whole scene again (after a word was added to the dictionary). */
      refreshLanguageCheck: () => ReturnType;
    };
  }
}

/** Replaces the issue's stretch, keeping the formatting there (an accepted correction, D-11). */
export function applyCorrection(view: EditorView, issue: PlacedIssue, replacement: string): void {
  view.dispatch(view.state.tr.insertText(replacement, issue.pos.from, issue.pos.to));
}
