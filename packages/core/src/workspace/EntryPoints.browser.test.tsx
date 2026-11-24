import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { App } from '../app/App';
import { formatBinding } from '../commands/keybinding';
import { createI18n } from '../i18n/i18n';
import { createTestPlatform } from '../testing/test-platform';

afterEach(cleanup);

const isMac = /Mac/.test(navigator.platform);

function setup(prefs = new Map<string, unknown>(), docs = new Map<string, Y.Doc>()) {
  const platform = createTestPlatform({
    keybindings: { primaryModifier: isMac ? 'Meta' : 'Control', reserved: [] },
    preferences: {
      get: async <T,>(key: string) => prefs.get(key) as T | undefined,
      set: async (key, value) => void prefs.set(key, value),
    },
    documents: {
      open: async (guid) => {
        const d = docs.get(guid) ?? new Y.Doc({ guid });
        docs.set(guid, d);
        return { guid, doc: d, whenLoaded: Promise.resolve(), close: async () => {} };
      },
    },
  });
  return { platform, prefs, docs };
}

async function open(platform: ReturnType<typeof setup>['platform']) {
  render(<App platform={platform} i18n={await createI18n('fr')} />);
  const editor = await screen.findByRole('textbox', { name: 'Texte de la scène' });
  await waitFor(() => expect(document.activeElement).toBe(editor));
  return editor;
}

describe('entry points (docs/DESIGN.md §4.8)', () => {
  it('opens every tool with the mouse, each showing its shortcut', async () => {
    const { platform } = setup();
    await open(platform);

    // The console (DESIGN 1.25): the manuscript's key opens the drawer and stays pressed;
    // a second click closes it.
    const manuscript = screen.getByRole('button', { name: 'Manuscrit' });
    expect(manuscript.title).toMatch(/^Manuscrit\u00A0: chapitres et scènes \(.+J\)$/);
    expect(manuscript.getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(manuscript);
    await screen.findByRole('complementary', { name: 'Plan du manuscrit' });
    expect(manuscript.getAttribute('aria-pressed')).toBe('true');
    // The drawer may cover the foot on a narrow screen: the click itself, not the pointer's path.
    manuscript.click();
    await waitFor(() =>
      expect(screen.queryByRole('complementary', { name: 'Plan du manuscrit' })).toBeNull(),
    );

    // The Compagnon's key opens his panel, which says what to do when there is nothing.
    const compagnon = screen.getByRole('button', { name: 'Compagnon' });
    await userEvent.click(compagnon);
    const panel = await screen.findByRole('complementary', { name: 'Le Compagnon' });
    expect(within(panel).getByText('Rien à traiter pour l’instant.')).toBeTruthy();
    expect(compagnon.getAttribute('aria-pressed')).toBe('true');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(compagnon.getAttribute('aria-pressed')).toBe('false'));

    // The command zone opens the command line, with useful commands before typing anything.
    await userEvent.click(screen.getByRole('button', { name: /Que voulez-vous faire/ }));
    const line = await screen.findByRole('listbox');
    expect(within(line).getByText('Pour commencer')).toBeTruthy();
    expect(within(line).getByText('Toutes les commandes')).toBeTruthy();
    await userEvent.keyboard('{Escape}');

    // Écrire | Atelier.
    await userEvent.click(screen.getByRole('button', { name: 'Atelier' }));
    await screen.findByRole('region', { name: 'Atelier' });
  });

  it('sets the display from « Aa »', async () => {
    const { platform, prefs } = setup();
    await open(platform);
    await userEvent.click(screen.getByRole('button', { name: 'Aa' }));
    const sheet = await screen.findByRole('dialog', { name: 'Affichage' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Agrandir le texte' }));
    await waitFor(() => expect(prefs.get('writing')).toMatchObject({ textSize: 20 }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Affichage' })).toBeNull());
  });

  it('leads to the app’s settings from the last line of « Aa », with the command’s key', async () => {
    const { platform } = setup();
    await open(platform);
    await userEvent.click(screen.getByRole('button', { name: 'Aa' }));
    const sheet = await screen.findByRole('dialog', { name: 'Affichage' });
    const settings = within(sheet).getByRole('button', { name: /^Réglages de l’app…/ });
    expect(within(sheet).getAllByRole('button').at(-1)).toBe(settings);
    expect(settings.querySelector('kbd')?.textContent).toBe(
      formatBinding('Mod-,', isMac ? 'Meta' : 'Control'),
    );
    expect(settings.dataset['command']).toBe('openSettings');
    await userEvent.click(settings);
    await screen.findByRole('region', { name: 'Réglages' });
    expect(screen.queryByRole('dialog', { name: 'Affichage' })).toBeNull();
  });

  it('fades the entry points while typing, and brings them back', async () => {
    const { platform } = setup();
    await open(platform);
    const app = document.querySelector('.ch-app') as HTMLElement;
    expect(app.dataset['typing']).toBeUndefined();
    await userEvent.keyboard('Il pleuvait');
    expect(app.dataset['typing']).toBe('true');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(app.dataset['typing']).toBeUndefined());
  });

  it('keeps open panels open the next time the project opens', async () => {
    const { platform, prefs, docs } = setup();
    await open(platform);
    await userEvent.click(screen.getByRole('button', { name: 'Compagnon' }));
    await screen.findByRole('complementary', { name: 'Le Compagnon' });
    await waitFor(() =>
      expect([...prefs.entries()].find(([key]) => key.startsWith('panels:'))?.[1]).toMatchObject({
        mentor: 'points',
      }),
    );
    cleanup();

    render(<App platform={setup(prefs, docs).platform} i18n={await createI18n('fr')} />);
    await screen.findByRole('complementary', { name: 'Le Compagnon' });
  });

  it('welcomes the author on the first launch and shows them around', async () => {
    const { platform, prefs } = setup();
    const editor = await open(platform);
    expect(screen.getByRole('complementary', { name: 'Bienvenue' })).toBeTruthy();
    // ⏎ in the text starts the tour (no new paragraph).
    await userEvent.keyboard('{Enter}');
    await screen.findByRole('dialog', { name: 'Le manuscrit' });
    expect(screen.getByRole('button', { name: 'Manuscrit' }).classList).toContain('ch-tour-on');
    await userEvent.keyboard('{Enter}');
    await screen.findByRole('dialog', { name: 'Le Compagnon' });
    await userEvent.keyboard('{Enter}');
    await screen.findByRole('dialog', { name: 'Que voulez-vous faire\u202F?' });
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('complementary', { name: 'Bienvenue' })).toBeNull();
    expect(prefs.get('welcomed')).toBe(true);
    expect(editor.querySelectorAll('p')).toHaveLength(1);
  });

  it('puts the welcome off at the first letter, and never shows it again', async () => {
    const { platform, prefs, docs } = setup();
    await open(platform);
    await userEvent.keyboard('Il');
    await waitFor(() =>
      expect(screen.queryByRole('complementary', { name: 'Bienvenue' })).toBeNull(),
    );
    expect(prefs.get('welcomed')).toBe(true);
    cleanup();
    render(<App platform={setup(prefs, docs).platform} i18n={await createI18n('fr')} />);
    await screen.findByRole('textbox', { name: 'Texte de la scène' });
    expect(screen.queryByRole('complementary', { name: 'Bienvenue' })).toBeNull();
  });
});
