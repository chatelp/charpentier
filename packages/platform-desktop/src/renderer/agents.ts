import type { AgentsService, DeepTask, LlmStatus } from '@charpentier/platform';
import type { DesktopBridge } from '../shared/ipc';

/** The Compagnon as the renderer sees it: a status, and the key going in (never out). */
export class IpcAgentsService implements AgentsService {
  #status: LlmStatus = 'unconfigured';
  readonly #listeners = new Set<(status: LlmStatus) => void>();

  constructor(private readonly bridge: DesktopBridge) {
    void bridge.invoke({ type: 'agents.status' }).then((status) => this.#set(status));
    bridge.onMessage((message) => {
      if (message.type === 'agents.status') this.#set(message.status);
    });
  }

  #set(status: LlmStatus) {
    if (status === this.#status) return;
    this.#status = status;
    for (const listener of this.#listeners) listener(status);
  }

  status(): LlmStatus {
    return this.#status;
  }

  onStatusChange(listener: (status: LlmStatus) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async setApiKey(key: string) {
    const result = await this.bridge.invoke({ type: 'agents.setKey', key });
    this.#set(await this.bridge.invoke({ type: 'agents.status' }));
    return result;
  }

  ask(input: { readonly projectId: string; readonly sceneId?: string }) {
    return this.bridge.invoke({ type: 'agents.ask', ...input });
  }

  analyze(input: {
    readonly projectId: string;
    readonly sceneIds: readonly string[];
    readonly automatic: boolean;
  }) {
    return this.bridge.invoke({ type: 'agents.analyze', ...input });
  }

  reviewChapter(input: {
    readonly projectId: string;
    readonly chapterId: string;
    readonly automatic: boolean;
  }) {
    return this.bridge.invoke({ type: 'agents.reviewChapter', ...input });
  }

  interview(input: {
    readonly projectId: string;
    readonly mode: 'free' | 'guided';
    readonly skip?: readonly string[];
    readonly section?: string;
    readonly pass?: boolean;
  }) {
    return this.bridge.invoke({ type: 'agents.interview', ...input });
  }

  estimateDeepWork(input: {
    readonly projectId: string;
    readonly task: DeepTask;
    readonly characterId?: string;
  }) {
    return this.bridge.invoke({ type: 'agents.estimateDeepWork', ...input });
  }

  deepWork(input: {
    readonly projectId: string;
    readonly task: DeepTask;
    readonly characterId?: string;
  }) {
    return this.bridge.invoke({ type: 'agents.deepWork', ...input });
  }

  lightModel() {
    return this.bridge.invoke({ type: 'agents.lightModel' });
  }

  async setLightModel(model: 'opus' | 'haiku') {
    await this.bridge.invoke({ type: 'agents.setLightModel', model });
  }

  async forgetApiKey() {
    await this.bridge.invoke({ type: 'agents.forgetKey' });
    this.#set(await this.bridge.invoke({ type: 'agents.status' }));
  }
}
