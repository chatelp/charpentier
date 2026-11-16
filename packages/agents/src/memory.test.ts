import type { LlmRequest, LlmService } from '@charpentier/platform';
import {
  addChatMessage,
  addInterviewMessage,
  AUTHOR,
  authorEditNote,
  chatMessages,
  createEntity,
  findNote,
  initProject,
  listNotes,
} from '@charpentier/schema';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { answerAuthor } from './conversation';
import { interviewTurn } from './interview';
import { atelierContext, generateWithMemory, projectMemory, threadWindow } from './memory';

function project() {
  const root = new Y.Doc({ guid: 'project:p' });
  initProject(root, { id: 'p', title: 'Saint-Pierre', kind: 'novel' });
  return { root, mentorDoc: new Y.Doc() };
}

/** A model that calls the memory tool as scripted, then answers `final`. */
function scriptedLlm(rounds: Record<string, unknown>[][], final: unknown) {
  const requests: LlmRequest[] = [];
  const llm: LlmService = {
    status: () => 'available',
    onStatusChange: () => () => {},
    generate: async (request) => {
      requests.push(request);
      const calls = rounds[requests.length - 1];
      if (calls && request.tools?.length)
        return {
          text: '',
          toolCalls: calls.map((input, i) => ({
            id: `c${requests.length}-${i}`,
            name: 'memory',
            input,
          })),
          turn: [{ type: 'tool_use', id: 'x' }],
        };
      return { text: JSON.stringify(final) };
    },
  };
  return { llm, requests };
}

describe('the notebook as the memory tool sees it (phase 6.5)', () => {
  it('views, creates, edits, inserts, renames and trashes notes', () => {
    const { mentorDoc } = project();
    const memory = projectMemory({ mentorDoc, sources: ['m1'] });
    expect(memory.run({ command: 'view', path: '/memories' }).text).toContain('(empty)');
    memory.run({
      command: 'create',
      path: '/memories/projet/grand-pere.md',
      file_text: 'Grand-père marin.',
    });
    memory.run({
      command: 'str_replace',
      path: '/memories/projet/grand-pere.md',
      old_str: 'marin',
      new_str: 'marin à Saint-Pierre',
    });
    memory.run({
      command: 'insert',
      path: '/memories/projet/grand-pere.md',
      insert_line: 1,
      insert_text: 'Source de l’intention du livre.',
    });
    expect(memory.run({ command: 'view', path: '/memories/projet/grand-pere.md' }).text).toBe(
      '     1\tGrand-père marin à Saint-Pierre.\n     2\tSource de l’intention du livre.',
    );
    memory.run({
      command: 'rename',
      old_path: '/memories/projet/grand-pere.md',
      new_path: '/memories/projet/famille.md',
    });
    expect(memory.index()).toBe('/memories/projet/famille.md: Grand-père marin à Saint-Pierre.');
    expect(findNote(mentorDoc, '/memories/projet/famille.md')?.sources).toEqual(['m1']);
    memory.run({ command: 'delete', path: '/memories/projet/famille.md' });
    expect(listNotes(mentorDoc)).toEqual([]);
  });

  it('refuses lines of the novel, secrets, long notes, other places, and the author’s notes', () => {
    const { mentorDoc } = project();
    const memory = projectMemory({ mentorDoc });
    const create = (path: string, file_text: string) =>
      memory.run({ command: 'create', path, file_text });
    expect(create('/memories/projet/a.md', '— Tu viens ? dit-elle.').isError).toBe(true);
    expect(create('/memories/projet/b.md', 'Sa clé : sk-ant-api03-xyz').isError).toBe(true);
    expect(create('/memories/projet/c.md', 'x'.repeat(2001)).isError).toBe(true);
    expect(create('/etc/passwd', 'x').isError).toBe(true);
    expect(create('/memories/../x.md', 'x').isError).toBe(true);
    const id = (() => {
      create('/memories/auteur/accompagnement.md', 'Aime les questions directes.');
      return findNote(mentorDoc, '/memories/auteur/accompagnement.md')?.id ?? '';
    })();
    authorEditNote(mentorDoc, id, 'Aime les questions directes, pas les compliments.', AUTHOR);
    const refused = memory.run({ command: 'delete', path: '/memories/auteur/accompagnement.md' });
    expect(refused).toMatchObject({ isError: true });
    expect(memory.index()).toContain('(author, read only)');
  });

  it('runs the model’s calls, sends its turn back, and returns its answer', async () => {
    const { mentorDoc } = project();
    const { llm, requests } = scriptedLlm(
      [[{ command: 'create', path: '/memories/projet/x.md', file_text: 'Un fait.' }]],
      { ok: true },
    );
    const response = await generateWithMemory(
      llm,
      {
        system: 's',
        messages: [{ role: 'user', content: 'u' }],
        maxOutputTokens: 100,
        tier: 'deep',
      },
      projectMemory({ mentorDoc }),
    );
    expect(JSON.parse(response.text)).toEqual({ ok: true });
    expect(requests).toHaveLength(2);
    expect(requests[1]?.messages.at(-2)).toEqual({
      role: 'assistant',
      content: [{ type: 'provider_turn', turn: [{ type: 'tool_use', id: 'x' }] }],
    });
    expect(requests[1]?.messages.at(-1)).toEqual({
      role: 'user',
      // The latest results are the loop's cache point.
      stable: true,
      content: [
        {
          type: 'tool_result',
          callId: 'c1-0',
          content: 'File created successfully at: /memories/projet/x.md',
        },
      ],
    });
    expect(findNote(mentorDoc, '/memories/projet/x.md')?.text).toBe('Un fait.');
  });
});

describe('one Compagnon: each mode knows what was said in the other (D-35)', () => {
  it('lets the conversation hear the interview, and keeps a note from it', async () => {
    const { root, mentorDoc } = project();
    addInterviewMessage(mentorDoc, { role: 'author', text: 'Mon grand-père était marin.' }, AUTHOR);
    await new Promise((resolve) => setTimeout(resolve, 5));
    addChatMessage(
      mentorDoc,
      { role: 'author', text: 'Qu’avais-je dit de mon grand-père ?' },
      AUTHOR,
    );
    const { llm, requests } = scriptedLlm(
      [[{ command: 'create', path: '/memories/projet/grand-pere.md', file_text: 'Marin.' }]],
      { reply: 'Qu’il était marin.', example: null, styleChoiceId: null },
    );
    await answerAuthor({ llm, root, mentorDoc });
    const said = JSON.stringify(requests[0]?.messages);
    expect(said).toContain('(in the interview) Mon grand-père était marin.');
    expect(requests[0]?.system).toContain('YOUR NOTEBOOK');
    expect(requests[0]?.system).toContain('PRECEDENCE');
    expect(chatMessages(mentorDoc).at(-1)?.text).toBe('Qu’il était marin.');
    const note = findNote(mentorDoc, '/memories/projet/grand-pere.md');
    expect(note?.sources).toEqual([chatMessages(mentorDoc)[0]?.id]);
  });

  it('lets the interview hear the conversation, and read the notebook’s index', async () => {
    const { root, mentorDoc } = project();
    const memory = projectMemory({ mentorDoc });
    memory.run({
      command: 'create',
      path: '/memories/auteur/rythme.md',
      file_text: 'Écrit le matin.',
    });
    addChatMessage(mentorDoc, { role: 'author', text: 'Je veux un ton nuancé.' }, AUTHOR);
    await new Promise((resolve) => setTimeout(resolve, 5));
    addInterviewMessage(mentorDoc, { role: 'author', text: 'Parlons du projet.' }, AUTHOR);
    const { llm, requests } = scriptedLlm([], {
      reply: 'D’accord.',
      question: null,
      why: null,
      proposals: [],
    });
    await interviewTurn({ llm, root, mentorDoc, mode: 'free' });
    expect(JSON.stringify(requests[0]?.messages)).toContain(
      '(in the conversation about the text) Je veux un ton nuancé.',
    );
    // The notebook, short, goes whole with the turn; the system prompt stays the same.
    expect(JSON.stringify(requests[0]?.messages.at(-1))).toContain(
      '/memories/auteur/rythme.md\\nÉcrit le matin.',
    );
  });

  it('reads the whole thread at first, while the notebook is empty, then the last messages', async () => {
    const { root, mentorDoc } = project();
    for (let i = 0; i < 40; i++)
      addInterviewMessage(mentorDoc, { role: 'author', text: `Parole ${i}` }, AUTHOR);
    const answer = { reply: 'Bien.', question: null, why: null, proposals: [] };
    const first = scriptedLlm(
      [
        [
          {
            command: 'create',
            path: '/memories/projet/debut.md',
            file_text: 'Parole 0 : le début.',
          },
        ],
      ],
      answer,
    );
    await interviewTurn({ llm: first.llm, root, mentorDoc, mode: 'free' });
    // All 40 messages: 39 before, the last one with the turn (same instant: order not checked).
    expect(first.requests[0]?.messages).toHaveLength(40);
    expect(JSON.stringify(first.requests[0]?.messages.at(-1))).toContain('YOUR NOTEBOOK IS EMPTY');

    addInterviewMessage(mentorDoc, { role: 'author', text: 'Et maintenant ?' }, AUTHOR);
    const next = scriptedLlm([], answer);
    await interviewTurn({ llm: next.llm, root, mentorDoc, mode: 'free' });
    // A window of the thread now (its start moves by steps of 20): the notebook holds the rest.
    const sent = next.requests[0]?.messages ?? [];
    expect(sent.length).toBeLessThan(43);
    expect(sent.length).toBeGreaterThanOrEqual(30);
    expect(JSON.stringify(sent.at(-1))).not.toContain('YOUR NOTEBOOK IS EMPTY');
    expect(JSON.stringify(sent.at(-1))).toContain('Parole 0 : le début.');
  });

  it('moves the thread’s window by steps, its start the same from call to call (prompt cache)', () => {
    const { mentorDoc } = project();
    const memory = projectMemory({ mentorDoc });
    memory.run({ command: 'create', path: '/memories/projet/a.md', file_text: 'Un fait.' });
    const thread = Array.from({ length: 59 }, (_, i) => i);
    const starts = [50, 51, 55, 59].map((n) => threadWindow(thread.slice(0, n), memory, 30)[0]);
    expect(starts).toEqual([20, 20, 20, 20]);
    expect(
      threadWindow(
        Array.from({ length: 60 }, (_, i) => i),
        memory,
        30,
      )[0],
    ).toBe(20);
    expect(
      threadWindow(
        Array.from({ length: 70 }, (_, i) => i),
        memory,
        30,
      )[0],
    ).toBe(40);
  });

  it('reads the Atelier in the same tree, read only', () => {
    const { root, mentorDoc } = project();
    createEntity(root, 'characters', { name: 'Hélène', occupation: 'batelière' });
    const memory = projectMemory({ mentorDoc, root });
    expect(memory.run({ command: 'view', path: '/memories' }).text).toContain('/memories/atelier/');
    expect(
      memory.run({ command: 'view', path: '/memories/atelier/personnages/helene.md' }).text,
    ).toContain('occupation (validated): batelière');
    expect(
      memory.run({ command: 'create', path: '/memories/atelier/personnages/x.md', file_text: 'x' }),
    ).toMatchObject({ isError: true });
    expect(atelierContext(memory)).toContain('name (validated): Hélène');
  });
});
