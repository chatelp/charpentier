import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import {
  chatMessages,
  createChapter,
  createScene,
  guids,
  initProject,
  parseSceneMarkdown,
  variantFragment,
  writeSceneDocToFragment,
} from '@charpentier/schema';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentHost } from './agent-host';
import { AnthropicLlmService } from './anthropic-llm';
import { DocStore } from './doc-store';
import { documentLocator, FolderLibrary } from './projects';
import type { SecretStore } from './secret-store';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A model that answers every task with a review, and counts how many run at once. */
function fakeClient() {
  const seen = { calls: 0, atOnce: 0, maxAtOnce: 0, prompts: [] as string[] };
  const create = async (body: { messages: { content: string }[] }) => {
    seen.calls++;
    seen.atOnce++;
    seen.maxAtOnce = Math.max(seen.maxAtOnce, seen.atOnce);
    seen.prompts.push(body.messages.map((m) => m.content).join('\n'));
    await new Promise((resolve) => setTimeout(resolve, 10));
    seen.atOnce--;
    const text = JSON.stringify({
      review: 'La pluie installe la scène. Que veut Hélène ?',
      narrativeModel: null,
      acts: [],
      arcs: [],
      clues: [],
      signals: [],
    });
    return {
      stop_reason: 'end_turn',
      content: [{ type: 'text', text }],
      usage: { input_tokens: 10, output_tokens: 10 },
    };
  };
  const client = { beta: { messages: { create } } } as unknown as Anthropic;
  return { client, seen };
}

async function setUp() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'charpentier-agents-'));
  dirs.push(tmp);
  const library = new FolderLibrary(path.join(tmp, 'Bibliothèque'));
  const store = new DocStore(documentLocator(library));
  const project = await library.create({ title: 'Les serres', kind: 'novel' });
  const root = store.acquire(guids.project(project.id), 'test');
  initProject(root, { id: project.id, title: 'Les serres', kind: 'novel' });
  const chapterId = createChapter(root, { title: 'La serre' });
  for (const text of ['Il pleuvait sur Nantes.', 'Hélène poussa la porte du bureau.']) {
    const { sceneId, variantId } = createScene(root, { chapterId, title: 'Scène' });
    const scene = store.acquire(guids.scene(project.id, sceneId), 'test');
    scene.transact(() =>
      writeSceneDocToFragment(parseSceneMarkdown(text), variantFragment(scene, variantId)),
    );
  }
  const { client, seen } = fakeClient();
  const llm = new AnthropicLlmService({
    apiKey: () => 'sk-test',
    models: () => ({ deep: 'claude-opus-5-5', fast: 'claude-opus-5-5' }),
    createClient: () => client,
  });
  const host = new AgentHost(llm, {} as SecretStore, store);
  return { host, store, projectId: project.id, seen };
}

describe('the specialised agents in the main process (D-27)', () => {
  it('estimates a task on the whole manuscript, then runs it one at a time', async () => {
    const { host, store, projectId, seen } = await setUp();
    const estimate = await host.handle({
      type: 'agents.estimateDeepWork',
      projectId,
      task: 'structure',
    });
    expect(estimate).toMatchObject({ inputTokens: expect.any(Number), usd: expect.any(Number) });
    expect(seen.calls).toBe(0); // Estimating costs nothing.

    const [structure, clues] = await Promise.all([
      host.handle({ type: 'agents.deepWork', projectId, task: 'structure' }),
      host.handle({ type: 'agents.deepWork', projectId, task: 'clues' }),
    ]);
    expect([structure, clues]).toEqual(['answered', 'answered']);
    expect(seen.maxAtOnce).toBe(1);
    expect(seen.prompts[0]).toContain('Il pleuvait sur Nantes.');
    expect(seen.prompts[0]).toContain('Hélène poussa la porte du bureau.');
    const mentor = store.acquire(guids.mentor(projectId), 'test');
    expect(chatMessages(mentor).map((m) => m.text.split('\n')[0])).toEqual([
      'Le point sur la structure',
      'Le point sur les indices',
    ]);
  });

  it('has nothing to estimate for a character that does not exist', async () => {
    const { host, projectId } = await setUp();
    expect(
      await host.handle({
        type: 'agents.estimateDeepWork',
        projectId,
        task: 'character',
        characterId: 'nobody',
      }),
    ).toBeNull();
  });
});
