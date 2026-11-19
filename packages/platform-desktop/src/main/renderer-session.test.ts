import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { DesktopBridge, Message } from '../shared/ipc';
import { createSimulatedSystem, type SystemService } from '@charpentier/platform';
import { IpcDocumentService } from '../renderer/documents';
import { connectSystem } from '../renderer/system';
import { DocStore } from './doc-store';
import { PreferencesFile } from './preferences';
import { documentLocator, FolderLibrary } from './projects';
import { RendererSession } from './renderer-session';

const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function mainProcess() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'charpentier-lib-'));
  dirs.push(root);
  const library = new FolderLibrary(path.join(root, 'Bibliothèque'));
  const store = new DocStore(documentLocator(library));
  const preferences = new PreferencesFile(path.join(root, 'prefs.json'));
  return { root, library, store, preferences };
}

/** A renderer wired to the main process the way the preload bridge does it. */
function renderer(main: ReturnType<typeof mainProcess> & { system?: SystemService | null }) {
  const listeners = new Set<(m: Message) => void>();
  // Asynchronous like IPC, in order.
  const session = new RendererSession(main, (m) =>
    queueMicrotask(() => listeners.forEach((l) => l(m))),
  );
  const bridge: DesktopBridge = {
    platform: 'darwin',
    invoke: (request) => session.handle(request),
    send: (message) => queueMicrotask(() => session.receive(message)),
    onMessage: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return { session, bridge, documents: new IpcDocumentService(bridge) };
}

/**
 * The same, over one ordered asynchronous channel: requests and messages
 * reach the main process later, in the order the renderer sent them (what
 * Electron's IPC guarantees, and nothing more).
 */
function rendererOverChannel(main: ReturnType<typeof mainProcess>) {
  const listeners = new Set<(m: Message) => void>();
  const received: string[] = [];
  let channel = Promise.resolve();
  const later = <T>(deliver: () => T | Promise<T>): Promise<T> => {
    const delivered = channel.then(() => new Promise((r) => setTimeout(r, 0))).then(deliver);
    channel = delivered.then(
      () => {},
      () => {},
    );
    return delivered;
  };
  const session = new RendererSession(main, (m) =>
    queueMicrotask(() => listeners.forEach((l) => l(m))),
  );
  const bridge: DesktopBridge = {
    platform: 'darwin',
    invoke: (request) =>
      later(() => {
        received.push(request.type);
        return session.handle(request);
      }),
    send: (message) =>
      void later(() => {
        received.push(message.type);
        session.receive(message);
      }),
    onMessage: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  /** Everything sent so far has been handled by the main process. */
  const settled = async () => {
    let seen;
    do {
      seen = channel;
      await seen;
      await tick();
    } while (seen !== channel);
  };
  return { session, bridge, received, settled, documents: new IpcDocumentService(bridge) };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The update of one insertion in a fresh replica. */
function editOf(guid: string, text: string): Uint8Array {
  const doc = new Y.Doc({ guid });
  doc.getText('t').insert(0, text);
  return Y.encodeStateAsUpdate(doc);
}

describe('documents held by the main process', () => {
  it('syncs two windows and keeps everything on disk', async () => {
    const main = mainProcess();
    const project = await main.library.create({ title: 'Mon roman', kind: 'novel' });
    const guid = `project:${project.id}`;
    const a = renderer(main);
    const b = renderer(main);
    const ha = await a.documents.open(guid);
    const hb = await b.documents.open(guid);
    await ha.whenLoaded;
    await hb.whenLoaded;

    ha.doc.getText('t').insert(0, 'Il pleuvait');
    await tick();
    expect(hb.doc.getText('t').toString()).toBe('Il pleuvait');
    hb.doc.getText('t').insert(11, ' sur Nantes.');
    await tick();
    expect(ha.doc.getText('t').toString()).toBe('Il pleuvait sur Nantes.');

    await ha.close();
    a.session.dispose();
    expect(main.store.isOpen(guid)).toBe(true);
    await hb.close();
    expect(main.store.isOpen(guid)).toBe(false);

    // A new main process (the app relaunched) reads it back from the project folder.
    const relaunched = { ...main, store: new DocStore(documentLocator(main.library)) };
    const doc = relaunched.store.acquire(guid, 'test');
    expect(doc.getText('t').toString()).toBe('Il pleuvait sur Nantes.');
    expect(
      fs.existsSync(path.join(main.library.root, 'Mon roman', '.charpentier', 'root', 'state.bin')),
    ).toBe(true);
  });

  it('keeps what is typed after a document is closed and reopened in the same tick', async () => {
    const main = mainProcess();
    const project = await main.library.create({ title: 'Mon roman', kind: 'novel' });
    const guid = `project:${project.id}/scene:s1`;
    const r = rendererOverChannel(main);
    const first = await r.documents.open(guid);
    await first.whenLoaded;
    first.doc.getText('t').insert(0, 'Avant.');
    await r.settled();

    // A React effect's cleanup, then the effect again (the scene's active variant changed).
    void first.close();
    const second = await r.documents.open(guid);
    await second.whenLoaded;
    expect(second.doc).not.toBe(first.doc);
    expect(second.doc.getText('t').toString()).toBe('Avant.');
    second.doc.getText('t').insert(6, ' Après.');
    await r.settled();

    // The main process did receive the open before the close of the first replica.
    expect(r.received).toEqual(['doc.open', 'doc.update', 'doc.open', 'doc.close', 'doc.update']);
    expect(main.store.holders(guid).has(r.session)).toBe(true);
    expect(main.store.acquire(guid, 'test').getText('t').toString()).toBe('Avant. Après.');

    // Another window still follows it, and this one still hears the others.
    const other = renderer(main);
    const theirs = await other.documents.open(guid);
    await theirs.whenLoaded;
    theirs.doc.getText('t').insert(0, 'Hier. ');
    await tick();
    await r.settled();
    expect(second.doc.getText('t').toString()).toBe('Hier. Avant. Après.');
    await theirs.close();
    main.store.release(guid, 'test');

    // The last close lets go of the document, and it is all on disk.
    await second.close();
    await r.settled();
    expect(main.store.isOpen(guid)).toBe(false);
    const relaunched = new DocStore(documentLocator(main.library));
    expect(relaunched.acquire(guid, 'test').getText('t').toString()).toBe('Hier. Avant. Après.');
    relaunched.closeAll();
  });

  it('balances opens and closes of one document, whatever their order', async () => {
    const main = mainProcess();
    const project = await main.library.create({ title: 'Mon roman', kind: 'novel' });
    const guid = `project:${project.id}`;
    const { session } = renderer(main);
    await session.handle({ type: 'doc.open', guid });
    await session.handle({ type: 'doc.open', guid });
    await session.handle({ type: 'doc.close', guid });
    expect(main.store.holders(guid).has(session)).toBe(true);
    const update = editOf(guid, 'Encore là.');
    session.receive({ type: 'doc.update', guid, update });
    expect(main.store.acquire(guid, 'test').getText('t').toString()).toBe('Encore là.');
    main.store.release(guid, 'test');
    await session.handle({ type: 'doc.close', guid });
    expect(main.store.isOpen(guid)).toBe(false);

    // One close too many is reported, and takes nothing away from a later open.
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    await session.handle({ type: 'doc.close', guid });
    expect(errors).toHaveBeenCalledTimes(1);
    await session.handle({ type: 'doc.open', guid });
    expect(main.store.holders(guid).has(session)).toBe(true);
    session.dispose();
    expect(main.store.isOpen(guid)).toBe(false);
  });

  it('never drops an update, even for a document the session does not hold', async () => {
    const main = mainProcess();
    const project = await main.library.create({ title: 'Mon roman', kind: 'novel' });
    const guid = `project:${project.id}/scene:s1`;
    const { session } = renderer(main);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    session.receive({ type: 'doc.update', guid, update: editOf(guid, 'Sauvé.') });
    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0]?.[0])).toContain(guid);
    expect(main.store.isOpen(guid)).toBe(false);
    const relaunched = new DocStore(documentLocator(main.library));
    expect(relaunched.acquire(guid, 'test').getText('t').toString()).toBe('Sauvé.');
    relaunched.closeAll();

    // Where it cannot be stored (unknown project), it says so and does not throw.
    session.receive({ type: 'doc.update', guid: 'project:unknown', update: editOf(guid, 'x') });
    expect(errors).toHaveBeenCalledTimes(3);
  });

  it('places scene documents in their project and refuses unknown projects', async () => {
    const main = mainProcess();
    const project = await main.library.create({ title: 'Les serres : tome 1/2', kind: 'novel' });
    const locate = documentLocator(main.library);
    const folder = path.join(main.library.root, 'Les serres tome 1 2');
    expect(locate(`project:${project.id}/scene:abc`)).toBe(
      path.join(folder, '.charpentier', 'scenes', 'abc'),
    );
    expect(locate(`project:${project.id}/scene:abc/history`)).toBe(
      path.join(folder, '.charpentier', 'scenes', 'abc.history'),
    );
    expect(locate('project:unknown')).toBeUndefined();
    expect(locate(`project:${project.id}/scene:../../etc`)).toBeUndefined();
  });

  it('lists, renames, trashes and restores projects from their folders', async () => {
    const main = mainProcess();
    const a = await main.library.create({ title: 'Mon roman', kind: 'novel' });
    await main.library.create({ title: 'Mon roman', kind: 'short-story' });
    expect(fs.readdirSync(main.library.root).sort()).toEqual(['Mon roman', 'Mon roman (2)']);
    await main.library.rename(a.id, 'Titan');
    await main.library.trash(a.id);
    expect((await main.library.list()).map((p) => p.kind)).toEqual(['short-story']);
    expect((await main.library.listTrashed()).map((p) => p.title)).toEqual(['Titan']);
    await main.library.restore(a.id);
    expect(await main.library.listTrashed()).toEqual([]);
  });

  it('remembers preferences', () => {
    const main = mainProcess();
    main.preferences.set('lastProjectId', 'p1');
    main.preferences.flush();
    expect(new PreferencesFile(main.preferences.file).get('lastProjectId')).toBe('p1');
  });
});

describe('the system of the device, held by the main process (phase 5.4)', () => {
  it('is null where the main process has none', async () => {
    expect(await connectSystem(renderer(mainProcess()).bridge)).toBeNull();
  });

  it('reads the state at once, follows its changes, and calls the actions of the main process', async () => {
    const system = createSimulatedSystem();
    const r = renderer({ ...mainProcess(), system });
    const seen = await connectSystem(r.bridge);
    if (!seen) throw new Error('no system');
    expect(seen.state().wifi.connected).toBe('Maison-5G');
    expect(seen.journal()[0]?.text).toBe('démarrage · charpentier 0.5.0');

    let changes = 0;
    seen.onChange(() => changes++);
    await seen.setBrightness(30);
    expect(system.state().brightness).toBe(30);
    await tick();
    expect(seen.state().brightness).toBe(30);
    expect(changes).toBeGreaterThan(0);

    expect(await seen.connectWifi('Livebox-4A2C', 'faux')).toBe('wrong-password');
    seen.post('luminosité 30 %');
    await tick();
    expect(seen.journal().at(-1)?.text).toBe('luminosité 30 %');

    // Only the service's actions cross the bridge.
    await expect(
      r.bridge.invoke({ type: 'system.call', method: 'onChange' as 'suspend', args: [] }),
    ).rejects.toThrow();
    r.session.dispose();
    system.simulate.battery(50);
    await tick();
    expect(seen.state().power.batteries[0]?.level).toBe(82);
  });

  it('opens the monitor: the hour kept, then each second, until it closes', async () => {
    const samples: ((s: never) => void)[] = [];
    let closed = 0;
    const system = {
      ...createSimulatedSystem(),
      monitor: {
        open: async (onSample: (s: never) => void) => {
          samples.push(onSample);
          return {
            info: { gpu: 'HD 5500', screen: null, link: null, memoryTotal: 8e9 },
            history: [{ at: 1 } as never],
            close: () => void closed++,
          };
        },
      },
    };
    const r = renderer({ ...mainProcess(), system });
    const seen = await connectSystem(r.bridge);
    const got: unknown[] = [];
    const session = await seen?.monitor?.open((sample) => got.push(sample));
    expect(session?.history).toHaveLength(1);
    expect(session?.info.gpu).toBe('HD 5500');
    samples[0]?.({ at: 2 } as never);
    await tick();
    expect(got).toEqual([{ at: 2 }]);
    session?.close();
    await tick();
    expect(closed).toBe(1);
    samples[0]?.({ at: 3 } as never);
    await tick();
    expect(got).toHaveLength(1);
  });
});
