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
}
