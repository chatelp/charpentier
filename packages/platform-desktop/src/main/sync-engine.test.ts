import fs from 'node:fs';
import type { Socket } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { createSyncServer, createUser, migrate } from '@charpentier/server';
import {
  acceptProposal,
  createAgentWriter,
  createChapter,
  createScene,
  fragmentPlainText,
  getScene,
  guids,
  initProject,
  listAllScenes,
  listEntities,
  readFieldRef,
  rejectProposal,
  variantFragment,
} from '@charpentier/schema';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { DocStore } from './doc-store';
import { documentLocator, FolderLibrary } from './projects';
import { SyncEngine, type SyncAccount } from './sync-engine';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const EMAIL = 'pierre@example.org';
const PASSWORD = 'une serre sous la glace';

async function server() {
  const db = new PGlite();
  await migrate(db);
  await createUser(db, EMAIL, PASSWORD);
  const sync = createSyncServer({ db, port: 0, address: '127.0.0.1' });
  await sync.listen();
  const sockets = new Set<Socket>();
  sync.httpServer.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    // Destroying alone leaves the devices connected for a while: cut them off.
    for (const socket of sockets) socket.destroy();
    await sync.destroy();
  };
  cleanups.push(stop);
  return Object.assign(`http://127.0.0.1:${sync.address.port}`, { db, stop });
}

/** A device: its own library folder, documents and sync engine. */
function device(
  name: string,
  { keychain = true, syncingDelayMs }: { keychain?: boolean; syncingDelayMs?: number } = {},
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `charpentier-sync-${name}-`));
  const library = new FolderLibrary(path.join(dir, 'Bibliothèque'));
  const store = new DocStore(documentLocator(library));
  let saved: SyncAccount | null = null;
  const engine = new SyncEngine({
    store,
    library,
    credentials: {
      load: () => saved,
      save: (account) => {
        // Without a keychain (Linux without one), nothing can be kept.
        if (account && !keychain) return false;
        saved = account;
        return true;
      },
    },
    stateDir: path.join(dir, 'sync'),
    device: name,
    WebSocket,
    ...(syncingDelayMs !== undefined && { syncingDelayMs }),
  });
  cleanups.push(() => {
    engine.stop();
    store.closeAll();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  /** A document of a project, held by the test. */
  const doc = (guid: string) => store.acquire(guid, 'test');
  return { library, store, engine, doc };
}

/** Appends a paragraph to the active variant of a scene, as the author would. */
function write(sceneDoc: Y.Doc, variantId: string, text: string) {
  const paragraph = new Y.XmlElement('paragraph');
  paragraph.insert(0, [new Y.XmlText(text)]);
  const fragment = variantFragment(sceneDoc, variantId);
  fragment.insert(fragment.length, [paragraph]);
}

const until = async (check: () => boolean | Promise<boolean>, timeout = 10_000) => {
  const deadline = Date.now() + timeout;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Timed out');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};

// Real sync over a real socket: slower on a busy machine (GitHub's, or the Mac under load).
describe('sync between two desktop apps (step 4.3)', { timeout: 20_000 }, () => {
  it('brings a project to another device, then merges what both wrote offline', async () => {
    const url = await server();
    const mac = device('Mac');
    const x250 = device('X250');

    // On the Mac: a novel, a scene, a character the Compagnon proposed.
    const { id } = await mac.library.create({ title: 'Les serres', kind: 'novel' });
    const root = mac.doc(guids.project(id));
    initProject(root, { id, title: 'Les serres', kind: 'novel' });
    const chapterId = createChapter(root, { title: 'La serre' });
    const { sceneId, variantId } = createScene(root, { chapterId, title: 'Le sas' });
    write(mac.doc(guids.scene(id, sceneId)), variantId, 'Il pleuvait sur Nantes.');
    const helene = createAgentWriter(root, 'scene-analysis').proposeEntity(
      'characters',
      { name: 'Hélène', age: '47 ans', fear: 'la surface' },
      [],
    );

    expect(await mac.engine.signIn(url, EMAIL, 'mauvais mot de passe')).toBe('invalid');
    expect(await mac.engine.signIn(url, EMAIL, PASSWORD)).toBe('ok');
    expect(await mac.engine.idle()).toBe(true);

    // The X250 signs in to the same account: the novel arrives, with its scene.
    expect(await x250.engine.signIn(url, EMAIL, PASSWORD)).toBe('ok');
    await until(async () => (await x250.library.list()).some((p) => p.id === id));
    expect(await x250.engine.idle()).toBe(true);
    const root2 = x250.doc(guids.project(id));
    await until(() => listAllScenes(root2).length === 1);
    const scene2 = x250.doc(guids.scene(id, sceneId));
    await until(() => fragmentPlainText(variantFragment(scene2, variantId)).includes('Nantes'));

    // Both go offline and write: each a paragraph, each a decision on a sheet.
    mac.engine.stop();
    x250.engine.stop();
    write(mac.doc(guids.scene(id, sceneId)), variantId, 'Hélène entra dans le sas.');
    acceptProposal(root, { module: 'characters', entityId: helene, field: 'age' });
    write(scene2, variantId, 'La porte était ouverte.');
    rejectProposal(root2, { module: 'characters', entityId: helene, field: 'fear' });

    // Back online: everything converges, nothing lost, the decisions kept.
    mac.engine.start();
    x250.engine.start();
    const texts = () => [
      fragmentPlainText(variantFragment(mac.doc(guids.scene(id, sceneId)), variantId)),
      fragmentPlainText(variantFragment(scene2, variantId)),
    ];
    await until(() => {
      const [a = '', b] = texts();
      return a === b && a.includes('Hélène entra') && a.includes('La porte');
    });
    for (const r of [root, root2]) {
      expect(readFieldRef(r, { module: 'characters', entityId: helene, field: 'age' }).status).toBe(
        'validated',
      );
      expect(
        readFieldRef(r, { module: 'characters', entityId: helene, field: 'fear' }).status,
      ).toBe('rejected');
    }
    expect(listEntities(root2, 'characters')).toHaveLength(1);
    expect(getScene(root2, sceneId)?.title).toBe('Le sas');
  });

  it('never brings back an old title from a device that opened the novel offline', async () => {
    const url = await server();
    const mac = device('Mac');
    const x250 = device('X250');
    const { id } = await mac.library.create({ title: 'Mon roman', kind: 'novel' });
    const root = mac.doc(guids.project(id));
    initProject(root, { id, title: 'Mon roman', kind: 'novel' });
    expect(await mac.engine.signIn(url, EMAIL, PASSWORD)).toBe('ok');
    expect(await mac.engine.idle()).toBe(true);
    expect(await x250.engine.signIn(url, EMAIL, PASSWORD)).toBe('ok');
    await until(async () => (await x250.library.list()).some((p) => p.id === id));
    expect(await x250.engine.idle()).toBe(true);

    // The X250 goes offline; the Mac renames the novel; then the X250 opens it.
    x250.engine.stop();
    await mac.library.rename(id, 'Avant Nantes');
    await mac.engine.reconcile();
    expect(await mac.engine.idle()).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await x250.library.touch(id);

    // Back online: the newer opening travels, never the old title.
    x250.engine.start();
    await until(
      async () => (await x250.library.list()).find((p) => p.id === id)?.title === 'Avant Nantes',
    );
    expect(await x250.engine.idle()).toBe(true);
    await mac.engine.reconcile();
    expect((await mac.library.list()).find((p) => p.id === id)?.title).toBe('Avant Nantes');
  });

  it('keeps a new device’s untouched starter off an account that has projects', async () => {
    const url = await server();
    const mac = device('Mac');
    const { id } = await mac.library.create({ title: 'Les serres', kind: 'novel' });
    const root = mac.doc(guids.project(id));
    initProject(root, { id, title: 'Les serres', kind: 'novel' });
    const { sceneId, variantId } = createScene(root, {
      chapterId: createChapter(root, { title: 'La serre' }),
      title: 'Le sas',
    });
    write(mac.doc(guids.scene(id, sceneId)), variantId, 'Il pleuvait sur Nantes.');
    expect(await mac.engine.signIn(url, EMAIL, PASSWORD)).toBe('ok');
    expect(await mac.engine.idle()).toBe(true);

    // The X250's first start made « Mon roman »: one chapter, one empty scene.
    const x250 = device('X250');
    const starter = await x250.library.create({ title: 'Mon roman', kind: 'novel' });
    const starterRoot = x250.doc(guids.project(starter.id));
    initProject(starterRoot, { id: starter.id, title: 'Mon roman', kind: 'novel' });
    createScene(starterRoot, {
      chapterId: createChapter(starterRoot, { title: 'Chapitre 1' }),
      title: 'Scène 1',
    });
    expect(await x250.engine.signIn(url, EMAIL, PASSWORD)).toBe('ok');
    await until(async () => (await x250.library.list()).some((p) => p.id === id));
    expect(await x250.engine.idle()).toBe(true);
    expect(x250.engine.withheld()).toEqual([starter.id]);
    // The first account administers the server, whose page answers from here (127.0.0.1).
    expect(await x250.engine.adminPage()).toEqual({ url: `${url}/admin` });
    // The Mac never hears of it.
    await mac.engine.reconcile();
    expect((await mac.library.list()).map((p) => p.title)).toEqual(['Les serres']);

    // Once written in, it is a real project: it goes to the account.
    const [first] = listAllScenes(starterRoot);
    write(
      x250.doc(guids.scene(starter.id, first?.id ?? '')),
      first?.activeVariantId ?? '',
      'Une idée.',
    );
    await x250.library.touch(starter.id);
    await x250.engine.reconcile();
    await until(async () => (await mac.library.list()).some((p) => p.id === starter.id));
  });

  it('carries a rename and the trash from one device to the other, without echo', async () => {
    const url = await server();
    const mac = device('Mac');
    const x250 = device('X250');
    const { id } = await mac.library.create({ title: 'Les serres', kind: 'novel' });
    initProject(mac.doc(guids.project(id)), { id, title: 'Les serres', kind: 'novel' });
    await mac.engine.signIn(url, EMAIL, PASSWORD);
    await x250.engine.signIn(url, EMAIL, PASSWORD);
    await until(async () => (await x250.library.list()).some((p) => p.id === id));

    await x250.library.rename(id, 'Les serres d’Hespéride');
    await x250.engine.reconcile();
    await until(async () =>
      (await mac.library.list()).some((p) => p.title === 'Les serres d’Hespéride'),
    );
    const stamp = (await mac.library.all()).find((p) => p.id === id)?.updatedAt;
    expect(stamp).toBe((await x250.library.all()).find((p) => p.id === id)?.updatedAt);

    await mac.library.trash(id);
    await mac.engine.reconcile();
    await until(async () => (await x250.library.listTrashed()).some((p) => p.id === id));
  });

  it('says so when the system has no keychain to keep the connection in', async () => {
    const url = await server();
    const linux = device('Linux', { keychain: false });
    expect(await linux.engine.signIn(url, EMAIL, PASSWORD)).toBe('no-keychain');
    expect(linux.engine.status()).toBe('off');
  });

  it('says when the device was signed out from elsewhere, and signs out cleanly', async () => {
    const url = await server();
    const mac = device('Mac');
    await mac.engine.signIn(String(url), EMAIL, PASSWORD);
    expect(await mac.engine.idle()).toBe(true);
    expect(mac.engine.account()?.email).toBe(EMAIL);

    // Revoked from another device: the next connection is refused.
    await url.db.query('update sessions set revoked_at = now()');
    mac.engine.stop();
    mac.engine.start();
    await until(() => mac.engine.status() === 'unauthorized');

    await mac.engine.signOut();
    expect(mac.engine.status()).toBe('off');
    expect(mac.engine.account()).toBeNull();
  });

  /** A signed-in device with a scene to type in, and the states it tells from then on. */
  async function typing(url: string, options: { syncingDelayMs?: number } = {}) {
    const mac = device('Mac', options);
    const { id } = await mac.library.create({ title: 'Les serres', kind: 'novel' });
    const root = mac.doc(guids.project(id));
    initProject(root, { id, title: 'Les serres', kind: 'novel' });
    const chapterId = createChapter(root, { title: 'La serre' });
    const { sceneId, variantId } = createScene(root, { chapterId, title: 'Le sas' });
    const scene = mac.doc(guids.scene(id, sceneId));
    await mac.engine.signIn(url, EMAIL, PASSWORD);
    expect(await mac.engine.idle()).toBe(true);
    const told: string[] = [];
    mac.engine.onStatusChange((status) => told.push(status));
    return { mac, told, type: (text: string) => write(scene, variantId, text) };
  }

  it('does not tell a state per keystroke: what the server acknowledges at once stays « synced »', async () => {
    const { mac, told, type } = await typing(String(await server()));
    for (let i = 0; i < 30; i++) {
      type(`Frappe ${i}.`);
      // Sent, not acknowledged yet: nothing is told, but the engine is not idle.
      expect(mac.engine.status()).toBe('synced');
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    expect(await mac.engine.idle()).toBe(true);
    expect(told).toEqual([]);
    expect(mac.engine.status()).toBe('synced');
  });

  it('tells « syncing » once changes have stayed unsent for the delay, then « synced »', async () => {
    const { mac, told, type } = await typing(String(await server()), { syncingDelayMs: 0 });
    // No delay: a fast server may still acknowledge before « syncing » is told, so type until it is.
    for (let i = 0; !told.includes('syncing'); i++) {
      type(`Phrase ${i}.`);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(await mac.engine.idle()).toBe(true);
    await until(() => told.at(-1) === 'synced');
    // Each state told once, in turn: never the same twice in a row.
    expect(told.slice(0, 2)).toEqual(['syncing', 'synced']);
    expect(told.every((status, i) => status === (i % 2 ? 'synced' : 'syncing'))).toBe(true);
  });

  it('tells at once that the device is offline, and forgets the account before telling « off »', async () => {
    const url = await server();
    const { mac, told, type } = await typing(String(url));
    await url.stop();
    type('Écrit hors ligne.');
    await until(() => told.includes('offline'), 5000);
    // Well under the delay of « syncing »: « offline » did not wait.
    expect(told[0]).toBe('offline');
    expect(told).not.toContain('syncing');
    // The listener of « off » (the update service's access) finds no account.
    const accounts: unknown[] = [];
    mac.engine.onStatusChange((status) => status === 'off' && accounts.push(mac.engine.account()));
    await mac.engine.signOut();
    expect(accounts).toEqual([null]);
  });
});
