import { Database as DatabaseExtension } from '@hocuspocus/extension-database';
import { Server } from '@hocuspocus/server';
import { claimProject, sessionFor } from './accounts';
import { loadDocument, storeDocument, type Database } from './database';
import { documentOwner } from './document-names';
import { handleApi, LoginLimiter } from './http-api';
import { handleCache } from './nix-cache';
import { handleUpdates } from './updates';

export interface SyncServerOptions {
  readonly db: Database;
  readonly port?: number;
  readonly address?: string;
  /** Where the X250's binary cache keeps its files (D-31); without it, no cache. */
  readonly cacheDir?: string | null;
}

/** What a connection is, once its token has been checked. */
export interface ConnectionContext {
  readonly userId: string;
  readonly sessionId: string;
}

/**
 * The sync server (docs/SPEC.md §14, step 4): Hocuspocus relays the Yjs
 * updates of each document between the devices of an account and keeps its
 * state in Postgres. A connection needs a live device session (D-21), and
 * only reaches the account's own documents: its library, and the projects it
 * owns (the first account to open a project claims it).
 */
export function createSyncServer(options: SyncServerOptions): Server<ConnectionContext> {
  const { db } = options;
  const cacheDir = options.cacheDir ?? null;
  const limiter = new LoginLimiter();
  return new Server<ConnectionContext>({
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
    async onAuthenticate({ documentName, token }): Promise<ConnectionContext> {
      const owner = documentOwner(documentName);
      if (!owner) throw new Error('Unknown document');
      const session = await sessionFor(db, token);
      if (!session) throw new Error('Not signed in');
      const allowed =
        owner.kind === 'library'
          ? owner.userId === session.userId
          : await claimProject(db, owner.projectId, session.userId);
      if (!allowed) throw new Error('Not this account’s document');
      return session;
    },
    async onRequest({ request, response }) {
      // The API answers, then the rejection (without an error) stops Hocuspocus's own answer.
      if (
        (await handleCache(db, cacheDir, request, response)) ||
        (await handleUpdates(db, cacheDir, request, response)) ||
        (await handleApi(db, limiter, request, response))
      )
        return Promise.reject();
    },
  });
}
