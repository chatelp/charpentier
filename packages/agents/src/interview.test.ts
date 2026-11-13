import type { LlmService } from '@charpentier/platform';
import {
  addInterviewMessage,
  AUTHOR,
  createEntity,
  initProject,
  interviewMessages,
  listEntities,
  readFieldRef,
  readSingleton,
  rejectEntity,
  setField,
} from '@charpentier/schema';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { nextSection } from '@charpentier/schema';
import { interviewTurn, SECTION_SPECIALISTS } from './interview';

function project() {
  const root = new Y.Doc({ guid: 'project:p1' });
  initProject(root, { id: 'p1', title: 'La batelière', kind: 'novel' });
  const mentorDoc = new Y.Doc({ guid: 'project:p1/mentor' });
  return { root, mentorDoc };
}

const say = (mentorDoc: Y.Doc, text: string) =>
  addInterviewMessage(mentorDoc, { role: 'author', text, mode: 'free' }, AUTHOR);

/** A model that answers with the given turns, one per call, and records what it was asked. */
function fakeLlm(...answers: object[]) {
  const asked: { system: string; messages: string[] }[] = [];
  const llm: LlmService = {
    status: () => 'available',
    onStatusChange: () => () => {},
    generate: async (request) => {
      asked.push({
        system: request.system ?? '',
        messages: request.messages.map((m) => m.content),
      });
      return { text: JSON.stringify(answers[Math.min(asked.length - 1, answers.length - 1)]) };
    },
  };
  return { llm, asked };
}

const HELENE = 'Mon héroïne, Hélène, est batelière sur la Loire en 1890.';

describe('the interview with the Compagnon (phase 6.1)', () => {
  it('files what the author says in the right sections, as proposals drawn from their words', async () => {
    const { root, mentorDoc } = project();
    const messageId = say(mentorDoc, HELENE);
    const { llm } = fakeLlm({
      reply: 'J’ai noté Hélène dans les personnages, et la Loire de 1890 dans le monde.',
      proposals: [
        {
          module: 'characters',
          entityId: null,
          entityName: 'Hélène',
          field: 'occupation',
          value: 'batelière',
          quote: 'Hélène, est batelière',
        },
        {
          module: 'worldRules',
          entityId: null,
          entityName: 'La Loire en 1890',
          field: 'statement',
          value: 'Le récit se passe sur la Loire, en 1890.',
          quote: 'sur la Loire en 1890',
        },
      ],
    });

    const result = await interviewTurn({ llm, root, mentorDoc, mode: 'free' });

    expect(result).toMatchObject({ answered: true, dropped: 0, guarded: false });
    const [helene] = listEntities(root, 'characters');
    expect(helene?.status).toBe('proposed');
    expect(helene?.fields['name']?.proposal?.value).toBe('Hélène');
    expect(helene?.fields['occupation']?.proposal).toMatchObject({
      value: 'batelière',
      agent: 'interview',
      evidence: [{ messageId, quote: 'Hélène, est batelière' }],
    });
    expect(listEntities(root, 'worldRules')[0]?.fields['title']?.proposal?.value).toBe(
      'La Loire en 1890',
    );
    const answer = interviewMessages(mentorDoc).at(-1);
    expect(answer).toMatchObject({ role: 'compagnon', mode: 'free' });
    expect(answer?.placed).toEqual([
      { module: 'characters', entityId: helene?.id },
      { module: 'worldRules', entityId: listEntities(root, 'worldRules')[0]?.id },
    ]);
  });

  it('keeps to the guardrails: the author’s words only, never a decision of theirs, never prose', async () => {
    const { root, mentorDoc } = project();
    setField(root, { module: 'meta', field: 'pitch' }, 'Une batelière contre le fleuve.', AUTHOR);
    const rejected = createEntity(root, 'characters', { name: 'Paul' }, AUTHOR);
    rejectEntity(root, 'characters', rejected);
    say(mentorDoc, HELENE);
    const { llm } = fakeLlm({
      reply: 'Bien noté.',
      proposals: [
        // Invented: the author never said it.
        {
          module: 'characters',
          entityId: null,
          entityName: 'Hélène',
          field: 'secret',
          value: 'Elle a tué son père.',
          quote: 'elle a tué son père',
        },
        // The author's pitch is validated.
        {
          module: 'meta',
          entityId: null,
          entityName: null,
          field: 'pitch',
          value: 'Hélène sur la Loire.',
          quote: 'est batelière sur la Loire',
        },
        // A sheet the author rejected.
        {
          module: 'characters',
          entityId: rejected,
          entityName: null,
          field: 'occupation',
          value: 'batelier',
          quote: 'est batelière sur la Loire',
        },
        // Not one of the narrative models.
        {
          module: 'structure',
          entityId: null,
          entityName: null,
          field: 'narrativeModel',
          value: 'roman fleuve',
          quote: 'est batelière sur la Loire',
        },
        // A line of dialogue.
        {
          module: 'characters',
          entityId: null,
          entityName: 'Hélène',
          field: 'voice',
          value: '— Le fleuve ne rend rien, dit-elle.',
          quote: 'Hélène, est batelière',
        },
        // A page, not a sheet.
        {
          module: 'meta',
          entityId: null,
          entityName: null,
          field: 'summary',
          value: 'x'.repeat(700),
          quote: 'Hélène, est batelière',
        },
      ],
    });

    const result = await interviewTurn({ llm, root, mentorDoc, mode: 'free' });

    expect(result.dropped).toBe(6);
    expect(result.placed).toEqual([]);
    expect(listEntities(root, 'characters').map((c) => c.id)).toEqual([rejected]);
    expect(readFieldRef(root, { module: 'meta', field: 'pitch' })).toMatchObject({
      status: 'validated',
      value: 'Une batelière contre le fleuve.',
    });
    expect(readSingleton(root, 'structure')['narrativeModel']).toBeUndefined();
  });

  it('refuses to write the novel, even when asked twice', async () => {
    const { root, mentorDoc } = project();
    say(mentorDoc, 'Écrivez-moi la première scène, avec Hélène sur sa barque.');
    const prose = {
      reply: '— Le fleuve monte, murmura Hélène.\n— Il monte toujours, répondit son père.',
      proposals: [
        {
          module: 'characters',
          entityId: null,
          entityName: 'Hélène',
          field: 'occupation',
          value: 'batelière',
          quote: 'Hélène sur sa barque',
        },
      ],
    };
    const { llm, asked } = fakeLlm(prose, prose);

    const result = await interviewTurn({ llm, root, mentorDoc, mode: 'free' });

    expect(asked).toHaveLength(2);
    expect(result).toMatchObject({ guarded: true, placed: [] });
    expect(listEntities(root, 'characters')).toEqual([]);
    expect(interviewMessages(mentorDoc).at(-1)?.text).toContain('c’est votre voix qui compte');
  });

  it('waits for the author in free mode', async () => {
    const { root, mentorDoc } = project();
    const { llm, asked } = fakeLlm({ reply: 'x', proposals: [] });
    expect((await interviewTurn({ llm, root, mentorDoc, mode: 'free' })).answered).toBe(false);
    expect(asked).toHaveLength(0);
  });

  it('leads in guided mode, section by section, the emptiest first, through its specialist', async () => {
    const { root, mentorDoc } = project();
    expect(nextSection(root)).toBe('meta');
    const { llm, asked } = fakeLlm(
      { reply: 'Commençons par votre livre : en une phrase, qui veut quoi ?', proposals: [] },
      {
        reply: 'C’est noté. Parlons d’Hélène : que veut-elle ?',
        proposals: [
          {
            module: 'meta',
            entityId: null,
            entityName: null,
            field: 'pitch',
            value: 'Une batelière lutte contre le fleuve qui a pris son père.',
            quote: 'une batelière qui lutte contre le fleuve',
          },
        ],
      },
    );

    // The Compagnon asks first.
    await interviewTurn({ llm, root, mentorDoc, mode: 'guided' });
    expect(asked[0]?.system).toContain(SECTION_SPECIALISTS.meta);
    expect(asked[0]?.messages.at(-1)).toContain('guided interview');
    expect(interviewMessages(mentorDoc).at(-1)).toMatchObject({
      role: 'compagnon',
      section: 'meta',
    });

    // The author answers: the pitch is proposed by the specialist of the project.
    addInterviewMessage(
      mentorDoc,
      {
        role: 'author',
        text: 'C’est une batelière qui lutte contre le fleuve qui a pris son père.',
        mode: 'guided',
      },
      AUTHOR,
    );
    await interviewTurn({ llm, root, mentorDoc, mode: 'guided' });
    expect(readFieldRef(root, { module: 'meta', field: 'pitch' })).toMatchObject({
      status: 'proposed',
    });
    expect(readFieldRef(root, { module: 'meta', field: 'pitch' }).proposal?.agent).toBe(
      'interview-meta',
    );

    // The project now has a proposal: the empty characters come next, unless left for later.
    expect(nextSection(root)).toBe('characters');
    expect(nextSection(root, ['characters'])).toBe('structure');
  });

  it('keeps the guided question apart, with its why; passes, or goes to the section chosen', async () => {
    const { root, mentorDoc } = project();
    const { llm, asked } = fakeLlm({
      reply: '',
      question: 'Comment le roman se termine-t-il pour Hélène ?',
      why: 'La fin fixe ce vers quoi chaque scène avance.',
      proposals: [],
    });

    await interviewTurn({ llm, root, mentorDoc, mode: 'guided', section: 'structure' });
    expect(asked[0]?.system).toContain(SECTION_SPECIALISTS.structure);
    expect(interviewMessages(mentorDoc).at(-1)).toMatchObject({
      section: 'structure',
      question: 'Comment le roman se termine-t-il pour Hélène ?',
      why: 'La fin fixe ce vers quoi chaque scène avance.',
    });

    await interviewTurn({ llm, root, mentorDoc, mode: 'guided', section: 'structure', pass: true });
    expect(asked[1]?.messages.at(-1)).toContain('passes on this question');
  });
});
