import {
  DocumentLibrary,
  MemoryDocumentService,
  WebCompagnon,
  WebSync,
} from '@charpentier/platform-web';
import type { LlmResponse } from '@charpentier/platform';
import {
  addChatMessage,
  AUTHOR,
  chatMessages,
  createChapter,
  createScene,
  guids,
  initProject,
} from '@charpentier/schema';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { CreateLlm } from './compagnon';
import type { Database } from './database';
import { createSyncServer } from './sync-server';
import { account, cleanUp, freshDatabase } from './testing';

const servers: { destroy(): Promise<void> }[] = [];
const syncs: WebSync[] = [];
afterEach(async () => {
  for (const sync of syncs.splice(0)) sync.stop();
  await cleanUp();
  for (const server of servers.splice(0)) await server.destroy();
});

const KEY = 'sk-ant-api03-la-cle-de-pierre';

/** The model, played: the Compagnon's answer, and which key it came with. */
function fakeModel() {
  const keys: string[] = [];
  const createLlm: CreateLlm = (apiKey) => ({
    checkKey: async (key) => (key === KEY ? 'valid' : 'invalid'),
    generate: async (): Promise<LlmResponse> => {
      keys.push(apiKey);
      return { text: JSON.stringify({ reply: 'Que veut Hélène, dans cette scène ?' }) };
    },
  });
  return { createLlm, keys };
}

async function start(db: Database, createLlm: CreateLlm) {
  const server = createSyncServer({ db, port: 0, address: '127.0.0.1', createLlm });
  await server.listen();
  servers.push(server);
  return { server, origin: `http://127.0.0.1:${server.address.port}` };
}

/** A browser on the app's page: its documents, its cookie jar, its storage, its Compagnon. */
function browser(initialOrigin: string) {
  const jar = { cookie: '', origin: initialOrigin };
  const fetchWithJar: typeof fetch = async (input, init = {}) => {
    // The page's origin follows a restarted server (a new port in the test).
    const url = String(input).replace(/^http:\/\/127\.0\.0\.1:\d+/, jar.origin);
    const response = await fetch(url, {
      ...init,
      headers: {
        Origin: jar.origin,
        ...(jar.cookie && { Cookie: jar.cookie }),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    const set = response.headers.get('set-cookie');
    if (set) jar.cookie = set.split(';')[0]?.endsWith('=') ? '' : (set.split(';')[0] ?? '');
    return response;
  };
  class PageSocket extends WebSocket {
    constructor(address: string, protocols?: string | string[]) {
      super(address, protocols, {
        headers: { Origin: jar.origin, ...(jar.cookie && { Cookie: jar.cookie }) },
      });
    }
  }
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  const documents = new MemoryDocumentService();
  const library = new DocumentLibrary(documents);
  const sync = new WebSync({
    documents,
    library,
    origin: initialOrigin,
    device: 'Navigateur · Test',
    storage,
    fetch: fetchWithJar,
    WebSocket: PageSocket,
  });
  syncs.push(sync);
  const compagnon = new WebCompagnon({
    documents,
    origin: initialOrigin,
    storage,
    fetch: fetchWithJar,
  });
  return { sync, compagnon, documents, library, store, jar };
}

describe('the Compagnon in the browser, through the server (phase 4.7 b)', () => {
  it('answers with the account’s key, which the browser never holds; after a restart, asks for the password', async () => {
    const db = await freshDatabase();
    const model = fakeModel();
    const first = await start(db, model.createLlm);
    const helene = await account(db);

    const page = browser(first.origin);
    expect(await page.sync.signIn({ server: first.origin, ...helene })).toBe('ok');
    await page.compagnon.refresh();
    expect(page.compagnon.status()).toBe('unconfigured');
    expect(await page.compagnon.setApiKey('sk-faux')).toBe('invalid');
    expect(await page.compagnon.setApiKey(KEY)).toBe('saved');
    expect(page.compagnon.status()).toBe('available');

    // A novel and a question, in the page's documents.
    const project = await page.library.create({ title: 'Les serres', kind: 'novel' });
    const root = (await page.documents.open(guids.project(project.id))).doc;
    initProject(root, { id: project.id, title: 'Les serres', kind: 'novel' });
    createScene(root, { chapterId: createChapter(root, { title: 'La serre' }), title: 'Scène' });
    const mentor = (await page.documents.open(guids.mentor(project.id))).doc;
    addChatMessage(mentor, { role: 'author', text: 'Ma scène est-elle trop lente ?' }, AUTHOR);

    expect(await page.compagnon.ask({ projectId: project.id })).toBe('answered');
    expect(chatMessages(mentor).at(-1)).toMatchObject({
      role: 'compagnon',
      text: 'Que veut Hélène, dans cette scène ?',
    });
    expect(model.keys).toEqual([KEY]);
    // Nothing the page keeps holds the key.
    expect(JSON.stringify([...page.store])).not.toContain('la-cle-de-pierre');

    // The server restarts: the session stays, the key waits for the password.
    await first.server.destroy();
    const second = await start(db, model.createLlm);
    page.jar.origin = second.origin;
    await page.compagnon.refresh();
    expect(page.compagnon.status()).toBe('locked');
    addChatMessage(mentor, { role: 'author', text: 'Et la fin ?' }, AUTHOR);
    expect(await page.compagnon.ask({ projectId: project.id })).toBe('unavailable');
    expect(await page.compagnon.unlock('pas le bon')).toBe('invalid');
    expect(await page.compagnon.unlock(helene.password)).toBe('unlocked');
    expect(page.compagnon.status()).toBe('available');
    expect(await page.compagnon.ask({ projectId: project.id })).toBe('answered');
    expect(model.keys).toEqual([KEY, KEY]);
  });
});
