import type * as Y from 'yjs';

/**
 * Opens and keeps in sync the Yjs documents of a project.
 *
 * Every host hands out a local replica: on the web the replica is persisted in
 * IndexedDB; on desktop it is a peer of the authoritative document held by the
 * Electron main process (docs/SPEC.md §13, D-7); later, Hocuspocus adds a
 * remote peer. Core code never needs to know which.
 */
export interface DocumentService {
  /** Opens (or creates) the document with the given guid, e.g. `project:<pid>/scene:<sid>`. */
  open(guid: string): Promise<DocumentHandle>;
}

export interface DocumentHandle {
  readonly guid: string;
  readonly doc: Y.Doc;
  /** Resolves once the local replica holds everything persisted so far. */
  readonly whenLoaded: Promise<void>;
  /** Flushes pending writes and releases the replica. */
  close(): Promise<void>;
}
