import type { DocumentHandle, DocumentService } from '@charpentier/platform';
import * as Y from 'yjs';
import type { DesktopBridge, Message } from '../shared/ipc';

/** Origin of updates coming from the main process (not sent back). */
const MAIN = Symbol('main');

interface Replica {
  readonly doc: Y.Doc;
  readonly loaded: Promise<void>;
  refs: number;
}

/**
 * Renderer replicas of the main process's documents (D-7). Each local update
 * is sent to the main process, each update from there is applied here.
 */
export class IpcDocumentService implements DocumentService {
  readonly #replicas = new Map<string, Replica>();

  constructor(private readonly bridge: DesktopBridge) {
    bridge.onMessage((message: Message) => {
      if (message.type !== 'doc.update') return;
      const replica = this.#replicas.get(message.guid);
      if (replica) Y.applyUpdate(replica.doc, message.update, MAIN);
    });
  }

  async open(guid: string): Promise<DocumentHandle> {
    let replica = this.#replicas.get(guid);
    if (!replica) {
      const doc = new Y.Doc({ guid });
      // Ask first: the main process must hold the document before our updates arrive.
      const loaded = this.bridge.invoke({ type: 'doc.open', guid }).then(({ state }) => {
        Y.applyUpdate(doc, state, MAIN);
      });
      doc.on('update', (update: Uint8Array, origin: unknown) => {
        if (origin !== MAIN) this.bridge.send({ type: 'doc.update', guid, update });
      });
      replica = { doc, loaded, refs: 0 };
      this.#replicas.set(guid, replica);
    }
    replica.refs++;
    const opened = replica;
    let closed = false;
    return {
      guid,
      doc: opened.doc,
      whenLoaded: opened.loaded,
      close: async () => {
        if (closed) return;
        closed = true;
        if (--opened.refs > 0) return;
        this.#replicas.delete(guid);
        await opened.loaded.catch(() => {});
        await this.bridge.invoke({ type: 'doc.close', guid });
        opened.doc.destroy();
      },
    };
  }
}
