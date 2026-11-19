import type { LlmService } from '@charpentier/platform';
import {
  addVariantMeta,
  anchorForQuote,
  AUTHOR,
  createAgentWriter,
  createChapter,
  createEntity,
  createScene,
  dismissSignal,
  getScene,
  initProject,
  listEntities,
  listSignals,
  parseSceneMarkdown,
  readFieldRef,
  rejectEntity,
  rejectProposal,
  variantFragment,
  writeSceneDocToFragment,
} from '@charpentier/schema';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { analyzeScene, remarkKindsFor } from './analysis';
import { UnusableAnswerError } from './answer';

function project() {
  const root = new Y.Doc({ guid: 'project:p1' });
  initProject(root, { id: 'p1', title: 'Les serres', kind: 'novel' });
  const chapterId = createChapter(root, { title: 'Un' });
  const { sceneId, variantId } = createScene(root, { chapterId, title: 'Le sas' });
  const helene = createEntity(
    root,
    'characters',
    { name: 'Hélène', appearance: 'yeux bleus' },
    AUTHOR,
  );
  const sceneDoc = new Y.Doc();
  writeSceneDocToFragment(
    parseSceneMarkdown(
      'Hélène avait les yeux verts, ce matin-là.\n\nUn technicien nommé Marc ouvrit le sas sans badge. Elle était très triste.',
    ),
    variantFragment(sceneDoc, variantId),
  );
  return { root, sceneDoc, sceneId, helene };
}

const activeVariant = (root: Y.Doc, sceneId: string) =>
  getScene(root, sceneId)?.activeVariantId ?? '';

const empty = {
  characters: [],
  worldRules: [],
  clues: [],
  knowledge: [],
  conflicts: [],
  remarks: [],
};

function model(analysis: object): LlmService {
  return {
    status: () => 'available',
    onStatusChange: () => () => {},
    generate: async () => ({ text: JSON.stringify({ ...empty, ...analysis }) }),
  };
}

describe('scene analysis (bottom-up, conflicts, remarks)', () => {
  it('flags green eyes against the validated sheet, anchored in the text', async () => {
    const { root, sceneDoc, sceneId, helene } = project();
    const llm = model({
      conflicts: [
        {
          module: 'characters',
          entityId: helene,
          field: 'appearance',
          quote: 'les yeux verts',
          message: 'La fiche d’Hélène dit « yeux bleus ».',
          principle: 'La cohérence des détails physiques garde la confiance du lecteur.',
        },
      ],
    });
    expect(await analyzeScene({ llm, root, sceneDoc, sceneId, level: 1 })).toMatchObject({
      signals: 1,
    });
    const [signal] = listSignals(root, { state: 'open' });
    expect(signal).toMatchObject({
      kind: 'conflict',
      author: 'mentor',
      fieldRef: { module: 'characters', entityId: helene, field: 'appearance' },
    });
    expect(signal?.textAnchor?.sceneId).toBe(sceneId);

    // Analysed again: the same conflict is not raised twice.
    await analyzeScene({ llm, root, sceneDoc, sceneId, level: 1 });
    expect(listSignals(root, { state: 'open' })).toHaveLength(1);
    // Ignored by the author: never raised again.
    dismissSignal(root, signal?.id ?? '');
    await analyzeScene({ llm, root, sceneDoc, sceneId, level: 1 });
    expect(listSignals(root, { state: 'open' })).toHaveLength(0);
  });

  it('proposes a new character, but never one the author rejected or invented quotes', async () => {
    const { root, sceneDoc, sceneId } = project();
    const marc = {
      name: 'Marc',
      existingId: null,
      quote: 'Un technicien nommé Marc',
      fields: [
        { field: 'occupation', value: 'technicien', quote: 'Un technicien nommé Marc' },
        { field: 'age', value: '30 ans', quote: 'âgé de trente ans' },
      ],
    };
    await analyzeScene({
      llm: model({ characters: [marc, { ...marc, name: 'Zoé', quote: 'Zoé entra' }] }),
      root,
      sceneDoc,
      sceneId,
      level: 3,
    });
    const proposed = listEntities(root, 'characters').filter((c) => c.status === 'proposed');
    expect(proposed).toHaveLength(1);
    expect(proposed[0]?.fields['occupation']?.proposal?.value).toBe('technicien');
    expect(proposed[0]?.fields['age']).toBeUndefined(); // its quote is not in the text

    rejectEntity(root, 'characters', proposed[0]?.id ?? '');
    await analyzeScene({ llm: model({ characters: [marc] }), root, sceneDoc, sceneId, level: 3 });
    expect(listEntities(root, 'characters').filter((c) => c.status === 'proposed')).toHaveLength(0);
  });

  it('lets through the remarks of the slider’s level only, with bounded suggestions', async () => {
    const { root, sceneDoc, sceneId } = project();
    const remarks = [
      {
        kind: 'craft',
        quote: 'Elle était très triste',
        message: 'L’émotion est nommée.',
        principle: 'Montrer plutôt que dire.',
        correction: null,
        example: 'Elle serra le badge jusqu’à s’en blesser la paume.',
      },
      {
        kind: 'language',
        quote: 'ouvrit le sas sans badge',
        message: 'Accord.',
        principle: 'Grammaire.',
        correction: 'ouvrit les sas sans badges et sans rien dire à personne',
        example: null,
      },
    ];
    await analyzeScene({ llm: model({ remarks }), root, sceneDoc, sceneId, level: 2 });
    expect(listSignals(root, { state: 'open' })).toHaveLength(0); // craft is level 3; the correction rewrites too much
    await analyzeScene({ llm: model({ remarks }), root, sceneDoc, sceneId, level: 3 });
    const [craft] = listSignals(root, { state: 'open' });
    expect(craft).toMatchObject({ kind: 'craft', suggestion: { kind: 'example' } });

    // Next analysis no longer reports it: the Compagnon resolves its own remark.
    expect(await analyzeScene({ llm: model({}), root, sceneDoc, sceneId, level: 3 })).toMatchObject(
      { resolved: 1 },
    );
    expect(remarkKindsFor(1)).toEqual([]);
  });

  it('never brings back a value the author rejected, even quoted otherwise, and says so to the model', async () => {
    const { root, sceneDoc, sceneId, helene } = project();
    const ref = { module: 'characters', entityId: helene, field: 'fear' } as const;
    const sad = (quote: string, value = 'la tristesse') => ({
      characters: [
        {
          name: 'Hélène',
          existingId: helene,
          quote: 'Hélène avait les yeux verts',
          fields: [{ field: 'fear', value, quote }],
        },
      ],
    });
    await analyzeScene({
      llm: model(sad('Elle était très triste')),
      root,
      sceneDoc,
      sceneId,
      level: 1,
    });
    expect(readFieldRef(root, ref).proposal?.value).toBe('la tristesse');
    rejectProposal(root, ref);

    // The same value on another passage, or spelled otherwise: still refused.
    const prompts: string[] = [];
    const again: LlmService = {
      ...model({}),
      generate: async (request) => {
        prompts.push(String(request.messages[0]?.content));
        return { text: JSON.stringify({ ...empty, ...sad('ce matin-là', 'La tristesse.') }) };
      },
    };
    expect(await analyzeScene({ llm: again, root, sceneDoc, sceneId, level: 1 })).toMatchObject({
      proposals: 0,
    });
    expect(readFieldRef(root, ref)).toMatchObject({ status: 'rejected' });
    expect(readFieldRef(root, ref).proposal).toBeUndefined();
    // The model is told what was refused, as in the interview.
    expect(prompts[0]).toContain('<refused>');
    expect(prompts[0]).toContain(`characters [${helene}] "Hélène" fear: rejected "la tristesse"`);
  });

  it('does not raise again a remark the author dismissed when another quote of the passage is given', async () => {
    const { root, sceneDoc, sceneId } = project();
    const remark = (quote: string) => ({
      remarks: [
        {
          kind: 'craft',
          quote,
          title: 'Émotion nommée',
          message: 'L’émotion est nommée.',
          principle: 'Montrer plutôt que dire.',
          correction: null,
          example: null,
          styleChoiceId: null,
        },
      ],
    });
    await analyzeScene({
      llm: model(remark('Elle était très triste')),
      root,
      sceneDoc,
      sceneId,
      level: 3,
    });
    const [raised] = listSignals(root, { state: 'open' });
    dismissSignal(root, raised?.id ?? '');

    const prompts: string[] = [];
    const again: LlmService = {
      ...model({}),
      generate: async (request) => {
        prompts.push(String(request.messages[0]?.content));
        return { text: JSON.stringify({ ...empty, ...remark('était très triste') }) };
      },
    };
    expect(await analyzeScene({ llm: again, root, sceneDoc, sceneId, level: 3 })).toMatchObject({
      signals: 0,
    });
    expect(listSignals(root, { state: 'open' })).toHaveLength(0);
    expect(prompts[0]).toContain(
      'remark dismissed (craft) on "Elle était très triste": Émotion nommée',
    );
    // Elsewhere in the scene, the same kind of remark is still made.
    await analyzeScene({
      llm: model(remark('ouvrit le sas sans badge')),
      root,
      sceneDoc,
      sceneId,
      level: 3,
    });
    expect(listSignals(root, { state: 'open' })).toHaveLength(1);
  });

  it('extends a clue’s pending list scene after scene, and leaves out a scene the author refused', async () => {
    const root = new Y.Doc({ guid: 'project:p2' });
    initProject(root, { id: 'p2', title: 'Les serres', kind: 'novel' });
    const chapterId = createChapter(root, { title: 'Un' });
    const scenes = ['Un', 'Deux', 'Trois'].map((title) => {
      const { sceneId, variantId } = createScene(root, { chapterId, title });
      const sceneDoc = new Y.Doc();
      writeSceneDocToFragment(
        parseSceneMarkdown(`Scène ${title} : le badge rouge traînait sur la table.`),
        variantFragment(sceneDoc, variantId),
      );
      return { sceneId, sceneDoc };
    });
    const badge = createEntity(root, 'clues', { title: 'Le badge rouge', kind: 'clue' }, AUTHOR);
    const ref = { module: 'clues', entityId: badge, field: 'appearsIn' } as const;
    const llm = model({
      clues: [
        {
          existingId: badge,
          title: 'Le badge rouge',
          kind: 'clue',
          role: 'appears',
          quote: 'le badge rouge traînait',
        },
      ],
    });
    const read = (i: number) =>
      analyzeScene({
        llm,
        root,
        sceneDoc: scenes[i]?.sceneDoc ?? new Y.Doc(),
        sceneId: scenes[i]?.sceneId ?? '',
        level: 1,
      });
    const ids = scenes.map((s) => s.sceneId);
    await read(1);
    await read(2);
    expect(readFieldRef(root, ref).proposal?.value).toEqual([ids[1], ids[2]]);
    await read(0);
    expect(readFieldRef(root, ref).proposal?.value).toEqual(ids); // in the manuscript's order

    // Refused: none of these scenes is proposed for it again, alone or with others.
    rejectProposal(root, ref);
    expect(await read(1)).toMatchObject({ proposals: 0 });
    expect(readFieldRef(root, ref).proposal).toBeUndefined();
  });

  it('files nothing of an analysis cut at the output limit, or unreadable', async () => {
    const { root, sceneDoc, sceneId } = project();
    const marc = {
      name: 'Marc',
      existingId: null,
      quote: 'Un technicien nommé Marc',
      fields: [],
    };
    const answering = (response: { text: string; truncated?: boolean }): LlmService => ({
      ...model({}),
      generate: async () => response,
    });
    const whole = JSON.stringify({ ...empty, characters: [marc] });
    for (const response of [{ text: whole, truncated: true }, { text: whole.slice(0, 40) }])
      await expect(
        analyzeScene({ llm: answering(response), root, sceneDoc, sceneId, level: 3 }),
      ).rejects.toBeInstanceOf(UnusableAnswerError);
    expect(listEntities(root, 'characters').filter((c) => c.status === 'proposed')).toEqual([]);
    // A list left out is read as empty, not as a crash halfway through the filing.
    expect(
      await analyzeScene({
        llm: answering({ text: JSON.stringify({ characters: [marc] }) }),
        root,
        sceneDoc,
        sceneId,
        level: 3,
      }),
    ).toMatchObject({ proposals: 1 });
  });

  const language = (quote: string, correction: string) => ({
    kind: 'language',
    quote,
    message: 'Accord.',
    principle: 'Grammaire.',
    correction,
    example: null,
  });

  it('keeps a correction with the passage it was written for, as the text has it', async () => {
    const { root, sceneDoc, sceneId } = project();
    const remarks = [language('ouvrit le sas sans badge', 'ouvrit le sas sans badges')];
    await analyzeScene({ llm: model({ remarks }), root, sceneDoc, sceneId, level: 2 });
    expect(listSignals(root, { state: 'open' })).toMatchObject([
      {
        kind: 'language',
        suggestion: {
          kind: 'correction',
          text: 'ouvrit le sas sans badges',
          quote: 'ouvrit le sas sans badge',
        },
      },
    ]);
  });

  it('never lets a correction carry a sentence of its own (adversarial)', async () => {
    const root = new Y.Doc({ guid: 'project:p1' });
    initProject(root, { id: 'p1', title: 'Les serres', kind: 'novel' });
    const chapterId = createChapter(root, { title: 'Un' });
    const { sceneId, variantId } = createScene(root, { chapterId, title: 'Le sas' });
    const sceneDoc = new Y.Doc();
    const long = 'Le vent tournait au-dessus des serres et la pluie battait les vitres, '
      .repeat(7)
      .replace(/, $/, '.');
    const short = 'Marc ouvrit le sas sans badge et entra dans la serre';
    writeSceneDocToFragment(
      parseSceneMarkdown(`${long}\n\n${short}.`),
      variantFragment(sceneDoc, variantId),
    );
    const remarks = [
      // 35 % of 480 characters is room for a sentence: the ratio alone let it through.
      language(long, `${long} Marc sortit alors un couteau de sa poche.`),
      language(short, `${short}. Il mourut.`),
      language(short, `${short}\nIl mourut`),
      language(short, `${short} en sifflant un air que personne ne connaissait`),
    ];
    await analyzeScene({ llm: model({ remarks }), root, sceneDoc, sceneId, level: 4 });
    expect(listSignals(root)).toEqual([]);
  });
});

describe('the remarks an analysis withdraws', () => {
  it('withdraws only its own remarks, on the variant it read', async () => {
    const { root, sceneDoc, sceneId } = project();
    const variantId = activeVariant(root, sceneId);
    const anchored = (variant: string) => {
      const textAnchor = anchorForQuote(sceneDoc, sceneId, variant, 'Elle était très triste');
      if (!textAnchor) throw new Error('not anchored');
      return textAnchor;
    };
    // A remark of « Vérifier la structure » on this very scene.
    const structure = createAgentWriter(root, 'structure').raiseSignal({
      kind: 'craft',
      message: 'La scène arrive tard dans l’acte.',
      textAnchor: anchored(variantId),
      fingerprint: 'task-structure',
    });
    // A remark of an earlier analysis, on another variant of the scene.
    writeSceneDocToFragment(
      parseSceneMarkdown('Elle était très triste, vraiment.'),
      variantFragment(sceneDoc, 'v2'),
    );
    addVariantMeta(root, sceneId, { variantId: 'v2', name: 'Essai', origin: 'author' });
    const analysis = createAgentWriter(root, 'scene-analysis');
    const elsewhere = analysis.raiseSignal({
      kind: 'craft',
      message: 'L’émotion est nommée.',
      textAnchor: anchored('v2'),
      fingerprint: 'other-variant',
    });
    const own = analysis.raiseSignal({
      kind: 'craft',
      message: 'L’émotion est nommée.',
      textAnchor: anchored(variantId),
      fingerprint: 'own',
    });

    const result = await analyzeScene({ llm: model({}), root, sceneDoc, sceneId, level: 4 });
    expect(result).toMatchObject({ resolved: 1 });
    const state = (id: string) => listSignals(root).find((s) => s.id === id)?.state;
    const source = (id: string) => listSignals(root).find((s) => s.id === id)?.source;
    expect([structure, elsewhere, own].map(source)).toEqual([
      'structure',
      'scene-analysis',
      'scene-analysis',
    ]);
    expect(state(own)).toBe('resolved');
    expect(state(structure)).toBe('open');
    expect(state(elsewhere)).toBe('open');
  });
});
