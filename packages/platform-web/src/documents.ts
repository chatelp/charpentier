import type { DocumentHandle, DocumentService } from '@charpentier/platform';
import * as Y from 'yjs';

/**
 * In-memory documents. Phase 1.5 adds IndexedDB persistence (y-indexeddb);
 * until then, content is lost on reload.
 */
export class MemoryDocumentService implements DocumentService {
  readonly #open = new Map<string, Y.Doc>();

  async open(guid: string): Promise<DocumentHandle> {
    let doc = this.#open.get(guid);
    if (!doc) {
      doc = new Y.Doc({ guid });
      this.#open.set(guid, doc);
    }
    return {
      guid,
      doc,
      whenLoaded: Promise.resolve(),
      close: async () => {
        this.#open.get(guid)?.destroy();
        this.#open.delete(guid);
      },
    };
  }
}
