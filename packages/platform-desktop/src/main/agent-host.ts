import Anthropic from '@anthropic-ai/sdk';
import { analyzeScene, answerAuthor } from '@charpentier/agents';
import type { ApiKeyResult, AskResult, LlmStatus } from '@charpentier/platform';
import {
  agentOrigin,
  fragmentPlainText,
  getScene,
  guids,
  hashEvidence,
  readMentorLevel,
  variantFragment,
} from '@charpentier/schema';
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
    private readonly lightModel: {
      get(): 'opus' | 'haiku';
      set(model: 'opus' | 'haiku'): void;
    } = { get: () => 'opus', set: () => {} },
  ) {}

  /** One analysis at a time per project: automatic triggers queue behind it. */
  readonly #running = new Map<string, Promise<unknown>>();

  async #analyze(
    projectId: string,
    sceneIds: readonly string[],
    automatic: boolean,
  ): Promise<AskResult> {
    if (this.llm.status() === 'unconfigured') return 'unavailable';
    if (automatic && this.llm.status() === 'offline') return 'offline';
    const previous = this.#running.get(projectId) ?? Promise.resolve();
    const run = previous.then(() => this.#analyzeNow(projectId, sceneIds, automatic));
    this.#running.set(
      projectId,
      run.catch(() => {}),
    );
    return run;
  }

  async #analyzeNow(
    projectId: string,
    sceneIds: readonly string[],
    automatic: boolean,
  ): Promise<AskResult> {
    const rootGuid = guids.project(projectId);
    const mentorGuid = guids.mentor(projectId);
    try {
      for (const sceneId of sceneIds) {
        const sceneGuid = guids.scene(projectId, sceneId);
        await this.#withDocs([rootGuid, mentorGuid, sceneGuid], async (docs) => {
          const root = docs.get(rootGuid);
          const mentorDoc = docs.get(mentorGuid);
          const sceneDoc = docs.get(sceneGuid);
          const scene = root && getScene(root, sceneId);
          if (!root || !mentorDoc || !sceneDoc || !scene) return;
          const level = readMentorLevel(root);
          // What was analysed last: an unchanged scene is not analysed again automatically.
          const text = fragmentPlainText(variantFragment(sceneDoc, scene.activeVariantId));
          if (!text.trim()) return;
          const digest = hashEvidence([
            { sceneId, variantId: scene.activeVariantId, quote: `${level}|${text}` },
          ]);
          const analyses = mentorDoc.getMap<string>('analyses');
          if (automatic && analyses.get(sceneId) === digest) return;
          await analyzeScene({
            llm: this.llm,
            root,
            sceneDoc,
            sceneId,
            level,
            tier: automatic ? 'fast' : 'deep',
          });
          mentorDoc.transact(() => analyses.set(sceneId, digest), agentOrigin('scene-analysis'));
        });
      }
      return 'answered';
    } catch (error) {
      if (error instanceof LlmUnconfiguredError) return 'unavailable';
      if (error instanceof LlmRefusalError) return 'refused';
      if (error instanceof Anthropic.APIConnectionError) return 'offline';
      console.error('Charpentier: the scene analysis failed', error);
      return 'failed';
    }
  }

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

  async handle(
    request: AgentRequest,
  ): Promise<LlmStatus | ApiKeyResult | AskResult | 'opus' | 'haiku' | null> {
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
      case 'agents.analyze':
        return this.#analyze(request.projectId, request.sceneIds, request.automatic);
      case 'agents.lightModel':
        return this.lightModel.get();
      case 'agents.setLightModel':
        this.lightModel.set(request.model);
        return null;
    }
  }
}
