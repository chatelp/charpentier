// Renderer side of the desktop platform: everything goes through the preload bridge.
import type {
  AgentsService,
  KeybindingsService,
  LibraryService,
  Platform,
  PreferencesService,
} from '@charpentier/platform';
import type { DesktopBridge } from '../shared/ipc';
import { IpcDocumentService } from './documents';

export { IpcDocumentService } from './documents';
export type { DesktopBridge } from '../shared/ipc';

/** The Compagnon arrives at step 3. */
const agentsNotYet: AgentsService = {
  status: () => 'disabled',
  onStatusChange: () => () => {},
};

function library(bridge: DesktopBridge): LibraryService {
  return {
    list: () => bridge.invoke({ type: 'library.list' }),
    listTrashed: () => bridge.invoke({ type: 'library.listTrashed' }),
    create: (input) => bridge.invoke({ type: 'library.create', input }),
    rename: async (projectId, title) => {
      await bridge.invoke({ type: 'library.rename', projectId, title });
    },
    touch: async (projectId) => {
      await bridge.invoke({ type: 'library.touch', projectId });
    },
    trash: async (projectId) => {
      await bridge.invoke({ type: 'library.trash', projectId });
    },
    restore: async (projectId) => {
      await bridge.invoke({ type: 'library.restore', projectId });
    },
  };
}

function preferences(bridge: DesktopBridge): PreferencesService {
  return {
    get: async <T>(key: string) =>
      (await bridge.invoke({ type: 'prefs.get', key })) as T | undefined,
    set: async (key, value) => {
      await bridge.invoke({ type: 'prefs.set', key, value });
    },
  };
}

/** The desktop app owns its menus: only the system's own shortcuts are kept. */
export function desktopKeybindings(platform: string): KeybindingsService {
  const mac = platform === 'darwin';
  return {
    primaryModifier: mac ? 'Meta' : 'Control',
    reserved: mac ? ['Meta-q', 'Meta-w', 'Meta-h', 'Meta-m'] : ['Control-q', 'Control-w'],
  };
}

export function createDesktopPlatform(bridge: DesktopBridge): Platform {
  return {
    host: 'desktop',
    documents: new IpcDocumentService(bridge),
    library: library(bridge),
    libraryFolder: {
      current: () => bridge.invoke({ type: 'host.libraryFolder' }),
      choose: () => bridge.invoke({ type: 'host.chooseLibraryFolder' }),
      reveal: async () => {
        await bridge.invoke({ type: 'host.revealLibraryFolder' });
      },
    },
    preferences: preferences(bridge),
    keybindings: desktopKeybindings(bridge.platform),
    agents: agentsNotYet,
    llm: null,
    fileMirror: null,
    secrets: null,
    spellcheck: null,
    system: null,
    // docs/DESIGN.md §4.1: a 34 px title bar merged with the background.
    titleBarHeight: bridge.platform === 'darwin' ? 34 : 0,
  };
}
