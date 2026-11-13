import type {
  ApiKeyResult,
  AskResult,
  LlmStatus,
  MenuModel,
  SignInResult,
  SyncAccountInfo,
  SyncDevice,
  SyncStatus,
  MonitorInfo,
  MonitorSample,
  SystemMessage,
  SystemService,
  SystemState,
  ProjectKind,
  ProjectSummary,
} from '@charpentier/platform';

/**
 * Messages between an Electron renderer (the interface) and the main process,
 * which owns the documents (D-7). Plain data only: everything crosses the
 * preload bridge by structured clone.
 */
export type Request =
  | { readonly type: 'doc.open'; readonly guid: string }
  | { readonly type: 'doc.close'; readonly guid: string }
  | { readonly type: 'library.list' }
  | { readonly type: 'library.listTrashed' }
  | {
      readonly type: 'library.create';
      readonly input: { title: string; kind: ProjectKind; id?: string };
    }
  | { readonly type: 'library.rename'; readonly projectId: string; readonly title: string }
  | { readonly type: 'library.touch'; readonly projectId: string }
  | { readonly type: 'library.trash'; readonly projectId: string }
  | { readonly type: 'library.restore'; readonly projectId: string }
  | { readonly type: 'prefs.get'; readonly key: string }
  | { readonly type: 'prefs.set'; readonly key: string; readonly value: unknown }
  | {
      readonly type: 'spell.misspelled';
      readonly words: readonly string[];
      readonly language: string;
    }
  | { readonly type: 'spell.suggest'; readonly word: string; readonly language: string }
  | { readonly type: 'agents.status' }
  | { readonly type: 'agents.setKey'; readonly key: string }
  | { readonly type: 'agents.forgetKey' }
  | { readonly type: 'agents.ask'; readonly projectId: string; readonly sceneId?: string }
  | {
      readonly type: 'agents.analyze';
      readonly projectId: string;
      readonly sceneIds: readonly string[];
      readonly automatic: boolean;
    }
  | {
      readonly type: 'agents.reviewChapter';
      readonly projectId: string;
      readonly chapterId: string;
      readonly automatic: boolean;
    }
  | {
      readonly type: 'agents.interview';
      readonly projectId: string;
      readonly mode: 'free' | 'guided';
      readonly skip?: readonly string[];
      readonly section?: string;
      readonly pass?: boolean;
    }
  | { readonly type: 'sync.status' }
  | { readonly type: 'sync.account' }
  | {
      readonly type: 'sync.signIn';
      readonly server: string;
      readonly email: string;
      readonly password: string;
    }
  | { readonly type: 'sync.signOut' }
  | { readonly type: 'sync.devices' }
  | { readonly type: 'sync.revokeDevice'; readonly id: string }
  | { readonly type: 'system.snapshot' }
  | { readonly type: 'system.post'; readonly text: string }
  | { readonly type: 'system.monitorOpen' }
  | { readonly type: 'system.monitorClose' }
  | {
      readonly type: 'system.call';
      readonly method: SystemAction;
      readonly args: readonly unknown[];
    }
  | { readonly type: 'agents.lightModel' }
  | { readonly type: 'agents.setLightModel'; readonly model: 'opus' | 'haiku' }
  // Handled by the Electron host itself (dialogs, Finder).
  | { readonly type: 'host.libraryFolder' }
  | { readonly type: 'host.chooseLibraryFolder' }
  | { readonly type: 'host.revealLibraryFolder' }
  | { readonly type: 'host.setMenu'; readonly model: MenuModel };

export interface Responses {
  'doc.open': { readonly state: Uint8Array };
  'doc.close': null;
  'library.list': readonly ProjectSummary[];
  'library.listTrashed': readonly ProjectSummary[];
  'library.create': ProjectSummary;
  'library.rename': null;
  'library.touch': null;
  'library.trash': null;
  'library.restore': null;
  'prefs.get': unknown;
  'prefs.set': null;
  'spell.misspelled': readonly string[];
  'spell.suggest': readonly string[];
  'agents.status': LlmStatus;
  'agents.setKey': ApiKeyResult;
  'agents.forgetKey': null;
  'agents.ask': AskResult;
  'agents.analyze': AskResult;
  'agents.reviewChapter': AskResult;
  'agents.interview': AskResult;
  'agents.lightModel': 'opus' | 'haiku';
  'sync.status': SyncStatus;
  'sync.account': SyncAccountInfo | null;
  'sync.signIn': SignInResult;
  'sync.signOut': null;
  'sync.devices': readonly SyncDevice[] | null;
  'sync.revokeDevice': boolean;
  'agents.setLightModel': null;
  'system.snapshot': SystemSnapshot | null;
  'system.post': null;
  'system.monitorOpen': {
    readonly info: MonitorInfo;
    readonly history: readonly MonitorSample[];
  } | null;
  'system.monitorClose': null;
  'system.call': unknown;
  'host.libraryFolder': string;
  'host.chooseLibraryFolder': boolean;
  'host.revealLibraryFolder': null;
  'host.setMenu': null;
}

/** One-way messages, in both directions. */
export type Message =
  | { readonly type: 'doc.update'; readonly guid: string; readonly update: Uint8Array }
  /** The Compagnon's availability changed (main → renderer). */
  | { readonly type: 'agents.status'; readonly status: LlmStatus }
  /** The window entered or left full screen (main → renderer). */
  | { readonly type: 'host.fullScreen'; readonly fullScreen: boolean }
  /** Where the sync stands changed (main → renderer). */
  | { readonly type: 'sync.status'; readonly status: SyncStatus }
  /** The device's system changed (main → renderer). */
  | { readonly type: 'system.changed'; readonly snapshot: SystemSnapshot }
  /** A second of the machine, while the monitor's screen is open (main → renderer). */
  | { readonly type: 'system.sample'; readonly sample: MonitorSample }
  /** A command was chosen in the application menu (main → renderer). */
  | { readonly type: 'host.menuCommand'; readonly id: string };

/** What the preload script exposes to the renderer as `window.charpentier`. */
export interface DesktopBridge {
  readonly platform: string;
  /**
   * Started with `--appliance` (docs/PLAN.md phase 5.2): the app is the whole
   * screen of a writing device, without title bar or menu bar.
   */
  readonly appliance?: boolean;
  invoke<R extends Request>(request: R): Promise<Responses[R['type']]>;
  send(message: Message): void;
  /** Messages from the main process; returns an unsubscribe function. */
  onMessage(listener: (message: Message) => void): () => void;
}

/** The device's system as the interface sees it (docs/PLAN.md phases 5.3, 5.4). */
export interface SystemSnapshot {
  readonly state: SystemState;
  readonly journal: readonly SystemMessage[];
  /** The system measures itself: the monitor can open. */
  readonly monitor: boolean;
}

/** The actions of the System service the interface may call, nothing else. */
export const SYSTEM_ACTIONS = [
  'setWifi',
  'connectWifi',
  'forgetWifi',
  'setBluetooth',
  'forgetBluetooth',
  'setBrightness',
  'setNightMode',
  'setVolume',
  'setMuted',
  'setSetting',
  'ejectUsb',
  'suspend',
  'reboot',
  'powerOff',
] as const satisfies readonly (keyof SystemService)[];

export type SystemAction = (typeof SYSTEM_ACTIONS)[number];

export const IPC_INVOKE = 'charpentier:invoke';
export const IPC_MESSAGE = 'charpentier:message';

export type { MenuModel };
