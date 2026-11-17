import {
  createSimulatedSystem,
  type AgentsService,
  type KeybindingsService,
  type Platform,
} from '@charpentier/platform';
import { IndexedDbDocumentService, MemoryDocumentService } from './documents';
import { DocumentLibrary } from './library';
import { LocalStoragePreferences } from './preferences';
import { WebSync } from './sync';

export { IndexedDbDocumentService, MemoryDocumentService } from './documents';
export { DocumentLibrary, LIBRARY_GUID } from './library';
export { LocalStoragePreferences } from './preferences';
export { WebSync, type WebSyncDeps } from './sync';

/** No AI on the web host until the server proxy exists (step 4). */
const disabledAgents: AgentsService = {
  status: () => 'disabled',
  onStatusChange: () => () => {},
  setApiKey: async () => 'invalid',
  forgetApiKey: async () => {},
  ask: async () => 'unavailable',
  analyze: async () => 'unavailable',
  reviewChapter: async () => 'unavailable',
  interview: async () => 'unavailable',
  estimateDeepWork: async () => null,
  deepWork: async () => 'unavailable',
  stopDeepWork: async () => {},
  chooseReference: async () => 'cancelled',
  readReference: async () => 'empty',
  dropReference: async () => {},
  lightModel: async () => 'opus',
  setLightModel: async () => {},
};

const isApple = (userAgent: string) => /Mac|iPhone|iPad/.test(userAgent);

/** Shortcuts the browser keeps whatever the page does (windows, tabs). */
export function webReservedShortcuts(apple: boolean): string[] {
  const mod = apple ? 'Meta' : 'Control';
  const tabs = Array.from({ length: 9 }, (_, i) => `${mod}-${i + 1}`);
  return [
    `${mod}-w`,
    `${mod}-t`,
    `${mod}-n`,
    `${mod}-Shift-n`,
    `${mod}-Shift-t`,
    `${mod}-l`,
    ...tabs,
    ...(apple
      ? ['Meta-q', 'Meta-Shift-a', 'Meta-Alt-ArrowLeft', 'Meta-Alt-ArrowRight']
      : ['Control-Tab']),
  ];
}

export function createWebKeybindings(userAgent: string): KeybindingsService {
  const apple = isApple(userAgent);
  return {
    primaryModifier: apple ? 'Meta' : 'Control',
    reserved: webReservedShortcuts(apple),
  };
}

/**
 * `simulateSystem`: a simulated X250 (address ending in `?x250`), to see and
 * review the system line in a browser (docs/PLAN.md phase 5.3); `'first-start'`
 * (`?x250=premier`): a device just installed, its first start ahead (5.6);
 * `'update'` (`?x250=maj`): an update ready, waiting for the next start (5.12).
 */
/** The browser, as the account's list of devices names it (« Navigateur · Firefox »). */
export function browserName(userAgent: string): string {
  const name = /Firefox\//.test(userAgent)
    ? 'Firefox'
    : /Edg\//.test(userAgent)
      ? 'Edge'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : '';
  return name ? `Navigateur · ${name}` : 'Navigateur';
}

/** Every document this browser keeps (« Se déconnecter »): the next page starts empty. */
async function forgetDocuments(prefix: string): Promise<void> {
  const databases = (await indexedDB.databases?.()) ?? [];
  await Promise.all(
    databases
      .filter((db) => db.name?.startsWith(prefix))
      .map(
        (db) =>
          new Promise<void>((resolve) => {
            const request = indexedDB.deleteDatabase(db.name ?? '');
            request.onsuccess = request.onerror = request.onblocked = () => resolve();
          }),
      ),
  );
  globalThis.location?.reload();
}

/**
 * `sync`: the app was served by the author's server (phase 4.7 a), its
 * account syncs with it; elsewhere (development, a copy), no sync.
 */
export function createWebPlatform(
  options: {
    readonly simulateSystem?: boolean | 'first-start' | 'update';
    readonly sync?: boolean;
    /** The app's version and commit, given by the web app's build (« À propos »). */
    readonly about?: { readonly version: string; readonly commit?: string };
  } = {},
): Platform {
  const system = options.simulateSystem
    ? createSimulatedSystem({ firstStart: options.simulateSystem === 'first-start' })
    : null;
  if (options.simulateSystem === 'update') system?.simulate.updateReady();
  const persistent = typeof indexedDB !== 'undefined';
  const documents = persistent ? new IndexedDbDocumentService() : new MemoryDocumentService();
  const library = new DocumentLibrary(documents);
  const sync =
    options.sync && persistent
      ? new WebSync({
          documents,
          library,
          origin: globalThis.location.origin,
          device: browserName(globalThis.navigator?.userAgent ?? ''),
          storage: globalThis.localStorage ?? null,
          forgetDocuments: () => forgetDocuments('charpentier:'),
          openTab: () => globalThis.open?.('about:blank', '_blank') ?? null,
        })
      : null;
  void sync?.start();
  return {
    host: 'web',
    about: options.about ?? null,
    documents,
    library,
    libraryFolder: null,
    preferences: new LocalStoragePreferences(),
    keybindings: createWebKeybindings(globalThis.navigator?.userAgent ?? ''),
    agents: disabledAgents,
    sync,
    llm: null,
    fileMirror: null,
    secrets: null,
    spellcheck: null,
    system,
  };
}
