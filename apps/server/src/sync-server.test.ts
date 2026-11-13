import { PGlite } from '@electric-sql/pglite';
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import type { Server } from '@hocuspocus/server';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { migrate, type Database } from './database';
import { documentOwner } from './document-names';
import { createSyncServer } from './sync-server';

const servers: Server[] = [];
const providers: HocuspocusProvider[] = [];
const sockets: HocuspocusProviderWebsocket[] = [];

afterEach(async () => {
  for (const provider of providers.splice(0)) provider.destroy();
  for (const socket of sockets.splice(0)) socket.destroy();
  for (const server of servers.splice(0)) await server.destroy();
});

async function startServer(db: Database) {
  const server = createSyncServer({ db, port: 0, address: '127.0.0.1' });
  await server.listen();
  servers.push(server);
  return `ws://127.0.0.1:${server.address.port}`;
}

/** A device: its own Y.Doc, connected to the server. */
function provide(url: string, name: string, doc: Y.Doc) {
  const socket = new HocuspocusProviderWebsocket({ url, WebSocketPolyfill: WebSocket });
  sockets.push(socket);
  const provider = new HocuspocusProvider({
    websocketProvider: socket,
    name,
    document: doc,
    token: 'test',
  });
  provider.attach();
  providers.push(provider);
  return provider;
}

function connect(url: string, name: string, doc = new Y.Doc()) {
  const provider = provide(url, name, doc);
  const synced = new Promise<void>((resolve) => provider.on('synced', () => resolve()));
  return { doc, provider, synced };
}

const text = (doc: Y.Doc) => doc.getText('t').toString();

async function freshDatabase() {
  const db = new PGlite();
  await migrate(db);
  return db;
}

describe('sync server', () => {
  it('relays the edits of one device to another', async () => {
    const url = await startServer(await freshDatabase());
    const a = connect(url, 'project:p1/scene:s1');
    const b = connect(url, 'project:p1/scene:s1');
    await Promise.all([a.synced, b.synced]);
    a.doc.getText('t').insert(0, 'Il pleuvait sur Nantes.');
    await expect.poll(() => text(b.doc), { timeout: 5000 }).toBe('Il pleuvait sur Nantes.');
  });

  it('merges what two devices wrote apart', async () => {
    const url = await startServer(await freshDatabase());
    // Each device writes before connecting (offline), then both connect.
    const docA = new Y.Doc();
    docA.getText('t').insert(0, 'Hélène entra. ');
    const docB = new Y.Doc();
    docB.getText('t').insert(0, 'Il pleuvait. ');
    const a = connect(url, 'project:p1/scene:s1', docA);
    const b = connect(url, 'project:p1/scene:s1', docB);
    await Promise.all([a.synced, b.synced]);
    await expect
      .poll(() => [text(a.doc), text(b.doc)], { timeout: 8000 })
      .toSatisfy(([x, y]) => x === y);
    expect(text(a.doc)).toContain('Hélène entra.');
    expect(text(a.doc)).toContain('Il pleuvait.');
  });

  it('keeps the documents in Postgres across a restart', async () => {
    const db = await freshDatabase();
    const first = await startServer(db);
    const a = connect(first, 'project:p1');
    await a.synced;
    a.doc.getText('t').insert(0, 'Les serres');
    // The server has it once the device has no unacknowledged change left.
    await expect.poll(() => a.provider.hasUnsyncedChanges).toBe(false);
    a.provider.destroy();
    // Destroying the server stores what is still pending.
    await servers.pop()?.destroy();

    const second = await startServer(db);
    const b = connect(second, 'project:p1');
    await b.synced;
    expect(text(b.doc)).toBe('Les serres');
  });

  it('serves only Charpentier documents', async () => {
    const url = await startServer(await freshDatabase());
    const provider = provide(url, 'anything-else', new Y.Doc());
    const failed = await new Promise<boolean>((resolve) => {
      provider.on('authenticationFailed', () => resolve(true));
      provider.on('synced', () => resolve(false));
    });
    expect(failed).toBe(true);
  });
});

describe('document names', () => {
  it('knows which project or account a document belongs to', () => {
    expect(documentOwner('project:abc')).toEqual({ kind: 'project', projectId: 'abc' });
    expect(documentOwner('project:abc/scene:s-1/history')).toEqual({
      kind: 'project',
      projectId: 'abc',
    });
    expect(documentOwner('project:abc/mentor')).toEqual({ kind: 'project', projectId: 'abc' });
    expect(documentOwner('library:u1')).toEqual({ kind: 'library', userId: 'u1' });
    for (const bad of ['project:', 'project:a/other', 'library', '../etc', 'project:a b'])
      expect(documentOwner(bad)).toBeNull();
  });
});
