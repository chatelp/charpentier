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

/** The drawer's line that has the focus. */
const focusedLine = () => document.activeElement?.getAttribute('aria-label');

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
    await waitFor(() => expect(document.title).toBe('Mon projet — Scène 1'));
    expect(screen.getByRole('textbox', { name: 'Texte de la scène' }).textContent).toBe(
      'Texte de la première scène.',
    );

    await press('mod+p'); // go to scene…
    await userEvent.keyboard('deuxieme{Enter}');
    await waitFor(() => expect(document.title).toBe('Mon projet — Deuxième'));
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
    await waitFor(() => expect(document.title).toBe('Mon projet — Scène 1'));

    await press('mod+k');
    await userEvent.keyboard('restaurer{Enter}');
    await userEvent.keyboard('{Enter}');
    expect(outline()).toEqual(['Chapitre 1: Scène 1, Éphémère']);
    await waitFor(() => expect(document.title).toBe('Mon projet — Éphémère'));

    // The trash says what went and how to get it back: ⌘Z, as long as nothing was typed since.
    await press('mod+k');
    await userEvent.keyboard('scene corbeille{Enter}');
    expect(outline()).toEqual(['Chapitre 1: Scène 1']);
    // (The queries read a non-breaking space as a space.)
    await screen.findByText('Scène « Éphémère » mise à la corbeille.');
    await press('mod+z');
    expect(outline()).toEqual(['Chapitre 1: Scène 1, Éphémère']);
    await waitFor(() => expect(document.title).toBe('Mon projet — Éphémère'));
    await screen.findByText('Remis en place.');

    // Once the author has typed, ⌘Z is the text's again: the scene stays in the trash.
    await press('mod+k');
    await userEvent.keyboard('scene corbeille{Enter}');
    await waitFor(() => expect(editorFocused()).toBe(true));
    await userEvent.keyboard('Un mot.');
    await press('mod+z');
    expect(outline()).toEqual(['Chapitre 1: Scène 1']);
  });

  it('brings back with ⌘Z the last scene put in the trash, and takes away the one made in its place', async () => {
    const { outline } = await startApp();
    await press('mod+k');
    await userEvent.keyboard('scene corbeille{Enter}');
    // A manuscript always has a scene to write in: one was made.
    expect(outline()).toEqual(['Chapitre 1: Nouvelle scène']);
    await press('mod+z');
    expect(outline()).toEqual(['Chapitre 1: Scène 1']);
    await waitFor(() => expect(document.title).toBe('Mon projet — Scène 1'));
  });

  it('says what went to the trash, with « Annuler », whose click does what ⌘Z does', async () => {
    const { outline } = await startApp();
    await press('mod+alt+n');
    await inputInPalette('Éphémère');
    await press('mod+k');
    await userEvent.keyboard('scene corbeille{Enter}');
    expect(outline()).toEqual(['Chapitre 1: Scène 1']);
    await screen.findByText('Scène « Éphémère » mise à la corbeille.');
    // The line's one button, named for what it brings back, with the undo key of the device.
    const button = screen.getByRole('button', {
      name: 'Annuler la mise à la corbeille de la scène Éphémère',
    });
    expect(button.querySelector('kbd')?.textContent).toBe(isMac ? '⌘Z' : 'Ctrl+Z');
    await userEvent.click(button);
    expect(outline()).toEqual(['Chapitre 1: Scène 1, Éphémère']);
    await waitFor(() => expect(document.title).toBe('Mon projet — Éphémère'));
    await screen.findByText('Remis en place.');
    expect(screen.queryByRole('button', { name: /^Annuler la mise à la corbeille/ })).toBeNull();
    // The scene came back open, its text with the focus.
    await waitFor(() => expect(editorFocused()).toBe(true));
  });

  it('counts the scenes that went with a chapter', async () => {
    await startApp();
    await press('mod+alt+shift+n');
    await inputInPalette('Nantes');
    await press('mod+alt+n');
    await inputInPalette('Le quai');
    await press('mod+k');
    await userEvent.keyboard('chapitre corbeille{Enter}');
    await screen.findByText('Chapitre « Nantes » et 2 scènes mis à la corbeille.');
    screen.getByRole('button', { name: 'Annuler la mise à la corbeille du chapitre Nantes' });
  });

  it('takes back several trashes one by one, the most recent first', async () => {
    const { outline } = await startApp();
    await press('mod+alt+n');
    await inputInPalette('Deux');
    await press('mod+alt+n');
    await inputInPalette('Trois');
    expect(outline()).toEqual(['Chapitre 1: Scène 1, Deux, Trois']);
    // In the drawer, ⌫ twice: nothing typed in between.
    await press('mod+j');
    await screen.findByRole('tree', { name: 'Plan du manuscrit' });
    await waitFor(() => expect(focusedLine()).toBe('Trois'));
    await userEvent.keyboard('{Backspace}');
    await screen.findByText('Scène « Trois » mise à la corbeille.');
    // The focus went to the line before.
    await waitFor(() => expect(focusedLine()).toBe('Deux'));
    await userEvent.keyboard('{Backspace}');
    // The message names the last one.
    await screen.findByText('Scène « Deux » mise à la corbeille.');
    expect(outline()).toEqual(['Chapitre 1: Scène 1']);

    await press('mod+z');
    expect(outline()).toEqual(['Chapitre 1: Scène 1, Deux']);
    await screen.findByText('Remis en place.');
    await press('mod+z');
    expect(outline()).toEqual(['Chapitre 1: Scène 1, Deux, Trois']);
    // Nothing more on offer: ⌘Z is the text's again.
    await press('mod+z');
    expect(outline()).toEqual(['Chapitre 1: Scène 1, Deux, Trois']);
  });

  it('forgets every way back as soon as the author types', async () => {
    const { outline } = await startApp();
    await press('mod+alt+n');
    await inputInPalette('Deux');
    await press('mod+alt+n');
    await inputInPalette('Trois');
    await press('mod+j');
    await screen.findByRole('tree', { name: 'Plan du manuscrit' });
    await waitFor(() => expect(focusedLine()).toBe('Trois'));
    await userEvent.keyboard('{Backspace}');
    // The focus went to the line before.
    await waitFor(() => expect(focusedLine()).toBe('Deux'));
    await userEvent.keyboard('{Backspace}');
    await screen.findByText('Scène « Deux » mise à la corbeille.');
    // Back to the text, a word: the message and its « Annuler » go, and ⌘Z is the text's.
    await press('Escape');
    await waitFor(() => expect(editorFocused()).toBe(true));
    await userEvent.keyboard('Un mot.');
    await waitFor(() =>
      expect(screen.queryByText('Scène « Deux » mise à la corbeille.')).toBeNull(),
    );
    expect(screen.queryByRole('button', { name: /^Annuler la mise à la corbeille/ })).toBeNull();
    await press('mod+z');
    await press('mod+z');
    expect(outline()).toEqual(['Chapitre 1: Scène 1']);
  });

  it('keeps a trash’s message past the 4 s of a confirmation, then lets it go', async () => {
    await startApp();
    await press('mod+alt+n');
    await inputInPalette('Éphémère');
    await press('mod+k');
    await userEvent.keyboard('scene corbeille{Enter}');
    await screen.findByText('Scène « Éphémère » mise à la corbeille.');
    await new Promise((resolve) => setTimeout(resolve, 5000));
    expect(screen.getByText('Scène « Éphémère » mise à la corbeille.')).toBeTruthy();
    screen.getByRole('button', { name: 'Annuler la mise à la corbeille de la scène Éphémère' });
    await waitFor(
      () => expect(screen.queryByText('Scène « Éphémère » mise à la corbeille.')).toBeNull(),
      { timeout: 5000 },
    );
  }, 20000);

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
