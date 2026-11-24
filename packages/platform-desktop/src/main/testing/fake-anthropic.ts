import type Anthropic from '@anthropic-ai/sdk';

type Create = (body: never, options?: { signal?: AbortSignal }) => Promise<unknown>;

/**
 * The SDK's `beta.messages.stream`, for tests, on top of a fake `create`:
 * the request goes out at once, the first words are told (`'text'`) when the
 * message has some, then `finalMessage()` gives it whole, or its error.
 */
export function streamFrom(create: Create) {
  return (body: never, options?: { signal?: AbortSignal }) => {
    const listeners: ((delta: string, snapshot: string) => void)[] = [];
    const result = create(body, options);
    // Read by finalMessage; a stream nobody reads must not fail the run.
    result.catch(() => {});
    const stream = {
      on(event: string, listener: (delta: string, snapshot: string) => void) {
        if (event === 'text') listeners.push(listener);
        return stream;
      },
      async finalMessage() {
        const message = (await result) as { content?: { type: string; text?: string }[] };
        const text = (message.content ?? [])
          .map((block) => (block.type === 'text' ? (block.text ?? '') : ''))
          .join('');
        if (text) for (const listener of listeners) listener(text, text);
        return message;
      },
    };
    return stream;
  };
}

/** A fake client whose messages are answered by `create`, streamed or not. */
export function fakeAnthropic(
  create: Create,
  retrieve: () => Promise<unknown> = async () => ({}),
): Anthropic {
  return {
    beta: { messages: { create, stream: streamFrom(create) } },
    models: { retrieve },
  } as unknown as Anthropic;
}
