import { prosemirrorToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import type { Node } from 'prosemirror-model';
import type * as Y from 'yjs';
import { sceneSchema } from '../prosemirror/scene-schema';

/**
 * Conversions between a variant's Yjs fragment and a ProseMirror scene
 * document, using the editor binding's own encoding (@tiptap/y-tiptap, a
 * maintained fork of y-prosemirror) so that both always agree.
 */
export function fragmentToSceneDoc(fragment: Y.XmlFragment): Node {
  const root = yXmlFragmentToProseMirrorRootNode(fragment, sceneSchema);
  // A fragment never written to is empty; a scene always has at least one block.
  return sceneSchema.nodes.doc.createAndFill(null, root.content) ?? root;
}

/** Replaces the fragment's content with `doc` (call inside a transaction with the right origin). */
export function writeSceneDocToFragment(doc: Node, fragment: Y.XmlFragment): void {
  if (fragment.length > 0) fragment.delete(0, fragment.length);
  prosemirrorToYXmlFragment(doc, fragment);
}
