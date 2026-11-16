import type { AgentsService, DeepWorkOutcome, ReferenceChoiceResult } from '@charpentier/platform';
import {
  addChatMessage,
  addInterviewMessage,
  agentOrigin,
  createAgentWriter,
  createEntity,
  guids,
  interviewMessages,
  listEntities,
  writeWorkRecord,
} from '@charpentier/schema';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { App } from '../app/App';
import { createI18n } from '../i18n/i18n';
import { createTestPlatform } from '../testing/test-platform';

afterEach(cleanup);

const isMac = /Mac/.test(navigator.platform);
const mod = (keys: string) => `{ControlOrMeta>}${keys}{/ControlOrMeta}`;

const BOOK: ReferenceChoiceResult = {
  token: 't1',
  title: 'Les Eaux basses',
  author: 'Marthe Delorme',
  format: 'epub',
  words: 84_300,
  chapters: 22,
  passages: 10,
  inputTokens: 6000,
  outputTokens: 1500,
  usd: 0.035,
  usdMax: 0.06,
  seconds: [20, 40],
};

/** The app with a Compagnon played by the test, and a file dialog that answers `chosen`. */
async function start(chosen: ReferenceChoiceResult[]) {
  const prefs = new Map<string, unknown>([['welcomed', true]]);
  const docs = new Map<string, Y.Doc>();
  const read: Parameters<AgentsService['readReference']>[0][] = [];
  const dropped: string[] = [];
  let finish: ((outcome: DeepWorkOutcome) => void) | undefined;
  const doc = (guid: string) => {
    const d = docs.get(guid) ?? new Y.Doc({ guid });
    docs.set(guid, d);
    return d;
  };
  const platform = createTestPlatform({
    keybindings: { primaryModifier: isMac ? 'Meta' : 'Control', reserved: [] },
    preferences: {
      get: async <T,>(key: string) => prefs.get(key) as T | undefined,
      set: async (key, value) => void prefs.set(key, value),
    },
    documents: {
      open: async (guid) => ({
        guid,
        doc: doc(guid),
        whenLoaded: Promise.resolve(),
        close: async () => {},
      }),
    },
    agents: {
      status: () => 'available',
      onStatusChange: () => () => {},
      setApiKey: async () => 'saved',
      forgetApiKey: async () => {},
      ask: async () => 'answered',
      analyze: async () => 'answered',
      reviewChapter: async () => 'answered',
      interview: async () => 'answered',
      lightModel: async () => 'opus',
      setLightModel: async () => {},
      estimateDeepWork: async () => null,
      deepWork: async () => 'empty',
      stopDeepWork: async () => finish?.('stopped'),
      chooseReference: async () => chosen.shift() ?? 'cancelled',
      dropReference: async ({ token }) => void dropped.push(token),
      readReference: (input) => {
        read.push(input);
        return new Promise<DeepWorkOutcome>((resolve) => {
          finish = (outcome) => {
            if (outcome === 'answered') {
              // What the main process does: proposals in Style et voix, a message in the interview.
              const root = doc(guids.project(input.projectId));
              const mentor = doc(guids.mentor(input.projectId));
              const writer = createAgentWriter(root, 'style');
              const evidence = [{ reference: 'Les Eaux basses' }];
              const placed = [
                writer.proposeEntity(
                  'style',
                  {
                    category: 'sentences',
                    choice: 'Des phrases courtes, souvent sans verbe.',
                    measure: '11 mots par phrase en moyenne',
                    source: 'Les Eaux basses, Marthe Delorme',
                  },
                  evidence,
                ),
                writer.proposeEntity(
                  'style',
                  {
                    category: 'tense',
                    choice: 'Le passé simple, sans retour en arrière.',
                    source: 'Les Eaux basses, Marthe Delorme',
                  },
                  evidence,
                ),
              ].map((entityId) => ({ module: 'style', entityId }));
              const id = addInterviewMessage(
                mentor,
                {
                  role: 'compagnon',
                  text: 'Une prose sèche, au plus près de Marthe. Gardez ceux qui vous ressemblent.',
                  mode: 'free',
                  placed,
                  reference: { title: 'Les Eaux basses', author: 'Marthe Delorme' },
                },
                agentOrigin('style'),
              );
              writeWorkRecord(
                mentor,
                { task: 'style' },
                {
                  at: new Date().toISOString(),
                  digest: '',
                  proposals: 2,
                  signalIds: [],
                  fingerprints: [],
                  reviewId: id,
                  title: 'Les Eaux basses',
                },
                agentOrigin('style'),
              );
            }
            resolve(outcome);
          };
        });
      },
    },
  });
  render(<App platform={platform} i18n={await createI18n('fr')} />);
  const editor = await screen.findByRole('textbox', { name: 'Texte de la scène' });
  await waitFor(() => expect(document.activeElement).toBe(editor));
  const project = () => {
    const guid = [...docs.keys()].find((g) => /^project:[^/]+$/.test(g)) ?? '';
    return { root: doc(guid), mentor: doc(`${guid}/mentor`) };
  };
  return { read, dropped, project, finish: (outcome: DeepWorkOutcome) => finish?.(outcome) };
}

describe('reference texts and Style et voix (phase 6.4, DESIGN §4.5 1.16)', () => {
  it('imports a book from the interview, confirms in the conversation, files its choices', async () => {
    const { read, project, finish } = await start([BOOK]);
    await userEvent.keyboard(mod('e'));
    await userEvent.keyboard(mod('0'));
    // Validated before: the tense the author chose.
    createEntity(project().root, 'style', { category: 'tense', choice: 'le présent de narration' });

    (await screen.findByRole('button', { name: 'Texte de référence…' })).click();
    // The book, as the author's words; the Compagnon's card with what leaves and its cost.
    await screen.findByRole('group', {
      name: /^Texte de référence : Les Eaux basses, Marthe Delorme · EPUB · 84\s300 mots\.$/,
    });
    await screen.findByRole('group', { name: 'Dégager les choix de style' });
    screen.getByText(/puis lit 10 passages tirés au hasard/);
    screen.getByText(/Seuls ces 10 passages partent vers le Compagnon\./);
    screen.getByText('environ 3 centimes');
    const launch = screen.getByRole('button', { name: /Lancer/ });
    await waitFor(() => expect(document.activeElement).toBe(launch));

    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(read).toEqual([{ projectId: expect.any(String), token: 't1' }]));
    await screen.findByText('Le Compagnon lit Les Eaux basses…', { selector: '.ch-work-doing' });
    screen.getByText('Mesures faites · 10 passages en lecture');
    // One work at a time: the import button waits.
    expect(
      screen.getByRole('button', { name: 'Texte de référence…' }).getAttribute('aria-disabled'),
    ).toBe('true');
    // The file the author gave stays in the conversation.
    expect(interviewMessages(project().mentor)[0]?.reference).toEqual({
      title: 'Les Eaux basses',
      author: 'Marthe Delorme',
      format: 'epub',
      words: 84_300,
    });

    finish('answered');
    await screen.findByText(/^Style · d’après Les Eaux basses/, { selector: '.ch-bilan-head' });
    screen.getByText('Des phrases courtes, souvent sans verbe.');
    screen.getByText('11 mots par phrase en moyenne');
    screen.getByText('Vous aviez choisi : « le présent de narration »');

    // V keeps the whole sheet of the last proposal: its choice, its category, its book.
    (await screen.findByRole('textbox', { name: 'Parlez de votre roman…' })).focus();
    await userEvent.keyboard('v');
    await waitFor(() => {
      const kept = listEntities(project().root, 'style').find(
        (e) => e.fields['choice']?.value === 'Le passé simple, sans retour en arrière.',
      );
      expect(kept?.status).toBe('validated');
      expect(kept?.fields['category']?.status).toBe('validated');
    });

    // The page: grouped by category, the sheet names its book.
    await userEvent.keyboard(mod('6'));
    await screen.findByText('Phrases et rythme', { selector: '.ch-atl-group' });
    screen.getByText('Temps', { selector: '.ch-atl-group' });
    screen.getByText('Lu', { exact: false, selector: '.ch-work-note' });
  });

  it('says why a file will not do, and lets go of a book left on its confirmation', async () => {
    const { dropped } = await start([{ refused: 'too-short', words: 1200 }, BOOK]);
    await userEvent.keyboard(mod('e'));
    await userEvent.keyboard(mod('0'));
    (await screen.findByRole('button', { name: 'Texte de référence…' })).click();
    await screen.findByText(
      'Trop court pour y voir un style : il faut au moins 2 000 mots (celui-ci en a 1 200).',
    );
    const other = screen.getByRole('button', { name: /Autre fichier…/ });
    await waitFor(() => expect(document.activeElement).toBe(other));
    await userEvent.keyboard('{Enter}');
    await screen.findByRole('group', { name: 'Dégager les choix de style' });
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /Lancer/ })),
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(dropped).toEqual(['t1']));
    expect(screen.queryByRole('group', { name: 'Dégager les choix de style' })).toBeNull();
  });

  it('shows the author’s choice under an answer that relies on it, and opens its sheet', async () => {
    const { project } = await start([]);
    const { root, mentor } = project();
    const id = createEntity(root, 'style', {
      category: 'tense',
      choice: 'le présent de narration',
    });
    addChatMessage(
      mentor,
      { role: 'compagnon', text: 'Ce passage glisse au passé : voulu ?', styleChoiceId: id },
      agentOrigin('chat'),
    );
    await userEvent.keyboard(mod('k'));
    await userEvent.keyboard('parler au compagnon');
    await userEvent.keyboard('{Enter}');
    const citation = await screen.findByRole('button', {
      name: 'Votre choix, Temps : le présent de narration. Ouvrir la fiche.',
    });
    citation.click();
    await screen.findByRole('complementary', { name: 'Fiche' });
  });
});
