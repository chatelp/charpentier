// Renderer side of the desktop platform: everything goes through the preload bridge.
import {
  navigatorKeyboardLayout,
  type KeybindingsService,
  type LibraryService,
  type LlmStatus,
  type Platform,
  type PreferencesService,
  type SyncStatus,
  type SystemService,
} from '@charpentier/platform';
import type { DesktopBridge } from '../shared/ipc';
import { IpcAgentsService } from './agents';
import { IpcSyncService } from './sync';
import { IpcDocumentService } from './documents';

export { IpcDocumentService } from './documents';
export { connectSystem } from './system';
export type { DesktopBridge } from '../shared/ipc';

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

/**
 * The desktop app owns its menus: only the system's own shortcuts are kept.
 * As a device (`appliance`), there is no menu and nothing to quit: every Ctrl
 * shortcut is the app's, and the Super key stays the system's (the core binds
 * none: `Mod` is Ctrl outside macOS).
 */
export function desktopKeybindings(platform: string, appliance = false): KeybindingsService {
  const mac = platform === 'darwin';
  return {
    primaryModifier: mac ? 'Meta' : 'Control',
    reserved: mac
      ? ['Meta-q', 'Meta-w', 'Meta-h', 'Meta-m']
      : appliance
        ? []
        : ['Control-q', 'Control-w'],
    keyboardLayout: navigatorKeyboardLayout,
  };
}

/** What the main process knows of the Compagnon and of the sync, read before the interface starts. */
export interface KnownStatuses {
  readonly agents: LlmStatus;
  readonly sync: SyncStatus;
}

/**
 * The app says only what it knows (docs/DESIGN.md §5.0, rule 7): the core asks for these
 * statuses synchronously at its first render, so they are read once before it.
 */
export async function connectStatuses(bridge: DesktopBridge): Promise<KnownStatuses> {
  const [agents, sync] = await Promise.all([
    bridge.invoke({ type: 'agents.status' }),
    bridge.invoke({ type: 'sync.status' }),
  ]);
  return { agents, sync };
}

/**
 * `system`: the device's, from `connectSystem` (read once before the
 * interface starts, since the core asks for it synchronously). `statuses`: from
 * `connectStatuses`, for the same reason.
 */
export function createDesktopPlatform(
  bridge: DesktopBridge,
  options: { readonly system?: SystemService | null; readonly statuses?: KnownStatuses } = {},
): Platform {
  const appliance = bridge.appliance ?? false;
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
    keybindings: desktopKeybindings(bridge.platform, appliance),
    agents: new IpcAgentsService(bridge, options.statuses?.agents),
    sync: new IpcSyncService(bridge, options.statuses?.sync),
    llm: null,
    fileMirror: null,
    secrets: null,
    spellcheck: {
      misspelled: (words, language) => bridge.invoke({ type: 'spell.misspelled', words, language }),
      suggest: (word, language) => bridge.invoke({ type: 'spell.suggest', word, language }),
    },
    system: options.system ?? null,
    about: bridge.about ?? null,
    // docs/DESIGN.md §4.1: a 34 px title bar merged with the background (none on a device).
    titleBarHeight: bridge.platform === 'darwin' && !appliance ? 34 : 0,
    // A device has no menu bar: the command zone stands in for it.
    ...(!appliance && {
      menu: {
        set: (model) => void bridge.invoke({ type: 'host.setMenu', model }),
        onCommand: (listener) =>
          bridge.onMessage((message) => {
            if (message.type === 'host.menuCommand') listener(message.id);
          }),
      },
    }),
    onFullScreenChange: (listener) =>
      bridge.onMessage((message) => {
        if (message.type === 'host.fullScreen') listener(message.fullScreen);
      }),
  };
}
