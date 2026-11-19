import type { LlmRequest, LlmService } from '@charpentier/platform';
import {
  addInterviewMessage,
  AUTHOR,
  authorWriteNote,
  createChapter,
  createScene,
  initProject,
  parseSceneMarkdown,
  readThreadSummary,
  variantFragment,
  writeSceneDocToFragment,
  type ThreadMessage,
} from '@charpentier/schema';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { analyzeScene } from './analysis';
import { interviewTurn } from './interview';
import {
  leavingAlert,
  leavingSoon,
  notebookForReading,
  projectMemory,
  stableThread,
  windowStart,
} from './memory';
import { keepThreadSummary, MAX_SUMMARY } from './thread-summary';

/** A model that summarizes (light calls) and answers the interview (deep ones). */
function model(fail = false) {
  const requests: LlmRequest[] = [];
  let summaries = 0;
  const llm: LlmService = {
    status: () => 'available',
    onStatusChange: () => () => {},
    generate: async (request) => {
      requests.push(request);
      if (request.tier === 'fast') {
        if (fail) throw new Error('offline');
        return { text: JSON.stringify({ summary: `Résumé ${++summaries}` }) };
      }
      return {
        text: JSON.stringify({ reply: 'Bien.', question: null, why: null, proposals: [] }),
      };
    },
  };
  return { llm, requests };
}

const thread = (n: number): ThreadMessage[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    at: `2026-11-${String(1 + Math.floor(i / 50)).padStart(2, '0')}T10:${String(i % 50).padStart(2, '0')}:00Z`,
    mode: 'interview',
    role: i % 2 ? 'compagnon' : 'author',
    text: `Parole ${i}`,
  }));

const withNote = () => {
  const mentorDoc = new Y.Doc();
  authorWriteNote(mentorDoc, {
    path: '/memories/projet/decisions/fin.md',
    text: '# La fin reste ouverte',
  });
  return mentorDoc;
};

describe('the thread’s rolling summary (phase 6.5)', () => {
  it('marks a summary cut at its bound, never in silence', async () => {
    const mentorDoc = new Y.Doc();
    const llm: LlmService = {
      status: () => 'available',
      onStatusChange: () => () => {},
      generate: async () => ({
        text: JSON.stringify({ summary: 'L’auteur a décidé la fin. '.repeat(400) }),
      }),
    };
    const text = await keepThreadSummary({
      llm,
      mentorDoc,
      thread: thread(40),
      start: 20,
      language: 'fr',
    });
    expect(text?.length).toBeLessThanOrEqual(MAX_SUMMARY);
    expect(text?.endsWith('la fin. […]')).toBe(true);
    expect(readThreadSummary(mentorDoc)?.text).toBe(text);
  });

  it('summarizes what left the window, a block at a time, from the summary so far', async () => {
    const mentorDoc = new Y.Doc();
    const { llm, requests } = model();
    const all = thread(80);
    const keep = (start: number) =>
      keepThreadSummary({ llm, mentorDoc, thread: all, start, language: 'fr' });

    // Nothing left the window: no call.
    expect(await keep(0)).toBeUndefined();
    expect(requests).toHaveLength(0);

    // The first block left: one light call over its 20 messages.
    expect(await keep(20)).toBe('Résumé 1');
    expect(requests[0]?.tier).toBe('fast');
    const first = String(requests[0]?.messages[0]?.content);
    expect(first).toContain('Parole 0');
    expect(first).toContain('Parole 19');
    expect(first).not.toContain('Parole 20');
    expect(readThreadSummary(mentorDoc)).toMatchObject({ upTo: 'm19', covered: 20 });

    // Same window: the summary kept, no call.
    expect(await keep(20)).toBe('Résumé 1');
    expect(requests).toHaveLength(1);

    // The next block: the summary so far, and only the new messages.
    expect(await keep(40)).toBe('Résumé 2');
    const second = String(requests[1]?.messages[0]?.content);
    expect(second).toContain('Résumé 1');
    expect(second).toContain('Parole 20');
    expect(second).not.toContain('Parole 19]');
    expect(second).not.toMatch(/Parole 1\b/);
  });

  it('keeps the previous summary when the light call fails: the answer does not wait on it', async () => {
    const mentorDoc = new Y.Doc();
    await keepThreadSummary({
      llm: model().llm,
      mentorDoc,
      thread: thread(60),
      start: 20,
      language: 'fr',
    });
    const failing = model(true);
    expect(
      await keepThreadSummary({
        llm: failing.llm,
        mentorDoc,
        thread: thread(60),
        start: 40,
        language: 'fr',
      }),
    ).toBe('Résumé 1');
    expect(readThreadSummary(mentorDoc)?.upTo).toBe('m19');
  });

  it('warns the Compagnon before the oldest messages sent go, so that he notes what matters', () => {
    const memory = projectMemory({ mentorDoc: withNote() });
    expect(windowStart(65, memory, 30)).toBe(20);
    expect(leavingSoon(60, memory, 30)).toBe(0);
    // Four messages before the window moves: its first 20 are about to go.
    expect(leavingSoon(66, memory, 30)).toBe(20);
    expect(leavingAlert(20, { text: 'Parole 20' })).toContain('THE FIRST 20 MESSAGES');
    expect(leavingAlert(0)).toBe('');
    // While the notebook is empty, the whole thread is read: no alert.
    expect(leavingSoon(66, projectMemory({ mentorDoc: new Y.Doc() }), 30)).toBe(0);
  });

  it('sends the summary first, in the cached part, and the alert with the last words', async () => {
    const root = new Y.Doc({ guid: 'project:p' });
    initProject(root, { id: 'p', title: 'Saint-Pierre', kind: 'novel' });
    const mentorDoc = withNote();
    for (let i = 0; i < 66; i++)
      addInterviewMessage(mentorDoc, { role: 'author', text: `Parole ${i}` }, AUTHOR);
    const { llm, requests } = model();
    await interviewTurn({ llm, root, mentorDoc, mode: 'free' });
    // A light call for the block that left, then the answer.
    expect(requests.map((r) => r.tier)).toEqual(['fast', 'deep']);
    const sent = requests[1]?.messages ?? [];
    // The Atelier and the notebook first, then the summary: both in the cached part.
    expect(String(sent[0]?.content)).toContain('<notebook>');
    expect(String(sent[1]?.content)).toContain('<earlier-thread>\nRésumé 1');
    expect(sent.filter((m) => m.stable)).toHaveLength(2);
    expect(String(sent.at(-1)?.content)).toContain('THE FIRST 20 MESSAGES');
    expect(String(sent.at(-1)?.content)).not.toContain('earlier-thread');
  });

  it('puts the summary before the thread, the last past turn marked for the cache', () => {
    const turns = stableThread(
      [
        { role: 'assistant', content: 'Bonjour.' },
        { role: 'user', content: 'Oui.' },
      ],
      'Résumé',
    );
    expect(turns[0]?.content).toContain('<earlier-thread>\nRésumé');
    expect(turns.map((t) => !!t.stable)).toEqual([false, false, true]);
    // Starting with the author: the summary goes in the same message.
    expect(stableThread([{ role: 'user', content: 'Oui.' }], 'Résumé')).toHaveLength(1);
    expect(stableThread([{ role: 'user', content: 'Oui.' }])[0]?.content).toBe('Oui.');
  });
});

describe('the notebook read by the works that do not write it (phase 6.5)', () => {
  it('goes to a scene’s analysis, the author’s notes first, and nothing when empty', async () => {
    const mentorDoc = withNote();
    expect(notebookForReading(new Y.Doc())).toBe('');
    expect(notebookForReading(mentorDoc)).toContain('La fin reste ouverte');

    const root = new Y.Doc({ guid: 'project:p1' });
    initProject(root, { id: 'p1', title: 'Les serres', kind: 'novel' });
    const chapterId = createChapter(root, { title: 'Un' });
    const { sceneId, variantId } = createScene(root, { chapterId, title: 'Le sas' });
    const sceneDoc = new Y.Doc();
    writeSceneDocToFragment(
      parseSceneMarkdown('Il pleuvait sur Nantes.'),
      variantFragment(sceneDoc, variantId),
    );
    let sent = '';
    const llm: LlmService = {
      status: () => 'available',
      onStatusChange: () => () => {},
      generate: async (request) => {
        sent = String(request.messages[0]?.content);
        return {
          text: JSON.stringify({
            characters: [],
            worldRules: [],
            clues: [],
            knowledge: [],
            conflicts: [],
            remarks: [],
          }),
        };
      },
    };
    await analyzeScene({ llm, root, sceneDoc, sceneId, level: 1, mentorDoc });
    expect(sent).toContain('La fin reste ouverte');
    expect(sent).toContain('Il pleuvait sur Nantes.');
  });
});
