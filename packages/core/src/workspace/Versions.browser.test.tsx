import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { App } from '../app/App';
import { createI18n } from '../i18n/i18n';
import { createTestPlatform } from '../testing/test-platform';

afterEach(cleanup);

const isMac = /Mac/.test(navigator.platform);
const editor = () => screen.getByRole('textbox', { name: 'Texte de la scène' });
const header = () => document.querySelector('.ch-scene-header')?.textContent ?? '';
const novelButton = () => screen.getByRole('button', { name: /le projet\u00A0: renommer/ });

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
  await waitFor(() => expect(document.activeElement).toBe(editor()));
}

const openSheet = async () => {
  // The test runs without the app's styles, where surfaces overlap: clicked through the DOM.
  novelButton().click();
  return screen.findByRole('dialog', { name: 'Le projet' });
};

/** The only way in while there is one version (DESIGN 1.33): the command, which opens the sheet. */
const newVersionByCommand = async () => {
  await userEvent.keyboard('{ControlOrMeta>}k{/ControlOrMeta}');
  await screen.findByRole('dialog', { name: 'Ligne de commande' });
  await userEvent.keyboard('Nouvelle version de travail{Enter}');
  const sheet = await screen.findByRole('dialog', { name: 'Le projet' });
  return { sheet, field: await within(sheet).findByRole('textbox', { name: 'Nom de la version' }) };
};

describe('working versions (DESIGN 1.20, in retreat since 1.33)', () => {
  it('tries another ending without touching the novel, and goes back to it', async () => {
    await start();
    await userEvent.keyboard('Hélène arrive à Nantes.');

    // One version: nothing speaks of versions, not even the sheet.
    let sheet = await openSheet();
    expect(sheet.textContent).not.toMatch(/version/i);
    expect(novelButton().textContent).not.toContain('·');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(editor()));

    // The command opens the sheet on the first one's name, and says once what it is.
    const first = await newVersionByCommand();
    sheet = first.sheet;
    expect(sheet.textContent).toContain('Nouvelle version de travail');
    expect(sheet.textContent).toContain('Une variante récrit une scène.');
    expect(sheet.textContent).toContain(
      'Elle part de «\u00a0Principale\u00a0», telle qu’elle est.',
    );
    await userEvent.type(first.field, 'Fin à Nantes{Enter}');

    // The new version is the active one: in the title, in the sheet, checked.
    await waitFor(() => expect(novelButton().textContent).toContain('Mon projet · Fin à Nantes'));
    const versions = within(sheet).getByRole('radiogroup', { name: 'Versions de travail' });
    const lines = within(versions).getAllByRole('radio');
    expect(lines.map((l) => l.querySelector('b')?.textContent)).toEqual([
      'Principale',
      'Fin à Nantes',
    ]);
    expect(lines[1]?.getAttribute('aria-checked')).toBe('true');
    expect(sheet.textContent).toContain('Version «\u00a0Fin à Nantes\u00a0»');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(editor()));

    // The scene is common: the header says so; the first words say it goes for both.
    expect(header()).toContain('commune');
    await userEvent.keyboard(' Il pleut.');
    expect(
      await screen.findByText(
        /Cette scène est commune à 2 versions : ce que vous écrivez vaut pour les deux\./,
      ),
    ).toBeTruthy();

    // Its own variant for this version: named after it.
    await userEvent.keyboard('{ControlOrMeta>}k{/ControlOrMeta}');
    await screen.findByRole('dialog', { name: 'Ligne de commande' });
    await userEvent.keyboard('copie{Enter}');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(header()).toContain('Fin à Nantes'));
    await waitFor(() => expect(document.activeElement).toBe(editor()));
    await userEvent.keyboard('{ControlOrMeta>}a{/ControlOrMeta}Hélène reste à Nantes.');

    // Back to Principale: its text, untouched.
    sheet = await openSheet();
    within(sheet).getAllByRole('radio')[0]?.click();
    await waitFor(() => expect(editor().textContent).toBe('Hélène arrive à Nantes. Il pleut.'));
    // In the main version the title stands alone, even with another version there.
    await waitFor(() => expect(novelButton().textContent).not.toContain('·'));
    expect(header()).not.toContain('commune');

    // And again: the other ending.
    within(sheet).getAllByRole('radio')[1]?.click();
    await waitFor(() => expect(editor().textContent).toBe('Hélène reste à Nantes.'));
    await waitFor(() => expect(novelButton().textContent).toContain('Mon projet · Fin à Nantes'));
  });

  it('renames a version on its line with R, and puts it in the trash with ⌫', async () => {
    await start();
    // A first version given up: the sheet closes, nothing changed.
    const givenUp = await newVersionByCommand();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Le projet' })).toBeNull());
    expect(givenUp.sheet.isConnected).toBe(false);

    const { sheet, field: name } = await newVersionByCommand();
    await userEvent.type(name, 'Fin à Nantes{Enter}');
    const line = await waitFor(() => {
      const found = within(sheet).getAllByRole('radio')[1];
      expect(found).toBeDefined();
      return found as HTMLElement;
    });
    line.focus();
    await userEvent.keyboard('r');
    const field = await within(sheet).findByRole('textbox', { name: 'Nom de la version' });
    await userEvent.clear(field);
    await userEvent.type(field, 'Fin au Croisic{Enter}');
    await waitFor(() => expect(novelButton().textContent).toContain('Fin au Croisic'));

    (within(sheet).getAllByRole('radio')[1] as HTMLElement).focus();
    await userEvent.keyboard('{Backspace}');
    // A version is a big piece: its line's button asks, a second ⌫ does it (DESIGN §4.7).
    await within(sheet).findByRole('button', { name: /^Confirmer\u00a0: version/ });
    expect(within(sheet).getAllByRole('radio')).toHaveLength(2);
    await userEvent.keyboard('{Backspace}');
    // The last one gone: back to the main version, and the sheet is silent again.
    await waitFor(() => expect(within(sheet).queryAllByRole('radio')).toHaveLength(0));
    expect(sheet.textContent).not.toMatch(/version/i);
    expect(novelButton().textContent).not.toContain('·');
  });
});
