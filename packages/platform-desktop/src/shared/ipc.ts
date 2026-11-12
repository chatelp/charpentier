import type {
  ApiKeyResult,
  AskResult,
  LlmStatus,
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
  | { readonly type: 'agents.lightModel' }
  | { readonly type: 'agents.setLightModel'; readonly model: 'opus' | 'haiku' }
  // Handled by the Electron host itself (dialogs, Finder).
  | { readonly type: 'host.libraryFolder' }
  | { readonly type: 'host.chooseLibraryFolder' }
  | { readonly type: 'host.revealLibraryFolder' };

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
  'agents.lightModel': 'opus' | 'haiku';
  'agents.setLightModel': null;
  'host.libraryFolder': string;
  'host.chooseLibraryFolder': boolean;
  'host.revealLibraryFolder': null;
}

/** One-way messages, in both directions. */
export type Message =
  | { readonly type: 'doc.update'; readonly guid: string; readonly update: Uint8Array }
  /** The Compagnon's availability changed (main → renderer). */
  | { readonly type: 'agents.status'; readonly status: LlmStatus };

/** What the preload script exposes to the renderer as `window.charpentier`. */
export interface DesktopBridge {
  readonly platform: string;
  invoke<R extends Request>(request: R): Promise<Responses[R['type']]>;
  send(message: Message): void;
  /** Messages from the main process; returns an unsubscribe function. */
  onMessage(listener: (message: Message) => void): () => void;
}

export const IPC_INVOKE = 'charpentier:invoke';
export const IPC_MESSAGE = 'charpentier:message';
