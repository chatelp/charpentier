import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
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

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

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
});
