import Anthropic from '@anthropic-ai/sdk';
import {
  LlmOfflineError,
  LlmRefusalError,
  LlmUnconfiguredError,
  type LlmMessage,
  type LlmRequest,
  type LlmResponse,
  type LlmService,
  type LlmStatus,
} from '@charpentier/platform';

export { LlmOfflineError, LlmRefusalError, LlmUnconfiguredError };

/** The model behind each tier (D-20): Opus everywhere; Haiku for light work when chosen. */
export interface ModelChoice {
  readonly deep: string;
  readonly fast: string;
}

export const OPUS = 'claude-opus-5-5';
export const HAIKU = 'claude-haiku-5-5';

/**
 * The LLM service of the desktop main process (docs/SPEC.md §14, D-12):
 * Anthropic's official SDK, the author's own key (BYOK). The status follows
 * the network and the key; the author's writing never depends on it.
 */
/**
 * A cache point lasts an hour, not the API's default five minutes: an author
 * often thinks longer than that between two messages, and every expired
 * point sends the whole history again at full price. Writing it costs twice
 * the input price (instead of 1.25), reading it a tenth: paid back as soon as
 * one message comes more than five minutes after the last.
 */
const CACHE = { type: 'ephemeral', ttl: '1h' } as const;

/** A cache point on a message's last block (everything before it is the same next time). */
function cachePoint(content: unknown): unknown {
  const blocks =
    typeof content === 'string' ? [{ type: 'text', text: content }] : (content as unknown[]);
  if (blocks.length === 0) return content;
  const last = blocks.at(-1) as Record<string, unknown>;
  // Thinking blocks cannot carry a cache point; the message's other blocks can.
  if (last['type'] === 'thinking' || last['type'] === 'redacted_thinking') return blocks;
  return [...blocks.slice(0, -1), { ...last, cache_control: CACHE }];
}

/**
 * A message's content for the Messages API: text, a tool's results, or the
 * model's own turn sent back exactly as it came (its thinking included,
 * which the API checks).
 */
function anthropicContent(content: LlmMessage['content']): unknown {
  if (typeof content === 'string') return content;
  return content.flatMap((block) => {
    if (block.type === 'text') return [{ type: 'text', text: block.text }];
    if (block.type === 'tool_result')
      return [
        {
          type: 'tool_result',
          tool_use_id: block.callId,
          content: block.content,
          ...(block.isError && { is_error: true }),
        },
      ];
    return Array.isArray(block.turn) ? (block.turn as unknown[]) : [];
  });
}

export class AnthropicLlmService implements LlmService {
  #status: LlmStatus;
  #client: Anthropic | undefined;
  readonly #listeners = new Set<(status: LlmStatus) => void>();

  constructor(
    private readonly options: {
      readonly apiKey: () => string | undefined;
      readonly models: () => ModelChoice;
      /** For tests. */
      readonly createClient?: (apiKey: string) => Anthropic;
    },
  ) {
    this.#status = options.apiKey() ? 'available' : 'unconfigured';
  }

  status(): LlmStatus {
    return this.#status;
  }

  onStatusChange(listener: (status: LlmStatus) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #setStatus(status: LlmStatus) {
    if (status === this.#status) return;
    this.#status = status;
    for (const listener of this.#listeners) listener(status);
  }

  /** The network came back or went away (Electron's `net.isOnline`). */
  setOnline(online: boolean): void {
    if (!this.options.apiKey()) this.#setStatus('unconfigured');
    else this.#setStatus(online ? 'available' : 'offline');
  }

  /** The key changed: a new client, and the status that goes with it. */
  keyChanged(): void {
    this.#client = undefined;
    this.#setStatus(this.options.apiKey() ? 'available' : 'unconfigured');
  }

  #clientFor(apiKey: string): Anthropic {
    this.#client ??=
      this.options.createClient?.(apiKey) ?? new Anthropic({ apiKey, maxRetries: 2 });
    return this.#client;
  }

  /** Checks a key with the provider before it is saved. */
  async checkKey(apiKey: string): Promise<'valid' | 'invalid' | 'offline'> {
    const client = this.options.createClient?.(apiKey) ?? new Anthropic({ apiKey, maxRetries: 1 });
    try {
      await client.models.retrieve(OPUS);
      return 'valid';
    } catch (error) {
      if (
        error instanceof Anthropic.AuthenticationError ||
        error instanceof Anthropic.PermissionDeniedError
      )
        return 'invalid';
      if (error instanceof Anthropic.APIConnectionError) return 'offline';
      throw error;
    }
  }

  async generate(request: LlmRequest, signal?: AbortSignal): Promise<LlmResponse> {
    const apiKey = this.options.apiKey();
    if (!apiKey) {
      this.#setStatus('unconfigured');
      throw new LlmUnconfiguredError('No API key');
    }
    const model = request.tier === 'deep' ? this.options.models().deep : this.options.models().fast;
    // Server-side fallback on a refusal; Haiku has none.
    const fallback =
      model === HAIKU
        ? {}
        : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };
    try {
      const message = await this.#clientFor(apiKey).beta.messages.create(
        {
          model,
          max_tokens: request.maxOutputTokens,
          // The system prompt is stable: cached across calls.
          system: [{ type: 'text', text: request.system, cache_control: CACHE }],
          messages: request.messages.map((m) => ({
            role: m.role,
            content: m.stable
              ? cachePoint(anthropicContent(m.content))
              : anthropicContent(m.content),
          })) as Anthropic.Beta.Messages.BetaMessageParam[],
          // The notebook (phase 6.5): Claude's own memory tool, run by the caller.
          ...(request.tools?.some((t) => t.kind === 'memory') && {
            tools: [{ type: 'memory_20250818' as const, name: 'memory' as const }],
            // The loop's last round: the tool stays declared, an answer is forced.
            ...(request.toolChoice === 'none' && { tool_choice: { type: 'none' as const } }),
          }),
          output_config: {
            effort: request.tier === 'deep' ? 'high' : 'low',
            ...(request.responseSchema && {
              format: { type: 'json_schema', schema: { ...request.responseSchema } },
            }),
          },
          ...fallback,
        },
        { signal },
      );
      this.#setStatus('available');
      // What the call cost, for the record (phase 6.5: the prompt cache, measured).
      const { usage } = message;
      console.info(
        `Charpentier: ${model} · ${usage.input_tokens} sent, ${usage.cache_read_input_tokens ?? 0} read from the cache, ${usage.cache_creation_input_tokens ?? 0} written to it, ${usage.output_tokens} out`,
      );
      if (message.stop_reason === 'refusal') throw new LlmRefusalError('The model declined');
      const toolCalls = message.content.flatMap((block) =>
        block.type === 'tool_use' && block.name === 'memory'
          ? [
              {
                id: block.id,
                name: 'memory' as const,
                input: block.input as Record<string, unknown>,
              },
            ]
          : [],
      );
      const text =
        toolCalls.length > 0
          ? ''
          : message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
      return {
        text,
        ...(toolCalls.length > 0 && { toolCalls, turn: message.content }),
        // Cut at the output limit: the caller must not take it for a whole answer.
        ...(message.stop_reason === 'max_tokens' && { truncated: true }),
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
          cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
        },
      };
    } catch (error) {
      if (error instanceof Anthropic.APIConnectionError) {
        this.#setStatus('offline');
        throw new LlmOfflineError('The provider cannot be reached', { cause: error });
      } else if (error instanceof Anthropic.AuthenticationError) {
        this.#setStatus('unconfigured');
        throw new LlmUnconfiguredError('API key refused');
      }
      throw error;
    }
  }
}
