import { Node, nodeInputRule } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sceneBreak: {
      /** Inserts a break inside the scene (rendered as a centred ornament). */
      insertSceneBreak: () => ReturnType;
    };
  }
}

/** Scene-internal break (docs/SPEC.md §15.6). Written `* * *` in Markdown. */
export const SceneBreak = Node.create({
  name: 'sceneBreak',
  group: 'block',

  parseHTML() {
    return [{ tag: 'hr' }];
  },

  renderHTML() {
    return ['hr', { class: 'ch-scene-break' }];
  },

  addCommands() {
    return {
      insertSceneBreak:
        () =>
        ({ tr, dispatch }) => {
          if (!dispatch) return true;
          tr.deleteSelection();
          const $pos = tr.selection.$from;
          if (!$pos.parent.isTextblock) return false;
          const paragraph = tr.doc.type.schema.nodes['paragraph'];
          if (!paragraph) return false;
          const sceneBreak = this.type.create();
          const depth = $pos.depth; // 1 in a paragraph, 2 in a quote's paragraph
          const atEnd = $pos.parentOffset === $pos.parent.content.size;
          const inLastBlockOfTop = depth === 1 || $pos.index(1) === $pos.node(1).childCount - 1;
          if (depth === 1 && $pos.parentOffset === 0) {
            // At the start of a top-level paragraph (empty or not): break goes before it.
            const at = $pos.before(1);
            tr.insert(at, sceneBreak);
            tr.setSelection(TextSelection.create(tr.doc, at + sceneBreak.nodeSize + 1));
          } else if (atEnd && inLastBlockOfTop) {
            // At the end of a paragraph or of a quote: break, then a plain paragraph.
            const at = $pos.after(1);
            tr.insert(at, [sceneBreak, paragraph.create()]);
            tr.setSelection(TextSelection.create(tr.doc, at + sceneBreak.nodeSize + 1));
          } else {
            // Split up to the top level, so the break never lands inside a quote.
            tr.split($pos.pos, depth);
            const boundary = $pos.pos + depth;
            tr.insert(boundary, sceneBreak);
            tr.setSelection(TextSelection.create(tr.doc, boundary + sceneBreak.nodeSize + depth));
          }
          tr.scrollIntoView();
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return { 'Mod-Shift-Enter': () => this.editor.commands.insertSceneBreak() };
  },

  addInputRules() {
    // "***", "* * *" or "⁂" followed by a space at the start of a paragraph.
    return [nodeInputRule({ find: /^(?:\*\s?\*\s?\*|⁂)\s$/, type: this.type })];
  },
});
