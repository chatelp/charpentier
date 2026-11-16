import {
  addInterviewMessage,
  agentOrigin,
  agentWriteNote,
  AUTHOR,
  findNote,
  guids,
  listNotes,
  listTrashedNotes,
} from '@charpentier/schema';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { App } from '../app/App';
import { createI18n } from '../i18n/i18n';
import { createTestPlatform } from '../testing/test-platform';

afterEach(cleanup);

const isMac = /Mac/.test(navigator.platform);
const mod = (keys: string) => `{ControlOrMeta>}${keys}{/ControlOrMeta}`;

const NANTES = '/memories/projet/a-reprendre/ce-qui-attend-helene-a-nantes.md';
const GRAND_PERE = '/memories/projet/histoire/le-grand-pere-batelier.md';
const QUESTION = '/memories/auteur/accompagnement/une-question-a-la-fois.md';

/** The app, and a notebook the Compagnon wrote during an interview. */
async function start() {
  const prefs = new Map<string, unknown>([['welcomed', true]]);
  const docs = new Map<string, Y.Doc>();
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
  });
  render(<App platform={platform} i18n={await createI18n('fr')} />);
  const editor = await screen.findByRole('textbox', { name: 'Texte de la scène' });
  await waitFor(() => expect(document.activeElement).toBe(editor));
  const mentor = doc(guids.mentor(String(prefs.get('lastProjectId'))));

  const origin = agentOrigin('interview');
  addInterviewMessage(
    mentor,
    { role: 'author', text: 'L’idée vient de mon grand-père, marinier de Loire.', mode: 'free' },
    AUTHOR,
  );
  const answer = addInterviewMessage(
    mentor,
    {
      role: 'compagnon',
      text: 'Je le note : Hélène lui doit son métier, pas sa vie.',
      mode: 'free',
      noted: [{ path: GRAND_PERE, change: 'created' }],
    },
    origin,
  );
  agentWriteNote(
    mentor,
    {
      path: GRAND_PERE,
      text: '# Le grand-père batelier\nLe roman vient de votre grand-père, marinier de Loire.',
      sources: [answer],
    },
    origin,
  );
  agentWriteNote(
    mentor,
    {
      path: NANTES,
      text: '# Ce qui attend Hélène à Nantes\nUn acheteur pour le bateau, ou son frère Paul.',
      sources: [answer],
    },
    origin,
  );
  agentWriteNote(
    mentor,
    {
      path: QUESTION,
      text: '# Une question à la fois\nVous préférez des remarques courtes.',
    },
    origin,
  );
  return { editor, mentor, prefs };
}

const note = (title: RegExp) => screen.getByRole('article', { name: title });

describe('the Carnet of the Compagnon (phase 6.5)', () => {
  it('shows both notebooks by nature; the author corrects, keeps, trashes and restores', async () => {
    const { editor, mentor, prefs } = await start();

    // ⌘7: the Carnet, under the interview in the rail, both notebooks on one page.
    await userEvent.keyboard(mod('7'));
    await screen.findByRole('heading', { level: 2, name: 'Carnet' });
    expect(screen.getByRole('option', { name: 'Carnet' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    screen.getByRole('heading', { level: 3, name: 'Ce roman' });
    screen.getByRole('heading', { level: 3, name: 'Vous' });
    within(screen.getByRole('group', { name: 'À reprendre' })).getByRole('article', {
      name: /Ce qui attend Hélène à Nantes/,
    });
    within(screen.getByRole('group', { name: 'Histoire' })).getByRole('article', {
      name: /Le grand-père batelier/,
    });
    within(screen.getByRole('group', { name: 'Accompagnement' })).getByRole('article', {
      name: /Une question à la fois/,
    });
    // Never visited: the Compagnon's notes are new, and the first has the focus.
    expect(note(/Ce qui attend Hélène à Nantes/).getAttribute('aria-label')).toBe(
      'Note du Compagnon, À reprendre : Ce qui attend Hélène à Nantes, nouvelle',
    );
    await waitFor(() => expect(document.activeElement).toBe(note(/Ce qui attend/)));

    // J, then V: the note is kept as it is, and becomes the author's.
    await userEvent.keyboard('j');
    await waitFor(() => expect(document.activeElement).toBe(note(/Le grand-père batelier/)));
    await userEvent.keyboard('v');
    await waitFor(() => expect(findNote(mentor, GRAND_PERE)?.by).toBe('author'));
    expect(findNote(mentor, GRAND_PERE)?.authorship).toBe('kept');
    within(note(/Le grand-père batelier/)).getByText(/Gardée par vous/);
    expect(note(/Le grand-père batelier/).getAttribute('aria-label')).toBe(
      'Votre note, Histoire : Le grand-père batelier',
    );

    // K, ⏎: corrected in place, title, text and nature; ⌘⏎ saves, the note is the author's.
    await userEvent.keyboard('k');
    await waitFor(() => expect(document.activeElement).toBe(note(/Ce qui attend/)));
    await userEvent.keyboard('{Enter}');
    const title = await screen.findByRole('textbox', { name: 'Titre de la note' });
    await waitFor(() => expect(document.activeElement).toBe(title));
    await userEvent.fill(title, 'Ce qui attend Hélène');
    await userEvent.fill(
      screen.getByRole('textbox', { name: 'Texte de la note' }),
      'Son frère Paul, plutôt.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Décision' }));
    await userEvent.keyboard(mod('{Enter}'));
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Titre de la note' })).toBe(null),
    );
    const corrected = listNotes(mentor).find((n) => n.path.includes('/decisions/'));
    expect(corrected).toMatchObject({
      by: 'author',
      authorship: 'corrected',
      text: '# Ce qui attend Hélène\nSon frère Paul, plutôt.',
      path: '/memories/projet/decisions/ce-qui-attend-helene.md',
    });
    within(screen.getByRole('group', { name: 'Décisions' })).getByText(/Corrigée par vous/);
    await waitFor(() => expect(document.activeElement).toBe(note(/Ce qui attend Hélène$/)));

    // ⌫: to the trash; « Corbeille (1) » unfolds it, « Remettre » brings it back.
    note(/Une question à la fois/).focus();
    await userEvent.keyboard('{Backspace}');
    await waitFor(() => expect(screen.queryByRole('article', { name: /Une question/ })).toBe(null));
    expect(listTrashedNotes(mentor)[0]).toMatchObject({ path: QUESTION, trashedBy: 'author' });
    await userEvent.click(screen.getByRole('button', { name: 'Corbeille (1)' }));
    screen.getByText(/Mise à la corbeille par vous/);
    await userEvent.click(screen.getByRole('button', { name: 'Remettre' }));
    await waitFor(() => expect(findNote(mentor, QUESTION)?.trashedAt).toBeUndefined());
    note(/Une question à la fois/);

    // O: the message the note comes from, in the interview, with the way back (Échap).
    note(/Le grand-père batelier/).focus();
    await userEvent.keyboard('o');
    await screen.findByText(/vient de ce message/);
    expect(
      screen
        .getByText('Je le note : Hélène lui doit son métier, pas sa vie.')
        .closest('.is-origin'),
    ).not.toBe(null);
    await userEvent.keyboard('{Escape}');
    await screen.findByRole('heading', { level: 2, name: 'Carnet' });
    await waitFor(() => expect(document.activeElement).toBe(note(/Le grand-père batelier/)));

    // Leaving the page: its notes are seen, no longer new.
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(editor));
    await waitFor(() =>
      expect(typeof prefs.get(`notebookVisit:${prefs.get('lastProjectId')}`)).toBe('string'),
    );
  });

  it('says under an answer what the Compagnon noted, a link to the note in the Carnet', async () => {
    await start();
    await userEvent.keyboard(mod('0'));
    await screen.findByText('Je le note : Hélène lui doit son métier, pas sa vie.');
    screen.getByText(/Noté au carnet :/);
    await userEvent.click(screen.getByRole('button', { name: 'Le grand-père batelier' }));
    await screen.findByRole('heading', { level: 2, name: 'Carnet' });
    await waitFor(() => expect(document.activeElement).toBe(note(/Le grand-père batelier/)));
  });
});
