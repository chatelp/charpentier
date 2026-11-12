import type { Platform } from '@charpentier/platform';
import {
  fragmentPlainText,
  guids,
  variantFragment,
  type OutlineChapter,
} from '@charpentier/schema';
import { useEffect, useMemo, useState } from 'react';
import { countWords } from '../editor/word-count';

/**
 * Plain text of each scene's active variant, read from the scene documents
 * one after the other (each scene lives in its own document, D-4). Read again
 * when scenes or active variants change; the open scene is kept live by its
 * editor elsewhere.
 */
export function useSceneTexts(
  platform: Platform,
  projectId: string,
  outline: readonly OutlineChapter[],
): ReadonlyMap<string, string> {
  const [texts, setTexts] = useState<ReadonlyMap<string, string>>(new Map());
  const key = outline.flatMap((c) => c.scenes.map((s) => `${s.id}/${s.activeVariantId}`)).join(',');

  useEffect(() => {
    let cancelled = false;
    const scenes = outline.flatMap((c) => c.scenes);
    void (async () => {
      const read = new Map<string, string>();
      for (const scene of scenes) {
        if (cancelled) return;
        const handle = await platform.documents.open(guids.scene(projectId, scene.id));
        try {
          await handle.whenLoaded;
          read.set(scene.id, fragmentPlainText(variantFragment(handle.doc, scene.activeVariantId)));
        } finally {
          await handle.close();
        }
      }
      if (!cancelled) setTexts(read);
    })();
    return () => {
      cancelled = true;
    };
    // `key` stands for the scenes and their active variants.
  }, [platform, projectId, key]);

  return texts;
}

/** Words of each scene, from its text. */
export function useWordsOf(texts: ReadonlyMap<string, string>): ReadonlyMap<string, number> {
  return useMemo(() => new Map([...texts].map(([id, text]) => [id, countWords(text)])), [texts]);
}
