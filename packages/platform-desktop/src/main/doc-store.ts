import * as Y from 'yjs';
import { DocFile } from './doc-file';

/** Origin of updates applied while loading from disk (not written back). */
const LOAD = Symbol('load');

export type UpdateListener = (update: Uint8Array, origin: unknown) => void;

interface Entry {
  readonly doc: Y.Doc;
  readonly file: DocFile;
  readonly holders: Set<unknown>;
  readonly listeners: Set<UpdateListener>;
}

/**
 * The reference copies of the documents (D-7): they live in the main
 * process, persisted by a `DocFile` each. Interfaces (renderers), the
 * Markdown mirror and, later, agents hold documents by key and receive
 * every update made by the others.
 */
export class DocStore {
  readonly #entries = new Map<string, Entry>();

  constructor(
    /** Directory of a document, or undefined if it cannot exist (unknown project). */
    private readonly locate: (guid: string) => string | undefined,
    private readonly fileOptions: ConstructorParameters<typeof DocFile>[1] = {},
  ) {}

  /** Opens (or shares) a document for `holder`. */
  acquire(guid: string, holder: unknown): Y.Doc {
    let entry = this.#entries.get(guid);
    if (!entry) {
      const dir = this.locate(guid);
      if (!dir) throw new Error(`No location for document ${guid}`);
      const doc = new Y.Doc({ guid, gc: true });
      const file = new DocFile(dir, this.fileOptions);
      file.load(doc, LOAD);
      const created: Entry = { doc, file, holders: new Set(), listeners: new Set() };
      doc.on('update', (update: Uint8Array, origin: unknown) => {
        if (origin === LOAD) return;
        file.append(update);
        if (file.shouldCompact) file.compact(doc);
        for (const listener of created.listeners) listener(update, origin);
      });
      this.#entries.set(guid, created);
      entry = created;
    }
    entry.holders.add(holder);
    return entry.doc;
  }

  /** Every update of `guid`, with its origin, until the returned function is called. */
  subscribe(guid: string, listener: UpdateListener): () => void {
    const entry = this.#entries.get(guid);
    if (!entry) throw new Error(`Document not open: ${guid}`);
    entry.listeners.add(listener);
    return () => entry.listeners.delete(listener);
  }

  /** `holder` no longer needs the document; the last one out closes it (state compacted). */
  release(guid: string, holder: unknown): void {
    const entry = this.#entries.get(guid);
    if (!entry || !entry.holders.delete(holder) || entry.holders.size > 0) return;
    entry.file.close(entry.doc);
    entry.doc.destroy();
    this.#entries.delete(guid);
  }

  /** Releases everything `holder` has (a window closing). */
  releaseAll(holder: unknown): void {
    for (const [guid, entry] of this.#entries)
      if (entry.holders.has(holder)) this.release(guid, holder);
  }

  /** Compacts and closes every document (quitting). */
  closeAll(): void {
    for (const [guid, entry] of this.#entries) {
      entry.file.close(entry.doc);
      entry.doc.destroy();
      this.#entries.delete(guid);
    }
  }

  /** Guids of the open documents. */
  openGuids(): string[] {
    return [...this.#entries.keys()];
  }

  /** Who holds a document (empty if closed). */
  holders(guid: string): ReadonlySet<unknown> {
    return this.#entries.get(guid)?.holders ?? new Set();
  }

  isOpen(guid: string): boolean {
    return this.#entries.has(guid);
  }
}
