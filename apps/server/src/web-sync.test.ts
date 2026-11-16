import { DocumentLibrary, MemoryDocumentService, WebSync } from '@charpentier/platform-web';
import { guids } from '@charpentier/schema';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createSyncServer } from './sync-server';
import { account, cleanUp, freshDatabase } from './testing';

const servers: { destroy(): Promise<void> }[] = [];
const syncs: WebSync[] = [];
afterEach(async () => {
  for (const sync of syncs.splice(0)) sync.stop();
  await cleanUp();
  for (const server of servers.splice(0)) await server.destroy();
});

/**
 * A browser on the app's page, outside a browser: its documents in memory,
 * its cookie jar, its handshakes from the page's origin.
 */
function browser(origin: string) {
  const jar = { cookie: '' };
  const headers = () => ({ Origin: origin, ...(jar.cookie && { Cookie: jar.cookie }) });
  const fetchWithJar: typeof fetch = async (input, init = {}) => {
    const response = await fetch(input, {
      ...init,
      headers: { ...headers(), ...(init.headers as Record<string, string> | undefined) },
    });
    const set = response.headers.get('set-cookie');
    if (set) jar.cookie = set.split(';')[0]?.endsWith('=') ? '' : (set.split(';')[0] ?? '');
    return response;
  };
  class PageSocket extends WebSocket {
    constructor(address: string, protocols?: string | string[]) {
      super(address, protocols, { headers: headers() });
    }
  }
  const store = new Map<string, string>();
  const tab = {
    opener: {} as unknown,
    location: { href: 'about:blank' },
    closed: false,
    close() {
      this.closed = true;
    },
  };
  const documents = new MemoryDocumentService();
  const library = new DocumentLibrary(documents);
  let forgotten = false;
  const sync = new WebSync({
    documents,
    library,
    origin,
    device: 'Navigateur · Test',
    storage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
      removeItem: (k) => void store.delete(k),
    },
    fetch: fetchWithJar,
    WebSocket: PageSocket,
    forgetDocuments: async () => {
      forgotten = true;
    },
    openTab: () => tab,
  });
  syncs.push(sync);
  return { sync, documents, library, jar, tab, forgotten: () => forgotten };
}

describe('the app in a browser syncs with its server (phase 4.7 a)', () => {
  it('brings a project written in one browser to another, and forgets it on signing out', async () => {
    const db = await freshDatabase();
    const server = createSyncServer({ db, port: 0, address: '127.0.0.1' });
    await server.listen();
    servers.push(server);
    const origin = `http://127.0.0.1:${server.address.port}`;
    const helene = await account(db);

    const one = browser(origin);
    expect(await one.sync.signIn({ server: origin, ...helene })).toBe('ok');
    // The page never holds the session: only the cookie jar does.
    expect(one.jar.cookie).toMatch(/^__Host-charpentier=/);
    const project = await one.library.create({ title: 'La batelière', kind: 'novel' });
    const root = await one.documents.open(guids.project(project.id));
    root.doc.getMap('meta').set('title', 'La batelière');
    expect(await one.sync.idle()).toBe(true);

    const two = browser(origin);
    expect(await two.sync.signIn({ server: origin, ...helene })).toBe('ok');
    expect(await two.sync.idle()).toBe(true);
    expect((await two.library.list()).map((p) => p.title)).toEqual(['La batelière']);
    const copy = await two.documents.open(guids.project(project.id));
    expect(copy.doc.getMap('meta').get('title')).toBe('La batelière');
    expect(await two.sync.account()).toEqual({ server: origin, email: helene.email });

    // A change here reaches the other browser.
    copy.doc.getMap('meta').set('title', 'La batelière de Loire');
    await two.sync.idle();
    await expect
      .poll(() => root.doc.getMap('meta').get('title'), { timeout: 5000 })
      .toBe('La batelière de Loire');

    // The first account administers the server; from here (127.0.0.1) the page answers.
    expect(await two.sync.openAdmin()).toBe('opened');
    expect(two.tab.location.href).toBe(`${origin}/admin`);
    expect(two.tab.opener).toBeNull();

    await two.sync.signOut();
    expect(two.forgotten()).toBe(true);
    expect(two.sync.status()).toBe('off');
    expect(await two.sync.account()).toBeNull();
    expect(two.jar.cookie).toBe('');
  });
});
