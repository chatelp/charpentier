import fs from 'node:fs';
import path from 'node:path';
import {
  addSignal,
  addVariantMeta,
  createCheckpoint,
  getScene,
  guids,
  MANUSCRIPT_DIR,
  MIRROR,
  MODULES_DIR,
  moduleFiles,
  newId,
  parseSceneMarkdown,
  readOutline,
  sceneFile,
  sceneMarkdown,
  scenePaths,
  type SceneInfo,
  serializeSceneMarkdown,
  variantFragment,
  writeSceneDocToFragment,
} from '@charpentier/schema';
import { prosemirrorToYXmlFragment } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import type { DocStore } from './doc-store';
import { blocksOf, diffHunks, merge3, type Merge3Result } from './merge3';
import { STATE_DIR, writeJsonAtomic } from './projects';

/** Texts the mirror writes into the project (the main process has no i18n yet). */
export interface MirrorStrings {
  /** Name of the variant holding an outside edit that could not be merged. */
  externalVariant(date: Date): string;
  /** Message of the signal pointing at it. */
  externalSignal(variantName: string): string;
  /** Message of the signal for a file the mirror could not take in and kept under another name. */
  keptAside(file: string): string;
}

export type ImportResult = 'unchanged' | 'merged' | 'variant' | 'ignored';

interface IndexEntry {
  /** Path of the scene's file, relative to the project folder. */
  readonly path: string;
  /** The variant the file and its base were last written from (absent in older indexes). */
  readonly variantId?: string;
}

/** A file edited outside, and the scene it goes to: named by its header, else by the file's place. */
interface OutsideFile {
  readonly scene: SceneInfo;
  readonly by: 'id' | 'path';
  readonly variantId?: string;
  readonly body: string;
}

/** What a flush does with files edited outside that are not taken in yet. */
type Pending = 'import' | 'defer' | 'leave';

export { MANUSCRIPT_DIR, MODULES_DIR, sceneFile, slug } from '@charpentier/schema';

/** A byte order mark and blank lines before the header are an editor's doing: read through them. */
const LEADING = /^\uFEFF?(?:[ \t]*\r?\n)*/;
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function parseSceneFile(text: string): {
  sceneId?: string;
  variantId?: string;
  body: string;
} {
  const content = text.slice(LEADING.exec(text)?.[0].length ?? 0);
  const match = FRONTMATTER.exec(content);
  if (!match) return { body: text.replace(/^\uFEFF/, '') };
  const sceneId = /^scene:\s*(\S+)\s*$/m.exec(match[1] ?? '')?.[1];
  const variantId = /^variant:\s*(\S+)\s*$/m.exec(match[1] ?? '')?.[1];
  return {
    ...(sceneId && { sceneId }),
    ...(variantId && { variantId }),
    body: content.slice(match[0].length).replace(/^\r?\n/, ''),
  };
}

/** The text of a file's body as the app would write it. */
const canonical = (body: string) => serializeSceneMarkdown(parseSceneMarkdown(body));

function atomicWrite(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, file);
}

const readOr = (file: string, fallback: string) => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return fallback;
  }
};

const read = (file: string): string | undefined => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
};

/** In the name of a file kept aside: `01-il-pleut.externe.md`. */
const ASIDE = 'externe';

/**
 * The Markdown mirror of one project (docs/SPEC.md §17, D-8): one `.md` per
 * scene (its active variant) in a folder per chapter, matched by id; modules
 * as YAML. Writes are deferred; files edited outside the app are merged back
 * (three-way, paragraph by paragraph) or kept as a variant when they overlap.
 *
 * What keeps outside edits: **a scene's file that is not what the app last
 * wrote is never overwritten before it has been taken in**, whenever the edit
 * was made (app closed, project not open, a moment ago).
 */
export class ProjectMirror {
  readonly #index: Map<string, IndexEntry>;
  /**
   * The last text of each file (by relative path) the mirror wrote or took
   * in: such a file holds nothing the project does not have.
   */
  readonly #known = new Map<string, string>();
  readonly #scenes = new Map<string, () => void>();
  #root: Y.Doc | undefined;
  #unsubscribeRoot: (() => void) | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #watcher: fs.FSWatcher | undefined;
  readonly #importTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly store: DocStore,
    readonly projectId: string,
    readonly folder: string,
    private readonly options: {
      readonly strings: MirrorStrings;
      readonly debounceMs?: number;
      /** How long a file edited outside must stay still before it is read (editors save in several steps). */
      readonly settleMs?: number;
      readonly watch?: boolean;
      /**
       * `false` for a plain export (the USB key's copy): the folder is not a
       * mirror, what is there is overwritten and nothing is read back.
       */
      readonly takeOutsideEdits?: boolean;
    },
  ) {
    const stored = readOr(this.#stateFile('mirror.json'), '{}');
    this.#index = new Map(
      Object.entries((JSON.parse(stored) as { scenes?: Record<string, IndexEntry> }).scenes ?? {}),
    );
  }

  get #takesEdits() {
    return this.options.takeOutsideEdits !== false;
  }

  #stateFile(...parts: string[]) {
    return path.join(this.folder, STATE_DIR, ...parts);
  }

  #basePath(sceneId: string) {
    return this.#stateFile('mirror-base', `${sceneId}.md`);
  }

  start(): void {
    const root = this.store.acquire(guids.project(this.projectId), this);
    this.#root = root;
    this.#unsubscribeRoot = this.store.subscribe(root.guid, () => {
      this.#syncScenes();
      this.#schedule();
    });
    this.#syncScenes();
    // Files edited while the app was closed or the project not open are taken in first.
    this.#flush('import');
    if (this.options.watch) this.#watch();
  }

  stop(): void {
    clearTimeout(this.#timer);
    this.#watcher?.close();
    for (const timer of this.#importTimers.values()) clearTimeout(timer);
    this.#importTimers.clear();
    // An outside edit still waiting stays in its file: the next start takes it in.
    this.#flush('leave');
    for (const [sceneId, unsubscribe] of this.#scenes) {
      unsubscribe();
      this.store.release(guids.scene(this.projectId, sceneId), this);
    }
    this.#scenes.clear();
    this.#unsubscribeRoot?.();
    if (this.#root) this.store.release(this.#root.guid, this);
    this.#root = undefined;
  }

  /** Holds the documents of the live scenes, and lets go of the others. */
  #syncScenes() {
    if (!this.#root) return;
    const live = new Set(readOutline(this.#root).flatMap((c) => c.scenes.map((s) => s.id)));
    for (const sceneId of live) {
      if (this.#scenes.has(sceneId)) continue;
      const guid = guids.scene(this.projectId, sceneId);
      this.store.acquire(guid, this);
      this.#scenes.set(
        sceneId,
        this.store.subscribe(guid, () => this.#schedule()),
      );
    }
    for (const [sceneId, unsubscribe] of this.#scenes) {
      if (live.has(sceneId)) continue;
      unsubscribe();
      this.#scenes.delete(sceneId);
      this.store.release(guids.scene(this.projectId, sceneId), this);
    }
  }

  #schedule() {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.flush(), this.options.debounceMs ?? 800);
  }

  #sceneDoc(sceneId: string): Y.Doc {
    return this.store.acquire(guids.scene(this.projectId, sceneId), this);
  }

  #markdownOf(sceneId: string, variantId: string): string {
    return sceneMarkdown(this.#sceneDoc(sceneId), variantId);
  }

  /** The scene whose file the mirror wrote at this path, other than `except`. */
  #ownerOf(relative: string, except?: string): string | undefined {
    for (const [sceneId, entry] of this.#index)
      if (entry.path === relative && sceneId !== except) return sceneId;
    return undefined;
  }

  /**
   * Writes every file that is not up to date (scenes moved or renamed follow
   * their file). While a file edited outside waits to be taken in, no scene
   * file is written: the edit is read once its file has settled, then
   * everything is written.
   */
  flush(): void {
    this.#flush('defer');
  }

  #flush(pending: Pending): void {
    clearTimeout(this.#timer);
    const root = this.#root;
    if (!root) return;
    if (this.#takesEdits) {
      this.#adoptFiles(root);
      let edited = this.#editedFiles(root);
      if (edited.length > 0 && pending === 'import') {
        for (const file of edited) {
          try {
            this.#import(file);
          } catch (error) {
            console.error('Charpentier: could not import', file, error);
          }
        }
        edited = this.#editedFiles(root);
      }
      if (edited.length > 0) {
        if (pending !== 'leave')
          for (const file of edited) if (!this.#importTimers.has(file)) this.#scheduleImport(file);
        this.#writeModules(root);
        return;
      }
    }
    const live = new Set<string>();
    for (const scene of scenePaths(root)) {
      live.add(scene.sceneId);
      const relative = path.join(...scene.path.split('/'));
      const target = path.join(this.folder, relative);
      const previous = this.#index.get(scene.sceneId);
      const body = this.#markdownOf(scene.sceneId, scene.variantId);
      const content = sceneFile(scene.sceneId, scene.variantId, body);
      if (previous?.path !== relative) {
        // A file the mirror did not write is in the way: it is kept, under another name.
        const occupant = this.#takesEdits && !this.#ownerOf(relative) ? read(target) : undefined;
        if (occupant !== undefined && occupant !== content) this.#setAside(root, relative);
        // The scene's file follows it, unless another scene's file took its place meanwhile.
        if (
          previous &&
          !this.#ownerOf(previous.path, scene.sceneId) &&
          fs.existsSync(path.join(this.folder, previous.path))
        ) {
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.renameSync(path.join(this.folder, previous.path), target);
          this.#known.delete(previous.path);
        }
      }
      if (readOr(target, '') !== content) {
        atomicWrite(target, content);
      }
      this.#known.set(relative, content);
      if (readOr(this.#basePath(scene.sceneId), '\u0000') !== body)
        atomicWrite(this.#basePath(scene.sceneId), body);
      this.#index.set(scene.sceneId, { path: relative, variantId: scene.variantId });
    }
    // Scenes gone to the trash: their file goes (the scene itself stays in the project).
    for (const [sceneId, entry] of this.#index) {
      if (live.has(sceneId)) continue;
      const shared = this.#ownerOf(entry.path, sceneId) !== undefined;
      const text = shared ? undefined : read(path.join(this.folder, entry.path));
      // Edited outside meanwhile, with no scene left to take it in: the file is kept.
      if (
        text !== undefined &&
        this.#takesEdits &&
        this.#known.get(entry.path) !== text &&
        canonical(parseSceneFile(text).body) !== readOr(this.#basePath(sceneId), '')
      )
        this.#setAside(root, entry.path);
      else if (text !== undefined) fs.rmSync(path.join(this.folder, entry.path), { force: true });
      fs.rmSync(this.#basePath(sceneId), { force: true });
      if (!shared) this.#known.delete(entry.path);
      this.#index.delete(sceneId);
    }
    this.#removeEmptyChapters();
    this.#writeModules(root);
    writeJsonAtomic(this.#stateFile('mirror.json'), { scenes: Object.fromEntries(this.#index) });
  }

  #removeEmptyChapters() {
    const manuscript = path.join(this.folder, MANUSCRIPT_DIR);
    if (!fs.existsSync(manuscript)) return;
    for (const entry of fs.readdirSync(manuscript, { withFileTypes: true })) {
      const dir = path.join(manuscript, entry.name);
      if (entry.isDirectory() && fs.readdirSync(dir).filter((f) => !f.startsWith('.')).length === 0)
        fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  #writeModules(root: Y.Doc) {
    for (const [file, content] of moduleFiles(root)) {
      const target = path.join(this.folder, MODULES_DIR, file);
      if (readOr(target, '') !== content) atomicWrite(target, content);
    }
  }

  // ─── Outside edits (docs/SPEC.md §17, D-8) ─────────────────────────────

  #watch() {
    const manuscript = path.join(this.folder, MANUSCRIPT_DIR);
    fs.mkdirSync(manuscript, { recursive: true });
    this.#watcher = fs.watch(manuscript, { recursive: true }, (_event, filename) => {
      if (!filename || !filename.toString().endsWith('.md')) return;
      this.#scheduleImport(path.join(manuscript, filename.toString()));
    });
  }

  /** Editors save in several steps: the file is read once it has settled. */
  #scheduleImport(file: string) {
    clearTimeout(this.#importTimers.get(file));
    this.#importTimers.set(
      file,
      setTimeout(() => {
        this.#importTimers.delete(file);
        try {
          this.importFile(file);
        } catch (error) {
          console.error('Charpentier: could not import', file, error);
        }
      }, this.options.settleMs ?? 300),
    );
  }

  /**
   * A scene's file found where its scene goes, that the index does not know
   * (the index was lost): it is the scene's file, to be taken in like any other.
   */
  #adoptFiles(root: Y.Doc) {
    for (const scene of scenePaths(root)) {
      if (this.#index.has(scene.sceneId)) continue;
      const relative = path.join(...scene.path.split('/'));
      if (this.#ownerOf(relative)) continue;
      const text = read(path.join(this.folder, relative));
      if (text !== undefined && parseSceneFile(text).sceneId === scene.sceneId)
        this.#index.set(scene.sceneId, { path: relative });
    }
  }

  /** The scene a file's text goes to: the one its header names, else the one whose file it is. */
  #sceneOf(root: Y.Doc, relative: string, text: string): OutsideFile | undefined {
    const parsed = parseSceneFile(text);
    const named = parsed.sceneId ? getScene(root, parsed.sceneId) : undefined;
    if (named) return { ...parsed, scene: named, by: 'id' };
    const owner = this.#ownerOf(relative);
    const scene = owner ? getScene(root, owner) : undefined;
    return scene && { scene, by: 'path', body: parsed.body };
  }

  /** The scene files, among those the mirror wrote, holding an outside edit not taken in yet. */
  #editedFiles(root: Y.Doc): string[] {
    const edited: string[] = [];
    for (const relative of new Set([...this.#index.values()].map((entry) => entry.path))) {
      const file = path.join(this.folder, relative);
      const text = read(file);
      if (text === undefined || this.#known.get(relative) === text) continue;
      const found = this.#sceneOf(root, relative, text);
      if (!found) continue; // Its scene is in the trash: `flush` keeps the file aside.
      if (canonical(found.body) === readOr(this.#basePath(found.scene.id), '\u0000'))
        this.#known.set(relative, text);
      else edited.push(file);
    }
    return edited;
  }

  /** Takes in a scene file edited outside the app, then brings the files up to date. */
  importFile(file: string): ImportResult {
    const result = this.#import(file);
    if (result === 'known') return 'unchanged';
    if (result !== 'ignored') this.#flush('defer');
    return result;
  }

  #import(file: string): ImportResult | 'known' {
    const root = this.#root;
    if (!root || !this.#takesEdits) return 'ignored';
    const text = read(file);
    if (text === undefined) return 'ignored';
    const relative = path.relative(this.folder, file);
    if (this.#known.get(relative) === text) return 'known';
    const found = this.#sceneOf(root, relative, text);
    if (!found) return 'ignored'; // Importing new files comes after v1 (D-1).
    const result = this.#takeIn(root, found);
    this.#known.set(relative, text);
    return result;
  }

  #takeIn(root: Y.Doc, found: OutsideFile): ImportResult {
    const { scene } = found;
    const sceneId = scene.id;
    const theirs = canonical(found.body);
    const written = readOr(this.#basePath(sceneId), '');
    if (theirs === written) return 'unchanged';

    // The edit goes to the variant the file shows (its header, else the one it
    // was written from), which may no longer be the active one.
    const has = (id: string | undefined): id is string =>
      id !== undefined && scene.variants.some((v) => v.id === id);
    const writtenFrom = this.#index.get(sceneId)?.variantId;
    const variantId = has(found.variantId)
      ? found.variantId
      : has(writtenFrom)
        ? writtenFrom
        : scene.activeVariantId;
    // The base is a common ancestor only for the variant it was written from.
    const base = writtenFrom === undefined || writtenFrom === variantId ? written : undefined;
    const sceneDoc = this.#sceneDoc(sceneId);
    const ours = this.#markdownOf(sceneId, variantId);
    if (theirs === ours) return 'unchanged';
    // Matched by its place only (no header left), a file is never merged into the text.
    const result: Merge3Result =
      found.by === 'id' && base !== undefined
        ? merge3(blocksOf(base), blocksOf(ours), blocksOf(theirs))
        : { ok: false };

    if (result.ok) {
      this.#withHistory(sceneId, (history) =>
        createCheckpoint(sceneDoc, history, { variantId, reason: 'before-external-merge' }, MIRROR),
      );
      sceneDoc.transact(() => {
        applyBlocks(variantFragment(sceneDoc, variantId), blocksOf(ours), result.merged);
      }, MIRROR);
      // The base moves when the file is written: until then it stays the common ancestor.
      return 'merged';
    }

    // Overlap: nothing is lost, the outside version becomes a variant.
    const external = newId();
    const name = this.options.strings.externalVariant(new Date());
    sceneDoc.transact(() => {
      writeSceneDocToFragment(parseSceneMarkdown(theirs), variantFragment(sceneDoc, external));
    }, MIRROR);
    addVariantMeta(root, sceneId, { variantId: external, name, origin: 'external-edit' }, MIRROR);
    addSignal(
      root,
      {
        kind: 'external-edit',
        author: 'mirror',
        message: this.options.strings.externalSignal(name),
      },
      MIRROR,
    );
    // The file goes back to the active variant; the base stays what the app last wrote.
    return 'variant';
  }

  /** Renames a file the mirror must not overwrite and cannot take in, and tells the author. */
  #setAside(root: Y.Doc, relative: string) {
    const { dir, name } = path.parse(relative);
    let aside = path.join(dir, `${name}.${ASIDE}.md`);
    for (let n = 2; fs.existsSync(path.join(this.folder, aside)); n++)
      aside = path.join(dir, `${name}.${ASIDE}-${n}.md`);
    fs.renameSync(path.join(this.folder, relative), path.join(this.folder, aside));
    this.#known.delete(relative);
    addSignal(
      root,
      {
        kind: 'external-edit',
        author: 'mirror',
        message: this.options.strings.keptAside(aside.split(path.sep).join('/')),
      },
      MIRROR,
    );
  }

  #withHistory<T>(sceneId: string, use: (history: Y.Doc) => T): T {
    const guid = guids.sceneHistory(this.projectId, sceneId);
    const history = this.store.acquire(guid, this);
    try {
      return use(history);
    } finally {
      this.store.release(guid, this);
    }
  }
}

/**
 * Applies the merged paragraphs to the variant's fragment, touching only the
 * top-level blocks that changed, so that what the author types meanwhile in
 * other paragraphs is untouched. Falls back to a full rewrite if the blocks
 * and the fragment do not line up.
 */
export function applyBlocks(
  fragment: Y.XmlFragment,
  ours: readonly string[],
  merged: readonly string[],
): void {
  const children = fragment.toArray();
  // Each top-level block serializes to one Markdown block; an empty scene is one empty paragraph.
  const aligned = children.length === ours.length || (ours.length === 0 && children.length <= 1);
  if (!aligned) {
    writeSceneDocToFragment(parseSceneMarkdown(merged.join('\n\n')), fragment);
    return;
  }
  const hunks = diffHunks(ours, merged).reverse();
  for (const hunk of hunks) {
    const start = Math.min(hunk.start, fragment.length);
    const end = ours.length === 0 ? fragment.length : hunk.end;
    if (end > start) fragment.delete(start, end - start);
    if (hunk.lines.length) {
      const scratch = new Y.Doc().getXmlFragment('blocks');
      prosemirrorToYXmlFragment(parseSceneMarkdown(hunk.lines.join('\n\n')), scratch);
      fragment.insert(
        start,
        scratch.toArray().map((node) => (node as Y.XmlElement).clone()),
      );
    }
  }
}
