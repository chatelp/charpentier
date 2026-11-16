import type { LlmService } from '@charpentier/platform';
import {
  addChatMessage,
  AUTHOR,
  chatMessages,
  createEntity,
  initProject,
  interviewMessages,
  listEntities,
  readFieldRef,
} from '@charpentier/schema';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { sheetsSummary } from './context';
import { answerAuthor } from './conversation';
import {
  drawExtracts,
  echoes,
  echoIndex,
  estimateStyle,
  measureStyle,
  readReference,
  splitChapters,
  type ReferenceText,
} from './style-reference';

/** A short book of our own: three chapters, narration and dialogue. */
const BOOK = `Chapitre 1

La péniche glissait sous les saules. Marthe tenait la barre depuis l'aube, les mains gercées par le froid.

— Tu ne dors donc jamais ? demanda le passeur.

Elle haussa les épaules. Le fleuve décidait pour elle.

Chapitre 2

Au matin, la brume couvrait l'écluse. Personne. Un chien aboyait quelque part sur la rive gauche, très loin, comme on aboie dans les rêves.

Marthe attendit longtemps avant de comprendre que l'éclusier ne viendrait plus.

Chapitre 3

Elle repartit seule. Le courant était fort. La péniche dérivait vers la ville, et Marthe ne la retenait pas.`;

const reference = (): ReferenceText => ({
  title: 'La péniche',
  author: 'Anne Essai',
  chapters: splitChapters(BOOK),
});

function project() {
  const root = new Y.Doc({ guid: 'project:p1' });
  initProject(root, { id: 'p1', title: 'La batelière', kind: 'novel' });
  return { root, mentorDoc: new Y.Doc() };
}

function fakeLlm(output: unknown) {
  const asked: { system: string; user: string }[] = [];
  const llm: LlmService = {
    status: () => 'available',
    onStatusChange: () => () => {},
    generate: async (request) => {
      asked.push({
        system: request.system,
        user: request.messages.map((m) => m.content).join('\n'),
      });
      return { text: JSON.stringify(output) };
    },
  };
  return { llm, asked };
}

describe('reference texts and style choices (phase 6.4)', () => {
  it('cuts a plain text into chapters at its headings', () => {
    const chapters = splitChapters(BOOK);
    expect(chapters).toHaveLength(3);
    expect(chapters[0]).toMatch(/^La péniche glissait/);
    expect(chapters.join('\n')).not.toContain('Chapitre');
    expect(splitChapters('Une seule page, sans titre.')).toEqual(['Une seule page, sans titre.']);
  });

  it('measures sentences, dialogue and person on the device', () => {
    const m = measureStyle(reference());
    expect(m.language).toBe('fr');
    expect(m.chapters).toBe(3);
    expect(m.sentences).toBe(12);
    expect(m.sentenceMean).toBeGreaterThan(5);
    expect(m.dialogueShare).toBeGreaterThan(0);
    expect(m.dialogueShare).toBeLessThan(0.2);
    expect(m.thirdPerson).toBeGreaterThan(m.firstPerson);
  });

  it('draws openings, endings and passages, never the whole book', () => {
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const extracts = drawExtracts(reference(), random);
    expect(extracts.filter((e) => e.kind === 'opening')).toHaveLength(3);
    expect(extracts.filter((e) => e.kind === 'ending')).toHaveLength(3);
    expect(extracts.some((e) => e.kind === 'middle')).toBe(true);
  });

  it('announces the cost before reading', () => {
    const estimate = estimateStyle(reference(), 'fr');
    expect(estimate.words).toBe(measureStyle(reference()).words);
    expect(estimate.usd).toBeGreaterThan(0);
    expect(estimate.usd).toBeLessThan(estimate.usdMax);
    expect(estimate.seconds[0]).toBeLessThanOrEqual(estimate.seconds[1]);
  });

  it('recognises a run of six words of the source, whatever the case', () => {
    const index = echoIndex(reference());
    expect(echoes('Comme dans le livre : « Le fleuve décidait pour elle. »', index)).toBe(false);
    expect(echoes('Un chien aboyait quelque part sur la rive.', index)).toBe(true);
    expect(echoes('Des phrases courtes, souvent sans verbe.', index)).toBe(false);
  });

  it('files the choices as proposals, from the book, and says so in the interview', async () => {
    const { root, mentorDoc } = project();
    const { llm, asked } = fakeLlm({
      intro: 'J’ai lu La péniche : une narration sobre, au plus près de Marthe.',
      choices: [
        {
          category: 'pointOfView',
          choice: 'Une narration à la troisième personne, collée au regard d’un seul personnage.',
          measure: null,
        },
        {
          category: 'sentences',
          choice: 'Des phrases courtes, souvent sans verbe, qui tombent comme des constats.',
          measure: '8 mots par phrase en moyenne',
        },
      ],
    });
    const result = await readReference({ llm, root, mentorDoc, text: reference() });
    expect(result).toEqual({ proposals: 2, dropped: 0 });
    const sheets = listEntities(root, 'style');
    expect(sheets.map((s) => s.status)).toEqual(['proposed', 'proposed']);
    const ref = (field: string) => ({
      module: 'style' as const,
      // Created in the same millisecond: found by its category, not its rank.
      entityId: sheets.find((e) => e.fields['category']?.proposal?.value === 'sentences')?.id ?? '',
      field,
    });
    expect(readFieldRef(root, ref('category')).proposal?.value).toBe('sentences');
    expect(readFieldRef(root, ref('measure')).proposal?.value).toBe('8 mots par phrase en moyenne');
    expect(readFieldRef(root, ref('source')).proposal?.value).toBe('La péniche, Anne Essai');
    expect(readFieldRef(root, ref('choice')).proposal?.evidence).toEqual([
      { reference: 'La péniche' },
    ]);
    const [message] = interviewMessages(mentorDoc);
    expect(message?.text).toMatch(/^J’ai lu La péniche/);
    expect(message?.placed).toEqual(
      expect.arrayContaining(sheets.map((s) => ({ module: 'style', entityId: s.id }))),
    );
    // The model read extracts and measures, and was told never to quote.
    expect(asked[0]?.user).toContain('MEASURES');
    expect(asked[0]?.system).toMatch(/Never quote the book/);
  });

  it('drops a choice that repeats the book, an invented category, prose, or one already there', async () => {
    const { root, mentorDoc } = project();
    createEntity(root, 'style', {
      category: 'tense',
      choice: 'Le passé simple pour le récit.',
    });
    const { llm } = fakeLlm({
      intro: 'Le livre dit : la péniche dérivait vers la ville, et Marthe ne la retenait pas.',
      choices: [
        {
          category: 'description',
          choice: 'Des images rares, comme un chien aboyait quelque part sur la rive gauche.',
          measure: null,
        },
        { category: 'humour', choice: 'Un humour discret.', measure: null },
        { category: 'dialogue', choice: '— Tu viens ? Le dialogue claque.', measure: null },
        { category: 'tense', choice: 'Le passé simple pour le récit.', measure: null },
        {
          category: 'chapters',
          choice: 'Des chapitres qui finissent sur un geste, sans commentaire.',
          measure: 'x'.repeat(200),
        },
        {
          category: 'register',
          choice: 'Un vocabulaire simple, concret, presque sans adjectifs.',
          measure: null,
        },
      ],
    });
    const result = await readReference({ llm, root, mentorDoc, text: reference() });
    expect(result).toEqual({ proposals: 1, dropped: 5 });
    // The intro repeated the book: the Compagnon's plain message replaces it.
    expect(interviewMessages(mentorDoc)[0]?.text).toBe(
      'J’ai lu « La péniche ». Voici les choix de style que j’y vois ; gardez ceux qui vous parlent.',
    );
  });

  it('reads nothing from an empty text', async () => {
    const { root, mentorDoc } = project();
    const { llm, asked } = fakeLlm({ intro: '', choices: [] });
    expect(
      await readReference({ llm, root, mentorDoc, text: { title: 'Vide', chapters: [] } }),
    ).toBe('nothing-to-read');
    expect(asked).toHaveLength(0);
  });
});

describe('the Compagnon relies on a validated style choice (phase 6.4)', () => {
  it('keeps the id of a validated choice under an answer, never an invented or proposed one', async () => {
    const { root, mentorDoc } = project();
    const present = createEntity(root, 'style', {
      category: 'tense',
      choice: 'le présent de narration',
    });
    const answers = [present, 'invente', null];
    const llm: LlmService = {
      status: () => 'available',
      onStatusChange: () => () => {},
      generate: async () => ({
        text: JSON.stringify({
          reply: 'Vous aviez choisi le présent : pourquoi le passé ici ?',
          example: null,
          styleChoiceId: answers.shift() ?? null,
        }),
      }),
    };
    for (let i = 0; i < 3; i++) {
      addChatMessage(mentorDoc, { role: 'author', text: 'Et ce passage ?' }, AUTHOR);
      await answerAuthor({ llm, root, mentorDoc });
    }
    const replies = chatMessages(mentorDoc).filter((m) => m.role === 'compagnon');
    expect(replies.map((m) => m.styleChoiceId)).toEqual([present, undefined, undefined]);
    // The choices go to the Compagnon with their ids.
    expect(sheetsSummary(root)).toContain(`style [${present}]`);
  });
});
