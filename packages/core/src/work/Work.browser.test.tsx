import type { AgentsService, DeepWorkOutcome } from '@charpentier/platform';
import {
  addChatMessage,
  agentOrigin,
  createAgentWriter,
  guids,
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

type DeepWorkInput = Parameters<AgentsService['deepWork']>[0];

/** The app with a Compagnon played by the test: a structure check that files one act. */
async function start() {
  const prefs = new Map<string, unknown>([['welcomed', true]]);
  const docs = new Map<string, Y.Doc>();
  const ran: DeepWorkInput[] = [];
  let finish: ((outcome: DeepWorkOutcome) => void) | undefined;
  let stopped = false;
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
      estimateDeepWork: async () => ({
        scenes: 42,
        words: 38_200,
        inputTokens: 60_000,
        outputTokens: 6000,
        usd: 0.36,
        usdMax: 0.56,
        seconds: [70, 110],
      }),
      deepWork: (input) => {
        ran.push(input);
        return new Promise<DeepWorkOutcome>((resolve) => {
          finish = (outcome) => {
            if (outcome === 'answered') {
              const root = doc(guids.project(input.projectId));
              const mentor = doc(guids.mentor(input.projectId));
              createAgentWriter(root, 'structure').proposeEntity(
                'acts',
                { title: 'Le retour à Nantes' },
                [],
              );
              const reviewId = addChatMessage(
                mentor,
                {
                  role: 'compagnon',
                  text: 'La crue monte très bien. Il manque peut-être le retour.',
                  work: { task: 'structure' },
                },
                agentOrigin('structure'),
              );
              writeWorkRecord(
                mentor,
                { task: 'structure' },
                {
                  at: new Date().toISOString(),
                  digest: 'x',
                  proposals: 1,
                  signalIds: [],
                  fingerprints: [],
                  reviewId,
                },
                agentOrigin('structure'),
              );
            }
            resolve(outcome);
          };
          if (stopped) finish('stopped');
        });
      },
      stopDeepWork: async () => {
        stopped = true;
        finish?.('stopped');
      },
    },
  });
  render(<App platform={platform} i18n={await createI18n('fr')} />);
  const editor = await screen.findByRole('textbox', { name: 'Texte de la scène' });
  await waitFor(() => expect(document.activeElement).toBe(editor));
  return { ran, finish: (outcome: DeepWorkOutcome) => finish?.(outcome) };
}

async function fromCommandLine(name: string) {
  await userEvent.keyboard(mod('k'));
  await userEvent.keyboard(name);
  await userEvent.keyboard('{Enter}');
}

describe('the Compagnon’s background work (phase 6.3, DESIGN §4.5)', () => {
  it('confirms in place with its cost, runs, then says what it found', async () => {
    const { ran, finish } = await start();

    // From the command line: the Atelier opens on Structure, the block in confirmation.
    await fromCommandLine('verifier la structure');
    const card = await screen.findByRole('group', { name: 'Vérifier la structure' });
    await screen.findByText(/relit tout le manuscrit \(42 scènes, 38\s200 mots\)/);
    screen.getByText('environ 30 centimes');
    screen.getByText('au plus 50 centimes · 1 à 2 minutes');
    const launch = screen.getByRole('button', { name: /Lancer/ });
    await waitFor(() => expect(document.activeElement).toBe(launch));
    expect(card).toBeTruthy();

    // ⏎ launches; the block and the footer follow it.
    await userEvent.keyboard('{Enter}');
    await waitFor(() =>
      expect(ran).toEqual([{ projectId: expect.any(String), task: 'structure' }]),
    );
    await screen.findByText('Le Compagnon vérifie la structure…', { selector: '.ch-work-doing' });
    screen.getByRole('button', { name: 'Le Compagnon vérifie la structure…' });

    finish('answered');
    await screen.findByText(/Vérifiée aujourd’hui à/);
    screen.getByRole('button', { name: '1 proposition' });
    await screen.findByText(/Le bilan de la structure est dans la conversation/);

    // The bilan in the conversation: named, dated, its proposal one click away.
    screen.getByRole('button', { name: 'le bilan' }).click();
    await screen.findByText(/Bilan de la structure/, { selector: '.ch-bilan-head' });
    screen.getByRole('button', { name: '1 proposition dans Structure ›' });
  });

  it('cancels with Échap, and stops when asked: nothing filed', async () => {
    const { ran } = await start();
    await fromCommandLine('verifier la structure');
    await screen.findByRole('group', { name: 'Vérifier la structure' });
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /Lancer/ })),
    );
    await userEvent.keyboard('{Escape}');
    const button = await screen.findByRole('button', { name: /Vérifier la structure/ });
    await waitFor(() => expect(document.activeElement).toBe(button));
    screen.getByText('Dernière fois : jamais');

    button.click();
    await screen.findByRole('group', { name: 'Vérifier la structure' });
    screen.getByRole('button', { name: /Lancer/ }).click();
    await waitFor(() => expect(ran).toHaveLength(1));
    screen.getByRole('button', { name: 'Arrêter' }).click();
    await screen.findByText(/Arrêtée à 0:0\d : rien n’a été rangé\./);
  });
});
