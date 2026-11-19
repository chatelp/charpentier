import type {
  DocumentHandle,
  DocumentService,
  LibraryService,
  ProjectKind,
  ProjectSummary,
} from '@charpentier/platform';
import * as Y from 'yjs';

/** Guid of the library index document. */
export const LIBRARY_GUID = 'library';

type Entry = Y.Map<unknown>;

/** A project as the account's library keeps it (the same shape as the desktop's). */
export interface LibraryRecord extends ProjectSummary {
  readonly createdAt: string;
  /** When the title last changed: a title travels by this date, never by an opening's. */
  readonly titleAt?: string;
  /** When the project last went to the trash or came back: the trash state travels by this date. */
  readonly trashAt?: string;
}

/** Origin of the changes that come from the account (not to be sent back). */
const ADOPTED = Symbol('adopted');

const now = () => new Date().toISOString();

function toSummary(id: string, entry: Entry): ProjectSummary {
  const trashedAt = entry.get('trashedAt');
  return {
    id,
    title: String(entry.get('title') ?? ''),
    kind: entry.get('kind') === 'short-story' ? 'short-story' : 'novel',
    updatedAt: String(entry.get('updatedAt') ?? ''),
    ...(typeof trashedAt === 'string' && { trashedAt }),
  };
}

const byDesc = (key: 'updatedAt' | 'trashedAt') => (a: ProjectSummary, b: ProjectSummary) =>
  (b[key] ?? '').localeCompare(a[key] ?? '');

/**
 * The library kept in a Yjs document (`library`), persisted like any other
 * document by the host's DocumentService. One entry per project, under its
 * id: two devices creating projects never collide.
 */
export class DocumentLibrary implements LibraryService {
  #handle: Promise<DocumentHandle> | undefined;

  constructor(private readonly documents: DocumentService) {}

  async #projects(): Promise<Y.Map<Entry>> {
    this.#handle ??= this.documents.open(LIBRARY_GUID).then(async (handle) => {
      await handle.whenLoaded;
      return handle;
    });
    return (await this.#handle).doc.getMap<Entry>('projects');
  }

  async #update(projectId: string, change: (entry: Entry) => void): Promise<void> {
    const projects = await this.#projects();
    const entry = projects.get(projectId);
    if (!entry) throw new Error(`Unknown project: ${projectId}`);
    // eslint-disable-next-line charpentier/transact-origin -- the library index is a host document, outside the project model and its origins
    projects.doc?.transact(() => change(entry));
  }

  /** Every project with its dates, trashed or not: what the sync compares (phase 4.7 a). */
  async all(): Promise<readonly LibraryRecord[]> {
    const projects = await this.#projects();
    return [...projects.entries()].map(([id, entry]) => {
      const titleAt = entry.get('titleAt');
      const trashAt = entry.get('trashAt');
      return {
        ...toSummary(id, entry),
        createdAt: String(entry.get('createdAt') ?? ''),
        ...(typeof titleAt === 'string' && { titleAt }),
        ...(typeof trashAt === 'string' && { trashAt }),
      };
    });
  }

  /** A project created or changed on another device, with exactly its dates (not sent back). */
  async adopt(record: LibraryRecord): Promise<void> {
    const projects = await this.#projects();
    projects.doc?.transact(() => {
      let entry = projects.get(record.id);
      if (!entry) {
        entry = new Y.Map<unknown>();
        projects.set(record.id, entry);
      }
      entry.set('title', record.title);
      entry.set('kind', record.kind);
      entry.set('createdAt', record.createdAt);
      entry.set('updatedAt', record.updatedAt);
      if (record.titleAt) entry.set('titleAt', record.titleAt);
      if (record.trashAt) entry.set('trashAt', record.trashAt);
      if (record.trashedAt) entry.set('trashedAt', record.trashedAt);
      else entry.delete('trashedAt');
    }, ADOPTED);
  }

  /** Called when the library changes here (not by `adopt`). */
  async onLocalChange(listener: () => void): Promise<() => void> {
    const projects = await this.#projects();
    const observer = (_events: unknown, transaction: Y.Transaction) => {
      if (transaction.origin !== ADOPTED) listener();
    };
    projects.observeDeep(observer);
    return () => projects.unobserveDeep(observer);
  }

  async list(): Promise<readonly ProjectSummary[]> {
    const projects = await this.#projects();
    return [...projects.entries()]
      .map(([id, entry]) => toSummary(id, entry))
      .filter((p) => !p.trashedAt)
      .sort(byDesc('updatedAt'));
  }

  async listTrashed(): Promise<readonly ProjectSummary[]> {
    const projects = await this.#projects();
    return [...projects.entries()]
      .map(([id, entry]) => toSummary(id, entry))
      .filter((p) => p.trashedAt)
      .sort(byDesc('trashedAt'));
  }

  async create(input: { title: string; kind: ProjectKind; id?: string }): Promise<ProjectSummary> {
    const projects = await this.#projects();
    const id = input.id ?? crypto.randomUUID();
    const existing = projects.get(id);
    if (existing) return toSummary(id, existing);
    const entry = new Y.Map<unknown>();
    // eslint-disable-next-line charpentier/transact-origin -- the library index is a host document, outside the project model and its origins
    projects.doc?.transact(() => {
      projects.set(id, entry);
      entry.set('title', input.title);
      entry.set('kind', input.kind);
      entry.set('createdAt', now());
      entry.set('updatedAt', now());
    });
    return toSummary(id, entry);
  }

  rename(projectId: string, title: string): Promise<void> {
    return this.#update(projectId, (entry) => {
      const at = now();
      entry.set('title', title);
      entry.set('updatedAt', at);
      entry.set('titleAt', at);
    });
  }

  touch(projectId: string): Promise<void> {
    return this.#update(projectId, (entry) => entry.set('updatedAt', now()));
  }

  trash(projectId: string): Promise<void> {
    return this.#update(projectId, (entry) => {
      const at = now();
      entry.set('trashedAt', at);
      entry.set('trashAt', at);
    });
  }

  restore(projectId: string): Promise<void> {
    return this.#update(projectId, (entry) => {
      entry.delete('trashedAt');
      entry.set('trashAt', now());
    });
  }
}
