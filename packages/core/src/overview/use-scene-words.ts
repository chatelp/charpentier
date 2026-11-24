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
  /** Its variants (the active one alone when not said). */
  readonly variants?: readonly { readonly id: string }[];
}

/** What a reading of a scene holds: its variants, read together (they share its document). */
interface ReadScene {
  /** The active variant's plain text. */
  readonly text: string;
  readonly words: ReadonlyMap<string, number>;
  /** The variants it read, and which was active: another reading is due when they change. */
  readonly key: string;
}

const variantIds = (scene: SceneToRead) =>
  scene.variants?.map((v) => v.id) ?? [scene.activeVariantId];
const readKey = (scene: SceneToRead) => [scene.activeVariantId, ...variantIds(scene)].join('/');

/**
 * Reads the plain text of scenes from their documents (each scene lives in
 * its own document, D-4) and remembers it per scene: opening a document is
 * the cost (on the desktop, its whole state crosses to the interface), so a
 * scene is opened again only when its text may have changed, that is when
 * its variants or the active one are others, or when it is or was the scene in
 * the editor (written there since it was read). All its variants are read at
 * once: they are in the document that is open.
 */
export class SceneTextReader {
  readonly #read = new Map<string, ReadScene>();

  constructor(
    private readonly documents: Platform['documents'],
    private readonly projectId: string,
  ) {}

  /**
   * Each of these scenes, read; null when cancelled on the way. The open
   * scene is never remembered: once left, it is read again.
   */
  async read(
    scenes: readonly SceneToRead[],
    openSceneId?: string,
    cancelled: () => boolean = () => false,
  ): Promise<ReadonlyMap<string, ReadScene> | null> {
    if (openSceneId !== undefined) this.#read.delete(openSceneId);
    const texts = new Map<string, ReadScene>();
    for (const scene of scenes) {
      const known = this.#read.get(scene.id);
      const key = readKey(scene);
      if (known?.key === key) {
        texts.set(scene.id, known);
        continue;
      }
      if (cancelled()) return null;
      const handle = await this.documents.open(guids.scene(this.projectId, scene.id));
      let read: ReadScene;
      try {
        await handle.whenLoaded;
        const plain = (id: string) => fragmentPlainText(variantFragment(handle.doc, id));
        read = {
          key,
          text: plain(scene.activeVariantId),
          words: new Map(variantIds(scene).map((id) => [id, countWords(plain(id))])),
        };
      } finally {
        await handle.close();
      }
      // Cancelled meanwhile: what was read may already be out of date.
      if (cancelled()) return null;
      if (scene.id !== openSceneId) this.#read.set(scene.id, read);
      texts.set(scene.id, read);
    }
    // Scenes gone from the manuscript are forgotten.
    for (const id of this.#read.keys()) if (!texts.has(id)) this.#read.delete(id);
    return texts;
  }
}

interface Reading {
  readonly scenes: ReadonlyMap<string, ReadScene>;
  /** The scene in the editor when they were read: its text may be another since. */
  readonly open: string | undefined;
}

const sameTexts = (a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>) =>
  a.size === b.size && [...a].every(([id, text]) => b.get(id) === text);

export interface SceneTexts {
  /** Plain text of each scene's active variant, as last read. */
  readonly texts: ReadonlyMap<string, string>;
  /**
   * The words of each of a scene's variants; undefined while it is not known: not read yet,
   * or read when it was the scene in the editor, or with other variants.
   */
  variantWords(sceneId: string): ReadonlyMap<string, number> | undefined;
}

/**
 * The scenes' texts, read from their documents one after the other. Only the
 * scenes that changed are read again when the outline changes (see
 * `SceneTextReader`); the open scene is kept live by its editor elsewhere.
 */
export function useSceneTexts(
  platform: Platform,
  projectId: string,
  outline: readonly OutlineChapter[],
  openSceneId?: string,
): SceneTexts {
  const [reading, setReading] = useState<Reading>({ scenes: new Map(), open: undefined });
  const [texts, setTexts] = useState<ReadonlyMap<string, string>>(new Map());
  const scenes = outline.flatMap((c) => c.scenes);
  const key = scenes.map((s) => `${s.id}/${readKey(s)}`).join(',');
  const reader = useMemo(
    () => new SceneTextReader(platform.documents, projectId),
    [platform, projectId],
  );

  useEffect(() => {
    let cancelled = false;
    void reader
      .read(scenes, openSceneId, () => cancelled)
      .then((read) => {
        if (!read || cancelled) return;
        const next = new Map([...read].map(([id, scene]) => [id, scene.text]));
        setTexts((current) => (sameTexts(current, next) ? current : next));
        setReading({ scenes: read, open: openSceneId });
      });
    return () => {
      cancelled = true;
    };
    // `key` stands for the scenes, their variants and the active ones.
  }, [reader, key, openSceneId]);

  const variantWords = (sceneId: string) => {
    const scene = scenes.find((s) => s.id === sceneId);
    const read = reading.scenes.get(sceneId);
    if (!scene || !read || read.key !== readKey(scene)) return undefined;
    if (reading.open === sceneId && openSceneId !== sceneId) return undefined;
    return read.words;
  };
  return { texts, variantWords };
}

/** Words of each scene, from its text. */
export function useWordsOf(texts: ReadonlyMap<string, string>): ReadonlyMap<string, number> {
  return useMemo(() => new Map([...texts].map(([id, text]) => [id, countWords(text)])), [texts]);
}
