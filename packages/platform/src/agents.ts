import type { LlmStatus } from './llm';

/** Outcome of saving an API key: checked against the provider first. */
export type ApiKeyResult = 'saved' | 'invalid' | 'offline';

/** Outcome of asking the Compagnon to answer (its answer lands in the mentor document). */
export type AskResult = 'answered' | 'unavailable' | 'offline' | 'refused' | 'failed';

/**
 * Entry point of core into the Compagnon. Agents run outside the UI
 * (Electron main process, server) and write their results into the project's
 * Yjs documents, never into scene documents (docs/SPEC.md §15.5). The API key
 * goes in, never back out: the UI cannot read it.
 */
export interface AgentsService {
  status(): LlmStatus;
  onStatusChange(listener: (status: LlmStatus) => void): () => void;
  /** Checks the key with the provider, then keeps it in the OS keychain. */
  setApiKey(key: string): Promise<ApiKeyResult>;
  forgetApiKey(): Promise<void>;
  /** Answers the author's last message of the conversation (docs/SPEC.md §6.7). */
  ask(input: { readonly projectId: string; readonly sceneId?: string }): Promise<AskResult>;
  /**
   * Analyses scenes (docs/SPEC.md §6.2): sheets proposals, conflicts, remarks.
   * `automatic` skips scenes unchanged since their last analysis and may use
   * the light model.
   */
  analyze(input: {
    readonly projectId: string;
    readonly sceneIds: readonly string[];
    readonly automatic: boolean;
  }): Promise<AskResult>;
  /**
   * The Compagnon's review of a whole chapter, left in the conversation (D-19:
   * at the end of each chapter at level 4, on demand at every level).
   * `automatic` skips a chapter unchanged since its last review.
   */
  reviewChapter(input: {
    readonly projectId: string;
    readonly chapterId: string;
    readonly automatic: boolean;
  }): Promise<AskResult>;
  /**
   * One turn of the interview with the Compagnon (D-26): answers the author's
   * last message of the interview thread, or (guided) asks the next
   * question; what belongs to the Atelier is filed there as proposals.
   * `skip`: sections the author left for later.
   */
  interview(input: {
    readonly projectId: string;
    readonly mode: 'free' | 'guided';
    readonly skip?: readonly string[];
  }): Promise<AskResult>;
  /** D-20: the model of the light, frequent work. */
  lightModel(): Promise<'opus' | 'haiku'>;
  setLightModel(model: 'opus' | 'haiku'): Promise<void>;
}
