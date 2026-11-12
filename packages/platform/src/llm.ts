/**
 * Provider-agnostic access to language models (docs/SPEC.md §14, §18).
 *
 * Used by the `agents` package only, wherever it runs (Electron main process,
 * server). Every LLM call in the codebase goes through this service, so a host
 * can route it to a local provider, the server proxy or nowhere.
 * The request is plain data so that it can cross an IPC or network boundary.
 */
export interface LlmService {
  status(): LlmStatus;
  onStatusChange(listener: (status: LlmStatus) => void): () => void;
  generate(request: LlmRequest, signal?: AbortSignal): Promise<LlmResponse>;
}

export type LlmStatus =
  /** Ready to take requests. */
  | 'available'
  /** Configured, but the network or the provider is unreachable. */
  | 'offline'
  /** No provider or key configured yet. */
  | 'unconfigured'
  /** Not offered by this host (e.g. the web host before step 4). */
  | 'disabled';

export interface LlmMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface LlmRequest {
  readonly system: string;
  readonly messages: readonly LlmMessage[];
  /** JSON Schema the answer must conform to (structured output). */
  readonly responseSchema?: Readonly<Record<string, unknown>>;
  readonly maxOutputTokens: number;
  /** Logical model tier; each host maps it to a concrete provider model. */
  readonly tier: 'fast' | 'deep';
}

export interface LlmResponse {
  /** Raw text, or JSON text when `responseSchema` was given. */
  readonly text: string;
  readonly usage?: { readonly inputTokens: number; readonly outputTokens: number };
}
