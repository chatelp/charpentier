import { sanitizeSceneText } from '@charpentier/schema';
import { Extension } from '@tiptap/core';
import { Fragment, Slice, type Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';

function sanitizeFragment(fragment: Fragment): Fragment {
  const nodes: PMNode[] = [];
  fragment.forEach((node) => {
    if (node.isText) {
      const text = sanitizeSceneText(node.text ?? '');
      if (text) nodes.push(node.type.schema.text(text, node.marks));
    } else {
      nodes.push(node.copy(sanitizeFragment(node.content)));
    }
  });
  return Fragment.from(nodes);
}

/**
 * Normalizes pasted text like any text entering a scene (docs/SPEC.md §15.6):
 * stray line breaks become spaces, control characters are dropped. Formatting
 * the scene schema does not know (bold, headings, links) is already dropped
 * by the schema's parse rules.
 */
export const SanitizePaste = Extension.create({
  name: 'sanitizePaste',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('sanitizePaste'),
        props: {
          transformPasted: (slice) =>
            new Slice(sanitizeFragment(slice.content), slice.openStart, slice.openEnd),
        },
      }),
    ];
  },
});
