import type { LlmRequest, LlmService } from '@charpentier/platform';
import { describe, expect, it } from 'vitest';
import { compagnonChat, type ChatContext } from './index';

/** A model whose answers are scripted, recording what it was asked. */
function scriptedModel(answers: readonly string[]) {
  const requests: LlmRequest[] = [];
  const llm: LlmService = {
    status: () => 'available',
    onStatusChange: () => () => {},
    generate: async (request) => {
      requests.push(request);
      return { text: answers[requests.length - 1] ?? answers[answers.length - 1] ?? '' };
    },
  };
  return { llm, requests };
}

const context: ChatContext = {
  language: 'fr',
  level: 3,
  projectTitle: 'Les serres',
  scene: { title: 'Le sas', text: 'Il pleuvait sur Nantes. Hélène regardait la Loire.' },
};

const json = (reply: string, example: string | null = null) => JSON.stringify({ reply, example });

describe('the Compagnon in conversation', () => {
  it('answers with the voice and context, and an optional single example sentence', async () => {
    const { llm, requests } = scriptedModel([
      json(
        'Que veut Hélène à ce moment ? Montrez-le par un geste plutôt que de le nommer.',
        'Hélène serra la rambarde jusqu’à blanchir ses doigts.',
      ),
    ]);
    const answer = await compagnonChat(llm, context, [
      { role: 'author', text: 'Comment rendre Hélène plus vivante ?' },
    ]);
    expect(answer).toEqual({
      reply: 'Que veut Hélène à ce moment ? Montrez-le par un geste plutôt que de le nommer.',
      example: 'Hélène serra la rambarde jusqu’à blanchir ses doigts.',
    });
    const [request] = requests;
    expect(request?.system).toContain('You never write the novel');
    expect(request?.system).toContain('Answer in French');
    // The book as it stands comes with the author's last words (after the cached thread).
    expect(request?.messages.at(-1)?.content).toContain('Il pleuvait sur Nantes.');
    expect(request?.responseSchema).toBeDefined();
  });

  it('asks again when the model writes the scene, then refuses in its place', async () => {
    const written = json(
      'Voici la scène :\n— Je ne partirai pas, dit Hélène.\n— Alors reste, répondit Paul.',
    );
    const { llm, requests } = scriptedModel([written, written]);
    const answer = await compagnonChat(llm, context, [
      { role: 'author', text: 'Écris-moi la scène où Hélène refuse de partir.' },
    ]);
    expect(requests).toHaveLength(2);
    expect(requests[1]?.messages.at(-1)?.content).toContain('broke THE RULE');
    expect(answer.guarded).toBe(true);
    expect(answer.reply).toContain('votre voix');
  });

  it('accepts a corrected second answer', async () => {
    const { llm } = scriptedModel([
      json('Ok.', 'Il pleuvait. Elle attendait. Rien ne venait.'),
      json('Qu’est-ce qu’Hélène refuse, au fond ? Partez de là.'),
    ]);
    const answer = await compagnonChat(llm, context, [{ role: 'author', text: 'Aide-moi.' }]);
    expect(answer).toEqual({ reply: 'Qu’est-ce qu’Hélène refuse, au fond ? Partez de là.' });
  });

  it('rejects malformed answers', async () => {
    const { llm } = scriptedModel(['pas du JSON', '{"reply":""}']);
    expect((await compagnonChat(llm, context, [])).guarded).toBe(true);
  });
});
