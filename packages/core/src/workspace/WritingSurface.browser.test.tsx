import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { App } from '../app/App';
import { createI18n } from '../i18n/i18n';
import { createTestPlatform } from '../testing/test-platform';

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset['theme'];
});

const isMac = /Mac/.test(navigator.platform);

async function startApp(reserved: string[] = []) {
  const prefs = new Map<string, unknown>();
  const docs = new Map<string, Y.Doc>();
  const platform = createTestPlatform({
    keybindings: { primaryModifier: isMac ? 'Meta' : 'Control', reserved },
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
  return { editor, prefs };
}

const mod = (keys: string) => `{ControlOrMeta>}${keys}{/ControlOrMeta}`;

describe('writing surface', () => {
  it('shows the scene’s chapter and title, and counts its words', async () => {
    await startApp();
    const header = screen.getByRole('banner');
    expect(header.textContent).toBe('I · Chapitre 1—1 · Scène 1');
    expect(screen.getByText('0 mot')).toBeTruthy();
    await userEvent.keyboard('Il pleuvait sur Nantes{Enter}— Encore ?');
    await waitFor(() => expect(screen.getByText('5 mots')).toBeTruthy());
    // Today's progress, and the state.
    expect(screen.getByText('+5 aujourd’hui')).toBeTruthy();
    expect(screen.getByText('Enregistré')).toBeTruthy();
  });

  it('opens the command line on the scenes with ⌘P', async () => {
    await startApp();
    await userEvent.keyboard(mod('p'));
    const input = await screen.findByRole('combobox');
    expect((input as HTMLInputElement).value).toBe('#');
    expect(screen.getByText('Scènes')).toBeTruthy();
    expect(screen.getByRole('option').textContent).toContain('Scène 1');
    // Deleting the prefix goes back to the commands.
    await userEvent.keyboard('{Backspace}focus');
    expect(screen.getByText('Commandes')).toBeTruthy();
    expect(screen.getByRole('option').textContent).toContain('Mode focus');
  });

  it('dims all but the current paragraph in focus mode', async () => {
    const { editor, prefs } = await startApp();
    await userEvent.keyboard('Un.{Enter}Deux.{Enter}Trois.');
    await userEvent.keyboard(`{ControlOrMeta>}{Shift>}f{/Shift}{/ControlOrMeta}`);
    const app = editor.closest('.ch-app');
    await waitFor(() => expect(app?.hasAttribute('data-focus')).toBe(true));
    const paragraphs = [...editor.querySelectorAll('p')];
    expect(paragraphs.map((p) => p.classList.contains('is-current-block'))).toEqual([
      false,
      false,
      true,
    ]);
    await waitFor(() => expect(getComputedStyle(paragraphs[0] as Element).opacity).toBe('0.26'));
    await userEvent.keyboard('{ArrowUp}');
    await waitFor(() => expect(paragraphs[1]?.classList.contains('is-current-block')).toBe(true));
    expect(prefs.get('writing')).toMatchObject({ focusMode: true });
  });

  it('changes the text size from the keyboard and keeps it', async () => {
    const { editor, prefs } = await startApp();
    const size = () => parseFloat(getComputedStyle(editor).fontSize);
    expect(size()).toBe(19);
    await userEvent.keyboard(mod('='));
    await waitFor(() => expect(size()).toBe(20));
    await userEvent.keyboard(mod('-'));
    await userEvent.keyboard(mod('-'));
    await waitFor(() => expect(size()).toBe(18));
    expect(prefs.get('writing')).toMatchObject({ textSize: 18 });
  });

  it('falls back to the other shortcut where the host keeps ⌘N', async () => {
    await startApp([isMac ? 'Meta-n' : 'Control-n']);
    await userEvent.keyboard(mod('{Alt>}n{/Alt}'));
    expect(await screen.findByRole('dialog', { name: 'Ligne de commande' })).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard(mod('k'));
    await userEvent.keyboard('>nouvelle scene');
    const option = await screen.findByRole('option', { name: /Nouvelle scène/ });
    expect(option.textContent).toContain(isMac ? '⌥⌘N' : 'Ctrl+Alt+N');
  });

  it('cycles the theme and applies it to the document', async () => {
    await startApp();
    await userEvent.keyboard(mod('k'));
    await userEvent.keyboard('changer de theme{Enter}');
    await waitFor(() => expect(document.documentElement.dataset['theme']).toBe('light'));
    expect(screen.getByRole('status').textContent).toBe('Thème clair.');
  });

  it('keeps the focus in a command line opened right after leaving the drawer', async () => {
    await startApp();
    await userEvent.keyboard(mod('j'));
    await screen.findByRole('tree');
    // Hold animation frames: a deferred focus of the text would land after ⌘K.
    const frames: FrameRequestCallback[] = [];
    // eslint-disable-next-line charpentier/no-host-global-access -- a spy needs the object that holds the method
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    try {
      await userEvent.keyboard('{Escape}');
      await userEvent.keyboard(mod('k'));
      const input = await screen.findByRole('combobox');
      for (const frame of frames.splice(0)) frame(performance.now());
      expect(document.activeElement).toBe(input);
    } finally {
      raf.mockRestore();
    }
  });
});

describe('command line', () => {
  it('mixes commands and scenes when typing freely, each with its symbol', async () => {
    await startApp();
    await userEvent.keyboard(mod('k'));
    await userEvent.keyboard('scene');
    const list = await screen.findByRole('listbox');
    expect(list.textContent).toContain('Commandes');
    expect(list.textContent).toContain('Scènes');
    const scene = screen.getByRole('option', { name: /I\.1 Scène 1/ });
    expect(scene.textContent).toContain('#');
    expect(scene.textContent).toContain('0 mot');
  });
});
