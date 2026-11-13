import type { Platform } from '@charpentier/platform';
import { guids } from '@charpentier/schema';
import { useEffect, useState } from 'react';
import type * as Y from 'yjs';

export interface SceneHistory {
  readonly sceneId: string;
  readonly sceneDoc: Y.Doc;
  readonly historyDoc: Y.Doc;
}

/**
 * The text and restore points of the scene selected in the overview
 * (docs/DESIGN.md §4.4), open while it is selected.
 */
export function useSceneHistory(
  platform: Platform,
  projectId: string,
  sceneId: string | undefined,
): SceneHistory | null {
  const [loaded, setLoaded] = useState<SceneHistory | null>(null);
  useEffect(() => {
    if (!sceneId) return;
    let cancelled = false;
    let release: (() => void) | undefined;
    void Promise.all([
      platform.documents.open(guids.scene(projectId, sceneId)),
      platform.documents.open(guids.sceneHistory(projectId, sceneId)),
    ]).then(async ([scene, history]) => {
      await Promise.all([scene.whenLoaded, history.whenLoaded]);
      release = () => {
        void scene.close();
        void history.close();
      };
      if (cancelled) return release();
      setLoaded({ sceneId, sceneDoc: scene.doc, historyDoc: history.doc });
    });
    return () => {
      cancelled = true;
      release?.();
    };
  }, [platform, projectId, sceneId]);
  return loaded?.sceneId === sceneId ? loaded : null;
}
