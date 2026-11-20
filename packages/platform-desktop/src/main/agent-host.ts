import { AgentWorks } from '@charpentier/agents';
import type {
  ApiKeyResult,
  DeepWorkEstimate,
  DeepWorkOutcome,
  LlmStatus,
  ReferenceChoiceResult,
} from '@charpentier/platform';
import type { AuthorshipViolation } from '@charpentier/schema';
import type { Request } from '../shared/ipc';
import type { AnthropicLlmService } from './anthropic-llm';
import type { DocStore } from './doc-store';
import { readReferenceFile, UnreadableReferenceError } from './reference-file';
import type { SecretStore } from './secret-store';

export const API_KEY_SECRET = 'anthropic.apiKey';

type AgentRequest = Extract<Request, { type: `agents.${string}` }>;

/**
 * The Compagnon's side of the main process: the LLM service and the key in
 * the keychain; the works themselves are `AgentWorks` (`@charpentier/agents`),
 * the same as in the browser, on the documents the main process holds.
 */
export class AgentHost {
  readonly works: AgentWorks;

  constructor(
    readonly llm: AnthropicLlmService,
    private readonly secrets: SecretStore,
    store: DocStore,
    lightModel: {
      get(): 'opus' | 'haiku';
      set(model: 'opus' | 'haiku'): void;
    } = { get: () => 'opus', set: () => {} },
    onViolation?: (violation: AuthorshipViolation) => void,
  ) {
    this.works = new AgentWorks(llm, store, lightModel, onViolation);
  }

  /** A file the author chose: read, held, its reading's cost estimated. */
  async openReference(projectId: string, file: string): Promise<ReferenceChoiceResult> {
    try {
      return await this.works.holdReference(projectId, await readReferenceFile(file));
    } catch (error) {
      if (error instanceof UnreadableReferenceError) return { refused: error.reason };
      console.error('Charpentier: a reference text could not be read', error);
      return { refused: 'unreadable' };
    }
  }

  async handle(
    request: AgentRequest,
  ): Promise<
    LlmStatus | ApiKeyResult | DeepWorkOutcome | DeepWorkEstimate | 'opus' | 'haiku' | null
  > {
    switch (request.type) {
      case 'agents.status':
        return this.llm.status();
      case 'agents.setKey': {
        const key = request.key.trim();
        const check = await this.llm.checkKey(key);
        if (check === 'invalid') return 'invalid';
        if (check === 'offline') return 'offline';
        // Said, not mistaken for a bad key: the system cannot keep it (Linux without keychain).
        if (!this.secrets.set(API_KEY_SECRET, key)) return 'no-keychain';
        this.llm.keyChanged();
        return 'saved';
      }
      case 'agents.forgetKey':
        this.secrets.delete(API_KEY_SECRET);
        this.llm.keyChanged();
        return null;
      case 'agents.ask':
        return this.works.ask(request);
      case 'agents.analyze':
        return this.works.analyze(request);
      case 'agents.reviewChapter':
        return this.works.reviewChapter(request);
      case 'agents.interview':
        return this.works.interview(request);
      case 'agents.estimateDeepWork':
        return this.works.estimateDeepWork(request);
      case 'agents.deepWork':
        return this.works.deepWork(request);
      case 'agents.chooseReference':
        // The system's file dialog belongs to the window: apps/desktop opens
        // it, then hands the file to openReference.
        throw new Error('A reference text is chosen through the window');
      case 'agents.readReference':
        return this.works.readReference(request);
      case 'agents.dropReference':
        this.works.dropReference(request);
        return null;
      case 'agents.stopDeepWork':
        this.works.stopDeepWork(request);
        return null;
      case 'agents.lightModel':
        return this.works.lightModel();
      case 'agents.setLightModel':
        this.works.setLightModel(request.model);
        return null;
    }
  }
}
