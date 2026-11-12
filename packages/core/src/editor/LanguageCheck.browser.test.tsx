import { guids, listEntities, createEntity } from '@charpentier/schema';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { App } from '../app/App';
import { createI18n } from '../i18n/i18n';
import { NNBSP } from '../language/typography';
import { createTestPlatform } from '../testing/test-platform';

afterEach(cleanup);

const isMac = /Mac/.test(navigator.platform);
const known = new Set(['il', 'pleuvait', 'sur', 'nantes', 'vous', 'venez', 'chez']);

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
    spellcheck: {
      misspelled: async (words) => words.filter((w) => !known.has(w.toLowerCase())),
      suggest: async (word) => (word === 'pleuvai' ? ['pleuvait', 'pleurai'] : []),
    },
  });
  render(<App platform={platform} i18n={await createI18n('fr')} />);
  const editor = await screen.findByRole('textbox', { name: 'Texte de la scène' });
  await waitFor(() => expect(document.activeElement).toBe(editor));
  const root = () => docs.get(guids.project(String(prefs.get('lastProjectId')))) as Y.Doc;
  return { editor, root };
}

describe('spelling and typography', () => {
  it('underlines issues after a pause and corrects them from the keyboard', async () => {
    const { editor } = await startApp();
    await userEvent.keyboard('Il pleuvai sur Nantes. Vous venez?');
    await waitFor(
      () => expect(editor.querySelector('.ch-lang-spelling')?.textContent).toBe('pleuvai'),
      {
        timeout: 3000,
      },
    );
    expect(editor.querySelector('.ch-lang-typography')?.textContent).toBe('?');

    // ⌘' goes to the first issue, ⌥⏎ offers the suggestions.
    await userEvent.keyboard(`{ControlOrMeta>}'{/ControlOrMeta}`);
    await userEvent.keyboard('{Alt>}{Enter}{/Alt}');
    await screen.findByRole('dialog', { name: 'Ligne de commande' });
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(editor.textContent).toBe('Il pleuvait sur Nantes. Vous venez?'));

    // The next one is typography: ⌥⏎ applies it at once.
    await userEvent.keyboard(`{ControlOrMeta>}'{/ControlOrMeta}`);
    await userEvent.keyboard('{Alt>}{Enter}{/Alt}');
    await waitFor(() =>
      expect(editor.textContent).toBe(`Il pleuvait sur Nantes. Vous venez${NNBSP}?`),
    );
  });

  it('accepts the project’s own words and its characters’ names', async () => {
    const { editor, root } = await startApp();
    createEntity(root(), 'characters', { name: 'Hélène Varenne' });
    expect(listEntities(root(), 'characters')).toHaveLength(1);
    await userEvent.keyboard('Hélène vient chez Xavier.');
    await waitFor(
      () => expect(editor.querySelector('.ch-lang-spelling')?.textContent).toBe('vient'),
      {
        timeout: 3000,
      },
    );
    // « vient » and « Xavier » are unknown to this tiny dictionary; Hélène is a character.
    expect([...editor.querySelectorAll('.ch-lang-spelling')].map((e) => e.textContent)).toEqual([
      'vient',
      'Xavier',
    ]);
    await userEvent.keyboard(`{ControlOrMeta>}'{/ControlOrMeta}{ControlOrMeta>}'{/ControlOrMeta}`);
    await userEvent.keyboard('{Alt>}{Enter}{/Alt}');
    await screen.findByRole('dialog', { name: 'Ligne de commande' });
    await userEvent.keyboard('dictionnaire{Enter}');
    await waitFor(() =>
      expect([...editor.querySelectorAll('.ch-lang-spelling')].map((e) => e.textContent)).toEqual([
        'vient',
      ]),
    );
  });
});
