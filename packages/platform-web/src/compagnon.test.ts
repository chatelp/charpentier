import { addChatMessage, AUTHOR, chatMessages, guids, initProject } from '@charpentier/schema';
import { describe, expect, it } from 'vitest';
import { WebCompagnon } from './compagnon';
import { MemoryDocumentService } from './documents';

/** The page's Compagnon, its server played by `generate`. */
async function page(generate: (init: RequestInit) => Promise<Response>) {
  const fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const path = new URL(String(input)).pathname;
    if (path === '/api/compagnon') return Response.json({ status: 'available' });
    if (path === '/api/compagnon/generate') return generate(init);
    return new Response(null, { status: 404 });
  }) as typeof globalThis.fetch;
  const documents = new MemoryDocumentService();
  const compagnon = new WebCompagnon({ documents, origin: 'http://localhost', fetch });
  await compagnon.refresh();
  const root = (await documents.open(guids.project('p1'))).doc;
  initProject(root, { id: 'p1', title: 'Les serres', kind: 'novel' });
  const mentor = (await documents.open(guids.mentor('p1'))).doc;
  addChatMessage(mentor, { role: 'author', text: 'Ma scène est-elle trop lente ?' }, AUTHOR);
  const phases: (string | null)[] = [];
  compagnon.onAnswerPhase((event) => phases.push(event.phase));
  return { compagnon, mentor, phases };
}

describe('waiting for the Compagnon in the browser (DESIGN 1.34)', () => {
  it('thinks, then reviews: the relay does not stream, its first words are never told', async () => {
    const { compagnon, mentor, phases } = await page(async () =>
      Response.json({ text: JSON.stringify({ reply: 'Que veut Hélène ?', example: null }) }),
    );
    expect(await compagnon.ask({ projectId: 'p1' })).toBe('answered');
    expect(phases).toEqual(['thinking', 'reviewing', null]);
    expect(chatMessages(mentor).at(-1)?.text).toBe('Que veut Hélène ?');
  });

  it('stops: the request to the server is aborted, nothing is written', async () => {
    let aborted = false;
    let reached = () => {};
    const atServer = new Promise<void>((resolve) => (reached = resolve));
    const { compagnon, mentor, phases } = await page(
      (init) =>
        new Promise((_resolve, reject) => {
          reached();
          init.signal?.addEventListener('abort', () => {
            aborted = true;
            reject(new DOMException('The request was aborted', 'AbortError'));
          });
        }),
    );
    const answer = compagnon.ask({ projectId: 'p1' });
    await atServer;
    await compagnon.stopAnswer({ projectId: 'p1' });
    expect(await answer).toBe('stopped');
    expect(aborted).toBe(true);
    expect(phases).toEqual(['thinking', null]);
    expect(chatMessages(mentor).map((m) => m.role)).toEqual(['author']);
    // Stopping is no network failure: the Compagnon stays available.
    expect(compagnon.status()).toBe('available');
  });
});
