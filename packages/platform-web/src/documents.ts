import type { DocumentHandle, DocumentService } from '@charpentier/platform';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';

/**
 * Yjs documents persisted in IndexedDB (y-indexeddb), one database per guid.
 * Every update is stored as it happens, so a reload or a crash loses nothing
 * that was typed. IndexedDB alone is not enough for a manuscript (the browser
 * may evict it); the desktop host writes to disk instead (step 2).
 */
export class IndexedDbDocumentService implements DocumentService {
  readonly #open = new Map<
    string,
    { doc: Y.Doc; persistence: IndexeddbPersistence; refs: number }
  >();

  constructor(private readonly prefix = 'charpentier:') {}

  async open(guid: string): Promise<DocumentHandle> {
    let entry = this.#open.get(guid);
    if (!entry) {
      const doc = new Y.Doc({ guid });
      entry = { doc, persistence: new IndexeddbPersistence(this.prefix + guid, doc), refs: 0 };
      this.#open.set(guid, entry);
    }
    entry.refs++;
    const current = entry;
    let closed = false;
    return {
      guid,
      doc: current.doc,
      whenLoaded: current.persistence.whenSynced.then(() => undefined),
      close: async () => {
        if (closed) return;
        closed = true;
        current.refs--;
        if (current.refs > 0) return;
        // The guid may be opened again before the lines below run: that is a new
        // replica on a connection of its own, which reads what this one wrote.
        this.#open.delete(guid);
        // Edits made before the first load completed are written by that load:
        // wait for it, then close the database (pending writes finish; data stays).
        await current.persistence.whenSynced;
        await current.persistence.destroy();
        current.doc.destroy();
      },
    };
  }
}

/** In-memory documents, for tests and for browsers without IndexedDB. */
export class MemoryDocumentService implements DocumentService {
  readonly #open = new Map<string, { doc: Y.Doc; refs: number }>();

  async open(guid: string): Promise<DocumentHandle> {
    let entry = this.#open.get(guid);
    if (!entry) {
      entry = { doc: new Y.Doc({ guid }), refs: 0 };
      this.#open.set(guid, entry);
    }
    entry.refs++;
    const current = entry;
    let closed = false;
    return {
      guid,
      doc: current.doc,
      whenLoaded: Promise.resolve(),
      close: async () => {
        if (closed) return;
        closed = true;
        if (--current.refs > 0) return;
        // Only its own entry: the guid may have been opened again since.
        if (this.#open.get(guid) === current) this.#open.delete(guid);
        current.doc.destroy();
      },
    };
  }
}
