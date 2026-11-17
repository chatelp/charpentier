import * as Y from 'yjs';
import { names, newId, nowIso } from './ids';
import { AUTHOR, type Origin } from './origins';

/**
 * Working versions of the novel (docs/DESIGN.md §4.4 « Versions de travail »,
 * 1.20, docs/PLAN.md phase 7.2). A version has a name and keeps, for each
 * scene, which variant to read, or that the scene is not part of it. Nothing
 * is copied: everything else (the order of chapters and scenes, the Atelier,
 * the Compagnon's thread and notebook) is common to all versions.
 *
 * Storage, in the project's root document:
 * - « Principale » always exists and is not stored as an entry: its choices
 *   and memberships are two top-level maps (`versionMain:choices`,
 *   `versionMain:members`), its name a field of the meta (`mainVersionName`);
 * - the other versions live in the top-level map `versions`, each under a
 *   random key, with its `choices` (scene → variant) and `members` (scene →
 *   in or out, when it differs from the default);
 * - the active version is project data (`activeVersion` in the meta), not
 *   the device's: switching sets every scene's `activeVariantId` in one
 *   transaction of the author, so another device opens on the same version;
 * - a scene, a chapter or a variant created outside Principale carries the
 *   version's id (`version`): it belongs to that version only.
 *
 * A scene is « common » in a version when the version has no choice of its
 * own for it: it reads Principale's variant, and writing in it writes for
 * every version that shares it.
 */

export const MAIN_VERSION = 'main';

export interface VersionInfo {
  readonly id: string;
  /** Empty for Principale when the author has not renamed it (the UI names it). */
  readonly name: string;
  readonly createdAt: string;
  readonly isMain: boolean;
  /** When the author last left it (« hier »), if ever. */
  readonly usedAt?: string;
  readonly trashedAt?: string;
}

type YMap = Y.Map<unknown>;

const meta = (doc: Y.Doc) => doc.getMap<unknown>(names.meta);
const versionsMap = (doc: Y.Doc) => doc.getMap<YMap>(names.versions);
const scenesMap = (doc: Y.Doc) => doc.getMap<YMap>(names.scenes);
const mainChoices = (doc: Y.Doc) => doc.getMap<string>(names.versionMainChoices);
const mainMembers = (doc: Y.Doc) => doc.getMap<boolean>(names.versionMainMembers);

const isLive = (m: YMap) => m.get('trashedAt') === undefined;

/** A version's choices and memberships (Principale's are top-level). */
function stateOf(
  doc: Y.Doc,
  versionId: string,
): { choices: Y.Map<string>; members: Y.Map<boolean> } | undefined {
  if (versionId === MAIN_VERSION) return { choices: mainChoices(doc), members: mainMembers(doc) };
  const entry = versionsMap(doc).get(versionId);
  if (!entry) return undefined;
  return {
    choices: entry.get('choices') as Y.Map<string>,
    members: entry.get('members') as Y.Map<boolean>,
  };
}

const toVersion = (id: string, m: YMap): VersionInfo => ({
  id,
  name: String(m.get('name') ?? ''),
  createdAt: String(m.get('createdAt') ?? ''),
  isMain: false,
  ...(typeof m.get('usedAt') === 'string' && { usedAt: String(m.get('usedAt')) }),
  ...(typeof m.get('trashedAt') === 'string' && { trashedAt: String(m.get('trashedAt')) }),
});

/** Principale, then the live versions, oldest first. */
export function listVersions(doc: Y.Doc): VersionInfo[] {
  const main: VersionInfo = {
    id: MAIN_VERSION,
    name: String(meta(doc).get('mainVersionName') ?? ''),
    createdAt: String(meta(doc).get('createdAt') ?? ''),
    isMain: true,
    ...(typeof meta(doc).get('mainUsedAt') === 'string' && {
      usedAt: String(meta(doc).get('mainUsedAt')),
    }),
  };
  const others = [...versionsMap(doc).entries()]
    .filter(([, m]) => isLive(m))
    .map(([id, m]) => toVersion(id, m))
    .sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1,
    );
  return [main, ...others];
}

/** Versions in the trash, most recent first. */
export function listTrashedVersions(doc: Y.Doc): VersionInfo[] {
  return [...versionsMap(doc).entries()]
    .filter(([, m]) => !isLive(m))
    .map(([id, m]) => toVersion(id, m))
    .sort((a, b) => ((a.trashedAt ?? '') < (b.trashedAt ?? '') ? 1 : -1));
}

/** Ids of the versions in the trash: their own scenes and variants are hidden with them. */
export function trashedVersionIds(doc: Y.Doc): ReadonlySet<string> {
  return new Set([...versionsMap(doc).entries()].filter(([, m]) => !isLive(m)).map(([id]) => id));
}

/** The version the author reads and writes (Principale when none, or when it is trashed). */
export function activeVersionId(doc: Y.Doc): string {
  const id = meta(doc).get('activeVersion');
  if (typeof id !== 'string' || id === MAIN_VERSION) return MAIN_VERSION;
  const entry = versionsMap(doc).get(id);
  return entry && isLive(entry) ? id : MAIN_VERSION;
}

/** Does this scene belong to this version? */
export function sceneInVersion(doc: Y.Doc, sceneId: string, versionId: string): boolean {
  const scene = scenesMap(doc).get(sceneId);
  if (!scene) return false;
  const explicit = stateOf(doc, versionId)?.members.get(sceneId);
  if (explicit !== undefined) return explicit;
  const own = scene.get('version');
  if (typeof own !== 'string') return true;
  return own === versionId;
}

/** Does this chapter, without any live scene, show in this version? */
export function emptyChapterInVersion(chapter: YMap, versionId: string): boolean {
  const own = chapter.get('version');
  return typeof own !== 'string' || own === versionId;
}

const liveVariant = (scene: YMap, variantId: unknown): variantId is string => {
  if (typeof variantId !== 'string') return false;
  const variant = (scene.get('variants') as Y.Map<YMap> | undefined)?.get(variantId);
  return variant !== undefined && isLive(variant);
};

/** The variant a version reads for a scene: its own choice, else Principale's. */
export function versionVariant(doc: Y.Doc, sceneId: string, versionId: string): string {
  const scene = scenesMap(doc).get(sceneId);
  if (!scene) return '';
  const own = stateOf(doc, versionId)?.choices.get(sceneId);
  if (versionId !== MAIN_VERSION && liveVariant(scene, own)) return own;
  const main = mainChoices(doc).get(sceneId);
  if (liveVariant(scene, main)) return main;
  return String(scene.get('activeVariantId') ?? '');
}

/**
 * Is this scene common in this version (it reads Principale's variant, and
 * writing in it writes for every version that shares it)? Principale's own
 * scenes are not « common » there: nothing is said of them.
 */
export function sceneIsCommon(doc: Y.Doc, sceneId: string, versionId: string): boolean {
  if (versionId === MAIN_VERSION) return false;
  const scene = scenesMap(doc).get(sceneId);
  if (!scene || typeof scene.get('version') === 'string') return false;
  return versionVariant(doc, sceneId, versionId) === versionVariant(doc, sceneId, MAIN_VERSION);
}

/** How many versions share this scene's text (Principale's variant): writing in it writes for them all. */
export function versionsSharingScene(doc: Y.Doc, sceneId: string): number {
  const main = versionVariant(doc, sceneId, MAIN_VERSION);
  return listVersions(doc).filter(
    (v) => sceneInVersion(doc, sceneId, v.id) && versionVariant(doc, sceneId, v.id) === main,
  ).length;
}

/** Scenes that read a variant of their own in this version (« 3 scènes à elle »). */
export function versionOwnScenes(doc: Y.Doc, versionId: string): number {
  if (versionId === MAIN_VERSION) return 0;
  return [...scenesMap(doc).entries()].filter(
    ([id, m]) =>
      isLive(m) && sceneInVersion(doc, id, versionId) && !sceneIsCommon(doc, id, versionId),
  ).length;
}

/**
 * Called when the variant read for a scene changes (switching variant, a new
 * variant made active): the active version keeps it as its choice.
 */
export function recordVariantChoice(doc: Y.Doc, sceneId: string, variantId: string): void {
  stateOf(doc, activeVersionId(doc))?.choices.set(sceneId, variantId);
}

/** Every scene reads the variant of `versionId` (inside a transaction). */
function applyVersion(doc: Y.Doc, versionId: string): void {
  for (const [sceneId, scene] of scenesMap(doc).entries()) {
    const variant = versionVariant(doc, sceneId, versionId);
    if (variant && scene.get('activeVariantId') !== variant) scene.set('activeVariantId', variant);
  }
}

/** Principale keeps what each scene reads before the author leaves it. */
function rememberMain(doc: Y.Doc): void {
  const choices = mainChoices(doc);
  for (const [sceneId, scene] of scenesMap(doc).entries()) {
    const current = scene.get('activeVariantId');
    if (typeof current === 'string' && !liveVariant(scene, choices.get(sceneId)))
      choices.set(sceneId, current);
  }
}

/** Passes to another version: no confirmation, nothing to save. */
export function switchVersion(doc: Y.Doc, versionId: string, origin: Origin = AUTHOR): void {
  doc.transact(() => {
    const from = activeVersionId(doc);
    if (from === versionId) return;
    if (versionId !== MAIN_VERSION) {
      const entry = versionsMap(doc).get(versionId);
      if (!entry || !isLive(entry)) throw new Error(`Unknown version: ${versionId}`);
    }
    if (from === MAIN_VERSION) {
      rememberMain(doc);
      meta(doc).set('mainUsedAt', nowIso());
    } else versionsMap(doc).get(from)?.set('usedAt', nowIso());
    meta(doc).set('activeVersion', versionId);
    applyVersion(doc, versionId);
  }, origin);
}

/**
 * A new version, from the active one as it stands, which it becomes: its
 * own choices and memberships are carried over, nothing else is copied.
 */
export function createVersion(doc: Y.Doc, name: string, origin: Origin = AUTHOR): string {
  const id = newId();
  doc.transact(() => {
    const from = stateOf(doc, activeVersionId(doc));
    const entry = new Y.Map<unknown>();
    versionsMap(doc).set(id, entry);
    entry.set('name', name);
    entry.set('createdAt', nowIso());
    entry.set('from', activeVersionId(doc));
    const choices = new Y.Map<string>();
    const members = new Y.Map<boolean>();
    entry.set('choices', choices);
    entry.set('members', members);
    // Principale's choices are what every version reads anyway; another
    // version's are carried over, and so are its own scenes.
    if (activeVersionId(doc) !== MAIN_VERSION && from) {
      for (const [sceneId, variantId] of from.choices.entries()) choices.set(sceneId, variantId);
      for (const [sceneId, member] of from.members.entries()) members.set(sceneId, member);
      const fromId = activeVersionId(doc);
      for (const [sceneId, scene] of scenesMap(doc).entries())
        if (scene.get('version') === fromId && !members.has(sceneId)) members.set(sceneId, true);
    }
  }, origin);
  switchVersion(doc, id, origin);
  return id;
}

export function renameVersion(
  doc: Y.Doc,
  versionId: string,
  name: string,
  origin: Origin = AUTHOR,
): void {
  doc.transact(() => {
    if (versionId === MAIN_VERSION) meta(doc).set('mainVersionName', name);
    else versionsMap(doc).get(versionId)?.set('name', name);
  }, origin);
}

/**
 * Puts a version in the trash, with its own variants and scenes (they come
 * back with it). Principale never goes. Trashing the active version goes
 * back to Principale first.
 */
export function trashVersion(doc: Y.Doc, versionId: string, origin: Origin = AUTHOR): void {
  if (versionId === MAIN_VERSION) throw new Error('Principale cannot be trashed');
  doc.transact(() => {
    if (activeVersionId(doc) === versionId) switchVersion(doc, MAIN_VERSION, origin);
    versionsMap(doc).get(versionId)?.set('trashedAt', nowIso());
  }, origin);
}

export function restoreVersion(doc: Y.Doc, versionId: string, origin: Origin = AUTHOR): void {
  doc.transact(() => versionsMap(doc).get(versionId)?.delete('trashedAt'), origin);
}

/** « Retirer de cette version » / « Ajouter à cette version »: nothing is thrown away. */
export function setSceneInVersion(
  doc: Y.Doc,
  sceneId: string,
  member: boolean,
  versionId: string = activeVersionId(doc),
  origin: Origin = AUTHOR,
): void {
  doc.transact(() => stateOf(doc, versionId)?.members.set(sceneId, member), origin);
}

/** The version a new scene, chapter or variant belongs to: none in Principale. */
export function ownerVersion(doc: Y.Doc): string | undefined {
  const active = activeVersionId(doc);
  return active === MAIN_VERSION ? undefined : active;
}
