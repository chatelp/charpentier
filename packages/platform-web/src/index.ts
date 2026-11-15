import {
  createSimulatedSystem,
  type AgentsService,
  type KeybindingsService,
  type Platform,
} from '@charpentier/platform';
import { IndexedDbDocumentService, MemoryDocumentService } from './documents';
import { DocumentLibrary } from './library';
import { LocalStoragePreferences } from './preferences';

export { IndexedDbDocumentService, MemoryDocumentService } from './documents';
export { DocumentLibrary, LIBRARY_GUID } from './library';
export { LocalStoragePreferences } from './preferences';

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
export function createWebPlatform(
  options: { readonly simulateSystem?: boolean | 'first-start' | 'update' } = {},
): Platform {
  const system = options.simulateSystem
    ? createSimulatedSystem({ firstStart: options.simulateSystem === 'first-start' })
    : null;
  if (options.simulateSystem === 'update') system?.simulate.updateReady();
  const documents =
    typeof indexedDB === 'undefined' ? new MemoryDocumentService() : new IndexedDbDocumentService();
  return {
    host: 'web',
    documents,
    library: new DocumentLibrary(documents),
    libraryFolder: null,
    preferences: new LocalStoragePreferences(),
    keybindings: createWebKeybindings(globalThis.navigator?.userAgent ?? ''),
    agents: disabledAgents,
    sync: null,
    llm: null,
    fileMirror: null,
    secrets: null,
    spellcheck: null,
    system,
  };
}
