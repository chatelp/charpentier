import type { AgentsService, KeybindingsService, Platform } from '@charpentier/platform';
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
    ...(apple ? ['Meta-q', 'Meta-Alt-ArrowLeft', 'Meta-Alt-ArrowRight'] : ['Control-Tab']),
  ];
}

export function createWebKeybindings(userAgent: string): KeybindingsService {
  const apple = isApple(userAgent);
  return {
    primaryModifier: apple ? 'Meta' : 'Control',
    reserved: webReservedShortcuts(apple),
  };
}

export function createWebPlatform(): Platform {
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
    llm: null,
    fileMirror: null,
    secrets: null,
    spellcheck: null,
    system: null,
  };
}
