import Anthropic from '@anthropic-ai/sdk';
import { answerAuthor } from '@charpentier/agents';
import type { ApiKeyResult, AskResult, LlmStatus } from '@charpentier/platform';
import { guids } from '@charpentier/schema';
import type * as Y from 'yjs';
import type { Request } from '../shared/ipc';
import { LlmRefusalError, LlmUnconfiguredError, type AnthropicLlmService } from './anthropic-llm';
import type { DocStore } from './doc-store';
import type { SecretStore } from './secret-store';

export const API_KEY_SECRET = 'anthropic.apiKey';

type AgentRequest = Extract<Request, { type: `agents.${string}` }>;

/**
 * The Compagnon's side of the main process: the LLM service, the key in the
 * keychain, and (from phase 3.4) the agents themselves.
 */
export class AgentHost {
  constructor(
    readonly llm: AnthropicLlmService,
    private readonly secrets: SecretStore,
    private readonly store: DocStore,
  ) {}

  /** Holds the documents an agent needs for the time of its work. */
  async #withDocs<T>(
    guidsNeeded: readonly string[],
    work: (docs: Map<string, Y.Doc>) => Promise<T>,
  ) {
    const docs = new Map(
      guidsNeeded.map((guid) => [guid, this.store.acquire(guid, this)] as const),
    );
    try {
      return await work(docs);
    } finally {
      for (const guid of guidsNeeded) this.store.release(guid, this);
    }
  }

  async #ask(projectId: string, sceneId: string | undefined): Promise<AskResult> {
    if (this.llm.status() === 'unconfigured') return 'unavailable';
    const rootGuid = guids.project(projectId);
    const mentorGuid = guids.mentor(projectId);
    const sceneGuid = sceneId ? guids.scene(projectId, sceneId) : undefined;
    try {
      await this.#withDocs([rootGuid, mentorGuid, ...(sceneGuid ? [sceneGuid] : [])], (docs) => {
        const root = docs.get(rootGuid);
        const mentorDoc = docs.get(mentorGuid);
        if (!root || !mentorDoc) throw new Error('Documents missing');
        const sceneDoc = sceneGuid ? docs.get(sceneGuid) : undefined;
        return answerAuthor({
          llm: this.llm,
          root,
          mentorDoc,
          ...(sceneDoc && { sceneDoc }),
          ...(sceneId !== undefined && { sceneId }),
        });
      });
      return 'answered';
    } catch (error) {
      if (error instanceof LlmUnconfiguredError) return 'unavailable';
      if (error instanceof LlmRefusalError) return 'refused';
      if (error instanceof Anthropic.APIConnectionError) return 'offline';
      console.error('Charpentier: the Compagnon could not answer', error);
      return 'failed';
    }
  }

  async handle(request: AgentRequest): Promise<LlmStatus | ApiKeyResult | AskResult | null> {
    switch (request.type) {
      case 'agents.status':
        return this.llm.status();
      case 'agents.setKey': {
        const key = request.key.trim();
        const check = await this.llm.checkKey(key);
        if (check === 'invalid') return 'invalid';
        if (check === 'offline') return 'offline';
        if (!this.secrets.set(API_KEY_SECRET, key)) return 'invalid';
        this.llm.keyChanged();
        return 'saved';
      }
      case 'agents.forgetKey':
        this.secrets.delete(API_KEY_SECRET);
        this.llm.keyChanged();
        return null;
      case 'agents.ask':
        return this.#ask(request.projectId, request.sceneId);
    }
  }
}
