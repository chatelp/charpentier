import {
  createChapter,
  createScene,
  getScene,
  guids,
  initProject,
  listChapters,
  listScenes,
  newId,
  readProjectMeta,
  SYSTEM,
  variantFragment,
} from '@charpentier/schema';
import type { DocumentHandle, Platform } from '@charpentier/platform';
import type * as Y from 'yjs';

export const DEFAULT_PROJECT_PREF = 'defaultProjectId';

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

export interface OpenScene {
  readonly projectId: string;
  readonly sceneId: string;
  readonly language: string;
  readonly fragment: Y.XmlFragment;
  close(): Promise<void>;
}

/**
 * Opens the default project's first scene, creating the project, a first
 * chapter and a first scene when they do not exist yet. Phase 1.5 only knows
 * one project; the library arrives in phase 1.10.
 */
export async function openDefaultScene(
  platform: Platform,
  titles: { project: string; chapter: string; scene: string },
): Promise<OpenScene> {
  const projectId = await defaultProjectId(platform);

  const handles: DocumentHandle[] = [];
  try {
    const root = await platform.documents.open(guids.project(projectId));
    handles.push(root);
    await root.whenLoaded;
    initProject(root.doc, { id: projectId, title: titles.project, kind: 'novel' });

    const chapterId =
      listChapters(root.doc)[0]?.id ?? createChapter(root.doc, { title: titles.chapter }, SYSTEM);
    const sceneId =
      listScenes(root.doc, chapterId)[0]?.id ??
      createScene(root.doc, { chapterId, title: titles.scene }, SYSTEM).sceneId;
    const scene = getScene(root.doc, sceneId);
    if (!scene) throw new Error(`Scene vanished: ${sceneId}`);

    const sceneHandle = await platform.documents.open(guids.scene(projectId, sceneId));
    handles.push(sceneHandle);
    await sceneHandle.whenLoaded;

    return {
      projectId,
      sceneId,
      language: readProjectMeta(root.doc)?.language ?? 'fr',
      fragment: variantFragment(sceneHandle.doc, scene.activeVariantId),
      close: async () => {
        for (const handle of handles.reverse()) await handle.close();
      },
    };
  } catch (error) {
    for (const handle of handles.reverse()) await handle.close();
    throw error;
  }
}
