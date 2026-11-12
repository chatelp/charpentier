import * as Y from 'yjs';
import type { Message, Request, Responses } from '../shared/ipc';
import type { DocStore } from './doc-store';
import type { FolderLibrary } from './projects';
import type { PreferencesFile } from './preferences';
import type { SpellClient } from './spell-client';
import type { AgentHost } from './agent-host';

/**
 * The main-process side of one renderer: answers its requests, applies the
 * updates it sends, and forwards every other update of the documents it
 * holds. Independent of Electron (the transport is a function), so it is
 * tested in plain Node.
 */
export class RendererSession {
  readonly #unsubscribe = new Map<string, () => void>();

  constructor(
    private readonly services: {
      readonly store: DocStore;
      readonly library: FolderLibrary;
      readonly preferences: PreferencesFile;
      readonly spell?: SpellClient;
      readonly agents?: AgentHost;
    },
    private readonly push: (message: Message) => void,
  ) {}

  async handle<R extends Request>(request: R): Promise<Responses[R['type']]> {
    return (await this.#handle(request)) as Responses[R['type']];
  }

  async #handle(request: Request): Promise<unknown> {
    const { store, library, preferences } = this.services;
    switch (request.type) {
      case 'doc.open': {
        const doc = store.acquire(request.guid, this);
        if (!this.#unsubscribe.has(request.guid)) {
          this.#unsubscribe.set(
            request.guid,
            store.subscribe(request.guid, (update, origin) => {
              if (origin !== this) this.push({ type: 'doc.update', guid: request.guid, update });
            }),
          );
        }
        return { state: Y.encodeStateAsUpdate(doc) };
      }
      case 'doc.close':
        this.#unsubscribe.get(request.guid)?.();
        this.#unsubscribe.delete(request.guid);
        store.release(request.guid, this);
        return null;
      case 'library.list':
        return library.list();
      case 'library.listTrashed':
        return library.listTrashed();
      case 'library.create':
        return library.create(request.input);
      case 'library.rename':
        await library.rename(request.projectId, request.title);
        return null;
      case 'library.touch':
        await library.touch(request.projectId);
        return null;
      case 'library.trash':
        await library.trash(request.projectId);
        return null;
      case 'library.restore':
        await library.restore(request.projectId);
        return null;
      case 'prefs.get':
        return preferences.get(request.key);
      case 'prefs.set':
        preferences.set(request.key, request.value);
        return null;
      case 'spell.misspelled':
        return this.services.spell?.misspelled(request.words, request.language) ?? [];
      case 'spell.suggest':
        return this.services.spell?.suggest(request.word, request.language) ?? [];
      case 'agents.status':
      case 'agents.setKey':
      case 'agents.forgetKey':
        if (!this.services.agents) throw new Error('No agents in this host');
        return this.services.agents.handle(request);
      default:
        throw new Error(`Not handled by the session: ${request.type}`);
    }
  }

  /** An update typed in the renderer. */
  receive(message: Message): void {
    if (message.type !== 'doc.update' || !this.#unsubscribe.has(message.guid)) return;
    // (Other messages only go from the main process to the renderer.)
    const doc = this.services.store.acquire(message.guid, this);
    Y.applyUpdate(doc, message.update, this);
  }

  /** The renderer went away (window closed, reload): let go of its documents. */
  dispose(): void {
    for (const unsubscribe of this.#unsubscribe.values()) unsubscribe();
    this.#unsubscribe.clear();
    this.services.store.releaseAll(this);
  }
}
