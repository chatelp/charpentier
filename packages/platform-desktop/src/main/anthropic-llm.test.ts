import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AgentHost, API_KEY_SECRET } from './agent-host';
import { DocStore } from './doc-store';
import {
  AnthropicLlmService,
  HAIKU,
  LlmOfflineError,
  LlmRefusalError,
  OPUS,
} from '@charpentier/anthropic';
import { SecretStore } from './secret-store';
import { fakeAnthropic } from './testing/fake-anthropic';

/** A fake SDK client: records requests, answers or fails as told. */
function fakeClient(behaviour: () => unknown) {
  const requests: Record<string, unknown>[] = [];
  const client = fakeAnthropic(
    async (body: Record<string, unknown>) => {
      requests.push(body);
      const result = behaviour();
      if (result instanceof Error) throw result;
      return result;
    },
    async () => {
      const result = behaviour();
      if (result instanceof Error) throw result;
      return { id: OPUS };
    },
  );
  return { client, requests };
}

const message = (text: string, stop_reason = 'end_turn') => ({
  content: [{ type: 'text', text }],
  stop_reason,
  usage: { input_tokens: 10, output_tokens: 5 },
});

const request = {
  system: 'You are le Compagnon.',
  messages: [{ role: 'user' as const, content: 'Bonjour' }],
  responseSchema: { type: 'object' },
  maxOutputTokens: 16000,
  tier: 'deep' as const,
};

describe('Anthropic LLM service', () => {
  it('calls Opus with a cached system prompt, structured output and refusal fallbacks', async () => {
    const { client, requests } = fakeClient(() => message('{"reply":"Oui."}'));
    const llm = new AnthropicLlmService({
      apiKey: () => 'sk-test',
      models: () => ({ deep: OPUS, fast: OPUS }),
      createClient: () => client,
    });
    expect(await llm.generate(request)).toEqual({
      text: '{"reply":"Oui."}',
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    });
    expect(requests[0]).toMatchObject({
      model: OPUS,
      max_tokens: 16000,
      system: [
        {
          type: 'text',
          text: 'You are le Compagnon.',
          cache_control: { type: 'ephemeral', ttl: '1h' },
        },
      ],
      output_config: {
        effort: 'high',
        format: { type: 'json_schema', schema: { type: 'object' } },
      },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
  });

  it('keeps the stable history in the cache for an hour, the last words outside it', async () => {
    const { client, requests } = fakeClient(() => message('ok'));
    const llm = new AnthropicLlmService({
      apiKey: () => 'sk-test',
      models: () => ({ deep: OPUS, fast: OPUS }),
      createClient: () => client,
    });
    await llm.generate({
      ...request,
      messages: [
        { role: 'user', content: 'Mon héroïne est batelière.', stable: true },
        { role: 'assistant', content: 'Je note.' },
        { role: 'user', content: 'Et son frère ?' },
      ],
    });
    expect(requests[0]?.['messages']).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Mon héroïne est batelière.',
            cache_control: { type: 'ephemeral', ttl: '1h' },
          },
        ],
      },
      { role: 'assistant', content: 'Je note.' },
      { role: 'user', content: 'Et son frère ?' },
    ]);
  });

  it('keeps the memory tool declared and forbids calling it on a forced answer', async () => {
    const { client, requests } = fakeClient(() => message('ok'));
    const llm = new AnthropicLlmService({
      apiKey: () => 'sk-test',
      models: () => ({ deep: OPUS, fast: OPUS }),
      createClient: () => client,
    });
    const turn = [{ type: 'tool_use', id: 't1', name: 'memory', input: { command: 'view' } }];
    const messages = [
      { role: 'user' as const, content: 'Bonjour' },
      { role: 'assistant' as const, content: [{ type: 'provider_turn' as const, turn }] },
      {
        role: 'user' as const,
        content: [{ type: 'tool_result' as const, callId: 't1', content: '(empty)' }],
      },
    ];
    await llm.generate({ ...request, messages, tools: [{ kind: 'memory' }] });
    await llm.generate({ ...request, messages, tools: [{ kind: 'memory' }], toolChoice: 'none' });
    const tools = [{ type: 'memory_20250818', name: 'memory' }];
    expect(requests[0]?.['tools']).toEqual(tools);
    expect(requests[0]).not.toHaveProperty('tool_choice');
    // The history holds tool_use and tool_result blocks: the tool must stay.
    expect(requests[1]?.['tools']).toEqual(tools);
    expect(requests[1]?.['tool_choice']).toEqual({ type: 'none' });
    expect(requests[1]?.['messages']).toEqual([
      { role: 'user', content: 'Bonjour' },
      { role: 'assistant', content: turn },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '(empty)' }] },
    ]);
  });

  it('sends light work to Haiku only when chosen, without fallbacks', async () => {
    const { client, requests } = fakeClient(() => message('ok'));
    const llm = new AnthropicLlmService({
      apiKey: () => 'sk-test',
      models: () => ({ deep: OPUS, fast: HAIKU }),
      createClient: () => client,
    });
    await llm.generate({ ...request, tier: 'fast' });
    expect(requests[0]).toMatchObject({ model: HAIKU, output_config: { effort: 'low' } });
    expect(requests[0]).not.toHaveProperty('fallbacks');
  });

  it('says when an answer was cut at the output limit', async () => {
    let stop = 'max_tokens';
    const { client } = fakeClient(() => message('{"reply":"Que veut', stop));
    const llm = new AnthropicLlmService({
      apiKey: () => 'sk-test',
      models: () => ({ deep: OPUS, fast: OPUS }),
      createClient: () => client,
    });
    expect(await llm.generate(request)).toMatchObject({
      text: '{"reply":"Que veut',
      truncated: true,
    });
    stop = 'end_turn';
    expect(await llm.generate(request)).not.toHaveProperty('truncated');
  });

  it('reports offline, missing key and refusals', async () => {
    let fail: unknown = new Anthropic.APIConnectionError({ message: 'down' });
    const { client } = fakeClient(() => fail);
    let key: string | undefined = 'sk-test';
    const llm = new AnthropicLlmService({
      apiKey: () => key,
      models: () => ({ deep: OPUS, fast: OPUS }),
      createClient: () => client,
    });
    const statuses: string[] = [];
    llm.onStatusChange((s) => statuses.push(s));
    await expect(llm.generate(request)).rejects.toBeInstanceOf(LlmOfflineError);
    fail = message('', 'refusal');
    await expect(llm.generate(request)).rejects.toBeInstanceOf(LlmRefusalError);
    key = undefined;
    await expect(llm.generate(request)).rejects.toThrow('No API key');
    expect(statuses).toEqual(['offline', 'available', 'unconfigured']);
  });
});

/** The SDK itself, its network played: what is sent as server-sent events, and how it ends. */
describe('the answer streamed, through the SDK (DESIGN 1.34)', () => {
  const sse = (event: Record<string, unknown>) =>
    new TextEncoder().encode(`event: ${String(event['type'])}\ndata: ${JSON.stringify(event)}\n\n`);
  const opening = {
    type: 'message_start',
    message: {
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: OPUS,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 1 },
    },
  };
  const block = (index: number, content_block: unknown, deltas: unknown[]) => [
    { type: 'content_block_start', index, content_block },
    ...deltas.map((delta) => ({ type: 'content_block_delta', index, delta })),
    { type: 'content_block_stop', index },
  ];
  const thinking = block(0, { type: 'thinking', thinking: '', signature: '' }, [
    { type: 'thinking_delta', thinking: 'Que veut-elle ?' },
    { type: 'signature_delta', signature: 'sig' },
  ]);
  const words = (...texts: string[]) =>
    block(
      1,
      { type: 'text', text: '' },
      texts.map((text) => ({ type: 'text_delta', text })),
    );
  const ending = (stop_reason: string) => [
    {
      type: 'message_delta',
      delta: { stop_reason, stop_sequence: null },
      usage: { output_tokens: 5 },
    },
    { type: 'message_stop' },
  ];

  /** The service on the real SDK; `send` writes events, `controller` closes or breaks the stream. */
  function streamed() {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const bodies: Record<string, unknown>[] = [];
    let sent!: () => void;
    const requested = new Promise<void>((resolve) => (sent = resolve));
    const llm = new AnthropicLlmService({
      apiKey: () => 'sk-test',
      models: () => ({ deep: OPUS, fast: OPUS }),
      createClient: (apiKey) =>
        new Anthropic({
          apiKey,
          maxRetries: 0,
          fetch: async (_url, init) => {
            bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
            const body = new ReadableStream<Uint8Array>({
              start(c) {
                controller = c;
                init?.signal?.addEventListener('abort', () =>
                  c.error(new DOMException('This operation was aborted', 'AbortError')),
                );
              },
            });
            sent();
            return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
          },
        }),
    });
    return {
      llm,
      bodies,
      requested,
      send: (...events: Record<string, unknown>[]) => {
        for (const event of events) controller.enqueue(sse(event));
      },
      close: () => controller.close(),
      fail: (error: Error) => controller.error(error),
    };
  }
  const soon = () => new Promise((resolve) => setTimeout(resolve, 5));

  it('tells its first words once, before it is whole; thinking is not words', async () => {
    const { llm, bodies, requested, send, close } = streamed();
    const told: string[] = [];
    const answer = llm.generate(request, undefined, (event) => told.push(event));
    await requested;
    send(opening, ...thinking);
    await soon();
    expect(told).toEqual([]);
    send(...words('{"reply":', '"Oui."}').slice(0, 2));
    await soon();
    expect(told).toEqual(['text']);
    send(...words('{"reply":', '"Oui."}').slice(2), ...ending('end_turn'));
    close();
    expect(await answer).toEqual({
      text: '{"reply":"Oui."}',
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    });
    expect(told).toEqual(['text']);
    expect(bodies[0]).toMatchObject({ stream: true, model: OPUS, max_tokens: 16000 });
  });

  it('gives the memory calls and the turn as they came, thinking and signature with them', async () => {
    const { llm, requested, send, close } = streamed();
    const told: string[] = [];
    const answer = llm.generate({ ...request, tools: [{ kind: 'memory' }] }, undefined, (event) =>
      told.push(event),
    );
    await requested;
    send(
      opening,
      ...thinking,
      ...block(1, { type: 'tool_use', id: 't1', name: 'memory', input: {} }, [
        { type: 'input_json_delta', partial_json: '{"command":"view",' },
        { type: 'input_json_delta', partial_json: '"path":"/memories"}' },
      ]),
      ...ending('tool_use'),
    );
    close();
    expect(await answer).toMatchObject({
      text: '',
      toolCalls: [{ id: 't1', name: 'memory', input: { command: 'view', path: '/memories' } }],
      turn: [
        { type: 'thinking', thinking: 'Que veut-elle ?', signature: 'sig' },
        { type: 'tool_use', id: 't1', input: { command: 'view', path: '/memories' } },
      ],
    });
    // A call of the notebook is not his answer.
    expect(told).toEqual([]);
  });

  it('gives an answer cut short as it is, its JSON unread', async () => {
    const { llm, requested, send, close } = streamed();
    const answer = llm.generate(request);
    await requested;
    send(opening, ...thinking, ...words('{"reply":"Que veut'), ...ending('max_tokens'));
    close();
    expect(await answer).toMatchObject({ text: '{"reply":"Que veut', truncated: true });
  });

  it('says offline when the network goes away in the middle of the answer', async () => {
    const { llm, requested, send, fail } = streamed();
    const answer = llm.generate(request);
    const refused = expect(answer).rejects.toBeInstanceOf(LlmOfflineError);
    await requested;
    send(opening, ...thinking, ...words('{"reply":').slice(0, 2));
    await soon();
    fail(new TypeError('terminated'));
    await refused;
    expect(llm.status()).toBe('offline');
  });

  it('stops when told to, without taking it for a network failure', async () => {
    const { llm, requested, send } = streamed();
    const controller = new AbortController();
    const answer = llm.generate(request, controller.signal);
    const stopped = expect(answer).rejects.toBeInstanceOf(Anthropic.APIUserAbortError);
    await requested;
    send(opening, ...thinking);
    await soon();
    controller.abort();
    await stopped;
    expect(llm.status()).toBe('available');
  });
});

describe('API key', () => {
  it('is checked, kept encrypted and never stored when refused', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charpentier-secrets-'));
    const encryption = {
      isEncryptionAvailable: () => true,
      encryptString: (s: string) => Buffer.from([...s].reverse().join('')),
      decryptString: (b: Buffer) => [...b.toString()].reverse().join(''),
    };
    const secrets = new SecretStore(path.join(dir, 'secrets.json'), encryption);
    let valid = false;
    const { client } = fakeClient(() =>
      valid
        ? message('')
        : new Anthropic.AuthenticationError(401, undefined, 'bad key', new Headers()),
    );
    const llm = new AnthropicLlmService({
      apiKey: () => secrets.get(API_KEY_SECRET),
      models: () => ({ deep: OPUS, fast: OPUS }),
      createClient: () => client,
    });
    const host = new AgentHost(llm, secrets, new DocStore(() => undefined));
    expect(await host.handle({ type: 'agents.setKey', key: 'sk-wrong' })).toBe('invalid');
    expect(secrets.get(API_KEY_SECRET)).toBeUndefined();
    valid = true;
    expect(await host.handle({ type: 'agents.setKey', key: ' sk-right ' })).toBe('saved');
    expect(secrets.get(API_KEY_SECRET)).toBe('sk-right');
    expect(fs.readFileSync(path.join(dir, 'secrets.json'), 'utf8')).not.toContain('sk-right');
    expect(await host.handle({ type: 'agents.status' })).toBe('available');
    await host.handle({ type: 'agents.forgetKey' });
    expect(await host.handle({ type: 'agents.status' })).toBe('unconfigured');
    // A system without a keychain (Linux without one): a good key, said not kept.
    const nowhere = new SecretStore(path.join(dir, 'none.json'), {
      ...encryption,
      isEncryptionAvailable: () => false,
    });
    const bare = new AgentHost(llm, nowhere, new DocStore(() => undefined));
    expect(await bare.handle({ type: 'agents.setKey', key: 'sk-right' })).toBe('no-keychain');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
