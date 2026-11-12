import type { LlmService } from '@charpentier/platform';
import {
  AUTHOR,
  createChapter,
  createEntity,
  createScene,
  dismissSignal,
  initProject,
  listEntities,
  listSignals,
  parseSceneMarkdown,
  rejectEntity,
  variantFragment,
  writeSceneDocToFragment,
} from '@charpentier/schema';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { analyzeScene, remarkKindsFor } from './analysis';

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
});
