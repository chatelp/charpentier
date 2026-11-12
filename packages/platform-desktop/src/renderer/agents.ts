import type { AgentsService, LlmStatus } from '@charpentier/platform';
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

  async forgetApiKey() {
    await this.bridge.invoke({ type: 'agents.forgetKey' });
    this.#set(await this.bridge.invoke({ type: 'agents.status' }));
  }
}
