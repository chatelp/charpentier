import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { App } from '../app/App';
import { createI18n } from '../i18n/i18n';
import { probeFeature } from '../testing/test-feature';
import { createTestPlatform } from '../testing/test-platform';

afterEach(cleanup);

const isMac = /Mac/.test(navigator.platform);
const mod = (keys: string) => `{ControlOrMeta>}${keys}{/ControlOrMeta}`;

async function start(withFeature = false) {
  const prefs = new Map<string, unknown>([['welcomed', true]]);
  const docs = new Map<string, Y.Doc>();
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
    about: { version: '0.1.1', commit: '43d2f0a' },
  });
  render(
    <App
      platform={platform}
      i18n={await createI18n('fr')}
      {...(withFeature && { features: [probeFeature] })}
    />,
  );
  const editor = await screen.findByRole('textbox', { name: 'Texte de la scène' });
  await waitFor(() => expect(document.activeElement).toBe(editor));
  return { editor };
}

const section = (name: string) =>
  within(screen.getByRole('listbox', { name: 'Sections des réglages' }))
    .getAllByRole('option')
    .find((o) => o.textContent?.startsWith(name)) as HTMLElement;

describe('the app’s settings (docs/DESIGN.md §4.8, phase 7.3)', () => {
  it('opens with ⌘, everywhere, its sections and their values, and sets what « Aa » sets', async () => {
    const { editor } = await start();
    await userEvent.keyboard(mod(','));
    const rail = await screen.findByRole('listbox', { name: 'Sections des réglages' });
    expect(
      within(rail)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      'ApparenceSystème',
      'Écriture19 px',
      'Sonsnon',
      'CompagnonOpus 5.5',
      'Bibliothèque1 roman',
      'À propos0.1.1 (43d2f0a)',
    ]);

    // The theme, from its setting keys; the rail follows.
    const page = screen.getByRole('region', { name: 'Apparence' });
    within(page).getByRole('radio', { name: 'Sombre' }).click();
    await waitFor(() => expect(section('Apparence').textContent).toBe('ApparenceSombre'));
    // The text size, from its stepper.
    within(page).getByRole('button', { name: 'Agrandir le texte' }).click();
    section('Écriture').click();
    await waitFor(() => expect(section('Écriture').textContent).toBe('Écriture20 px'));

    // The sounds, each with its own option.
    section('Sons').click();
    const sounds = await screen.findByRole('region', { name: 'Sons' });
    within(within(sounds).getByRole('radiogroup', { name: 'Son de frappe' }))
      .getByRole('radio', {
        name: 'oui',
      })
      .click();
    await waitFor(() => expect(section('Sons').textContent).toBe('Sonsoui'));

    // The version and its commit.
    section('À propos').click();
    expect((await screen.findByRole('region', { name: 'À propos' })).textContent).toContain(
      'Charpentier 0.1.1 (43d2f0a)',
    );

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(editor));
  });

  it('keeps the machine’s settings apart, each view leading to the other (D-36)', async () => {
    await start(true);
    await userEvent.keyboard(mod(','));
    const rail = await screen.findByRole('listbox', { name: 'Sections des réglages' });
    // No « À propos » here: the machine has its own.
    expect(rail.textContent).not.toContain('Sonde');
    expect(rail.textContent).not.toContain('À propos');
    screen.getByRole('button', { name: /Réglages du système/ }).click();
    await waitFor(() =>
      expect(screen.getByRole('listbox', { name: 'Sections des réglages' }).textContent).toContain(
        'Sonde',
      ),
    );
    screen.getByRole('button', { name: /Réglages de l’app/ }).click();
    await waitFor(() =>
      expect(screen.getByRole('listbox', { name: 'Sections des réglages' }).textContent).toContain(
        'Apparence',
      ),
    );
  });
});
