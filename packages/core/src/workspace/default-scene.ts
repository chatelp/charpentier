import {
  createChapter,
  createScene,
  guids,
  initProject,
  listAllScenes,
  listChapters,
  newId,
  readProjectMeta,
  SYSTEM,
} from '@charpentier/schema';
import type { DocumentHandle, Platform } from '@charpentier/platform';
import type * as Y from 'yjs';

export const DEFAULT_PROJECT_PREF = 'defaultProjectId';
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
 * The default project's id, created on first use. Concurrent callers (React
 * runs effects twice in development) share one lookup, so a single project is
 * ever created.
 */
function defaultProjectId(platform: Platform): Promise<string> {
  let pending = pendingIds.get(platform);
  if (!pending) {
    pending = (async () => {
      const existing = await platform.preferences.get<string>(DEFAULT_PROJECT_PREF);
      if (existing) return existing;
      const created = newId();
      await platform.preferences.set(DEFAULT_PROJECT_PREF, created);
      return created;
    })();
    pendingIds.set(platform, pending);
    pending.catch(() => pendingIds.delete(platform));
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

/** Opens the default project (phase 1.5–1.9; the library arrives in phase 1.10). */
export async function openDefaultProject(
  platform: Platform,
  titles: DefaultTitles,
): Promise<ProjectSession> {
  const projectId = await defaultProjectId(platform);
  let handle: DocumentHandle | undefined;
  try {
    handle = await platform.documents.open(guids.project(projectId));
    await handle.whenLoaded;
    const root = handle.doc;
    initProject(root, { id: projectId, title: titles.project, kind: 'novel' });
    const fallback = ensureScene(root, titles);
    const last = await platform.preferences.get<string>(lastScenePref(projectId));
    const live = new Set(listAllScenes(root).map((s) => s.id));
    const opened = handle;
    return {
      projectId,
      root,
      language: readProjectMeta(root)?.language ?? 'fr',
      initialSceneId: last && live.has(last) ? last : fallback,
      close: () => opened.close(),
    };
  } catch (error) {
    await handle?.close();
    throw error;
  }
}
