import * as Y from 'yjs';
import { names, newId, nowIso } from './ids';
import { keyAt, sortOrdered } from './order';
import { AUTHOR, type Origin } from './origins';
import {
  activeVersionId,
  emptyChapterInVersion,
  ownerVersion,
  recordVariantChoice,
  sceneInVersion,
  trashedVersionIds,
} from './versions';

/**
 * The manuscript tree in the project's root document (docs/SPEC.md §15.2):
 * chapters and scenes are flat maps keyed by id; a scene names its chapter;
 * order comes from fractional keys. Moving a scene writes two fields, so
 * concurrent moves can never duplicate it.
 *
 * Nothing is ever hard-deleted: chapters, scenes and variants are trashed.
 */

export interface ChapterInfo {
  readonly id: string;
  readonly title: string;
  readonly order: string;
}

export type VariantOrigin = 'author' | 'external-edit' | 'checkpoint';

export interface VariantInfo {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly origin: VariantOrigin;
  /** The working version it was made in (none: Principale's). */
  readonly version?: string;
}

export interface SceneInfo {
  readonly id: string;
  readonly title: string;
  readonly chapterId: string;
  readonly order: string;
  readonly activeVariantId: string;
  /** Live (non-trashed) variants, oldest first (a trashed version's go with it). */
  readonly variants: readonly VariantInfo[];
  /** The working version it was created in, which alone it belongs to (none: all). */
  readonly version?: string;
}

type YMap = Y.Map<unknown>;

const chaptersMap = (doc: Y.Doc) => doc.getMap<YMap>(names.chapters);
const scenesMap = (doc: Y.Doc) => doc.getMap<YMap>(names.scenes);

const isLive = (m: YMap) => m.get('trashedAt') === undefined;

function requireMap(container: Y.Map<YMap>, id: string, what: string): YMap {
  const m = container.get(id);
  if (!m) throw new Error(`Unknown ${what}: ${id}`);
  return m;
}

// ─── Chapters ────────────────────────────────────────────────────────────

const toChapter = (id: string, m: YMap): ChapterInfo => ({
  id,
  title: String(m.get('title') ?? ''),
  order: String(m.get('order') ?? ''),
});

export function listChapters(doc: Y.Doc): ChapterInfo[] {
  return sortOrdered(
    [...chaptersMap(doc).entries()].filter(([, m]) => isLive(m)).map(([id, m]) => toChapter(id, m)),
  );
}

export function createChapter(
  doc: Y.Doc,
  input: { title: string; index?: number },
  origin: Origin = AUTHOR,
): string {
  const id = newId();
  doc.transact(() => {
    const siblings = listChapters(doc);
    const chapters = chaptersMap(doc);
    const shown = new Set(readOutline(doc).map((c) => c.id));
    const index =
      input.index === undefined
        ? siblings.length
        : indexAmongAll(siblings, (c) => shown.has(c.id), input.index);
    const order = keyAt(siblings, index, (sid, o) => chapters.get(sid)?.set('order', o));
    const chapter = new Y.Map<unknown>();
    chapters.set(id, chapter);
    chapter.set('title', input.title);
    chapter.set('order', order);
    chapter.set('createdAt', nowIso());
    // Made outside Principale: it belongs to that version only (DESIGN 1.20).
    const owner = ownerVersion(doc);
    if (owner) chapter.set('version', owner);
  }, origin);
  return id;
}

export function renameChapter(
  doc: Y.Doc,
  chapterId: string,
  title: string,
  origin: Origin = AUTHOR,
): void {
  doc.transact(
    () => requireMap(chaptersMap(doc), chapterId, 'chapter').set('title', title),
    origin,
  );
}

export function moveChapter(
  doc: Y.Doc,
  chapterId: string,
  index: number,
  origin: Origin = AUTHOR,
): void {
  doc.transact(() => {
    const chapters = chaptersMap(doc);
    const chapter = requireMap(chapters, chapterId, 'chapter');
    const siblings = listChapters(doc).filter((c) => c.id !== chapterId);
    const shown = new Set(readOutline(doc).map((c) => c.id));
    const at = indexAmongAll(siblings, (c) => shown.has(c.id), index);
    chapter.set(
      'order',
      keyAt(siblings, at, (sid, o) => chapters.get(sid)?.set('order', o)),
    );
  }, origin);
}

export function trashChapter(doc: Y.Doc, chapterId: string, origin: Origin = AUTHOR): void {
  doc.transact(
    () => requireMap(chaptersMap(doc), chapterId, 'chapter').set('trashedAt', nowIso()),
    origin,
  );
}

export function restoreChapter(doc: Y.Doc, chapterId: string, origin: Origin = AUTHOR): void {
  doc.transact(
    () => requireMap(chaptersMap(doc), chapterId, 'chapter').delete('trashedAt'),
    origin,
  );
}

// ─── Scenes ──────────────────────────────────────────────────────────────

const versionOf = (m: YMap) =>
  typeof m.get('version') === 'string' ? { version: String(m.get('version')) } : {};

function toScene(id: string, m: YMap, trashedVersions: ReadonlySet<string> = new Set()): SceneInfo {
  const variants = (m.get('variants') as Y.Map<YMap> | undefined) ?? new Y.Map<YMap>();
  const active = String(m.get('activeVariantId') ?? '');
  return {
    id,
    title: String(m.get('title') ?? ''),
    chapterId: String(m.get('chapterId') ?? ''),
    order: String(m.get('order') ?? ''),
    activeVariantId: active,
    ...versionOf(m),
    variants: [...variants.entries()]
      .filter(
        ([vid, v]) =>
          isLive(v) && (vid === active || !trashedVersions.has(String(v.get('version') ?? ''))),
      )
      .map(([vid, v]) => ({
        id: vid,
        name: String(v.get('name') ?? ''),
        createdAt: String(v.get('createdAt') ?? ''),
        origin: (v.get('origin') as VariantOrigin | undefined) ?? 'author',
        ...versionOf(v),
      }))
      .sort((a, b) =>
        a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1,
      ),
  };
}

export function getScene(doc: Y.Doc, sceneId: string): SceneInfo | undefined {
  const m = scenesMap(doc).get(sceneId);
  return m && isLive(m) ? toScene(sceneId, m, trashedVersionIds(doc)) : undefined;
}

/** Live scenes of a live chapter, in order, in every version. */
export function listScenes(doc: Y.Doc, chapterId: string): SceneInfo[] {
  const trashed = trashedVersionIds(doc);
  return sortOrdered(
    [...scenesMap(doc).entries()]
      .filter(([, m]) => isLive(m) && m.get('chapterId') === chapterId)
      .map(([id, m]) => toScene(id, m, trashed)),
  );
}

/**
 * Where `index` among the siblings the active version shows falls among all
 * of them (scenes of other versions may sit in between).
 */
function indexAmongAll<T extends { readonly id: string }>(
  all: readonly T[],
  shown: (item: T) => boolean,
  index: number,
): number {
  const visible = all.filter(shown);
  if (visible.length === all.length) return index;
  const at = visible[index];
  return at ? all.indexOf(at) : all.length;
}

/** Creates a scene and its first variant's metadata. The variant's text lives in the scene document. */
export function createScene(
  doc: Y.Doc,
  input: { chapterId: string; title: string; index?: number; variantName?: string },
  origin: Origin = AUTHOR,
): { sceneId: string; variantId: string } {
  const sceneId = newId();
  const variantId = newId();
  doc.transact(() => {
    requireMap(chaptersMap(doc), input.chapterId, 'chapter');
    const scenes = scenesMap(doc);
    const siblings = listScenes(doc, input.chapterId);
    const version = activeVersionId(doc);
    const index =
      input.index === undefined
        ? siblings.length
        : indexAmongAll(siblings, (sc) => sceneInVersion(doc, sc.id, version), input.index);
    const order = keyAt(siblings, index, (sid, o) => scenes.get(sid)?.set('order', o));
    const scene = new Y.Map<unknown>();
    scenes.set(sceneId, scene);
    scene.set('title', input.title);
    scene.set('chapterId', input.chapterId);
    scene.set('order', order);
    scene.set('createdAt', nowIso());
    const variants = new Y.Map<YMap>();
    scene.set('variants', variants);
    variants.set(variantId, variantEntry(input.variantName ?? '', 'author'));
    scene.set('activeVariantId', variantId);
    // Made outside Principale: it belongs to that version only (DESIGN 1.20).
    const owner = ownerVersion(doc);
    if (owner) {
      scene.set('version', owner);
      recordVariantChoice(doc, sceneId, variantId);
    }
  }, origin);
  return { sceneId, variantId };
}

export function renameScene(
  doc: Y.Doc,
  sceneId: string,
  title: string,
  origin: Origin = AUTHOR,
): void {
  doc.transact(() => requireMap(scenesMap(doc), sceneId, 'scene').set('title', title), origin);
}

/** Moves a scene to `index` in `chapterId` (same or another chapter). */
export function moveScene(
  doc: Y.Doc,
  sceneId: string,
  to: { chapterId: string; index: number },
  origin: Origin = AUTHOR,
): void {
  doc.transact(() => {
    requireMap(chaptersMap(doc), to.chapterId, 'chapter');
    const scenes = scenesMap(doc);
    const scene = requireMap(scenes, sceneId, 'scene');
    const siblings = listScenes(doc, to.chapterId).filter((s) => s.id !== sceneId);
    const version = activeVersionId(doc);
    const at = indexAmongAll(siblings, (sc) => sceneInVersion(doc, sc.id, version), to.index);
    scene.set('chapterId', to.chapterId);
    scene.set(
      'order',
      keyAt(siblings, at, (sid, o) => scenes.get(sid)?.set('order', o)),
    );
  }, origin);
}

export function trashScene(doc: Y.Doc, sceneId: string, origin: Origin = AUTHOR): void {
  doc.transact(
    () => requireMap(scenesMap(doc), sceneId, 'scene').set('trashedAt', nowIso()),
    origin,
  );
}

export function restoreScene(doc: Y.Doc, sceneId: string, origin: Origin = AUTHOR): void {
  doc.transact(() => requireMap(scenesMap(doc), sceneId, 'scene').delete('trashedAt'), origin);
}

// ─── Variant metadata ────────────────────────────────────────────────────

function variantEntry(name: string, origin: VariantOrigin, version?: string): YMap {
  const v = new Y.Map<unknown>();
  v.set('name', name);
  v.set('createdAt', nowIso());
  v.set('origin', origin);
  if (version) v.set('version', version);
  return v;
}

const variantsOf = (doc: Y.Doc, sceneId: string) =>
  requireMap(scenesMap(doc), sceneId, 'scene').get('variants') as Y.Map<YMap>;

/** Registers a variant whose text has already been written in the scene document. */
export function addVariantMeta(
  doc: Y.Doc,
  sceneId: string,
  input: { variantId: string; name: string; origin: VariantOrigin; activate?: boolean },
  origin: Origin = AUTHOR,
): void {
  doc.transact(() => {
    variantsOf(doc, sceneId).set(
      input.variantId,
      variantEntry(input.name, input.origin, ownerVersion(doc)),
    );
    if (input.activate) {
      requireMap(scenesMap(doc), sceneId, 'scene').set('activeVariantId', input.variantId);
      // The active version reads it from now on (DESIGN 1.20).
      recordVariantChoice(doc, sceneId, input.variantId);
    }
  }, origin);
}

export function renameVariant(
  doc: Y.Doc,
  sceneId: string,
  variantId: string,
  name: string,
  origin: Origin = AUTHOR,
): void {
  doc.transact(
    () => requireMap(variantsOf(doc, sceneId), variantId, 'variant').set('name', name),
    origin,
  );
}

export function setActiveVariant(
  doc: Y.Doc,
  sceneId: string,
  variantId: string,
  origin: Origin = AUTHOR,
): void {
  doc.transact(() => {
    const variant = requireMap(variantsOf(doc, sceneId), variantId, 'variant');
    if (!isLive(variant)) throw new Error(`Variant is in the trash: ${variantId}`);
    requireMap(scenesMap(doc), sceneId, 'scene').set('activeVariantId', variantId);
    // Only the active version's choice changes (DESIGN 1.20).
    recordVariantChoice(doc, sceneId, variantId);
  }, origin);
}

/** Trashes a variant. The active variant cannot be trashed: activate another one first. */
export function trashVariant(
  doc: Y.Doc,
  sceneId: string,
  variantId: string,
  origin: Origin = AUTHOR,
): void {
  doc.transact(() => {
    const scene = requireMap(scenesMap(doc), sceneId, 'scene');
    if (scene.get('activeVariantId') === variantId)
      throw new Error('Cannot trash the active variant');
    requireMap(variantsOf(doc, sceneId), variantId, 'variant').set('trashedAt', nowIso());
  }, origin);
}

// ─── Outline and keyboard-friendly moves ─────────────────────────────────

export interface OutlineChapter extends ChapterInfo {
  readonly scenes: readonly SceneInfo[];
}

/**
 * Live chapters with their live scenes, in reading order, as a working
 * version shows them (the active one by default, DESIGN 1.20): its scenes
 * only; a chapter shows when it has one of them, or when it is empty and
 * not another version's. With a single version, the whole manuscript.
 */
export function readOutline(
  doc: Y.Doc,
  versionId: string = activeVersionId(doc),
): OutlineChapter[] {
  const chapters = chaptersMap(doc);
  return readFullOutline(doc).flatMap((chapter) => {
    const scenes = chapter.scenes.filter((s) => sceneInVersion(doc, s.id, versionId));
    if (scenes.length > 0) return [{ ...chapter, scenes }];
    const m = chapters.get(chapter.id);
    return chapter.scenes.length === 0 && m && emptyChapterInVersion(m, versionId)
      ? [{ ...chapter, scenes }]
      : [];
  });
}

/** Every live chapter with every live scene, whatever the version (sync, the mirror's store). */
export function readFullOutline(doc: Y.Doc): OutlineChapter[] {
  return listChapters(doc).map((chapter) => ({ ...chapter, scenes: listScenes(doc, chapter.id) }));
}

/** Live scenes of the whole manuscript, in every version, in reading order. */
export function listAllScenes(doc: Y.Doc): SceneInfo[] {
  return readFullOutline(doc).flatMap((c) => c.scenes);
}

/** Live scenes of the active version (or `versionId`), in reading order. */
export function listVersionScenes(doc: Y.Doc, versionId?: string): SceneInfo[] {
  return readOutline(doc, versionId).flatMap((c) => c.scenes);
}

/** Live scenes not in this version (the drawer's « hors de cette version »). */
export function listScenesOutOfVersion(
  doc: Y.Doc,
  versionId: string = activeVersionId(doc),
): SceneInfo[] {
  const trashed = trashedVersionIds(doc);
  return listAllScenes(doc).filter(
    (s) =>
      !sceneInVersion(doc, s.id, versionId) && !(s.version !== undefined && trashed.has(s.version)),
  );
}

/**
 * Moves a scene one step up or down in reading order. At the edge of its
 * chapter it crosses into the neighbouring chapter (end of the previous one,
 * start of the next one). Returns false when there is nowhere to go.
 */
export function moveSceneStep(
  doc: Y.Doc,
  sceneId: string,
  direction: -1 | 1,
  origin: Origin = AUTHOR,
): boolean {
  const outline = readOutline(doc);
  const chapterIndex = outline.findIndex((c) => c.scenes.some((s) => s.id === sceneId));
  const chapter = outline[chapterIndex];
  if (!chapter) return false;
  const index = chapter.scenes.findIndex((s) => s.id === sceneId);
  const target = index + direction;
  if (target >= 0 && target < chapter.scenes.length) {
    moveScene(doc, sceneId, { chapterId: chapter.id, index: target }, origin);
    return true;
  }
  const neighbour = outline[chapterIndex + direction];
  if (!neighbour) return false;
  moveScene(
    doc,
    sceneId,
    { chapterId: neighbour.id, index: direction === 1 ? 0 : neighbour.scenes.length },
    origin,
  );
  return true;
}

/** Moves a chapter one step up or down. Returns false at the edges. */
export function moveChapterStep(
  doc: Y.Doc,
  chapterId: string,
  direction: -1 | 1,
  origin: Origin = AUTHOR,
): boolean {
  const chapters = readOutline(doc);
  const index = chapters.findIndex((c) => c.id === chapterId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= chapters.length) return false;
  moveChapter(doc, chapterId, target, origin);
  return true;
}

export interface TrashContent {
  readonly chapters: readonly ChapterInfo[];
  readonly scenes: readonly (SceneInfo & { readonly trashedAt: string })[];
}

/** What the author put in the trash, most recent first. */
export function listTrash(doc: Y.Doc): TrashContent {
  const byDate = <T extends { trashedAt: string }>(items: T[]) =>
    items.sort((a, b) => (a.trashedAt < b.trashedAt ? 1 : a.trashedAt > b.trashedAt ? -1 : 0));
  return {
    chapters: byDate(
      [...chaptersMap(doc).entries()]
        .filter(([, m]) => !isLive(m))
        .map(([id, m]) => ({ ...toChapter(id, m), trashedAt: String(m.get('trashedAt')) })),
    ),
    scenes: byDate(
      [...scenesMap(doc).entries()]
        .filter(([, m]) => !isLive(m))
        .map(([id, m]) => ({ ...toScene(id, m), trashedAt: String(m.get('trashedAt')) })),
    ),
  };
}

/** Restores a scene and, if needed, its chapter. */
export function restoreSceneWithChapter(
  doc: Y.Doc,
  sceneId: string,
  origin: Origin = AUTHOR,
): void {
  doc.transact(() => {
    const scene = requireMap(scenesMap(doc), sceneId, 'scene');
    scene.delete('trashedAt');
    chaptersMap(doc)
      .get(String(scene.get('chapterId')))
      ?.delete('trashedAt');
  }, origin);
}

// ─── Trashed variants ────────────────────────────────────────────────────

/** Variants of a scene that are in the trash. */
export function listTrashedVariants(
  doc: Y.Doc,
  sceneId: string,
): (VariantInfo & { readonly trashedAt: string })[] {
  return [...variantsOf(doc, sceneId).entries()]
    .filter(([, v]) => !isLive(v))
    .map(([vid, v]) => ({
      id: vid,
      name: String(v.get('name') ?? ''),
      createdAt: String(v.get('createdAt') ?? ''),
      origin: (v.get('origin') as VariantOrigin | undefined) ?? 'author',
      trashedAt: String(v.get('trashedAt')),
    }));
}

export function restoreVariant(
  doc: Y.Doc,
  sceneId: string,
  variantId: string,
  origin: Origin = AUTHOR,
): void {
  doc.transact(
    () => requireMap(variantsOf(doc, sceneId), variantId, 'variant').delete('trashedAt'),
    origin,
  );
}
