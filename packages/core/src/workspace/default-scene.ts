import {
  createChapter,
  createScene,
  guids,
  initProject,
  listAllScenes,
  listChapters,
  readProjectMeta,
  renameProject,
  SYSTEM,
} from '@charpentier/schema';
import type { DocumentHandle, Platform } from '@charpentier/platform';
import type * as Y from 'yjs';

/** The project opened last on this device. */
export const LAST_PROJECT_PREF = 'lastProjectId';
/** The single project of phases 1.5–1.9, adopted into the library on first start. */
export const LEGACY_PROJECT_PREF = 'lastProjectId';
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
      if (last && live.some((p) => p.id === last)) return last;
      const legacy = await preferences.get<string>(LEGACY_PROJECT_PREF);
      if (legacy && !live.some((p) => p.id === legacy)) {
        const trashed = await library.listTrashed();
        if (!trashed.some((p) => p.id === legacy)) {
          // Its real title is read from its document when it opens.
          await library.create({ id: legacy, title: titles.project, kind: 'novel' });
          return legacy;
        }
      }
      const recent = live[0];
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
  const first = listAllScenes(root)[0];
  if (first) return first.id;
  const chapterId =
    listChapters(root)[0]?.id ?? createChapter(root, { title: titles.chapter }, SYSTEM);
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
    const fallback = ensureScene(root, titles);
    const last = await platform.preferences.get<string>(lastScenePref(projectId));
    const live = new Set(listAllScenes(root).map((s) => s.id));
    const opened = handle;
    return {
      projectId,
      root,
      language: meta?.language ?? 'fr',
      initialSceneId: last && live.has(last) ? last : fallback,
      close: () => opened.close(),
    };
  } catch (error) {
    await handle?.close();
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
