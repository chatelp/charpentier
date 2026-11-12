import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AgentHost, API_KEY_SECRET } from './agent-host';
import { DocStore } from './doc-store';
import { AnthropicLlmService, HAIKU, LlmRefusalError, OPUS } from './anthropic-llm';
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
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    expect(requests[0]).toMatchObject({
      model: OPUS,
      max_tokens: 16000,
      system: [
        { type: 'text', text: 'You are le Compagnon.', cache_control: { type: 'ephemeral' } },
      ],
      output_config: {
        effort: 'high',
        format: { type: 'json_schema', schema: { type: 'object' } },
      },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
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
    await expect(llm.generate(request)).rejects.toBeInstanceOf(Anthropic.APIConnectionError);
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
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
