import type { LlmStatus } from './llm';

/**
 * Entry point of core into the mentor. Agents run outside the UI (Electron
 * main process, server) and write their results into the project's Yjs
 * documents, never into scene documents (docs/SPEC.md §15.5).
 * Operations (chat, scene analysis) are added in step 3.
 */
export interface AgentsService {
  status(): LlmStatus;
  onStatusChange(listener: (status: LlmStatus) => void): () => void;
}
