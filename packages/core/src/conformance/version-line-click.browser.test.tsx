import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from 'vitest/browser';
import { afterEach, expect, it } from 'vitest';
import * as Y from 'yjs';
import { App } from '../app/App';
import { createI18n } from '../i18n/i18n';
import { createTestPlatform } from '../testing/test-platform';
// With the app's styles and a real mouse: what the author has (docs/DESIGN.md §5.0, rule 2).
import '../styles/base.css';

afterEach(cleanup);

const isMac = /Mac/.test(navigator.platform);

async function start() {
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
        const doc = docs.get(guid) ?? new Y.Doc({ guid });
        docs.set(guid, doc);
        return { guid, doc, whenLoaded: Promise.resolve(), close: async () => {} };
      },
    },
  });
  render(<App platform={platform} i18n={await createI18n('fr')} />);
  await screen.findByRole('textbox', { name: 'Texte de la scène' });
}

// Found by the author on 23 November 2026: « Renommer » on a version's line showed only while the
// line had the focus, vanished at the press of the mouse, and the click changed version instead.
it('renames a working version with the mouse, on its line of the project sheet', async () => {
  await start();
  await userEvent.keyboard('{ControlOrMeta>}k{/ControlOrMeta}');
  await screen.findByRole('dialog', { name: 'Ligne de commande' });
  await userEvent.keyboard('Nouvelle version de travail{Enter}');
  const sheet = await screen.findByRole('dialog', { name: 'Le projet' });
  await userEvent.type(
    await within(sheet).findByRole('textbox', { name: 'Nom de la version' }),
    'Fin à Nantes{Enter}',
  );
  const lines = await waitFor(() => {
    const found = within(sheet).getAllByRole('radio');
    expect(found).toHaveLength(2);
    return found;
  });
  const [main, other] = lines as [HTMLElement, HTMLElement];
  expect(other.getAttribute('aria-checked')).toBe('true');

  // The mouse comes over the main version's line: its actions show, and the click is theirs.
  await userEvent.hover(main);
  await userEvent.click(within(main).getByRole('button', { name: /Renommer/ }));
  const field = await within(sheet).findByRole('textbox', { name: 'Nom de la version' });
  await userEvent.clear(field);
  await userEvent.type(field, 'Première{Enter}');
  await waitFor(() => {
    const [first, second] = within(sheet).getAllByRole('radio');
    expect(first?.textContent).toContain('Première');
    // The version did not change under the click.
    expect(second?.getAttribute('aria-checked')).toBe('true');
  });
});
