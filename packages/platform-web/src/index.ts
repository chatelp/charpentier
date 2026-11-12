import type { AgentsService, KeybindingsService, Platform } from '@charpentier/platform';
import { MemoryDocumentService } from './documents';
import { MemoryLibrary } from './library';
import { LocalStoragePreferences } from './preferences';

export { MemoryDocumentService } from './documents';
export { MemoryLibrary } from './library';
export { LocalStoragePreferences } from './preferences';

/** No AI on the web host until the server proxy exists (step 4). */
const disabledAgents: AgentsService = {
  status: () => 'disabled',
  onStatusChange: () => () => {},
};

const isApple = (userAgent: string) => /Mac|iPhone|iPad/.test(userAgent);

export function createWebKeybindings(userAgent: string): KeybindingsService {
  const apple = isApple(userAgent);
  return {
    primaryModifier: apple ? 'Meta' : 'Control',
    // The browser keeps these whatever we do.
    reserved: apple
      ? ['Meta+W', 'Meta+Q', 'Meta+T', 'Meta+N']
      : ['Control+W', 'Control+T', 'Control+N'],
  };
}

export function createWebPlatform(): Platform {
  return {
    host: 'web',
    documents: new MemoryDocumentService(),
    library: new MemoryLibrary(),
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
