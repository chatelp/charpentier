import type { AnswerPhaseEvent, LlmService } from '@charpentier/platform';
import {
  addChatMessage,
  addInterviewMessage,
  AUTHOR,
  chatMessages,
  guids,
  initProject,
  interviewMessages,
} from '@charpentier/schema';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { AgentWorks, type AgentDocuments } from './works';

/** The documents of one project, held in memory. */
function project() {
  const docs = new Map<string, Y.Doc>();
  const store: AgentDocuments = {
    acquire: (guid) => {
      const doc = docs.get(guid) ?? new Y.Doc({ guid });
      docs.set(guid, doc);
      return doc;
    },
    release: () => {},
  };
  const root = store.acquire(guids.project('p1'), 'test') as Y.Doc;
  initProject(root, { id: 'p1', title: 'Les serres', kind: 'novel' });
  const mentorDoc = store.acquire(guids.mentor('p1'), 'test') as Y.Doc;
  return { store, root, mentorDoc };
}

const reply = JSON.stringify({ reply: 'Que veut Hélène ?', example: null });
const turn = JSON.stringify({
  reply: 'Je note : batelière.',
  question: null,
  why: null,
  proposals: [],
});

/** A model that tells its first words, answers what it is given, and records the phases seen. */
function model(answers: string[], seen: string[]) {
  const llm: LlmService = {
    status: () => 'available',
    onStatusChange: () => () => {},
    generate: async (_request, _signal, progress) => {
      seen.push('model called');
      await new Promise((resolve) => setTimeout(resolve, 1));
      progress?.('text');
      return { text: answers.shift() ?? reply };
    },
  };
  return llm;
}

/** A model that thinks until it is stopped. */
const endless: LlmService = {
  status: () => 'available',
  onStatusChange: () => () => {},
  generate: (_request, signal) =>
    new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new Error('Request was aborted.')));
    }),
};

describe('the phases of an answer (DESIGN 1.34)', () => {
  it('follow the engine: thinking, the first words, the guardrails, each attempt again', async () => {
    const { store, mentorDoc } = project();
    addChatMessage(mentorDoc, { role: 'author', text: 'Ma scène est-elle trop lente ?' }, AUTHOR);
    const seen: string[] = [];
    // The first answer cannot be read: asked again, from the start.
    const works = new AgentWorks(model(['pas du JSON', reply], seen), store);
    works.onAnswerPhase((event: AnswerPhaseEvent) =>
      seen.push(`${event.projectId}: ${event.phase ?? 'done'}`),
    );
    expect(await works.ask({ projectId: 'p1' })).toBe('answered');
    expect(seen).toEqual([
      'p1: thinking',
      'model called',
      'p1: writing',
      'p1: reviewing',
      'p1: thinking',
      'model called',
      'p1: writing',
      'p1: reviewing',
      'p1: done',
    ]);
    expect(chatMessages(mentorDoc).at(-1)?.text).toBe('Que veut Hélène ?');
  });

  it('are the interview’s too', async () => {
    const { store, mentorDoc } = project();
    addInterviewMessage(mentorDoc, { role: 'author', text: 'Hélène est batelière.' }, AUTHOR);
    const seen: string[] = [];
    const works = new AgentWorks(model([turn], seen), store);
    works.onAnswerPhase((event) => seen.push(event.phase ?? 'done'));
    expect(await works.interview({ projectId: 'p1', mode: 'free' })).toBe('answered');
    expect(seen).toEqual(['thinking', 'model called', 'writing', 'reviewing', 'done']);
  });
});

describe('« Arrêter » (DESIGN 1.34)', () => {
  it('stops the conversation’s answer: nothing is written, the phase ends', async () => {
    const { store, mentorDoc } = project();
    addChatMessage(mentorDoc, { role: 'author', text: 'Ma scène est-elle trop lente ?' }, AUTHOR);
    const works = new AgentWorks(endless, store);
    const phases: (string | null)[] = [];
    works.onAnswerPhase((event) => phases.push(event.phase));
    const before = Y.encodeStateVector(mentorDoc);
    const answer = works.ask({ projectId: 'p1' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    works.stopAnswer({ projectId: 'p1' });
    expect(await answer).toBe('stopped');
    expect(phases).toEqual(['thinking', null]);
    // Not one change to the mentor document: the author's message waits, unanswered.
    expect(Y.encodeStateVector(mentorDoc)).toEqual(before);
    expect(chatMessages(mentorDoc).map((m) => m.role)).toEqual(['author']);
  });

  it('stops the interview’s, even while it waits behind a reading', async () => {
    const { store, mentorDoc } = project();
    addInterviewMessage(mentorDoc, { role: 'author', text: 'Hélène est batelière.' }, AUTHOR);
    const seen: string[] = [];
    const works = new AgentWorks(model([turn], seen), store);
    // A reading of a scene runs first: the interview queues behind it.
    const reading = works.analyze({ projectId: 'p1', sceneIds: ['none'], automatic: false });
    const answer = works.interview({ projectId: 'p1', mode: 'free' });
    works.stopAnswer({ projectId: 'p1' });
    expect(await answer).toBe('stopped');
    await reading;
    expect(seen).toEqual([]);
    expect(interviewMessages(mentorDoc).map((m) => m.role)).toEqual(['author']);
    // Nothing is left stopped: the next answer comes.
    expect(await works.interview({ projectId: 'p1', mode: 'free' })).toBe('answered');
    expect(interviewMessages(mentorDoc).map((m) => m.role)).toEqual(['author', 'compagnon']);
  });

  it('does not stop the background works, nor them it', async () => {
    const { store, mentorDoc } = project();
    addChatMessage(mentorDoc, { role: 'author', text: 'Ma scène est-elle trop lente ?' }, AUTHOR);
    const seen: string[] = [];
    const works = new AgentWorks(model([], seen), store);
    const answer = works.ask({ projectId: 'p1' });
    works.stopDeepWork({ projectId: 'p1' });
    expect(await answer).toBe('answered');
  });
});
