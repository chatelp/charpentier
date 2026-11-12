import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { parseSceneMarkdown } from '../markdown/parse';
import { serializeSceneMarkdown } from '../markdown/serialize';
import { doc, p, quote, sceneBreak } from '../testing/builders';
import { fragmentToSceneDoc, writeSceneDocToFragment } from './scene-text-bridge';

describe('Yjs fragment ↔ scene document ↔ Markdown', () => {
  it('round-trips through the CRDT and the Markdown mirror', () => {
    const scene = doc(
      p('— Tu viens ? demanda-t-elle.'),
      p('Avec l’', { italic: 'Odyssée' }, '.', 'BR', 'Puis rien.'),
      sceneBreak(),
      quote(p('Chère Anna,')),
      p(),
    );
    const ydoc = new Y.Doc();
    const fragment = ydoc.getXmlFragment('variant:v1');
    ydoc.transact(() => writeSceneDocToFragment(scene, fragment));

    // Persist and reload the CRDT, as the host would.
    const reloaded = new Y.Doc();
    Y.applyUpdate(reloaded, Y.encodeStateAsUpdate(ydoc));
    const fromCrdt = fragmentToSceneDoc(reloaded.getXmlFragment('variant:v1'));
    expect(fromCrdt.toJSON()).toEqual(scene.toJSON());

    const markdown = serializeSceneMarkdown(fromCrdt);
    expect(parseSceneMarkdown(markdown).toJSON()).toEqual(scene.toJSON());
  });

  it('reads an empty fragment as an empty scene', () => {
    const fragment = new Y.Doc().getXmlFragment('variant:v1');
    expect(fragmentToSceneDoc(fragment).toJSON()).toEqual(doc(p()).toJSON());
  });
});
