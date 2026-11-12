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

async function startApp() {
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
  await textFocused();
  return platform;
}

const editor = () => screen.getByRole('textbox', { name: 'Texte de la scène' });
const textFocused = () =>
  waitFor(() => expect(document.activeElement).toBe(editor()), { timeout: 2000 });

describe('library', () => {
  it('creates a novel and a short story and switches from one to the other', async () => {
    const platform = await startApp();
    await userEvent.keyboard('Le roman commence.');

    await userEvent.keyboard(mod('o'));
    await screen.findByRole('region', { name: 'Bibliothèque' });
    expect(screen.getByRole('option', { name: /Mon roman/ })).toBeTruthy();
    await userEvent.keyboard('n');
    await userEvent.keyboard('La serre');
    await userEvent.click(screen.getByRole('radio', { name: 'Nouvelle' }));
    screen.getByRole('textbox', { name: 'Titre du projet' }).focus();
    await userEvent.keyboard('{Enter}');

    // The short story opens, empty, ready to write.
    await textFocused();
    expect(editor().textContent).toBe('');
    await userEvent.keyboard('La nouvelle commence.');
    expect((await platform.library.list()).map((p) => `${p.title} (${p.kind})`)).toEqual([
      'La serre (short-story)',
      'Mon roman (novel)',
    ]);

    // Back to the novel: its text is there.
    await userEvent.keyboard(mod('o'));
    await screen.findByRole('region', { name: 'Bibliothèque' });
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await textFocused();
    await waitFor(() => expect(editor().textContent).toBe('Le roman commence.'));

    // Trash the short story, then restore it.
    await userEvent.keyboard(mod('o'));
    await screen.findByRole('region', { name: 'Bibliothèque' });
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('option', { name: /Mon roman/ })),
    );
    await userEvent.keyboard('{ArrowDown}{Backspace}');
    await waitFor(() => expect(screen.getByText(/Mis à la corbeille le/)).toBeTruthy());
    expect((await platform.library.list()).map((p) => p.title)).toEqual(['Mon roman']);
    await userEvent.keyboard('{Enter}');
    await waitFor(async () => expect(await platform.library.list()).toHaveLength(2));
    await userEvent.keyboard('{Escape}');
    await textFocused();
  });
});
