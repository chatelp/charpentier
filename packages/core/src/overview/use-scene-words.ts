import type { Platform } from '@charpentier/platform';
import {
  fragmentPlainText,
  guids,
  variantFragment,
  type OutlineChapter,
} from '@charpentier/schema';
import { useEffect, useMemo, useState } from 'react';
import { countWords } from '../editor/word-count';

interface SceneToRead {
  readonly id: string;
  readonly activeVariantId: string;
}

/**
 * Reads the plain text of scenes from their documents (each scene lives in
 * its own document, D-4) and remembers it per scene: opening a document is
 * the cost (on the desktop, its whole state crosses to the interface), so a
 * scene is opened again only when its text may have changed, that is when
 * its active variant is another one, or when it is or was the scene in the
 * editor (written there since it was read).
 */
export class SceneTextReader {
  readonly #read = new Map<string, { readonly variantId: string; readonly text: string }>();

  constructor(
    private readonly documents: Platform['documents'],
    private readonly projectId: string,
  ) {}

  /**
   * The text of each of these scenes; null when cancelled on the way. The
   * open scene is never remembered: once left, it is read again.
   */
  async texts(
    scenes: readonly SceneToRead[],
    openSceneId?: string,
    cancelled: () => boolean = () => false,
  ): Promise<ReadonlyMap<string, string> | null> {
    if (openSceneId !== undefined) this.#read.delete(openSceneId);
    const texts = new Map<string, string>();
    for (const scene of scenes) {
      const known = this.#read.get(scene.id);
      if (known?.variantId === scene.activeVariantId) {
        texts.set(scene.id, known.text);
        continue;
      }
      if (cancelled()) return null;
      const handle = await this.documents.open(guids.scene(this.projectId, scene.id));
      let text: string;
      try {
        await handle.whenLoaded;
        text = fragmentPlainText(variantFragment(handle.doc, scene.activeVariantId));
      } finally {
        await handle.close();
      }
      // Cancelled meanwhile: what was read may already be out of date.
      if (cancelled()) return null;
      if (scene.id !== openSceneId)
        this.#read.set(scene.id, { variantId: scene.activeVariantId, text });
      texts.set(scene.id, text);
    }
    // Scenes gone from the manuscript are forgotten.
    for (const id of this.#read.keys()) if (!texts.has(id)) this.#read.delete(id);
    return texts;
  }
}

const sameTexts = (a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>) =>
  a.size === b.size && [...a].every(([id, text]) => b.get(id) === text);

/**
 * Plain text of each scene's active variant, read from the scene documents
 * one after the other. Only the scenes that changed are read again when the
 * outline changes (see `SceneTextReader`); the open scene is kept live by its
 * editor elsewhere.
 */
export function useSceneTexts(
  platform: Platform,
  projectId: string,
  outline: readonly OutlineChapter[],
  openSceneId?: string,
): ReadonlyMap<string, string> {
  const [texts, setTexts] = useState<ReadonlyMap<string, string>>(new Map());
  const key = outline.flatMap((c) => c.scenes.map((s) => `${s.id}/${s.activeVariantId}`)).join(',');
  const reader = useMemo(
    () => new SceneTextReader(platform.documents, projectId),
    [platform, projectId],
  );

  useEffect(() => {
    let cancelled = false;
    const scenes = outline.flatMap((c) => c.scenes);
    void reader
      .texts(scenes, openSceneId, () => cancelled)
      .then((read) => {
        if (read && !cancelled) setTexts((current) => (sameTexts(current, read) ? current : read));
      });
    return () => {
      cancelled = true;
    };
    // `key` stands for the scenes and their active variants.
  }, [reader, key, openSceneId]);

  return texts;
}

/** Words of each scene, from its text. */
export function useWordsOf(texts: ReadonlyMap<string, string>): ReadonlyMap<string, number> {
  return useMemo(() => new Map([...texts].map(([id, text]) => [id, countWords(text)])), [texts]);
}
