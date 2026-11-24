import type { AgentsService, AnswerPhaseEvent, DeepTask, LlmStatus } from '@charpentier/platform';
import type { DesktopBridge } from '../shared/ipc';

/** The Compagnon as the renderer sees it: a status, and the key going in (never out). */
export class IpcAgentsService implements AgentsService {
  #status: LlmStatus;
  readonly #listeners = new Set<(status: LlmStatus) => void>();
  readonly #phaseListeners = new Set<(event: AnswerPhaseEvent) => void>();

  /**
   * `known`: the status read before the interface starts (`connectStatuses`). Without it
   * the service would say « no key » until the main process answers, and the footer would
   * show « saisir la clé » for an instant to an author who has one (DESIGN §5.0, rule 7).
   */
  constructor(
    private readonly bridge: DesktopBridge,
    known: LlmStatus = 'unconfigured',
  ) {
    this.#status = known;
    void bridge.invoke({ type: 'agents.status' }).then((status) => this.#set(status));
    bridge.onMessage((message) => {
      if (message.type === 'agents.status') this.#set(message.status);
      else if (message.type === 'agents.phase') {
        const event = { projectId: message.projectId, phase: message.phase };
        for (const listener of this.#phaseListeners) listener(event);
      }
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

  async stopDeepWork(input: { readonly projectId: string }) {
    await this.bridge.invoke({ type: 'agents.stopDeepWork', ...input });
  }

  /** The phases come from the main process, where the agents run (DESIGN 1.34). */
  onAnswerPhase(listener: (event: AnswerPhaseEvent) => void): () => void {
    this.#phaseListeners.add(listener);
    return () => this.#phaseListeners.delete(listener);
  }

  async stopAnswer(input: { readonly projectId: string }) {
    await this.bridge.invoke({ type: 'agents.stopAnswer', ...input });
  }

  chooseReference(input: { readonly projectId: string }) {
    return this.bridge.invoke({ type: 'agents.chooseReference', ...input });
  }

  readReference(input: { readonly projectId: string; readonly token: string }) {
    return this.bridge.invoke({ type: 'agents.readReference', ...input });
  }

  async dropReference(input: { readonly token: string }) {
    await this.bridge.invoke({ type: 'agents.dropReference', ...input });
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
