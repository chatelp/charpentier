import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const key = new PluginKey('currentBlock');

/**
 * Marks the top-level block holding the cursor with `is-current-block`, a
 * decoration (never a mark in the content). The focus mode dims the others.
 */
export const CurrentBlock = Extension.create({
  name: 'currentBlock',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        props: {
          decorations(state) {
            const index = state.selection.$head.index(0);
            let decorations: Decoration[] = [];
            state.doc.forEach((node, offset, i) => {
              if (i === index)
                decorations = [
                  Decoration.node(offset, offset + node.nodeSize, { class: 'is-current-block' }),
                ];
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
