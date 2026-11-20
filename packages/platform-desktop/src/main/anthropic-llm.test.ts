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

/** A fake SDK client: records requests, answers or fails as told. */
function fakeClient(behaviour: () => unknown) {
  const requests: Record<string, unknown>[] = [];
  const client = {
    beta: {
      messages: {
        create: async (body: Record<string, unknown>) => {
          requests.push(body);
          const result = behaviour();
          if (result instanceof Error) throw result;
          return result;
        },
      },
    },
    models: {
      retrieve: async () => {
        const result = behaviour();
        if (result instanceof Error) throw result;
        return { id: OPUS };
      },
    },
  } as unknown as Anthropic;
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
