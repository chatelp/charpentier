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
}

/** The top-level map of a document holding a notebook. */
export const NOTEBOOK = 'notebook';

const notebook = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>(NOTEBOOK);

const toNote = (id: string, m: Y.Map<unknown>): Note => {
  const trashedAt = m.get('trashedAt');
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
  input: { path: string; text: string; by: Note['by']; sources?: readonly string[] },
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
  return write(doc, { ...input, by: 'compagnon' }, origin, existing);
}

export function agentRenameNote(doc: Y.Doc, from: string, to: string, origin: Origin): void {
  const note = findNote(doc, from);
  if (!note) throw new NoteRefused('missing', `${from} does not exist.`);
  if (note.by === 'author') throw new NoteRefused('author', `${from} is the author's note.`);
  if (findNote(doc, to)) throw new NoteRefused('exists', `${to} already exists.`);
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
  doc.transact(() => mapOf(doc, note.id)?.set('trashedAt', nowIso()), origin);
}

// ─── The author's (the note becomes theirs) ───

export function authorWriteNote(
  doc: Y.Doc,
  input: { path: string; text: string },
  origin: Origin = AUTHOR,
): string {
  return write(doc, { ...input, by: 'author' }, origin, findNote(doc, input.path));
}

export function authorEditNote(doc: Y.Doc, id: string, text: string, origin: Origin = AUTHOR) {
  const m = mapOf(doc, id);
  if (!m) return;
  doc.transact(() => {
    m.set('text', text);
    m.set('by', 'author');
    m.set('updatedAt', nowIso());
  }, origin);
}

export function authorTrashNote(doc: Y.Doc, id: string, origin: Origin = AUTHOR) {
  doc.transact(() => mapOf(doc, id)?.set('trashedAt', nowIso()), origin);
}

export function authorRestoreNote(doc: Y.Doc, id: string, origin: Origin = AUTHOR) {
  doc.transact(() => mapOf(doc, id)?.delete('trashedAt'), origin);
}
