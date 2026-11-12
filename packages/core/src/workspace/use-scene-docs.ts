import type { Platform } from '@charpentier/platform';
import { guids, variantFragment } from '@charpentier/schema';
import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { AutoCheckpointer } from './auto-checkpoint';

export interface SceneDocs {
  readonly sceneDoc: Y.Doc;
  readonly historyDoc: Y.Doc;
  readonly fragment: Y.XmlFragment;
}

/**
 * Opens a scene's text and history documents while the scene is shown,
 * returns the active variant's fragment (null while loading) and keeps
 * automatic restore points.
 */
export function useSceneDocs(
  platform: Platform,
  projectId: string,
  sceneId: string,
  variantId: string,
): SceneDocs | null {
  const key = `${sceneId}/${variantId}`;
  const [loaded, setLoaded] = useState<{ key: string; docs: SceneDocs } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let release: (() => Promise<void>) | undefined;
    Promise.all([
      platform.documents.open(guids.scene(projectId, sceneId)),
      platform.documents.open(guids.sceneHistory(projectId, sceneId)),
    ]).then(
      async ([scene, history]) => {
        await Promise.all([scene.whenLoaded, history.whenLoaded]);
        const closeBoth = async () => {
          await scene.close();
          await history.close();
        };
        if (cancelled) return void closeBoth();
        const checkpointer = new AutoCheckpointer(scene.doc, history.doc, variantId);
        const onHide = () => {
          if (document.visibilityState === 'hidden') checkpointer.flush();
        };
        document.addEventListener('visibilitychange', onHide);
        release = async () => {
          document.removeEventListener('visibilitychange', onHide);
          checkpointer.dispose();
          await closeBoth();
        };
        setLoaded({
          key,
          docs: {
            sceneDoc: scene.doc,
            historyDoc: history.doc,
            fragment: variantFragment(scene.doc, variantId),
          },
        });
      },
      (error: unknown) => console.error(error),
    );
    return () => {
      cancelled = true;
      void release?.();
    };
  }, [platform, projectId, sceneId, variantId, key]);

  return loaded?.key === key ? loaded.docs : null;
}
