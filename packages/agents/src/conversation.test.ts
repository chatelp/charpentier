import type { LlmService } from '@charpentier/platform';
import {
  addChatMessage,
  AUTHOR,
  chatMessages,
  createChapter,
  createEntity,
  createScene,
  initProject,
  parseSceneMarkdown,
  variantFragment,
  writeSceneDocToFragment,
} from '@charpentier/schema';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { answerAuthor } from './conversation';

describe('conversation with the Compagnon', () => {
  it('answers the author’s last message with the scene and the validated sheets as context', async () => {
    const root = new Y.Doc({ guid: 'project:p1' });
    initProject(root, { id: 'p1', title: 'Les serres', kind: 'novel' });
    const chapterId = createChapter(root, { title: 'Un' });
    const { sceneId, variantId } = createScene(root, { chapterId, title: 'Le sas' });
    createEntity(root, 'characters', { name: 'Hélène', age: '47 ans' });
    const sceneDoc = new Y.Doc();
    writeSceneDocToFragment(
      parseSceneMarkdown('Il pleuvait sur Nantes.'),
      variantFragment(sceneDoc, variantId),
    );
    const mentorDoc = new Y.Doc();
    addChatMessage(
      mentorDoc,
      { role: 'author', text: 'Ma scène est-elle trop lente ?', sceneId },
      AUTHOR,
    );

    let asked = '';
    const llm: LlmService = {
      status: () => 'available',
      onStatusChange: () => () => {},
      generate: async (request) => {
        asked = request.messages.map((m) => m.content).join('\n');
        return {
          text: JSON.stringify({
            reply: 'Que se passe-t-il pour Hélène dans ce sas ?',
            example: null,
          }),
        };
      },
    };
    expect(await answerAuthor({ llm, root, mentorDoc, sceneDoc, sceneId })).toBe('answered');
    expect(asked).toContain('Il pleuvait sur Nantes.');
    expect(asked).toContain('name: Hélène');
    expect(asked).toContain('Ma scène est-elle trop lente ?');
    expect(chatMessages(mentorDoc).map((m) => `${m.role}: ${m.text}`)).toEqual([
      'author: Ma scène est-elle trop lente ?',
      'compagnon: Que se passe-t-il pour Hélène dans ce sas ?',
    ]);
    // Nothing to answer once the Compagnon has spoken.
    expect(await answerAuthor({ llm, root, mentorDoc, sceneDoc, sceneId })).toBe(
      'nothing-to-answer',
    );
  });
});
