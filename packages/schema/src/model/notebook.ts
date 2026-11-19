import * as Y from 'yjs';
import { newId, nowIso } from './ids';
import { AUTHOR, type Origin } from './origins';

/**
 * The Compagnon's notebook (docs/PLAN.md phase 6.5, D-35): short notes, one
 * per fact (the author's story and intentions, decisions, doubts, questions
 * to come back to, how they want to be accompanied), that the Compagnon
 * reads at every call and writes as he goes. Kept in a Yjs document like
 * everything else: the project's in its mentor document, the author's in a
 * document of the account. Each note is a file of a small tree
 * (`/memories/projet/grand-pere.md`), which is how Claude's memory tool
 * sees it; nothing here depends on a provider.
 *
 * A note the author wrote or corrected is theirs (`by: 'author'`): the
 * Compagnon can read it, never change, move or remove it (as a validated
 * field). Nothing is deleted: a removed note goes to the trash.
 */

/** The seven natures of a note (DESIGN §4.5, Carnet), in the page's order, by their folder. */
export const noteNatures = [
  'a-reprendre',
  'decisions',
  'intentions',
  'histoire',
  'doutes',
  'accompagnement',
  'facon-d-ecrire',
] as const;
export type NoteNature = (typeof noteNatures)[number];

/** The two notebooks: this book's, and the author's across their books. */
export type NoteBook = 'projet' | 'auteur';

export interface Note {
  readonly id: string;
  readonly path: string;
  readonly text: string;
  readonly by: 'compagnon' | 'author';
  /** Messages of the thread it comes from, when known. */
  readonly sources: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly trashedAt?: string;
  /** Who put it in the trash: the author's refusal, which the Compagnon respects. */
  readonly trashedBy?: 'compagnon' | 'author';
  /** How an author's note became theirs: written, corrected, or kept as it was. */
  readonly authorship?: 'written' | 'corrected' | 'kept';
}

/**
 * What the page shows of a note, read from its file: its notebook and nature
 * from the folders (`/memories/projet/decisions/…`), its title from its first
 * line (`# La fin reste ouverte`), else from its name.
 */
export function noteParts(note: Pick<Note, 'path' | 'text'>): {
  readonly book: NoteBook;
  readonly nature: NoteNature;
  readonly title: string;
  readonly body: string;
} {
  const parts = note.path.split('/').filter(Boolean);
  const book: NoteBook = parts[1] === 'auteur' ? 'auteur' : 'projet';
  const folder = parts[2] ?? '';
  const nature = (noteNatures as readonly string[]).includes(folder)
    ? (folder as NoteNature)
    : book === 'auteur'
      ? 'accompagnement'
      : 'histoire';
  const lines = note.text.split('\n');
  const heading = /^#\s+(.+)$/.exec(lines[0]?.trim() ?? '')?.[1];
  const name = (parts.at(-1) ?? '').replace(/\.md$/, '').replace(/-/g, ' ');
  return {
    book,
    nature,
    title: heading ?? name.charAt(0).toUpperCase() + name.slice(1),
    body: (heading ? lines.slice(1) : lines).join('\n').trim(),
  };
}

/** The path of a note of this notebook and nature, from its title. */
export function notePath(book: NoteBook, nature: NoteNature, title: string): string {
  const slug =
    title
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'note';
  return `/memories/${book}/${nature}/${slug}.md`;
}

/** The top-level map of a document holding a notebook. */
export const NOTEBOOK = 'notebook';

const notebook = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>(NOTEBOOK);

const toNote = (id: string, m: Y.Map<unknown>): Note => {
  const trashedAt = m.get('trashedAt');
  const trashedBy = m.get('trashedBy');
  const authorship = m.get('authorship');
  const sources = m.get('sources');
  return {
    id,
    path: String(m.get('path') ?? ''),
    text: String(m.get('text') ?? ''),
    by: m.get('by') === 'author' ? 'author' : 'compagnon',
    sources: Array.isArray(sources) ? sources.map(String) : [],
    createdAt: String(m.get('createdAt') ?? ''),
    updatedAt: String(m.get('updatedAt') ?? ''),
    ...(typeof trashedAt === 'string' && { trashedAt }),
    ...((authorship === 'written' || authorship === 'corrected' || authorship === 'kept') && {
      authorship,
    }),
    ...(typeof trashedAt === 'string' && {
      trashedBy: trashedBy === 'author' ? 'author' : 'compagnon',
    }),
  };
};

/** Live notes, by path; when two devices made the same path, the most recent one. */
export function listNotes(doc: Y.Doc): Note[] {
  const byPath = new Map<string, Note>();
  for (const [id, m] of notebook(doc)) {
    if (!(m instanceof Y.Map)) continue;
    const note = toNote(id, m);
    if (note.trashedAt || !note.path) continue;
    const other = byPath.get(note.path);
    if (!other || note.updatedAt > other.updatedAt) byPath.set(note.path, note);
  }
  return [...byPath.values()].sort((a, b) => (a.path < b.path ? -1 : 1));
}

/** Notes in the trash, most recently trashed first. */
export function listTrashedNotes(doc: Y.Doc): Note[] {
  return [...notebook(doc)]
    .filter((e): e is [string, Y.Map<unknown>] => e[1] instanceof Y.Map)
    .map(([id, m]) => toNote(id, m))
    .filter((n) => n.trashedAt)
    .sort((a, b) => ((a.trashedAt ?? '') < (b.trashedAt ?? '') ? 1 : -1));
}

export const findNote = (doc: Y.Doc, path: string): Note | undefined =>
  listNotes(doc).find((n) => n.path === path);

/**
 * Whether the notebook was ever written in: a note exists, live or in the
 * trash (nothing is deleted). A notebook whose notes were all removed is not
 * a notebook never begun: the Compagnon does not read the whole thread and
 * take his first notes all over again.
 */
export const notebookStarted = (doc: Y.Doc): boolean => notebook(doc).size > 0;

/** A path as a refusal remembers it: case, accents and punctuation aside, folder by folder. */
const pathKey = (path: string) =>
  path
    .split('/')
    .map((part) =>
      part
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .replace(/\.md$/, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
    )
    .join('/');

/**
 * A note the author put in the trash is their refusal: the Compagnon does not
 * write it again, there or under a path that only differs by its spelling
 * (`Fin_ouverte.md` for `fin-ouverte.md`).
 */
function assertNotRefused(doc: Y.Doc, path: string): void {
  const key = pathKey(path);
  if (listTrashedNotes(doc).some((n) => n.trashedBy === 'author' && pathKey(n.path) === key))
    throw new NoteRefused('author', `the author removed ${path}: do not write it again.`);
}

/** Why the Compagnon may not change a note. */
export class NoteRefused extends Error {
  constructor(
    readonly reason: 'author' | 'missing' | 'exists',
    message: string,
  ) {
    super(message);
  }
}

const mapOf = (doc: Y.Doc, id: string) => notebook(doc).get(id);

function write(
  doc: Y.Doc,
  input: {
    path: string;
    text: string;
    by: Note['by'];
    sources?: readonly string[];
    authorship?: Note['authorship'];
  },
  origin: Origin,
  existing?: Note,
): string {
  const id = existing?.id ?? newId();
  doc.transact(() => {
    let m = existing ? mapOf(doc, existing.id) : undefined;
    if (!m) {
      m = new Y.Map<unknown>();
      notebook(doc).set(id, m);
      m.set('createdAt', nowIso());
    }
    m.set('path', input.path);
    m.set('text', input.text);
    m.set('by', input.by);
    if (input.authorship) m.set('authorship', input.authorship);
    m.set('updatedAt', nowIso());
    if (input.sources?.length) {
      const before = existing?.sources ?? [];
      m.set('sources', [...new Set([...before, ...input.sources])]);
    }
  }, origin);
  return id;
}

// ─── The Compagnon's writes (through his agent origin) ───

/** Creates a note, or rewrites one of his own at the same path. */
export function agentWriteNote(
  doc: Y.Doc,
  input: { path: string; text: string; sources?: readonly string[] },
  origin: Origin,
): string {
  const existing = findNote(doc, input.path);
  if (existing?.by === 'author')
    throw new NoteRefused('author', `${input.path} is the author's note: read only.`);
  if (!existing) assertNotRefused(doc, input.path);
  return write(doc, { ...input, by: 'compagnon' }, origin, existing);
}

export function agentRenameNote(doc: Y.Doc, from: string, to: string, origin: Origin): void {
  const note = findNote(doc, from);
  if (!note) throw new NoteRefused('missing', `${from} does not exist.`);
  if (note.by === 'author') throw new NoteRefused('author', `${from} is the author's note.`);
  if (findNote(doc, to)) throw new NoteRefused('exists', `${to} already exists.`);
  // Not a way around the author's refusal either.
  assertNotRefused(doc, to);
  doc.transact(() => {
    const m = mapOf(doc, note.id);
    m?.set('path', to);
    m?.set('updatedAt', nowIso());
  }, origin);
}

/** To the trash: nothing is deleted. */
export function agentTrashNote(doc: Y.Doc, path: string, origin: Origin): void {
  const note = findNote(doc, path);
  if (!note) throw new NoteRefused('missing', `${path} does not exist.`);
  if (note.by === 'author') throw new NoteRefused('author', `${path} is the author's note.`);
  doc.transact(() => {
    const m = mapOf(doc, note.id);
    m?.set('trashedAt', nowIso());
    m?.set('trashedBy', 'compagnon');
  }, origin);
}

// ─── The author's (the note becomes theirs) ───

export function authorWriteNote(
  doc: Y.Doc,
  input: { path: string; text: string },
  origin: Origin = AUTHOR,
): string {
  return write(
    doc,
    { ...input, by: 'author', authorship: 'written' },
    origin,
    findNote(doc, input.path),
  );
}

export function authorEditNote(doc: Y.Doc, id: string, text: string, origin: Origin = AUTHOR) {
  const m = mapOf(doc, id);
  if (!m) return;
  doc.transact(() => {
    m.set('text', text);
    m.set('by', 'author');
    m.set('authorship', 'corrected');
    m.set('updatedAt', nowIso());
  }, origin);
}

export function authorTrashNote(doc: Y.Doc, id: string, origin: Origin = AUTHOR) {
  doc.transact(() => {
    const m = mapOf(doc, id);
    m?.set('trashedAt', nowIso());
    m?.set('trashedBy', 'author');
  }, origin);
}

export function authorRestoreNote(doc: Y.Doc, id: string, origin: Origin = AUTHOR) {
  doc.transact(() => {
    const m = mapOf(doc, id);
    m?.delete('trashedAt');
    m?.delete('trashedBy');
  }, origin);
}

/** « Garder » : the note becomes the author's as it is; the Compagnon no longer rewrites it. */
export function authorKeepNote(doc: Y.Doc, id: string, origin: Origin = AUTHOR) {
  doc.transact(() => {
    const m = mapOf(doc, id);
    if (!m) return;
    m.set('by', 'author');
    m.set('authorship', 'kept');
    m.set('updatedAt', nowIso());
  }, origin);
}

/** Moves a note (another nature, the other notebook), keeping its id and history. */
export function authorMoveNote(doc: Y.Doc, id: string, path: string, origin: Origin = AUTHOR) {
  doc.transact(() => {
    const m = mapOf(doc, id);
    if (!m) return;
    m.set('path', path);
    m.set('by', 'author');
    m.set('updatedAt', nowIso());
  }, origin);
}
