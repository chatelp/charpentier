import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  addVariantMeta,
  createChapter,
  createScene,
  getScene,
  listAllScenes,
  listScenesOutOfVersion,
  moveScene,
  readOutline,
  setActiveVariant,
} from './manuscript';
import { initProject } from './project';
import {
  activeVersionId,
  createVersion,
  listTrashedVersions,
  listVersions,
  MAIN_VERSION,
  renameVersion,
  restoreVersion,
  sceneIsCommon,
  setSceneInVersion,
  switchVersion,
  trashVersion,
  versionOwnScenes,
  versionVariant,
} from './versions';

/** A novel of one chapter and three scenes, as the author has it before any version. */
function novel() {
  const doc = new Y.Doc();
  initProject(doc, { id: 'p', title: 'Avant Nantes', kind: 'novel' });
  const chapterId = createChapter(doc, { title: 'Le fleuve' });
  const scenes = ['La nuit sur l’eau', 'L’estuaire', 'Le quai de la Fosse'].map(
    (title) => createScene(doc, { chapterId, title }).sceneId,
  );
  return { doc, chapterId, scenes: scenes as [string, string, string] };
}

const titles = (doc: Y.Doc, versionId?: string) =>
  readOutline(doc, versionId).flatMap((c) => c.scenes.map((s) => s.title));
const active = (doc: Y.Doc, sceneId: string) => getScene(doc, sceneId)?.activeVariantId;

describe('working versions (DESIGN 1.20)', () => {
  it('changes nothing while the novel has only Principale', () => {
    const { doc } = novel();
    expect(listVersions(doc).map((v) => v.id)).toEqual([MAIN_VERSION]);
    expect(activeVersionId(doc)).toBe(MAIN_VERSION);
    expect(titles(doc)).toEqual(['La nuit sur l’eau', 'L’estuaire', 'Le quai de la Fosse']);
  });

  it('starts a version from the active one: every scene common, until it gets its own variant', () => {
    const { doc, scenes } = novel();
    const [, , quay] = scenes;
    const principal = active(doc, quay);
    const version = createVersion(doc, 'Fin à Nantes');
    expect(activeVersionId(doc)).toBe(version);
    expect(scenes.every((s) => sceneIsCommon(doc, s, version))).toBe(true);
    expect(versionOwnScenes(doc, version)).toBe(0);

    // « Nouvelle variante » in the version: its choice only.
    addVariantMeta(doc, quay, {
      variantId: 'v-nantes',
      name: 'Fin à Nantes',
      origin: 'author',
      activate: true,
    });
    expect(active(doc, quay)).toBe('v-nantes');
    expect(sceneIsCommon(doc, quay, version)).toBe(false);
    expect(versionOwnScenes(doc, version)).toBe(1);
    expect(getScene(doc, quay)?.variants.at(-1)?.version).toBe(version);

    // Back to Principale: its ending, untouched; and again.
    switchVersion(doc, MAIN_VERSION);
    expect(active(doc, quay)).toBe(principal);
    expect(versionVariant(doc, quay, MAIN_VERSION)).toBe(principal);
    switchVersion(doc, version);
    expect(active(doc, quay)).toBe('v-nantes');
  });

  it('lets Principale change a common scene for every version that shares it', () => {
    const { doc, scenes } = novel();
    const [night] = scenes;
    const version = createVersion(doc, 'Fin à Nantes');
    switchVersion(doc, MAIN_VERSION);
    addVariantMeta(doc, night, { variantId: 'v-b', name: 'B', origin: 'author', activate: true });
    switchVersion(doc, version);
    // Common: the version reads Principale's choice.
    expect(active(doc, night)).toBe('v-b');
    // Choosing another variant there makes it the version's own.
    const first = getScene(doc, night)?.variants[0]?.id ?? '';
    setActiveVariant(doc, night, first);
    expect(sceneIsCommon(doc, night, version)).toBe(false);
    switchVersion(doc, MAIN_VERSION);
    expect(active(doc, night)).toBe('v-b');
  });

  it('keeps a scene or a chapter made in a version to that version, and can take a scene out', () => {
    const { doc, chapterId, scenes } = novel();
    createVersion(doc, 'Fin à Nantes');
    createScene(doc, { chapterId, title: 'La lettre', index: 1 });
    createChapter(doc, { title: 'Orléans' });
    expect(titles(doc)).toEqual([
      'La nuit sur l’eau',
      'La lettre',
      'L’estuaire',
      'Le quai de la Fosse',
    ]);
    expect(readOutline(doc).map((c) => c.title)).toEqual(['Le fleuve', 'Orléans']);
    expect(titles(doc, MAIN_VERSION)).not.toContain('La lettre');
    expect(readOutline(doc, MAIN_VERSION).map((c) => c.title)).toEqual(['Le fleuve']);

    // « Retirer de cette version »: hidden here, thrown away nowhere.
    setSceneInVersion(doc, scenes[1], false);
    expect(titles(doc)).not.toContain('L’estuaire');
    expect(titles(doc, MAIN_VERSION)).toContain('L’estuaire');
    expect(listScenesOutOfVersion(doc).map((s) => s.title)).toEqual(['L’estuaire']);
    setSceneInVersion(doc, scenes[1], true);
    expect(titles(doc)).toContain('L’estuaire');
    // Every scene is still there for the sync and the mirror's store.
    expect(listAllScenes(doc)).toHaveLength(4);
  });

  it('places a moved scene among the scenes the version shows', () => {
    const { doc, chapterId, scenes } = novel();
    const version = createVersion(doc, 'Fin à Nantes');
    setSceneInVersion(doc, scenes[1], false, version);
    // Shown: night, quay. Move quay to the top.
    moveScene(doc, scenes[2], { chapterId, index: 0 });
    expect(titles(doc)).toEqual(['Le quai de la Fosse', 'La nuit sur l’eau']);
  });

  it('puts a version in the trash with its own scenes and variants, and brings them back', () => {
    const { doc, chapterId, scenes } = novel();
    const version = createVersion(doc, 'Fin à Nantes');
    const { sceneId } = createScene(doc, { chapterId, title: 'La lettre' });
    addVariantMeta(doc, scenes[2], {
      variantId: 'v-n',
      name: 'N',
      origin: 'author',
      activate: true,
    });
    expect(() => trashVersion(doc, MAIN_VERSION)).toThrow();
    trashVersion(doc, version);
    expect(activeVersionId(doc)).toBe(MAIN_VERSION);
    expect(listVersions(doc)).toHaveLength(1);
    expect(listTrashedVersions(doc).map((v) => v.name)).toEqual(['Fin à Nantes']);
    expect(titles(doc)).not.toContain('La lettre');
    expect(listScenesOutOfVersion(doc).map((s) => s.id)).not.toContain(sceneId);
    expect(getScene(doc, scenes[2])?.variants.map((v) => v.id)).not.toContain('v-n');

    restoreVersion(doc, version);
    switchVersion(doc, version);
    expect(titles(doc)).toContain('La lettre');
    expect(active(doc, scenes[2])).toBe('v-n');
  });

  it('renames Principale and the others; their names are the author’s', () => {
    const { doc } = novel();
    const version = createVersion(doc, 'Fin à Nantes');
    renameVersion(doc, MAIN_VERSION, 'Fin à Orléans');
    renameVersion(doc, version, 'Fin au Croisic');
    expect(listVersions(doc).map((v) => v.name)).toEqual(['Fin à Orléans', 'Fin au Croisic']);
  });

  it('merges two versions created at once on two devices, and follows the active one across', () => {
    const { doc: a, scenes } = novel();
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    const onA = createVersion(a, 'Fin à Nantes');
    const onB = createVersion(b, 'Fin au Croisic');
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    expect(new Set(listVersions(a).map((v) => v.id))).toEqual(new Set([MAIN_VERSION, onA, onB]));
    expect(listVersions(b)).toEqual(listVersions(a));

    // The active version is the project's: B opens on what A chose.
    switchVersion(a, onA);
    addVariantMeta(a, scenes[0], { variantId: 'v-a', name: 'A', origin: 'author', activate: true });
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(activeVersionId(b)).toBe(onA);
    expect(active(b, scenes[0])).toBe('v-a');
  });
});
