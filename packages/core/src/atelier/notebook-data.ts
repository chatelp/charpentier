import {
  chatMessages,
  interviewMessages,
  listNotes,
  listTrashedNotes,
  notePath,
  type ChatMessage,
  type Note,
  type NoteBook,
  type NoteNature,
  type WorkRef,
} from '@charpentier/schema';
import type * as Y from 'yjs';

/** What the Carnet reads of the mentor document: the notes, and the threads they come from. */
export interface NotebookData {
  readonly notes: readonly Note[];
  readonly trashed: readonly Note[];
  readonly interviewIds: ReadonlySet<string>;
  readonly chat: ReadonlyMap<string, ChatMessage>;
  /** The working version each message was born in, outside Principale (DESIGN 1.20). */
  readonly versions: ReadonlyMap<string, string>;
}

export function readNotebook(doc: Y.Doc): NotebookData {
  return {
    notes: listNotes(doc),
    trashed: listTrashedNotes(doc),
    interviewIds: new Set(interviewMessages(doc).map((m) => m.id)),
    chat: new Map(chatMessages(doc).map((m) => [m.id, m])),
    versions: new Map(
      [...interviewMessages(doc), ...chatMessages(doc)].flatMap((m) =>
        m.version ? [[m.id, m.version] as const] : [],
      ),
    ),
  };
}

/** Where a note comes from: the first of its messages still in a thread, and how many there are. */
export interface NoteSource {
  readonly mode: 'interview' | 'conversation';
  readonly messageId: string;
  readonly count: number;
  /** A background work's bilan (« d'après Bilan de la structure »). */
  readonly work?: WorkRef;
  /** The working version its first message was born in, outside Principale. */
  readonly version?: string;
}

export function sourceOf(note: Note, data: NotebookData): NoteSource | undefined {
  const known = note.sources.filter((id) => data.interviewIds.has(id) || data.chat.has(id));
  const first = known[0];
  if (!first) return undefined;
  const version = data.versions.get(first);
  if (data.interviewIds.has(first))
    return {
      mode: 'interview',
      messageId: first,
      count: known.filter((id) => data.interviewIds.has(id)).length,
      ...(version && { version }),
    };
  const work = data.chat.get(first)?.work;
  return {
    mode: 'conversation',
    messageId: first,
    count: known.filter((id) => data.chat.has(id)).length,
    ...(work && { work }),
    ...(version && { version }),
  };
}

/**
 * The path for a note of the author's, from its title, that no other live
 * note has (« la-fin-reste-ouverte-2.md »): writing at a taken path would
 * replace that note.
 */
export function freeNotePath(
  doc: Y.Doc,
  book: NoteBook,
  nature: NoteNature,
  title: string,
  self?: string,
): string {
  const base = notePath(book, nature, title);
  const taken = new Set(
    listNotes(doc)
      .filter((n) => n.id !== self)
      .map((n) => n.path),
  );
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const path = base.replace(/\.md$/, `-${i}.md`);
    if (!taken.has(path)) return path;
  }
}

/** Since the author's last visit, a note of the Compagnon's is new, or updated. */
export function freshness(
  note: Note,
  lastVisit: string | null | undefined,
): 'created' | 'updated' | undefined {
  if (note.by !== 'compagnon' || lastVisit === undefined) return undefined;
  if (lastVisit !== null && note.updatedAt <= lastVisit) return undefined;
  return lastVisit === null || note.createdAt > lastVisit ? 'created' : 'updated';
}

/** The preference that keeps the time of the author's last visit to the Carnet, per project. */
export const notebookVisitPref = (projectId: string) => `notebookVisit:${projectId}`;
