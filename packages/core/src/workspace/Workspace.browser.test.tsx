import { guids, readOutline } from '@charpentier/schema';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { App } from '../app/App';
import { createI18n } from '../i18n/i18n';
import { createTestPlatform } from '../testing/test-platform';

afterEach(cleanup);

const isMac = /Mac/.test(navigator.platform);

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
  await screen.findByRole('textbox', { name: 'Texte de la scène' });
  await waitFor(() =>
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Texte de la scène'),
  );
  const root = () => docs.get(guids.project(String(prefs.get('lastProjectId')))) as Y.Doc;
  const outline = () =>
    readOutline(root()).map((c) => `${c.title}: ${c.scenes.map((s) => s.title).join(', ')}`);
  return { outline };
}

/** `mod+alt+n` → the platform's chord. */
async function press(chord: string) {
  const parts = chord.split('+');
  const key = parts.pop() ?? '';
  const mods = parts.map((m) => ({ mod: 'ControlOrMeta', alt: 'Alt', shift: 'Shift' })[m] ?? m);
  await userEvent.keyboard(
    `${mods.map((m) => `{${m}>}`).join('')}${key.length > 1 ? `{${key}}` : key}${mods
      .reverse()
      .map((m) => `{/${m}}`)
      .join('')}`,
  );
}

async function inputInPalette(text: string) {
  const input = await screen.findByRole('dialog', { name: 'Ligne de commande' });
  expect(input).toBeTruthy();
  await userEvent.keyboard(`{ControlOrMeta>}a{/ControlOrMeta}${text}{Enter}`);
}

const editorFocused = () =>
  document.activeElement?.getAttribute('aria-label') === 'Texte de la scène';

describe('workspace, keyboard only', () => {
  it('creates two chapters and three scenes, then reorganises them without the mouse', async () => {
    const { outline } = await startApp();

    await press('mod+alt+shift+n'); // new chapter, asks for its title
    await inputInPalette('Deux');
    await press('mod+alt+n'); // new scene after the current one
    await inputInPalette('Scène B');
    await press('mod+k'); // the palette finds the same command by name
    await userEvent.keyboard('nouvelle scene{Enter}');
    await inputInPalette('Scène C');
    expect(outline()).toEqual(['Chapitre 1: Scène 1', 'Deux: Nouvelle scène, Scène B, Scène C']);
    await waitFor(() => expect(editorFocused()).toBe(true));

    await press('mod+j'); // outline, focused on the open scene (Scène C)
    await screen.findByRole('tree', { name: 'Plan du manuscrit' });
    await press('alt+ArrowUp');
    await press('alt+ArrowUp');
    expect(outline()).toEqual(['Chapitre 1: Scène 1', 'Deux: Scène C, Nouvelle scène, Scène B']);
    await press('alt+ArrowUp'); // crosses into the previous chapter
    expect(outline()).toEqual(['Chapitre 1: Scène 1, Scène C', 'Deux: Nouvelle scène, Scène B']);

    await userEvent.keyboard('{ArrowDown}r'); // from Scène C down to the "Deux" chapter, rename
    await inputInPalette('Le retour');
    await userEvent.keyboard('{Alt>}{ArrowUp}{/Alt}'); // move the chapter first
    expect(outline()).toEqual([
      'Le retour: Nouvelle scène, Scène B',
      'Chapitre 1: Scène 1, Scène C',
    ]);

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('tree')).toBeNull();
    await waitFor(() => expect(editorFocused()).toBe(true));
  });

  it('keeps each scene’s text in its own document while moving between scenes', async () => {
    await startApp();
    await userEvent.keyboard('Texte de la première scène.');
    await press('mod+alt+n');
    await inputInPalette('Deuxième');
    await waitFor(() => expect(editorFocused()).toBe(true));
    await userEvent.keyboard('Texte de la deuxième.');

    await press('mod+alt+ArrowUp'); // previous scene
    await waitFor(() => expect(document.title).toBe('Mon roman — Scène 1'));
    expect(screen.getByRole('textbox', { name: 'Texte de la scène' }).textContent).toBe(
      'Texte de la première scène.',
    );

    await press('mod+p'); // go to scene…
    await userEvent.keyboard('deuxieme{Enter}');
    await waitFor(() => expect(document.title).toBe('Mon roman — Deuxième'));
    expect(screen.getByRole('textbox', { name: 'Texte de la scène' }).textContent).toBe(
      'Texte de la deuxième.',
    );
  });

  it('puts a scene in the trash and restores it from the palette', async () => {
    const { outline } = await startApp();
    await press('mod+alt+n');
    await inputInPalette('Éphémère');
    await press('mod+k');
    await userEvent.keyboard('scene corbeille{Enter}');
    expect(outline()).toEqual(['Chapitre 1: Scène 1']);
    await waitFor(() => expect(document.title).toBe('Mon roman — Scène 1'));

    await press('mod+k');
    await userEvent.keyboard('restaurer{Enter}');
    await userEvent.keyboard('{Enter}');
    expect(outline()).toEqual(['Chapitre 1: Scène 1, Éphémère']);
    await waitFor(() => expect(document.title).toBe('Mon roman — Éphémère'));
  });

  it('reorders scenes and chapters by drag and drop', async () => {
    const { outline } = await startApp();
    await press('mod+alt+shift+n');
    await inputInPalette('Deux');
    await press('mod+alt+n');
    await inputInPalette('Scène B');
    await press('mod+j');
    const item = (name: string) => screen.getByRole('treeitem', { name });
    const drag = (from: string, to: string) => {
      const dataTransfer = new DataTransfer();
      fireEvent.dragStart(item(from), { dataTransfer });
      fireEvent.dragOver(item(to), { dataTransfer });
      fireEvent.drop(item(to), { dataTransfer });
      fireEvent.dragEnd(item(from), { dataTransfer });
    };

    drag('Scène B', 'Scène 1'); // a scene dropped on a scene goes before it
    expect(outline()).toEqual(['Chapitre 1: Scène B, Scène 1', 'Deux: Nouvelle scène']);
    drag('Scène 1', 'Deux'); // a scene dropped on a chapter goes at its end
    expect(outline()).toEqual(['Chapitre 1: Scène B', 'Deux: Nouvelle scène, Scène 1']);
    drag('Deux', 'Chapitre 1'); // a chapter dropped on a chapter goes before it
    expect(outline()).toEqual(['Deux: Nouvelle scène, Scène 1', 'Chapitre 1: Scène B']);
  });

  it('never leaves the manuscript without a scene to write in', async () => {
    const { outline } = await startApp();
    await press('mod+k');
    await userEvent.keyboard('chapitre corbeille{Enter}');
    expect(outline()).toEqual(['Nouveau chapitre: Nouvelle scène']);
    await waitFor(() => expect(editorFocused()).toBe(true));
  });
});
