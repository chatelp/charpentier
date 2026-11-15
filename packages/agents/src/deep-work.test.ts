import type { LlmService } from '@charpentier/platform';
import {
  chatMessages,
  createChapter,
  createEntity,
  createScene,
  getScene,
  initProject,
  listEntities,
  listSignals,
  parseSceneMarkdown,
  readFieldRef,
  readWorkRecord,
  rejectEntity,
  variantFragment,
  writeSceneDocToFragment,
} from '@charpentier/schema';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { deepWork, estimateDeepWork, MAX_DEEP_VALUE, type DeepWorkOutput } from './deep-work';

const SCENES = [
  [
    'Le quai',
    'Hélène attache la barque au quai de Nantes. La lettre de son frère tremble dans sa main.',
  ],
  ['La crue', 'La Loire monte depuis trois jours. Personne ne parle plus de la lettre.'],
  ['Le retour', 'Hélène rentre seule. Elle sait maintenant que son frère a menti.'],
] as const;

/** A short manuscript: two chapters, three scenes, Hélène's sheet validated. */
function manuscript() {
  const root = new Y.Doc({ guid: 'project:p1' });
  initProject(root, { id: 'p1', title: 'La batelière', kind: 'novel' });
  const one = createChapter(root, { title: 'Le départ' });
  const two = createChapter(root, { title: 'Le fleuve' });
  const sceneDocs = new Map<string, Y.Doc>();
  const ids: string[] = [];
  SCENES.forEach(([title, text], i) => {
    const { sceneId, variantId } = createScene(root, { chapterId: i === 0 ? one : two, title });
    const doc = new Y.Doc();
    writeSceneDocToFragment(parseSceneMarkdown(text), variantFragment(doc, variantId));
    sceneDocs.set(sceneId, doc);
    ids.push(sceneId);
  });
  const helene = createEntity(root, 'characters', { name: 'Hélène', occupation: 'batelière' });
  return { root, sceneDocs, ids, helene, mentorDoc: new Y.Doc() };
}

function fakeLlm(output: DeepWorkOutput) {
  const asked: { system: string; user: string; schema: unknown }[] = [];
  const llm: LlmService = {
    status: () => 'available',
    onStatusChange: () => () => {},
    generate: async (request) => {
      asked.push({
        system: request.system,
        user: request.messages.map((m) => m.content).join('\n'),
        schema: request.responseSchema,
      });
      return { text: JSON.stringify(output) };
    },
  };
  return { llm, asked };
}

describe('specialised agents on the whole manuscript (D-27)', () => {
  it('says when the manuscript has not changed since the last run', async () => {
    const m = manuscript();
    const empty = { review: 'Rien.', narrativeModel: null, acts: [], arcs: [], signals: [] };
    await deepWork({ llm: fakeLlm(empty).llm, ...m, task: 'structure' });
    const since = readWorkRecord(m.mentorDoc, { task: 'structure' })?.at;
    expect(estimateDeepWork({ ...m, task: 'structure' })?.unchangedSince).toBe(since);
    expect(estimateDeepWork({ ...m, task: 'clues' })?.unchangedSince).toBeUndefined();
    const doc = m.sceneDocs.get(m.ids[0] ?? '');
    const scene = getScene(m.root, m.ids[0] ?? '');
    doc?.transact(() =>
      writeSceneDocToFragment(
        parseSceneMarkdown('Un autre texte.'),
        variantFragment(doc, scene?.activeVariantId ?? ''),
      ),
    );
    expect(estimateDeepWork({ ...m, task: 'structure' })?.unchangedSince).toBeUndefined();
  });

  it('checks the structure: an abandoned arc signalled where it stops, the missing act proposed', async () => {
    const m = manuscript();
    const [quai, crue, retour] = m.ids as [string, string, string];
    const { llm, asked } = fakeLlm({
      review: 'Le départ tient bien. La lettre du frère disparaît après la crue : est-ce voulu ?',
      narrativeModel: 'threeActs',
      acts: [
        {
          existingId: null,
          title: 'Le départ',
          summary: 'Hélène reçoit la lettre et part.',
          sceneIds: [quai, 'invented-scene'],
          sceneId: quai,
          quote: 'La lettre de son frère',
        },
        {
          existingId: null,
          title: 'Une scène inventée',
          summary: 'Rien.',
          sceneIds: [crue],
          sceneId: crue,
          quote: 'une phrase qui ne figure nulle part',
        },
      ],
      arcs: [
        {
          existingId: null,
          title: 'La lettre du frère',
          kind: 'secondary',
          summary: 'Le mensonge du frère, posé puis laissé.',
          sceneIds: [retour, quai],
          sceneId: quai,
          quote: 'La lettre de son frère',
        },
      ],
      signals: [
        {
          sceneId: crue,
          quote: 'Personne ne parle plus de la lettre',
          kind: 'craft',
          title: 'Un arc qui s’arrête',
          message: 'La lettre s’efface ici. Qu’en reste-t-il pour Hélène ?',
          principle: 'Un fil posé appelle une suite ou un abandon assumé.',
        },
      ],
    });

    const result = await deepWork({ llm, ...m, task: 'structure' });

    expect(asked[0]?.user).toContain(SCENES[1][1]);
    expect(asked[0]?.user).toContain(`<scene id="${crue}"`);
    expect(result).toEqual({ proposals: 3, signals: 1, resolved: 0 });
    const acts = listEntities(m.root, 'acts');
    expect(acts).toHaveLength(1); // The act with an invented passage is left out.
    expect(
      readFieldRef(m.root, { module: 'acts', entityId: acts[0]?.id ?? '', field: 'sceneIds' })
        .proposal?.value,
    ).toEqual([quai]);
    const arc = listEntities(m.root, 'arcs')[0];
    expect(
      readFieldRef(m.root, { module: 'arcs', entityId: arc?.id ?? '', field: 'sceneIds' }).proposal
        ?.value,
    ).toEqual([quai, retour]); // Manuscript order.
    expect(
      readFieldRef(m.root, { module: 'structure', field: 'narrativeModel' }).proposal?.value,
    ).toBe('threeActs');
    const [signal] = listSignals(m.root);
    expect(signal?.textAnchor?.sceneId).toBe(crue);
    expect(signal?.author).toBe('mentor');
    // The Compagnon is the only voice: the review is its message.
    expect(chatMessages(m.mentorDoc).map((c) => [c.role, c.text, c.work])).toEqual([
      [
        'compagnon',
        'Le départ tient bien. La lettre du frère disparaît après la crue : est-ce voulu ?',
        { task: 'structure' },
      ],
    ]);
    // What it left, for the block in the Atelier and the bilan's buttons.
    expect(readWorkRecord(m.mentorDoc, { task: 'structure' })).toMatchObject({
      proposals: 3,
      signalIds: [signal?.id],
      reviewId: chatMessages(m.mentorDoc)[0]?.id,
    });
  });

  it('tracks the clues and never proposes again a clue the author rejected', async () => {
    const m = manuscript();
    const [quai, , retour] = m.ids as [string, string, string];
    const refused = createEntity(m.root, 'clues', { title: 'La barque' });
    rejectEntity(m.root, 'clues', refused);
    const clue = (title: string, quote: string) => ({
      existingId: null,
      title,
      kind: 'clue',
      description: 'Le frère a menti sur la date de son retour.',
      plantedIn: [quai],
      appearsIn: [],
      resolvedIn: [retour],
      sceneId: quai,
      quote,
    });
    const { llm } = fakeLlm({
      review: 'La lettre est bien posée et bien résolue.',
      clues: [
        clue('La lettre du frère', 'La lettre de son frère'),
        clue('La barque', 'attache la barque'),
      ],
      signals: [],
    });
    await deepWork({ llm, ...m, task: 'clues' });
    const clues = listEntities(m.root, 'clues');
    expect(clues.map((c) => c.status).sort()).toEqual(['proposed', 'rejected']);
    const letter = clues.find((c) => c.status === 'proposed');
    expect(
      letter?.fields['plantedIn']?.proposal?.value ?? letter?.fields['plantedIn']?.value,
    ).toEqual([quai]);
  });

  it('takes stock of a character, without touching a validated field', async () => {
    const m = manuscript();
    const [quai, , retour] = m.ids as [string, string, string];
    const { llm, asked } = fakeLlm({
      review: 'Hélène veut la vérité, et la trouve seule.',
      fields: [
        {
          field: 'desire',
          value: 'Savoir ce que cache son frère.',
          sceneId: quai,
          quote: 'La lettre de son frère tremble',
        },
        {
          field: 'occupation' as 'desire',
          value: 'meunière',
          sceneId: quai,
          quote: 'attache la barque',
        },
        {
          field: 'secret',
          value: '— Je partirai demain, dit-elle.',
          sceneId: retour,
          quote: 'Hélène rentre seule',
        },
      ],
      knowledge: [],
      signals: [],
    });
    await deepWork({ llm, ...m, task: 'character', characterId: m.helene });
    expect(asked[0]?.user).toContain(`<character id="${m.helene}" name="Hélène">`);
    const field = (f: string) =>
      readFieldRef(m.root, { module: 'characters', entityId: m.helene, field: f });
    expect(field('desire').proposal?.value).toBe('Savoir ce que cache son frère.');
    expect(field('occupation').value).toBe('batelière'); // Validated, and not a field of this task.
    expect(field('occupation').proposal).toBeUndefined();
    expect(field('secret').proposal).toBeUndefined(); // Dialogue: never a line of the novel.
    expect(chatMessages(m.mentorDoc)[0]?.work).toEqual({
      task: 'character',
      characterId: m.helene,
    });
  });

  it('resolves its own remarks of last time that it does not make again', async () => {
    const m = manuscript();
    const [, crue] = m.ids as [string, string];
    const signal = {
      sceneId: crue,
      quote: 'Personne ne parle plus de la lettre',
      kind: 'clue' as const,
      title: 'La lettre oubliée',
      message: 'Que devient la lettre ?',
      principle: 'Un indice posé doit servir.',
    };
    await deepWork({
      llm: fakeLlm({ review: 'Un point.', clues: [], signals: [signal] }).llm,
      ...m,
      task: 'clues',
    });
    // The same remark again: not raised twice.
    await deepWork({
      llm: fakeLlm({ review: 'Encore.', clues: [], signals: [signal] }).llm,
      ...m,
      task: 'clues',
    });
    expect(listSignals(m.root, { state: 'open' })).toHaveLength(1);
    // Another task does not resolve it; this one, without it, does.
    await deepWork({
      llm: fakeLlm({ review: 'Rien.', narrativeModel: null, acts: [], arcs: [], signals: [] }).llm,
      ...m,
      task: 'structure',
    });
    expect(listSignals(m.root, { state: 'open' })).toHaveLength(1);
    const result = await deepWork({
      llm: fakeLlm({ review: 'Réglé.', clues: [], signals: [] }).llm,
      ...m,
      task: 'clues',
    });
    expect(result).toMatchObject({ resolved: 1 });
    expect(listSignals(m.root, { state: 'open' })).toHaveLength(0);
  });

  it('keeps the novel out of the review and of the proposed values', async () => {
    const m = manuscript();
    const [quai] = m.ids as [string];
    const { llm } = fakeLlm({
      review: 'Voici la suite :\n— Je ne partirai pas, dit-elle en refermant la porte.',
      narrativeModel: null,
      acts: [
        {
          existingId: null,
          title: 'Le départ',
          summary: 'x'.repeat(MAX_DEEP_VALUE + 1),
          sceneIds: [quai],
          sceneId: quai,
          quote: 'La lettre de son frère',
        },
      ],
      arcs: [],
      signals: [],
    });
    await deepWork({ llm, ...m, task: 'structure' });
    expect(chatMessages(m.mentorDoc)).toHaveLength(0);
    const act = listEntities(m.root, 'acts')[0];
    expect(act?.fields['summary']).toBeUndefined(); // Too long: left out, the act stays.
  });

  it('estimates the cost before the work, and has nothing to read in an empty project', () => {
    const m = manuscript();
    const estimate = estimateDeepWork({ ...m, task: 'structure' });
    expect(estimate?.inputTokens).toBeGreaterThan(100);
    expect(estimate?.usd).toBeGreaterThan(0);
    expect(estimate?.usd).toBeLessThan(0.5);
    expect(estimate).toMatchObject({ scenes: 3, words: 41 });
    expect(estimate?.usdMax).toBeGreaterThan(estimate?.usd ?? 0);
    expect(estimate?.seconds[0]).toBeLessThan(estimate?.seconds[1] ?? 0);
    expect(estimate?.unchangedSince).toBeUndefined();
    expect(estimateDeepWork({ ...m, task: 'character', characterId: 'nobody' })).toBeUndefined();

    const empty = new Y.Doc();
    initProject(empty, { id: 'p2', title: 'Vide', kind: 'novel' });
    expect(estimateDeepWork({ root: empty, sceneDocs: new Map(), task: 'clues' })).toBeUndefined();
  });
});
