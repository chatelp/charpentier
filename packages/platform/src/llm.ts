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
  /**
   * `progress` is told when the model's first words arrive (`'text'`), for a
   * host whose provider streams; one that does not never calls it. The
   * answer itself only comes whole, in the response.
   */
  generate(
    request: LlmRequest,
    signal?: AbortSignal,
    progress?: (event: LlmProgress) => void,
  ): Promise<LlmResponse>;
}

/** What a call to the model says on the way: its first words are coming. */
export type LlmProgress = 'text';

/** The model declined the request for safety reasons (and so did its fallbacks). */
export class LlmRefusalError extends Error {}
/** No key, or the key was refused. */
export class LlmUnconfiguredError extends Error {}
/** The provider (or the relay to it) could not be reached. */
export class LlmOfflineError extends Error {}

export type LlmStatus =
  /** Ready to take requests. */
  | 'available'
  /** Configured, but the network or the provider is unreachable. */
  | 'offline'
  /** No provider or key configured yet. */
  | 'unconfigured'
  /** Not offered by this host (e.g. the web host before step 4). */
  | 'disabled'
  /**
   * The key is on the server, sealed by the account's password, and this
   * session must give the password again (the server restarted, phase 4.7 b).
   */
  | 'locked';

export interface LlmMessage {
  readonly role: 'user' | 'assistant';
  /** Text, or blocks when tools are in play. */
  readonly content: string | readonly LlmBlock[];
  /**
   * Everything up to this message stays the same from one call to the next:
   * a host whose provider caches prompts marks a cache point here.
   */
  readonly stable?: boolean;
}

export type LlmBlock =
  | { readonly type: 'text'; readonly text: string }
  /** What a tool answered to one of the model's calls. */
  | {
      readonly type: 'tool_result';
      readonly callId: string;
      readonly content: string;
      readonly isError?: boolean;
    }
  /**
   * The model's own turn, sent back exactly as the provider gave it
   * (`LlmResponse.turn`): its tool calls and its thinking with them.
   */
  | { readonly type: 'provider_turn'; readonly turn: unknown };

/**
 * A tool the model may call (phase 6.5, D-35). `memory`: the Compagnon's
 * notebook, a small tree of notes under `/memories` (view, create,
 * str_replace, insert, delete, rename); a host maps it to the provider's own
 * memory tool where there is one (Claude's), to a generic tool with the
 * same commands elsewhere. The notes are the project's, not the provider's.
 */
export type LlmTool = { readonly kind: 'memory' };

export interface LlmToolCall {
  readonly id: string;
  readonly name: 'memory';
  readonly input: Readonly<Record<string, unknown>>;
}

export interface LlmRequest {
  readonly system: string;
  readonly messages: readonly LlmMessage[];
  /** JSON Schema the answer must conform to (structured output). */
  readonly responseSchema?: Readonly<Record<string, unknown>>;
  readonly maxOutputTokens: number;
  /** Logical model tier; each host maps it to a concrete provider model. */
  readonly tier: 'fast' | 'deep';
  /** Tools the model may call; the caller runs them and calls again. */
  readonly tools?: readonly LlmTool[];
  /**
   * `none`: the tools stay declared (the history holds their calls and
   * results, which the provider refuses without them) but none may be
   * called: the model must answer in text.
   */
  readonly toolChoice?: 'none';
}

export interface LlmResponse {
  /** Raw text, or JSON text when `responseSchema` was given (empty while calling tools). */
  readonly text: string;
  /** The model wants these tools run before it answers. */
  readonly toolCalls?: readonly LlmToolCall[];
  /** Its turn as the provider gave it, to send back with the tools' results. */
  readonly turn?: unknown;
  /** The answer stopped at `maxOutputTokens`: incomplete, not to be used as it is. */
  readonly truncated?: boolean;
  readonly usage?: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    /** Input read from the provider's prompt cache, and written to it. */
    readonly cacheReadTokens?: number;
    readonly cacheWriteTokens?: number;
  };
}
