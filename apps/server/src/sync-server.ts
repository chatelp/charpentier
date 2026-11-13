import { Database as DatabaseExtension } from '@hocuspocus/extension-database';
import { Server } from '@hocuspocus/server';
import { loadDocument, storeDocument, type Database } from './database';
import { documentOwner } from './document-names';

export interface SyncServerOptions {
  readonly db: Database;
  readonly port?: number;
  readonly address?: string;
  /**
   * Checks the connection's token for a document; throws to refuse it.
   * (Accounts and sessions: phase 4.2.)
   */
  readonly authorize?: (token: string, documentName: string) => Promise<void>;
}

/**
 * The sync server (docs/SPEC.md §14, step 4): Hocuspocus relays the Yjs
 * updates of each document between the devices and keeps its state in
 * Postgres. It only serves Charpentier's own documents.
 */
export function createSyncServer(options: SyncServerOptions): Server {
  const { db } = options;
  return new Server({
    ...(options.port !== undefined && { port: options.port }),
    ...(options.address !== undefined && { address: options.address }),
    quiet: true,
    // Save a document 2 s after its last change, and at least every 10 s while it changes.
    debounce: 2000,
    maxDebounce: 10_000,
    extensions: [
      new DatabaseExtension({
        fetch: ({ documentName }) => loadDocument(db, documentName),
        store: ({ documentName, state }) => storeDocument(db, documentName, state),
      }),
    ],
    async onAuthenticate({ documentName, token }) {
      if (!documentOwner(documentName)) throw new Error('Unknown document');
      await options.authorize?.(token, documentName);
    },
  });
}
