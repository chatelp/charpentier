import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import type { DocumentHandle } from '@charpentier/platform';
import { guids, variantFragment } from '@charpentier/schema';
import { sceneIsEmpty, SceneTextReader as Reader } from './use-scene-words';

/** The reader, its texts alone. */
class SceneTextReader extends Reader {
  async texts(...args: Parameters<Reader['read']>) {
    const read = await this.read(...args);
    return read && new Map([...read].map(([id, scene]) => [id, scene.text]));
  }
}

/** Scene documents in memory, counting each opening. */
function documents() {
  const docs = new Map<string, Y.Doc>();
  const opened: string[] = [];
  const doc = (sceneId: string) => {
    const guid = guids.scene('p1', sceneId);
    const found = docs.get(guid) ?? new Y.Doc({ guid });
    docs.set(guid, found);
    return found;
  };
  return {
    opened,
    write(sceneId: string, variantId: string, text: string) {
      const paragraph = new Y.XmlElement('paragraph');
      paragraph.insert(0, [new Y.XmlText(text)]);
      variantFragment(doc(sceneId), variantId).push([paragraph]);
    },
    service: {
      open: async (guid: string): Promise<DocumentHandle> => {
        const sceneId = guid.split('scene:')[1] ?? '';
        opened.push(sceneId);
        return { guid, doc: doc(sceneId), whenLoaded: Promise.resolve(), close: async () => {} };
      },
    },
  };
}

const scenes = (...ids: string[]) => ids.map((id) => ({ id, activeVariantId: 'v1' }));

describe('reading the scenes’ texts for the overview', () => {
  it('opens each scene once, then only the scenes that changed', async () => {
    const docs = documents();
    for (const id of ['a', 'b', 'c']) docs.write(id, 'v1', `Scène ${id}.`);
    docs.write('b', 'v2', 'Autre version.');
    const reader = new SceneTextReader(docs.service, 'p1');

    expect(await reader.texts(scenes('a', 'b', 'c'))).toEqual(
      new Map([
        ['a', 'Scène a.'],
        ['b', 'Scène b.'],
        ['c', 'Scène c.'],
      ]),
    );
    expect(docs.opened).toEqual(['a', 'b', 'c']);

    // The outline changes (a title, an order): nothing is opened again.
    docs.opened.length = 0;
    expect((await reader.texts(scenes('c', 'a', 'b')))?.get('b')).toBe('Scène b.');
    expect(docs.opened).toEqual([]);

    // A new scene: it alone is opened.
    docs.write('d', 'v1', 'Scène d.');
    expect((await reader.texts(scenes('a', 'b', 'c', 'd')))?.get('d')).toBe('Scène d.');
    expect(docs.opened).toEqual(['d']);

    // Another active variant: that scene alone is opened.
    docs.opened.length = 0;
    const read = await reader.texts([
      ...scenes('a'),
      { id: 'b', activeVariantId: 'v2' },
      ...scenes('c', 'd'),
    ]);
    expect(read?.get('b')).toBe('Autre version.');
    expect(docs.opened).toEqual(['b']);

    // A scene gone, then back (out of the corbeille): read again.
    docs.opened.length = 0;
    await reader.texts(scenes('a', 'c', 'd'));
    expect(docs.opened).toEqual([]);
    await reader.texts(scenes('a', 'b', 'c', 'd'));
    expect(docs.opened).toEqual(['b']);
  });

  it('reads again the scene in the editor, and once more when it is left', async () => {
    const docs = documents();
    for (const id of ['a', 'b']) docs.write(id, 'v1', `Scène ${id}.`);
    const reader = new SceneTextReader(docs.service, 'p1');
    await reader.texts(scenes('a', 'b'), 'a');
    docs.opened.length = 0;

    // Written in the editor since: the open scene is not trusted from memory.
    docs.write('a', 'v1', 'Écrit depuis.');
    expect((await reader.texts(scenes('a', 'b'), 'a'))?.get('a')).toBe('Scène a.\nÉcrit depuis.');
    expect(docs.opened).toEqual(['a']);

    // The author moves to the other scene: the one left is read a last time.
    docs.write('a', 'v1', 'Encore.');
    docs.opened.length = 0;
    const read = await reader.texts(scenes('a', 'b'), 'b');
    expect(read?.get('a')).toBe('Scène a.\nÉcrit depuis.\nEncore.');
    expect(docs.opened).toEqual(['a', 'b']);
    docs.opened.length = 0;
    await reader.texts(scenes('a', 'b'), 'b');
    expect(docs.opened).toEqual(['b']);
  });

  it('remembers nothing of a cancelled reading', async () => {
    const docs = documents();
    for (const id of ['a', 'b']) docs.write(id, 'v1', `Scène ${id}.`);
    const reader = new SceneTextReader(docs.service, 'p1');
    expect(
      await reader.texts(scenes('a', 'b'), undefined, () => docs.opened.length > 0),
    ).toBeNull();
    docs.opened.length = 0;
    await reader.texts(scenes('a', 'b'));
    expect(docs.opened).toEqual(['a', 'b']);
  });

  it('reads the words of all the variants of a scene, in one opening', async () => {
    const docs = documents();
    docs.write('a', 'v1', 'Trois mots ici.');
    docs.write('a', 'v2', 'Un.');
    const reader = new Reader(docs.service, 'p1');
    const variants = (...ids: string[]) => [
      { id: 'a', activeVariantId: 'v3', variants: ids.map((id) => ({ id })) },
    ];
    const read = await reader.read(variants('v1', 'v2', 'v3'));
    expect([...(read?.get('a')?.words ?? [])]).toEqual([
      ['v1', 3],
      ['v2', 1],
      ['v3', 0],
    ]);
    expect(read?.get('a')?.text).toBe('');
    expect(docs.opened).toEqual(['a']);
    // A variant gone, or a new one: read again.
    await reader.read(variants('v1', 'v2', 'v3'));
    expect(docs.opened).toEqual(['a']);
    await reader.read(variants('v1', 'v3'));
    expect(docs.opened).toEqual(['a', 'a']);
  });

  it('reads again a scene thought empty; not read in time, or at all, it is not known to be', async () => {
    const docs = documents();
    const scene = { id: 'a', activeVariantId: 'v1', variants: [{ id: 'v1' }, { id: 'v2' }] };
    expect(await sceneIsEmpty(docs.service, 'p1', scene)).toBe(true);
    // Filled on another device since, in the variant that is not read.
    docs.write('a', 'v2', 'Écrit ailleurs.');
    expect(await sceneIsEmpty(docs.service, 'p1', scene)).toBe(false);
    const never = { open: () => new Promise<DocumentHandle>(() => {}) };
    const before = Date.now();
    expect(await sceneIsEmpty(never, 'p1', scene)).toBe(false);
    expect(Date.now() - before).toBeLessThan(1000);
    const broken = { open: () => Promise.reject<DocumentHandle>(new Error('unreadable')) };
    expect(await sceneIsEmpty(broken, 'p1', scene)).toBe(false);
  });
});
