import type { AgentsService } from '@charpentier/platform';
import {
  addInterviewMessage,
  agentOrigin,
  createAgentWriter,
  guids,
  interviewMessages,
  listEntities,
  readFieldRef,
  type InterviewSection,
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

type InterviewInput = Parameters<AgentsService['interview']>[0];

/** The app with a Compagnon played by the test: it files what it is told in the Atelier. */
async function start() {
  const prefs = new Map<string, unknown>([['welcomed', true]]);
  const docs = new Map<string, Y.Doc>();
  const asked: InterviewInput[] = [];
  const doc = (guid: string) => {
    const d = docs.get(guid) ?? new Y.Doc({ guid });
    docs.set(guid, d);
    return d;
  };
  const projectId = () => String(prefs.get('lastProjectId'));
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
      lightModel: async () => 'opus',
      setLightModel: async () => {},
      estimateDeepWork: async () => null,
      deepWork: async () => 'unavailable',
      stopDeepWork: async () => {},
      chooseReference: async () => 'cancelled',
      readReference: async () => 'empty',
      dropReference: async () => {},
      interview: async (input) => {
        asked.push(input);
        const root = doc(guids.project(input.projectId));
        const mentor = doc(guids.mentor(input.projectId));
        if (input.mode === 'free') {
          const said = interviewMessages(mentor).at(-1);
          const evidence = [{ messageId: said?.id ?? '', quote: 'Hélène, est batelière' }];
          const entityId = createAgentWriter(root, 'interview').proposeEntity(
            'characters',
            { name: 'Hélène', occupation: 'batelière' },
            evidence,
          );
          addInterviewMessage(
            mentor,
            {
              role: 'compagnon',
              text: 'J’ai noté Hélène dans les personnages.',
              mode: 'free',
              placed: [
                { module: 'characters', entityId },
                { module: 'characters', entityId, field: 'occupation' },
              ],
            },
            agentOrigin('interview'),
          );
        } else {
          addInterviewMessage(
            mentor,
            {
              role: 'compagnon',
              text: '',
              mode: 'guided',
              section: (input.section ?? 'meta') as InterviewSection,
              question: input.pass
                ? 'Quel est le ton de votre roman ?'
                : 'En une phrase, qui veut quoi ?',
              why: 'Le pitch dit ce que le roman promet au lecteur.',
            },
            agentOrigin('interview'),
          );
        }
        return 'answered';
      },
    },
  });
  render(<App platform={platform} i18n={await createI18n('fr')} />);
  const editor = await screen.findByRole('textbox', { name: 'Texte de la scène' });
  await waitFor(() => expect(document.activeElement).toBe(editor));
  const root = () => doc(guids.project(projectId()));
  return { editor, asked, root };
}

describe('the interview page of the Atelier (phase 6.2)', () => {
  it('files what the author says, to validate on the spot; guided, it asks and passes', async () => {
    const { editor, asked, root } = await start();

    // ⌘0: the interview heads the Atelier's rail; the Compagnon explains it first.
    await userEvent.keyboard(mod('0'));
    const field = await screen.findByRole('textbox', { name: 'Parlez de votre roman…' });
    await waitFor(() => expect(document.activeElement).toBe(field));
    expect(screen.getByRole('option', { name: 'Entretien' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    screen.getByText(/Racontez-moi votre roman/);

    // The author talks; the answer says where it filed what, with the proposals under it.
    await userEvent.keyboard('Mon heroine, Helene, est bateliere.{Enter}');
    await screen.findByText('J’ai noté Hélène dans les personnages.');
    expect(asked.at(-1)).toMatchObject({ mode: 'free' });
    screen.getByText('2 propositions');
    const helene = () => listEntities(root(), 'characters')[0];
    const occupation = () =>
      readFieldRef(root(), {
        module: 'characters',
        entityId: helene()?.id ?? '',
        field: 'occupation',
      });

    // V in the empty field validates the last proposal waiting: the occupation.
    await waitFor(() => expect(document.activeElement).toBe(field));
    await userEvent.keyboard('v');
    await waitFor(() => expect(occupation().status).toBe('validated'));
    // It stays under its answer, « validée »; and keeping her occupation kept Hélène.
    await waitFor(() => expect(screen.getAllByText('validée')).toHaveLength(2));
    expect(helene()?.status).toBe('validated');
    screen.getByText('nouvelle fiche');
    expect((field as HTMLTextAreaElement).value).toBe('');

    expect(
      readFieldRef(root(), { module: 'characters', entityId: helene()?.id ?? '', field: 'name' })
        .status,
    ).toBe('validated');

    // ⌘⇧M: guided; the Compagnon asks, his question in its card.
    await userEvent.keyboard(mod('{Shift>}m{/Shift}'));
    await screen.findByText('En une phrase, qui veut quoi ?');
    screen.getByText('Le pitch dit ce que le roman promet au lecteur.');
    expect(asked.at(-1)).toMatchObject({ mode: 'guided' });

    // ⇥ in the empty field passes the question: another one, same section.
    field.focus();
    await userEvent.keyboard('{Tab}');
    await screen.findByText('Quel est le ton de votre roman ?');
    expect(asked.at(-1)).toMatchObject({ mode: 'guided', pass: true, section: 'meta' });

    // ⌘⇧S: another section, chosen in the command line.
    await userEvent.keyboard(mod('{Shift>}s{/Shift}'));
    await screen.findByRole('dialog', { name: 'Ligne de commande' });
    await userEvent.keyboard('Personnages{Enter}');
    await waitFor(() => expect(asked.at(-1)).toMatchObject({ section: 'characters' }));

    // Échap: back to the text.
    await screen.findByRole('textbox', { name: 'Votre réponse…' });
    (screen.getByRole('textbox', { name: 'Votre réponse…' }) as HTMLElement).focus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(editor));
  });
});
