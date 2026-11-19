import {
  createChapter,
  createScene,
  fragmentToSceneDoc,
  getScene,
  guids,
  initProject,
  listAllScenes,
  listChapters,
  listVersionScenes,
  readOutline,
  readProjectMeta,
  renameProject,
  SYSTEM,
  variantFragment,
} from '@charpentier/schema';
import type { DocumentHandle, Platform } from '@charpentier/platform';
import type * as Y from 'yjs';

/** The project opened last on this device. */
export const LAST_PROJECT_PREF = 'lastProjectId';
/** The single project of phases 1.5–1.9, adopted into the library on first start. */
export const LEGACY_PROJECT_PREF = 'lastProjectId';
/**
 * The project that could not be opened last time, until one opens again: the
 * next start goes to another one rather than fail on the same, launch after launch.
 */
export const FAILED_PROJECT_PREF = 'failedProjectId';
export const lastScenePref = (projectId: string) => `lastScene:${projectId}`;

export interface DefaultTitles {
  readonly project: string;
  readonly chapter: string;
  readonly scene: string;
}

export interface ProjectSession {
  readonly projectId: string;
  readonly root: Y.Doc;
  readonly language: string;
  /** The scene to show first: the last one opened, or the first one. */
  readonly initialSceneId: string;
  close(): Promise<void>;
}

const pendingIds = new WeakMap<Platform, Promise<string>>();

/**
 * The project to open at start: the last one opened, else a project created
 * before the library existed (adopted into it), else the most recent one,
 * else a new one. Concurrent callers (React runs effects twice in
 * development) share one lookup, so a single project is ever created.
 */
export function initialProjectId(platform: Platform, titles: DefaultTitles): Promise<string> {
  let pending = pendingIds.get(platform);
  if (!pending) {
    pending = (async () => {
      const { library, preferences } = platform;
      const live = await library.list();
      const last = await preferences.get<string>(LAST_PROJECT_PREF);
      const failed = await preferences.get<string | null>(FAILED_PROJECT_PREF);
      if (last && last !== failed && live.some((p) => p.id === last)) return last;
      const legacy = await preferences.get<string>(LEGACY_PROJECT_PREF);
      if (legacy && !live.some((p) => p.id === legacy)) {
        const trashed = await library.listTrashed();
        if (!trashed.some((p) => p.id === legacy)) {
          // Its real title is read from its document when it opens.
          await library.create({ id: legacy, title: titles.project, kind: 'novel' });
          return legacy;
        }
      }
      // The one that failed only when it is the only one: the app then says so and offers the library.
      const recent = live.find((p) => p.id !== failed) ?? live[0];
      if (recent) return recent.id;
      return (await library.create({ title: titles.project, kind: 'novel' })).id;
    })();
    pendingIds.set(platform, pending);
    // Each start decides afresh (the library may have changed meanwhile).
    void pending.finally(() => pendingIds.delete(platform)).catch(() => {});
  }
  return pending;
}

/**
 * A manuscript always has at least one scene to write in: creates a chapter
 * and a scene when there are none. Returns the first live scene.
 */
export function ensureScene(root: Y.Doc, titles: Pick<DefaultTitles, 'chapter' | 'scene'>): string {
  // The active version's (DESIGN 1.20): a version without scenes gets one of its own.
  const first = listVersionScenes(root)[0];
  if (first) return first.id;
  const chapterId =
    readOutline(root)[0]?.id ?? createChapter(root, { title: titles.chapter }, SYSTEM);
  return createScene(root, { chapterId, title: titles.scene }, SYSTEM).sceneId;
}

/** Opens a project of the library, ready to write in. */
export async function openProject(
  platform: Platform,
  projectId: string,
  titles: DefaultTitles,
): Promise<ProjectSession> {
  const summary = [
    ...(await platform.library.list()),
    ...(await platform.library.listTrashed()),
  ].find((p) => p.id === projectId);
  let handle: DocumentHandle | undefined;
  try {
    handle = await platform.documents.open(guids.project(projectId));
    await handle.whenLoaded;
    const root = handle.doc;
    initProject(root, {
      id: projectId,
      title: summary?.title ?? titles.project,
      kind: summary?.kind ?? 'novel',
    });
    // The root document is the reference for the title (it syncs between devices).
    const meta = readProjectMeta(root);
    if (summary && meta && meta.title !== summary.title)
      await platform.library.rename(projectId, meta.title);
    else if (summary) await platform.library.touch(projectId);
    await platform.preferences.set(LAST_PROJECT_PREF, projectId);
    if (await platform.preferences.get<string | null>(FAILED_PROJECT_PREF))
      await platform.preferences.set(FAILED_PROJECT_PREF, null);
    const fallback = ensureScene(root, titles);
    const last = await platform.preferences.get<string>(lastScenePref(projectId));
    const live = new Set(listVersionScenes(root).map((s) => s.id));
    const opened = handle;
    return {
      projectId,
      root,
      language: meta?.language ?? 'fr',
      initialSceneId: last && live.has(last) ? last : fallback,
      close: () => opened.close(),
    };
  } catch (error) {
    await handle?.close().catch(() => {});
    await platform.preferences.set(FAILED_PROJECT_PREF, projectId).catch(() => {});
    throw error;
  }
}

/** Renames a project in its own document and in the library. */
export async function renameProjectEverywhere(
  platform: Platform,
  projectId: string,
  title: string,
  openRoot?: Y.Doc,
): Promise<void> {
  if (openRoot) renameProject(openRoot, title);
  else {
    const handle = await platform.documents.open(guids.project(projectId));
    try {
      await handle.whenLoaded;
      renameProject(handle.doc, title);
    } finally {
      await handle.close();
    }
  }
  await platform.library.rename(projectId, title);
}

/**
 * A project nobody has written in yet: the default title, a single scene,
 * no text. The one a new device opens before its novel comes from the sync.
 */
export async function isBlankProject(
  platform: Platform,
  projectId: string,
  root: Y.Doc,
  titles: DefaultTitles,
): Promise<boolean> {
  if (readProjectMeta(root)?.title !== titles.project) return false;
  const scenes = listAllScenes(root);
  if (scenes.length > 1 || listChapters(root).length > 1) return false;
  const scene = scenes[0] && getScene(root, scenes[0].id);
  if (!scene) return true;
  const handle = await platform.documents.open(guids.scene(projectId, scene.id));
  try {
    await handle.whenLoaded;
    return (
      fragmentToSceneDoc(variantFragment(handle.doc, scene.activeVariantId)).textContent.trim() ===
      ''
    );
  } finally {
    await handle.close();
  }
}

async function isBlankInLibrary(platform: Platform, projectId: string, titles: DefaultTitles) {
  const handle = await platform.documents.open(guids.project(projectId));
  try {
    await handle.whenLoaded;
    return await isBlankProject(platform, projectId, handle.doc, titles);
  } finally {
    await handle.close();
  }
}

/**
 * Just signed in, the device's novel has come from the sync: when the project
 * open is still blank, it goes to the trash (never deleted) and the most
 * recent project of the account that is not blank itself (another device's
 * blank start may have reached the account) opens instead. Null otherwise.
 */
export async function projectFromSync(
  platform: Platform,
  session: ProjectSession,
  titles: DefaultTitles,
): Promise<string | null> {
  const others = (await platform.library.list()).filter((p) => p.id !== session.projectId);
  if (others.length === 0) return null;
  if (!(await isBlankProject(platform, session.projectId, session.root, titles))) return null;
  // The account's novel first; failing one, its most recent project, even
  // blank: the device's own blank stays off the account (the sync withholds
  // it) and goes to this device's trash, so that no « Mon roman » doubles.
  let chosen = others[0];
  for (const other of others)
    if (!(await isBlankInLibrary(platform, other.id, titles))) {
      chosen = other;
      break;
    }
  if (!chosen) return null;
  await platform.library.trash(session.projectId);
  return chosen.id;
}
