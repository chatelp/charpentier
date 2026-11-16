import type * as Y from 'yjs';
import { fragmentPlainText } from './history';
import { listAllScenes, listChapters } from './manuscript';
import { chatMessages, interviewMessages } from './mentor-chat';
import { entityModules, listEntities, readSingleton, singletonModules } from './modules';
import { variantFragment } from './scene-content';
import { listSignals } from './signals';

/**
 * A project nobody has touched yet: the one a new device makes at its first
 * start, before it is signed in (one chapter, one empty scene, no sheet, no
 * conversation). Signing such a device in to an account that already has
 * projects must not add an empty « Mon roman » to the account (essais du
 * 16 novembre 2026). Any word, sheet or message makes it a real project.
 */
export function isPristineProject(input: {
  readonly root: Y.Doc;
  readonly mentor?: Y.Doc;
  /** The scene documents, by scene id (a missing one counts as empty). */
  readonly scenes: ReadonlyMap<string, Y.Doc>;
}): boolean {
  const { root, mentor, scenes } = input;
  if (listChapters(root).length > 1) return false;
  const live = listAllScenes(root);
  if (live.length > 1) return false;
  for (const scene of live) {
    const doc = scenes.get(scene.id);
    if (doc && fragmentPlainText(variantFragment(doc, scene.activeVariantId)).trim()) return false;
  }
  for (const module of singletonModules)
    if (Object.values(readSingleton(root, module)).some((f) => f.status !== undefined))
      return false;
  for (const module of entityModules) if (listEntities(root, module).length) return false;
  if (listSignals(root).length) return false;
  if (mentor && (chatMessages(mentor).length || interviewMessages(mentor).length)) return false;
  return true;
}
