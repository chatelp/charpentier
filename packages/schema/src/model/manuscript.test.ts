import { describe, expect, it } from 'vitest';
import { newProjectDoc, replicaOf, sync } from '../testing/yjs';
import {
  createChapter,
  createScene,
  listChapters,
  listScenes,
  moveChapter,
  moveScene,
  renameScene,
  restoreScene,
  trashScene,
} from './manuscript';
import { readProjectMeta } from './project';

const titles = (items: readonly { title: string }[]) => items.map((i) => i.title);

describe('project', () => {
  it('initializes the root document once', () => {
    const doc = newProjectDoc();
    expect(readProjectMeta(doc)).toMatchObject({
      id: 'p1',
      title: 'Mon roman',
      kind: 'novel',
      language: 'fr',
      schemaVersion: 1,
    });
  });
});

describe('manuscript tree', () => {
  it('creates, orders and moves chapters and scenes', () => {
    const doc = newProjectDoc();
    const c1 = createChapter(doc, { title: 'Un' });
    const c2 = createChapter(doc, { title: 'Deux' });
    createChapter(doc, { title: 'Zéro', index: 0 });
    expect(titles(listChapters(doc))).toEqual(['Zéro', 'Un', 'Deux']);

    const a = createScene(doc, { chapterId: c1, title: 'A' }).sceneId;
    createScene(doc, { chapterId: c1, title: 'B' });
    createScene(doc, { chapterId: c1, title: 'A½', index: 1 });
    expect(titles(listScenes(doc, c1))).toEqual(['A', 'A½', 'B']);

    moveScene(doc, a, { chapterId: c2, index: 0 });
    expect(titles(listScenes(doc, c1))).toEqual(['A½', 'B']);
    expect(titles(listScenes(doc, c2))).toEqual(['A']);

    moveChapter(doc, c2, 0);
    expect(titles(listChapters(doc))).toEqual(['Deux', 'Zéro', 'Un']);
  });

  it('trashes and restores a scene without losing it', () => {
    const doc = newProjectDoc();
    const c = createChapter(doc, { title: 'Un' });
    const { sceneId } = createScene(doc, { chapterId: c, title: 'A' });
    trashScene(doc, sceneId);
    expect(listScenes(doc, c)).toEqual([]);
    restoreScene(doc, sceneId);
    expect(titles(listScenes(doc, c))).toEqual(['A']);
  });
});

describe('manuscript tree under concurrent edits', () => {
  it('never duplicates a scene moved concurrently to two chapters', () => {
    const a = newProjectDoc();
    const c1 = createChapter(a, { title: 'Un' });
    const c2 = createChapter(a, { title: 'Deux' });
    const c3 = createChapter(a, { title: 'Trois' });
    const { sceneId } = createScene(a, { chapterId: c1, title: 'Errante' });
    const b = replicaOf(a);

    moveScene(a, sceneId, { chapterId: c2, index: 0 }); // offline on device A
    moveScene(b, sceneId, { chapterId: c3, index: 0 }); // offline on device B
    sync(a, b);

    for (const doc of [a, b]) {
      const everywhere = [c1, c2, c3]
        .flatMap((c) => listScenes(doc, c))
        .filter((s) => s.id === sceneId);
      expect(everywhere).toHaveLength(1);
    }
    expect(listScenes(a, c2).map((s) => s.id)).toEqual(listScenes(b, c2).map((s) => s.id));
    expect(listScenes(a, c3).map((s) => s.id)).toEqual(listScenes(b, c3).map((s) => s.id));
  });

  it('keeps both scenes inserted concurrently at the same place, in the same order everywhere', () => {
    const a = newProjectDoc();
    const c = createChapter(a, { title: 'Un' });
    createScene(a, { chapterId: c, title: 'Début' });
    createScene(a, { chapterId: c, title: 'Fin' });
    const b = replicaOf(a);

    createScene(a, { chapterId: c, title: 'De A', index: 1 });
    createScene(b, { chapterId: c, title: 'De B', index: 1 });
    sync(a, b);

    const orderA = titles(listScenes(a, c));
    expect(orderA).toEqual(titles(listScenes(b, c)));
    expect(orderA[0]).toBe('Début');
    expect(orderA[3]).toBe('Fin');
    expect(new Set(orderA.slice(1, 3))).toEqual(new Set(['De A', 'De B']));

    // Inserting between the two tied scenes still works (siblings get re-keyed).
    createScene(a, { chapterId: c, title: 'Entre', index: 2 });
    expect(titles(listScenes(a, c))[2]).toBe('Entre');
    sync(a, b);
    expect(titles(listScenes(b, c))).toEqual(titles(listScenes(a, c)));
  });

  it('merges a concurrent rename and move of the same scene', () => {
    const a = newProjectDoc();
    const c1 = createChapter(a, { title: 'Un' });
    const c2 = createChapter(a, { title: 'Deux' });
    const { sceneId } = createScene(a, { chapterId: c1, title: 'Ancien titre' });
    const b = replicaOf(a);
    renameScene(a, sceneId, 'Nouveau titre');
    moveScene(b, sceneId, { chapterId: c2, index: 0 });
    sync(a, b);
    for (const doc of [a, b]) expect(titles(listScenes(doc, c2))).toEqual(['Nouveau titre']);
  });
});
