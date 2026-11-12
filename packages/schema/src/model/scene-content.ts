import * as Y from 'yjs';
import { names, newId } from './ids';
import { addVariantMeta } from './manuscript';
import { AUTHOR, type Origin } from './origins';

/**
 * Text of a scene, in its own document `project:<pid>/scene:<sid>`
 * (docs/SPEC.md §15.4). Each variant is a top-level `Y.XmlFragment` named
 * `variant:<id>`, bound to the editor through y-prosemirror. Top-level types
 * merge across replicas, so two devices opening the same variant for the
 * first time never overwrite each other.
 */
export const variantFragment = (sceneDoc: Y.Doc, variantId: string): Y.XmlFragment =>
  sceneDoc.getXmlFragment(names.variant(variantId));

type XmlNode = Y.XmlElement | Y.XmlText;

/** Replaces the content of `target` with a copy of `source` (call inside a transaction). */
export function replaceFragmentContent(target: Y.XmlFragment, source: Y.XmlFragment): void {
  const copies = source.toArray().map((node) => (node as XmlNode).clone());
  if (target.length > 0) target.delete(0, target.length);
  if (copies.length > 0) target.insert(0, copies);
}

/**
 * Creates a new variant of a scene, empty or copied from an existing one, and
 * registers it in the root document. The text is written first, so an
 * interruption can at worst leave an unlisted (invisible) fragment.
 */
export function createVariant(
  rootDoc: Y.Doc,
  sceneDoc: Y.Doc,
  sceneId: string,
  input: { name: string; copyOf?: string; activate?: boolean },
  origin: Origin = AUTHOR,
): string {
  const variantId = newId();
  const { copyOf } = input;
  if (copyOf) {
    sceneDoc.transact(
      () =>
        replaceFragmentContent(
          variantFragment(sceneDoc, variantId),
          variantFragment(sceneDoc, copyOf),
        ),
      origin,
    );
  }
  addVariantMeta(
    rootDoc,
    sceneId,
    {
      variantId,
      name: input.name,
      origin: 'author',
      ...(input.activate !== undefined && { activate: input.activate }),
    },
    origin,
  );
  return variantId;
}
