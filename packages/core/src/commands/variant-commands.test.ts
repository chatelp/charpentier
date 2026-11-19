import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import {
  createChapter,
  createScene,
  guids,
  initProject,
  listCheckpoints,
  variantFragment,
} from '@charpentier/schema';
import { variantCommands } from './variant-commands';

describe('the « save » gesture (createCheckpoint)', () => {
  it('answers « saved » each time, and stores a restore point only when the text changed', () => {
    const root = new Y.Doc({ guid: guids.project('p1') });
    initProject(root, { id: 'p1', title: 'Les serres', kind: 'novel' });
    const chapterId = createChapter(root, { title: 'La serre' });
    const { sceneId, variantId } = createScene(root, { chapterId, title: 'Le sas' });
    const sceneDoc = new Y.Doc({ guid: guids.scene('p1', sceneId) });
    const historyDoc = new Y.Doc();
    const write = (text: string) => {
      const paragraph = new Y.XmlElement('paragraph');
      paragraph.insert(0, [new Y.XmlText(text)]);
      variantFragment(sceneDoc, variantId).push([paragraph]);
    };
    const told: string[] = [];
    const command = variantCommands.find((c) => c.id === 'createCheckpoint');
    const save = () =>
      void command?.run({
        root,
        sceneId,
        sceneDocs: { sceneDoc, historyDoc },
        notify: (message: string) => told.push(message),
        t: (key: string) => key,
      } as unknown as Parameters<NonNullable<typeof command>['run']>[0]);

    write('Il pleuvait sur Nantes.');
    save();
    const size = Y.encodeStateAsUpdate(historyDoc).length;
    for (let i = 0; i < 20; i++) save();
    expect(told).toHaveLength(21);
    expect(new Set(told)).toEqual(new Set(['status.checkpointCreated']));
    expect(listCheckpoints(historyDoc)).toHaveLength(1);
    expect(Y.encodeStateAsUpdate(historyDoc).length).toBe(size);

    write('Hélène attendait.');
    save();
    expect(listCheckpoints(historyDoc)).toHaveLength(2);
    expect(told).toHaveLength(22);
  });
});
