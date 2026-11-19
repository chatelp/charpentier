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

  it('refuses plain narration, with no dash and no quotation mark', async () => {
    const written = json(
      'Voici la scène que vous demandez :\n\nHélène descendit vers le fleuve. La pluie tombait toujours sur les quais.\n\nElle s’arrêta devant la barque de son père et posa la main sur le bois mouillé.',
    );
    const { llm, requests } = scriptedModel([written, written]);
    const refusals: unknown[] = [];
    const answer = await compagnonChat(
      llm,
      context,
      [{ role: 'author', text: 'Écris-moi la scène où Hélène descend au fleuve.' }],
      undefined,
      undefined,
      (refused) => refusals.push(refused.why),
    );
    expect(requests).toHaveLength(2);
    expect(refusals).toHaveLength(2);
    expect(JSON.stringify(refusals[0])).toContain('narration');
    expect(answer.guarded).toBe(true);
  });

  it('refuses quoted speech, and a sentence of the novel in the reply beside the example', async () => {
    const { llm, requests } = scriptedModel([
      json('« Je reste », dit Hélène.'),
      json('Bien vu. Hélène serra la rambarde.', 'Elle ferma les yeux.'),
    ]);
    const answer = await compagnonChat(llm, context, [{ role: 'author', text: 'Une réplique ?' }]);
    expect(requests).toHaveLength(2);
    expect(answer.guarded).toBe(true);
  });

  it('refuses whole an answer over its bound, and says why when it asks again', async () => {
    const { llm, requests } = scriptedModel([
      json('Votre scène tient. '.repeat(400)),
      json('Votre scène tient.'),
    ]);
    const answer = await compagnonChat(llm, context, [{ role: 'author', text: 'Développez.' }]);
    expect(requests[1]?.messages.at(-1)?.content).toContain('too long');
    expect(answer).toEqual({ reply: 'Votre scène tient.' });
  });

  it('lets the Compagnon quote what the author validated in their sheets', async () => {
    const value =
      'Batelière têtue. Elle gardait la barque de sa mère et ne parlait à personne depuis la crue.';
    const quoting = json(`Votre fiche dit : « ${value} » Où cela se voit-il dans la scène ?`);
    const refused = await compagnonChat(scriptedModel([quoting]).llm, context, []);
    expect(refused.guarded).toBe(true);
    const allowed = await compagnonChat(
      scriptedModel([quoting]).llm,
      { ...context, authorWords: `characters [c1] summary: ${value}` },
      [],
    );
    expect(allowed.guarded).toBeUndefined();
    expect(allowed.reply).toContain(value);
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
