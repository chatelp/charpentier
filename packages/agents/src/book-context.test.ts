import type { LlmRequest, LlmService } from '@charpentier/platform';
import {
  addChatMessage,
  addInterviewMessage,
  AUTHOR,
  authorWriteNote,
  createEntity,
  initProject,
} from '@charpentier/schema';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { bookContext } from './book-context';
import { answerAuthor } from './conversation';
import { interviewTurn } from './interview';
import { projectMemory } from './memory';

function model(answer: unknown) {
  const requests: LlmRequest[] = [];
  const llm: LlmService = {
    status: () => 'available',
    onStatusChange: () => () => {},
    generate: async (request) => {
      requests.push(request);
      return { text: JSON.stringify(request.tier === 'fast' ? { summary: 'Résumé' } : answer) };
    },
  };
  return { llm, requests };
}

const project = () => {
  const root = new Y.Doc({ guid: 'project:p' });
  initProject(root, { id: 'p', title: 'Saint-Pierre', kind: 'novel' });
  const mentorDoc = new Y.Doc();
  authorWriteNote(mentorDoc, {
    path: '/memories/projet/decisions/fin.md',
    text: '# La fin reste ouverte',
  });
  return { root, mentorDoc };
};

const text = (request: LlmRequest | undefined, at: number) =>
  JSON.stringify(at < 0 ? request?.messages.at(at) : request?.messages[at]);

describe('the Atelier and the notebook in the cached part (prompt cache, phase 6.5)', () => {
  it('keeps them the same from call to call; what changed goes with the last words', async () => {
    const { root, mentorDoc } = project();
    const answer = { reply: 'Bien.', question: null, why: null, proposals: [] };
    const { llm, requests } = model(answer);
    const say = async (words: string) => {
      addInterviewMessage(mentorDoc, { role: 'author', text: words }, AUTHOR);
      await interviewTurn({ llm, root, mentorDoc, mode: 'free' });
    };

    projectMemory({ mentorDoc }).run({
      command: 'create',
      path: '/memories/projet/vieux.md',
      file_text: 'Un vieux fait.',
    });
    await say('Parlons d’Hélène.');
    const first = requests.at(-1);
    expect(first?.messages[0]?.stable).toBe(true);
    expect(text(first, 0)).toContain('La fin reste ouverte');
    expect(text(first, -1)).not.toContain('<atelier>');

    // A sheet and a note change: the cached part stays as it was, the change comes last.
    createEntity(root, 'characters', { name: 'Hélène' });
    projectMemory({ mentorDoc }).run({
      command: 'create',
      path: '/memories/projet/helene.md',
      file_text: 'Hélène doute.',
    });
    await say('Et son frère ?');
    const second = requests.at(-1);
    expect(second?.messages[0]).toEqual(first?.messages[0]);
    expect(text(second, -1)).toContain('WHAT CHANGED');
    expect(text(second, -1)).toContain('Hélène doute.');
    expect(text(second, -1)).toContain('name (validated): Hélène');

    // A note of the cached part removed: named as such.
    projectMemory({ mentorDoc }).run({ command: 'delete', path: '/memories/projet/vieux.md' });
    await say('Oublions ça.');
    expect(text(requests.at(-1), -1)).toContain('Removed since: /memories/projet/vieux.md');
  });

  it('takes them again when the window of the thread moves', () => {
    const { mentorDoc } = project();
    const store = () => projectMemory({ mentorDoc });
    const before = bookContext({ mentorDoc, store: store(), key: 'chat', start: 20 });
    store().run({ command: 'create', path: '/memories/projet/a.md', file_text: 'Un fait.' });
    const same = bookContext({ mentorDoc, store: store(), key: 'chat', start: 20 });
    expect(same.stable).toBe(before.stable);
    expect(same.now).toContain('Un fait.');
    const moved = bookContext({ mentorDoc, store: store(), key: 'chat', start: 40 });
    expect(moved.stable).toContain('Un fait.');
    expect(moved.now).toBe('');
    // Each kind of call keeps its own (its own system prompt, its own cache).
    expect(bookContext({ mentorDoc, store: store(), key: 'interview', start: 20 }).now).toBe('');
  });

  it('takes them again when what changed outgrows half of them', () => {
    const { mentorDoc } = project();
    const store = () => projectMemory({ mentorDoc });
    const before = bookContext({ mentorDoc, store: store(), key: 'chat', start: 0 });
    for (let i = 0; i < 4; i++)
      store().run({
        command: 'create',
        path: `/memories/projet/n${i}.md`,
        file_text: `# Note ${i}\n${'Un long fait. '.repeat(100)}`,
      });
    const after = bookContext({ mentorDoc, store: store(), key: 'chat', start: 0 });
    expect(after.stable).not.toBe(before.stable);
    expect(after.stable).toContain('# Note 3');
    expect(after.now).toBe('');
  });

  it('puts them before the thread in the conversation too, the scene with the last words', async () => {
    const { root, mentorDoc } = project();
    addChatMessage(mentorDoc, { role: 'author', text: 'Que penses-tu de la fin ?' }, AUTHOR);
    const { llm, requests } = model({ reply: 'Ouverte.', example: null, styleChoiceId: null });
    await answerAuthor({ llm, root, mentorDoc });
    const sent = requests.at(-1);
    expect(sent?.messages[0]?.stable).toBe(true);
    expect(text(sent, 0)).toContain('<atelier>');
    expect(text(sent, 0)).toContain('La fin reste ouverte');
    expect(text(sent, -1)).not.toContain('<notebook>');
    expect(text(sent, -1)).toContain('Que penses-tu de la fin ?');
    // System, Atelier and notebook, thread: within the provider's four cache points with the tool's.
    expect(sent?.messages.filter((m) => m.stable).length).toBeLessThanOrEqual(2);
  });
});
