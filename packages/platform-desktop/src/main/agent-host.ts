import type { ApiKeyResult, LlmStatus } from '@charpentier/platform';
import type { Request } from '../shared/ipc';
import type { AnthropicLlmService } from './anthropic-llm';
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
  ) {}

  async handle(request: AgentRequest): Promise<LlmStatus | ApiKeyResult | null> {
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
    }
  }
}
