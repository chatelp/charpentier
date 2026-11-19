import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import {
  agentOrigin,
  addChatMessage,
  AUTHOR,
  chatMessages,
  addInterviewMessage,
  interviewMessages,
  createChapter,
  createScene,
  guids,
  initProject,
  parseSceneMarkdown,
  variantFragment,
  writeSceneDocToFragment,
  type AuthorshipViolation,
} from '@charpentier/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  const seen = {
    calls: 0,
    atOnce: 0,
    maxAtOnce: 0,
    prompts: [] as string[],
    /** Run in the middle of a call: while the agent holds its documents. */
    during: undefined as (() => void) | undefined,
  };
  const create = async (
    body: { messages: { content: string }[] },
    options?: { signal?: AbortSignal },
  ) => {
    seen.calls++;
    seen.atOnce++;
    seen.maxAtOnce = Math.max(seen.maxAtOnce, seen.atOnce);
    seen.prompts.push(body.messages.map((m) => m.content).join('\n'));
    await new Promise((resolve) => setTimeout(resolve, 30));
    seen.during?.();
    seen.atOnce--;
    if (options?.signal?.aborted) throw new Error('Request was aborted.');
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

async function setUp(other?: Anthropic) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'charpentier-agents-'));
  dirs.push(tmp);
  const library = new FolderLibrary(path.join(tmp, 'Bibliothèque'));
  const store = new DocStore(documentLocator(library));
  const project = await library.create({ title: 'Les serres', kind: 'novel' });
  const root = store.acquire(guids.project(project.id), 'test');
  initProject(root, { id: project.id, title: 'Les serres', kind: 'novel' });
  const chapterId = createChapter(root, { title: 'La serre' });
  const sceneIds: string[] = [];
  for (const text of ['Il pleuvait sur Nantes.', 'Hélène poussa la porte du bureau.']) {
    const { sceneId, variantId } = createScene(root, { chapterId, title: 'Scène' });
    sceneIds.push(sceneId);
    const scene = store.acquire(guids.scene(project.id, sceneId), 'test');
    scene.transact(() =>
      writeSceneDocToFragment(parseSceneMarkdown(text), variantFragment(scene, variantId)),
    );
  }
  const { client, seen } = fakeClient();
  const llm = new AnthropicLlmService({
    apiKey: () => 'sk-test',
    models: () => ({ deep: 'claude-opus-5-5', fast: 'claude-opus-5-5' }),
    createClient: () => other ?? client,
  });
  const violations: AuthorshipViolation[] = [];
  const host = new AgentHost(llm, {} as SecretStore, store, undefined, (v) => violations.push(v));
  return { host, store, projectId: project.id, seen, violations, sceneIds };
}

describe('the specialised agents in the main process (D-27)', () => {
  it('estimates a task on the whole manuscript, then runs it one at a time', async () => {
    const { host, store, projectId, seen } = await setUp();
    const estimate = await host.handle({
      type: 'agents.estimateDeepWork',
      projectId,
      task: 'structure',
    });
    expect(estimate).toMatchObject({ scenes: 2, words: 10, usd: expect.any(Number) });
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
    expect(chatMessages(mentor).map((m) => m.work?.task)).toEqual(['structure', 'clues']);
  });

  it('reports an agent write to a scene document, and nothing of an honest work', async () => {
    const { host, store, projectId, seen, violations, sceneIds } = await setUp();
    expect(await host.handle({ type: 'agents.deepWork', projectId, task: 'structure' })).toBe(
      'answered',
    );
    // What the agents legitimately write (root proposals, the mentor document) is no violation.
    expect(violations).toEqual([]);

    const sceneGuid = guids.scene(projectId, sceneIds[0] ?? '');
    const scene = store.acquire(sceneGuid, 'test');
    const rogue = () =>
      scene.transact(
        () => scene.getMap('leak').set('prose', 'Écrit par un agent.'),
        agentOrigin('rogue'),
      );
    seen.during = rogue;
    await host.handle({ type: 'agents.deepWork', projectId, task: 'clues' });
    seen.during = undefined;
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ docGuid: sceneGuid, origin: agentOrigin('rogue') });
    expect(violations[0]?.reason).toMatch(/scene/);
  });

  it('stops a running work: nothing is filed', async () => {
    const { host, store, projectId } = await setUp();
    const run = host.handle({ type: 'agents.deepWork', projectId, task: 'structure' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await host.handle({ type: 'agents.stopDeepWork', projectId });
    expect(await run).toBe('stopped');
    expect(chatMessages(store.acquire(guids.mentor(projectId), 'test'))).toEqual([]);
  });

  it('stops the running work when another is queued behind it', async () => {
    const { host, store, projectId, seen } = await setUp();
    const running = host.handle({ type: 'agents.deepWork', projectId, task: 'structure' });
    const queued = host.handle({ type: 'agents.deepWork', projectId, task: 'clues' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await host.handle({ type: 'agents.stopDeepWork', projectId });
    expect(await Promise.all([running, queued])).toEqual(['stopped', 'stopped']);
    // The queued one never reached the model.
    expect(seen.calls).toBe(1);
    expect(chatMessages(store.acquire(guids.mentor(projectId), 'test'))).toEqual([]);
    // Nothing is left stopped: the next work runs.
    expect(await host.handle({ type: 'agents.deepWork', projectId, task: 'structure' })).toBe(
      'answered',
    );
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

describe('an answer that cannot be used (cut at the output limit)', () => {
  it('is reported as a failure: the Compagnon says nothing he did not say', async () => {
    const create = async () => ({
      stop_reason: 'max_tokens',
      content: [{ type: 'text', text: '{"reply":"Que veut' }],
      usage: { input_tokens: 10, output_tokens: 10 },
    });
    const { host, store, projectId } = await setUp({
      beta: { messages: { create } },
    } as unknown as Anthropic);
    const mentor = store.acquire(guids.mentor(projectId), 'test');
    addChatMessage(mentor, { role: 'author', text: 'Ma scène est-elle trop lente ?' }, AUTHOR);
    addInterviewMessage(mentor, { role: 'author', text: 'Hélène est batelière.' }, AUTHOR);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await host.handle({ type: 'agents.ask', projectId })).toBe('failed');
      expect(await host.handle({ type: 'agents.interview', projectId, mode: 'free' })).toBe(
        'failed',
      );
    } finally {
      logged.mockRestore();
    }
    expect(chatMessages(mentor).map((m) => m.role)).toEqual(['author']);
    expect(interviewMessages(mentor).map((m) => m.role)).toEqual(['author']);
  });
});

describe('reference texts in the main process (phase 6.4)', () => {
  const book = (words: number) =>
    `Chapitre 1\n\n${'La péniche glissait sous les saules du canal. '.repeat(Math.ceil(words / 7))}`;
  const save = (name: string, content: string) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charpentier-ref-'));
    dirs.push(dir);
    fs.writeFileSync(path.join(dir, name), content);
    return path.join(dir, name);
  };

  it('holds a chosen text with its cost, reads it once, then lets it go', async () => {
    const { host, store, projectId, seen } = await setUp();
    const chosen = await host.openReference(projectId, save('La péniche.txt', book(2500)));
    if (typeof chosen === 'string' || 'refused' in chosen) throw new Error('not chosen');
    expect(chosen).toMatchObject({ title: 'La péniche', format: 'txt', usd: expect.any(Number) });
    expect(chosen.words).toBeGreaterThanOrEqual(2500);
    expect(seen.calls).toBe(0); // Choosing costs nothing.
    expect(
      await host.handle({ type: 'agents.readReference', projectId, token: chosen.token }),
    ).toBe('answered');
    expect(seen.prompts[0]).toContain('BOOK: La péniche');
    const mentor = store.acquire(guids.mentor(projectId), 'test');
    expect(interviewMessages(mentor)).toHaveLength(1);
    // The text was let go: the same token reads nothing again.
    expect(
      await host.handle({ type: 'agents.readReference', projectId, token: chosen.token }),
    ).toBe('empty');
  });

  it('says why a file will not do, and drops a text the author leaves', async () => {
    const { host, projectId, seen } = await setUp();
    expect(await host.openReference(projectId, save('court.txt', book(300)))).toEqual({
      refused: 'too-short',
      words: expect.any(Number),
    });
    expect(await host.openReference(projectId, save('abime.epub', 'pas un zip'))).toEqual({
      refused: 'unreadable',
    });
    const chosen = await host.openReference(projectId, save('long.md', book(2500)));
    if (typeof chosen === 'string' || 'refused' in chosen) throw new Error('not chosen');
    await host.handle({ type: 'agents.dropReference', token: chosen.token });
    expect(
      await host.handle({ type: 'agents.readReference', projectId, token: chosen.token }),
    ).toBe('empty');
    expect(seen.calls).toBe(0);
  });
});
