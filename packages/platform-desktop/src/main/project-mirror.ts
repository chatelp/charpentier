import fs from 'node:fs';
import path from 'node:path';
import {
  addSignal,
  addVariantMeta,
  createCheckpoint,
  entityModules,
  fragmentToSceneDoc,
  getScene,
  evidenceSceneId,
  guids,
  listEntities,
  MIRROR,
  newId,
  parseSceneMarkdown,
  readOutline,
  readSingleton,
  serializeSceneMarkdown,
  singletonModules,
  variantFragment,
  writeSceneDocToFragment,
  type FieldState,
} from '@charpentier/schema';
import { prosemirrorToYXmlFragment } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import type { DocStore } from './doc-store';
import { blocksOf, diffHunks, merge3 } from './merge3';
import { STATE_DIR, writeJsonAtomic } from './projects';
import { toYaml } from './yaml';

/** Texts the mirror writes into the project (the main process has no i18n yet). */
export interface MirrorStrings {
  /** Name of the variant holding an outside edit that could not be merged. */
  externalVariant(date: Date): string;
  /** Message of the signal pointing at it. */
  externalSignal(variantName: string): string;
}

export type ImportResult = 'unchanged' | 'merged' | 'variant' | 'ignored';

interface IndexEntry {
  /** Path of the scene's file, relative to the project folder. */
  readonly path: string;
}

export const MANUSCRIPT_DIR = 'manuscrit';
export const MODULES_DIR = 'modules';

const pad = (n: number) => String(n).padStart(2, '0');

/** `Le retour à Nantes` → `le-retour-a-nantes`. */
export function slug(title: string): string {
  return (
    title
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/, '') || 'sans-titre'
  );
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function sceneFile(sceneId: string, variantId: string, body: string): string {
  return [
    '---',
    '# Charpentier : identifiants de la scène, à ne pas modifier.',
    `scene: ${sceneId}`,
    `variant: ${variantId}`,
    '---',
    '',
    body,
  ].join('\n');
}

export function parseSceneFile(text: string): { sceneId?: string; body: string } {
  const match = FRONTMATTER.exec(text);
  if (!match) return { body: text };
  const sceneId = /^scene:\s*(\S+)\s*$/m.exec(match[1] ?? '')?.[1];
  return { ...(sceneId && { sceneId }), body: text.slice(match[0].length).replace(/^\r?\n/, '') };
}

const MODULE_FILES: Record<string, string> = {
  meta: 'meta.yaml',
  characters: 'personnages.yaml',
  structure: 'structure.yaml',
  acts: 'structure.yaml',
  arcs: 'structure.yaml',
  worldRules: 'regles-du-monde.yaml',
  clues: 'indices.yaml',
};

function fieldForYaml(state: FieldState) {
  return {
    status: state.status ?? 'empty',
    ...(state.value !== undefined && { value: state.value }),
    ...(state.proposal && {
      proposal: state.proposal.value,
      // A scene's id, or `entretien` for what the author said in the interview (D-26).
      source: state.proposal.evidence.map((e) => evidenceSceneId(e) ?? 'entretien'),
    }),
  };
}

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

/**
 * The Markdown mirror of one project (docs/SPEC.md §17, D-8): one `.md` per
 * scene (its active variant) in a folder per chapter, matched by id; modules
 * as YAML. Writes are deferred; files edited outside the app are merged back
 * (three-way, paragraph by paragraph) or kept as a variant when they overlap.
 */
export class ProjectMirror {
  readonly #index: Map<string, IndexEntry>;
  /** What the mirror itself last wrote, by relative path: its own writes are not imports. */
  readonly #written = new Map<string, string>();
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
      readonly watch?: boolean;
    },
  ) {
    const stored = readOr(this.#stateFile('mirror.json'), '{}');
    this.#index = new Map(
      Object.entries((JSON.parse(stored) as { scenes?: Record<string, IndexEntry> }).scenes ?? {}),
    );
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
    this.flush();
    if (this.options.watch) this.#watch();
  }

  stop(): void {
    clearTimeout(this.#timer);
    this.#watcher?.close();
    for (const timer of this.#importTimers.values()) clearTimeout(timer);
    this.flush();
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
    return serializeSceneMarkdown(
      fragmentToSceneDoc(variantFragment(this.#sceneDoc(sceneId), variantId)),
    );
  }

  /** Writes every file that is not up to date (scenes moved or renamed follow their file). */
  flush(): void {
    clearTimeout(this.#timer);
    const root = this.#root;
    if (!root) return;
    const outline = readOutline(root);
    const live = new Set<string>();
    outline.forEach((chapter, ci) => {
      const dir = `${pad(ci + 1)}-${slug(chapter.title)}`;
      chapter.scenes.forEach((scene, si) => {
        live.add(scene.id);
        const relative = path.join(MANUSCRIPT_DIR, dir, `${pad(si + 1)}-${slug(scene.title)}.md`);
        const target = path.join(this.folder, relative);
        const previous = this.#index.get(scene.id);
        if (
          previous &&
          previous.path !== relative &&
          fs.existsSync(path.join(this.folder, previous.path))
        ) {
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.renameSync(path.join(this.folder, previous.path), target);
          this.#written.delete(previous.path);
        }
        const body = this.#markdownOf(scene.id, scene.activeVariantId);
        const content = sceneFile(scene.id, scene.activeVariantId, body);
        if (readOr(target, '') !== content) {
          atomicWrite(target, content);
        }
        this.#written.set(relative, content);
        if (readOr(this.#basePath(scene.id), '\u0000') !== body)
          atomicWrite(this.#basePath(scene.id), body);
        this.#index.set(scene.id, { path: relative });
      });
    });
    // Scenes gone to the trash: their file goes (the scene itself stays in the project).
    for (const [sceneId, entry] of this.#index) {
      if (live.has(sceneId)) continue;
      fs.rmSync(path.join(this.folder, entry.path), { force: true });
      fs.rmSync(this.#basePath(sceneId), { force: true });
      this.#written.delete(entry.path);
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
    const files = new Map<string, Record<string, unknown>>();
    const add = (module: string, value: unknown) => {
      const file = MODULE_FILES[module] ?? `${module}.yaml`;
      files.set(file, { ...(files.get(file) ?? {}), [module]: value });
    };
    for (const module of singletonModules) {
      add(
        module,
        Object.fromEntries(
          Object.entries(readSingleton(root, module)).map(([k, v]) => [k, fieldForYaml(v)]),
        ),
      );
    }
    for (const module of entityModules) {
      add(
        module,
        listEntities(root, module).map((e) => ({
          id: e.id,
          status: e.status,
          fields: Object.fromEntries(
            Object.entries(e.fields).map(([k, v]) => [k, fieldForYaml(v)]),
          ),
        })),
      );
    }
    const header =
      '# Charpentier : modules du projet, en lecture seule (les modifications ici ne sont pas reprises).\n';
    for (const [file, value] of files) {
      const target = path.join(this.folder, MODULES_DIR, file);
      const content = header + toYaml(value);
      if (readOr(target, '') !== content) atomicWrite(target, content);
    }
  }

  // ─── Outside edits (docs/SPEC.md §17, D-8) ─────────────────────────────

  #watch() {
    const manuscript = path.join(this.folder, MANUSCRIPT_DIR);
    fs.mkdirSync(manuscript, { recursive: true });
    this.#watcher = fs.watch(manuscript, { recursive: true }, (_event, filename) => {
      if (!filename || !filename.toString().endsWith('.md')) return;
      const file = path.join(manuscript, filename.toString());
      clearTimeout(this.#importTimers.get(file));
      // Editors save in several steps: wait for the file to settle.
      this.#importTimers.set(
        file,
        setTimeout(() => {
          this.#importTimers.delete(file);
          try {
            this.importFile(file);
          } catch (error) {
            console.error('Charpentier: could not import', file, error);
          }
        }, 300),
      );
    });
  }

  /** Takes in a scene file edited outside the app. */
  importFile(file: string): ImportResult {
    const root = this.#root;
    if (!root || !fs.existsSync(file)) return 'ignored';
    const relative = path.relative(this.folder, file);
    const text = fs.readFileSync(file, 'utf8');
    if (this.#written.get(relative) === text) return 'unchanged';
    const { sceneId, body } = parseSceneFile(text);
    const scene = sceneId ? getScene(root, sceneId) : undefined;
    if (!sceneId || !scene) return 'ignored'; // Importing new files comes after v1 (D-1).

    const theirs = serializeSceneMarkdown(parseSceneMarkdown(body));
    const base = readOr(this.#basePath(sceneId), '');
    if (theirs === base) return 'unchanged';
    const variantId = scene.activeVariantId;
    const sceneDoc = this.#sceneDoc(sceneId);
    const ours = this.#markdownOf(sceneId, variantId);
    const result = merge3(blocksOf(base), blocksOf(ours), blocksOf(theirs));

    if (result.ok) {
      this.#withHistory(sceneId, (history) =>
        createCheckpoint(sceneDoc, history, { variantId, reason: 'before-external-merge' }, MIRROR),
      );
      sceneDoc.transact(() => {
        applyBlocks(variantFragment(sceneDoc, variantId), blocksOf(ours), result.merged);
      }, MIRROR);
      atomicWrite(this.#basePath(sceneId), this.#markdownOf(sceneId, variantId));
      this.flush();
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
    this.flush();
    return 'variant';
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
