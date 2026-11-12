import { createEntity, guids } from '@charpentier/schema';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { App } from '../app/App';
import { createI18n } from '../i18n/i18n';
import { createTestPlatform } from '../testing/test-platform';

afterEach(cleanup);

const isMac = /Mac/.test(navigator.platform);

describe('sheet beside the text', () => {
  it('opens a character’s sheet from their name, then in the Atelier', async () => {
    const prefs = new Map<string, unknown>();
    const docs = new Map<string, Y.Doc>();
    const platform = createTestPlatform({
      keybindings: { primaryModifier: isMac ? 'Meta' : 'Control', reserved: [] },
      preferences: {
        get: async <T,>(key: string) => prefs.get(key) as T | undefined,
        set: async (key, value) => void prefs.set(key, value),
      },
      documents: {
        open: async (guid) => {
          const doc = docs.get(guid) ?? new Y.Doc({ guid });
          docs.set(guid, doc);
          return { guid, doc, whenLoaded: Promise.resolve(), close: async () => {} };
        },
      },
    });
    render(<App platform={platform} i18n={await createI18n('fr')} />);
    const editor = await screen.findByRole('textbox', { name: 'Texte de la scène' });
    await waitFor(() => expect(document.activeElement).toBe(editor));
    const root = docs.get(guids.project(String(prefs.get('lastProjectId')))) as Y.Doc;
    createEntity(root, 'characters', { name: 'Hélène Varenne', occupation: 'enquêtrice' });

    await userEvent.keyboard('Ce soir-là, Hélène attendait.');
    await waitFor(() => expect(editor.querySelector('.ch-who')?.textContent).toBe('Hélène'));
    await userEvent.click(editor.querySelector('.ch-who') as HTMLElement);
    const panel = await screen.findByRole('complementary', { name: 'Fiche' });
    expect(within(panel).getByRole('heading', { name: 'Hélène Varenne' })).toBeTruthy();
    expect(within(panel).getByText(/Personnage · enquêtrice · 1 scène/)).toBeTruthy();
    await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true));

    await userEvent.keyboard('{ControlOrMeta>}{Enter}{/ControlOrMeta}');
    await screen.findByRole('region', { name: 'Atelier' });
    expect(screen.queryByRole('complementary', { name: 'Fiche' })).toBeNull();
  });
});
