import { useMemo, useSyncExternalStore } from 'react';
import type * as Y from 'yjs';

/** Caches `read(doc)` and recomputes it after each Yjs update (local or remote). */
class DocSnapshotStore<T> {
  #value: T;
  #stale = false;

  constructor(
    private readonly doc: Y.Doc,
    private readonly read: (doc: Y.Doc) => T,
  ) {
    this.#value = read(doc);
  }

  subscribe = (onChange: () => void) => {
    const handler = () => {
      this.#stale = true;
      onChange();
    };
    this.doc.on('update', handler);
    return () => this.doc.off('update', handler);
  };

  getSnapshot = (): T => {
    if (this.#stale) {
      this.#value = this.read(this.doc);
      this.#stale = false;
    }
    return this.#value;
  };
}

/**
 * A React view of a Yjs document. `read` must be stable (module-level, or
 * memoized), as it identifies the store.
 */
export function useDocSnapshot<T>(doc: Y.Doc, read: (doc: Y.Doc) => T): T {
  const store = useMemo(() => new DocSnapshotStore(doc, read), [doc, read]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
