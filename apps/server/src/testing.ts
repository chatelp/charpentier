import { PGlite } from '@electric-sql/pglite';
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import type { Server } from '@hocuspocus/server';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { createUser, login } from './accounts';
import { migrate, type Database } from './database';
import { createSyncServer } from './sync-server';

/** Test helpers: a Postgres in memory (PGlite), a server on a free port, devices. */

const servers: Server[] = [];
const providers: HocuspocusProvider[] = [];
const sockets: HocuspocusProviderWebsocket[] = [];

export async function cleanUp() {
  for (const provider of providers.splice(0)) provider.destroy();
  for (const socket of sockets.splice(0)) socket.destroy();
  for (const server of servers.splice(0)) await server.destroy();
}

export async function freshDatabase(): Promise<Database> {
  const db = new PGlite();
  await migrate(db);
  return db;
}

export async function startServer(
  db: Database,
  cacheDir: string | null = null,
  netboot?: { secret: string | null; macs: readonly string[] },
) {
  const server = createSyncServer({
    db,
    port: 0,
    address: '127.0.0.1',
    cacheDir,
    ...(netboot && { netboot }),
  });
  await server.listen();
  servers.push(server);
  const { port } = server.address;
  return {
    server,
    ws: `ws://127.0.0.1:${port}`,
    http: `http://127.0.0.1:${port}`,
    stop: async () => {
      servers.splice(servers.indexOf(server), 1);
      await server.destroy();
    },
  };
}

/** An account and a signed-in device of it. */
export async function account(db: Database, email = 'helene@example.org') {
  const password = 'une serre sous la glace';
  const userId = await createUser(db, email, password);
  const session = await login(db, email, password, 'test');
  if (!session) throw new Error('Could not sign in');
  return { userId, token: session.token, sessionId: session.sessionId, email, password };
}

/** A device's copy of a document, connected to the server with a token. */
export function connect(
  url: string,
  name: string,
  token: string,
  doc = new Y.Doc(),
  /** What a browser's handshake carries (its cookie, its origin). */
  headers?: Record<string, string>,
) {
  const Polyfill = headers
    ? class extends WebSocket {
        constructor(address: string, protocols?: string | string[]) {
          super(address, protocols, { headers });
        }
      }
    : WebSocket;
  const socket = new HocuspocusProviderWebsocket({ url, WebSocketPolyfill: Polyfill });
  sockets.push(socket);
  const provider = new HocuspocusProvider({
    websocketProvider: socket,
    name,
    document: doc,
    token,
  });
  provider.attach();
  providers.push(provider);
  const synced = new Promise<boolean>((resolve) => {
    provider.on('synced', () => resolve(true));
    provider.on('authenticationFailed', () => resolve(false));
  });
  return { doc, provider, synced };
}

export const text = (doc: Y.Doc) => doc.getText('t').toString();
