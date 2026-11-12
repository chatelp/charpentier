import type { LlmService } from '@charpentier/platform';
import {
  chatMessages,
  createChapter,
  createScene,
  initProject,
  parseSceneMarkdown,
  variantFragment,
  writeSceneDocToFragment,
} from '@charpentier/schema';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { reviewChapter } from './review';

function chapterWithTwoScenes() {
  const root = new Y.Doc({ guid: 'project:p1' });
  initProject(root, { id: 'p1', title: 'Les serres', kind: 'novel' });
  const chapterId = createChapter(root, { title: 'La serre' });
  const sceneDocs = new Map<string, Y.Doc>();
  for (const [title, text] of [
    ['Le sas', 'Il pleuvait sur Nantes.'],
    ['Le bureau', 'Hélène poussa la porte du bureau.'],
  ] as const) {
    const { sceneId, variantId } = createScene(root, { chapterId, title });
    const doc = new Y.Doc();
    writeSceneDocToFragment(parseSceneMarkdown(text), variantFragment(doc, variantId));
    sceneDocs.set(sceneId, doc);
  }
  return { root, chapterId, sceneDocs };
}

function fakeLlm(reply: string) {
  const asked: string[] = [];
  const llm: LlmService = {
    status: () => 'available',
    onStatusChange: () => () => {},
    generate: async (request) => {
      asked.push(request.messages.map((m) => m.content).join('\n'));
      return { text: JSON.stringify({ reply, example: null }) };
    },
  };
  return { llm, asked };
}

describe('review of a chapter', () => {
  it('reads the whole chapter and leaves its review in the conversation', async () => {
    const { root, chapterId, sceneDocs } = chapterWithTwoScenes();
    const mentorDoc = new Y.Doc();
    const { llm, asked } = fakeLlm('Le sas installe bien la pluie. Que veut Hélène ?');

    expect(
      await reviewChapter({ llm, root, mentorDoc, sceneDocs, chapterId, automatic: true }),
    ).toBe('answered');
    expect(asked[0]).toContain('Il pleuvait sur Nantes.');
    expect(asked[0]).toContain('Hélène poussa la porte du bureau.');
    expect(chatMessages(mentorDoc).map((m) => `${m.role}: ${m.text}`)).toEqual([
      'compagnon: Bilan du chapitre « La serre »\n\nLe sas installe bien la pluie. Que veut Hélène ?',
    ]);

    // An unchanged chapter is not reviewed again automatically; on demand it is.
    expect(
      await reviewChapter({ llm, root, mentorDoc, sceneDocs, chapterId, automatic: true }),
    ).toBe('nothing-to-review');
    expect(
      await reviewChapter({ llm, root, mentorDoc, sceneDocs, chapterId, automatic: false }),
    ).toBe('answered');
    expect(asked).toHaveLength(2);
  });

  it('never lets the novel be written in a review', async () => {
    const { root, chapterId, sceneDocs } = chapterWithTwoScenes();
    const mentorDoc = new Y.Doc();
    const { llm, asked } = fakeLlm(
      'Voici la suite :\n— Je ne partirai pas, dit-elle en refermant la porte.',
    );
    await reviewChapter({ llm, root, mentorDoc, sceneDocs, chapterId, automatic: false });
    expect(asked).toHaveLength(2); // Asked again once, then refused.
    expect(chatMessages(mentorDoc)[0]?.text).not.toContain('Je ne partirai pas');
  });

  it('has nothing to review in an empty chapter', async () => {
    const root = new Y.Doc();
    initProject(root, { id: 'p1', title: 'Les serres', kind: 'novel' });
    const chapterId = createChapter(root, { title: 'Vide' });
    const { llm, asked } = fakeLlm('?');
    expect(
      await reviewChapter({
        llm,
        root,
        mentorDoc: new Y.Doc(),
        sceneDocs: new Map(),
        chapterId,
        automatic: false,
      }),
    ).toBe('nothing-to-review');
    expect(asked).toHaveLength(0);
  });
});
