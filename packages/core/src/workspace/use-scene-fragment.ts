import type { Platform } from '@charpentier/platform';
import { guids, variantFragment } from '@charpentier/schema';
import { useEffect, useState } from 'react';
import type * as Y from 'yjs';

/** Opens a scene's document while it is shown and returns the variant's fragment (null while loading). */
export function useSceneFragment(
  platform: Platform,
  projectId: string,
  sceneId: string,
  variantId: string,
): Y.XmlFragment | null {
  const key = `${sceneId}/${variantId}`;
  const [loaded, setLoaded] = useState<{ key: string; fragment: Y.XmlFragment } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let release: (() => Promise<void>) | undefined;
    platform.documents.open(guids.scene(projectId, sceneId)).then(
      async (handle) => {
        await handle.whenLoaded;
        if (cancelled) return void handle.close();
        release = () => handle.close();
        setLoaded({ key, fragment: variantFragment(handle.doc, variantId) });
      },
      (error: unknown) => console.error(error),
    );
    return () => {
      cancelled = true;
      void release?.();
    };
  }, [platform, projectId, sceneId, variantId, key]);

  return loaded?.key === key ? loaded.fragment : null;
}
