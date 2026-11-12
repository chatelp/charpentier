import type { Platform } from '@charpentier/platform';
import {
  fragmentPlainText,
  guids,
  variantFragment,
  type OutlineChapter,
} from '@charpentier/schema';
import { useEffect, useState } from 'react';
import { countWords } from '../editor/word-count';

/**
 * Words of each scene's active variant, read from the scene documents one
 * after the other (each scene text lives in its own document, D-4).
 */
export function useSceneWords(
  platform: Platform,
  projectId: string,
  outline: readonly OutlineChapter[],
): ReadonlyMap<string, number> {
  const [words, setWords] = useState<ReadonlyMap<string, number>>(new Map());
  const key = outline.flatMap((c) => c.scenes.map((s) => `${s.id}/${s.activeVariantId}`)).join(',');

  useEffect(() => {
    let cancelled = false;
    const scenes = outline.flatMap((c) => c.scenes);
    void (async () => {
      const counts = new Map<string, number>();
      for (const scene of scenes) {
        if (cancelled) return;
        const handle = await platform.documents.open(guids.scene(projectId, scene.id));
        try {
          await handle.whenLoaded;
          counts.set(
            scene.id,
            countWords(fragmentPlainText(variantFragment(handle.doc, scene.activeVariantId))),
          );
        } finally {
          await handle.close();
        }
      }
      if (!cancelled) setWords(counts);
    })();
    return () => {
      cancelled = true;
    };
    // `key` stands for the scenes and their active variants.
  }, [platform, projectId, key]);

  return words;
}
