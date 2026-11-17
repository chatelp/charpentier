import { createChapter, createScene, guids, readOutline } from '@charpentier/schema';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
  const editor = await screen.findByRole('textbox', { name: 'Texte de la scène' });
  await waitFor(() => expect(document.activeElement).toBe(editor));
  const root = docs.get(guids.project(String(prefs.get('lastProjectId')))) as Y.Doc;
  const outline = () =>
    readOutline(root).map((c) => `${c.title}: ${c.scenes.map((s) => s.title).join(', ')}`);
  return { root, outline };
}

describe('overview of the manuscript', () => {
  it('shows chapters as columns with word counts, moves scenes and opens one', async () => {
    const { root, outline } = await startApp();
    await userEvent.keyboard('Il pleuvait sur Nantes.');
    const two = createChapter(root, { title: 'Deux' });
    createScene(root, { chapterId: two, title: 'B' });
    createScene(root, { chapterId: two, title: 'C' });

    await userEvent.keyboard('{ControlOrMeta>}{Shift>}p{/Shift}{/ControlOrMeta}');
    const overview = await screen.findByRole('region', { name: 'Vue d’ensemble du manuscrit' });
    await waitFor(() => expect(overview.textContent).toContain('4 mots'));
    expect(screen.getByRole('group', { name: 'Deux' })).toBeTruthy();
    const current = screen.getByRole('article', { name: 'I.1 Scène 1' });
    expect(current.getAttribute('aria-current')).toBe('true');
    expect(document.activeElement).toBe(current);

    await userEvent.keyboard('{ArrowRight}{ArrowDown}'); // to C
    expect(document.activeElement).toBe(screen.getByRole('article', { name: 'II.2 C' }));
    await userEvent.keyboard('{Alt>}{ArrowUp}{/Alt}');
    expect(outline()).toEqual(['Chapitre 1: Scène 1', 'Deux: C, B']);
    await userEvent.keyboard('{Alt>}{ArrowLeft}{/Alt}');
    expect(outline()).toEqual(['Chapitre 1: Scène 1, C', 'Deux: B']);

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('article', { name: 'I.2 C' })),
    );
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(document.title).toBe('Mon roman — C'));
    expect(screen.queryByRole('region', { name: 'Vue d’ensemble du manuscrit' })).toBeNull();
  });

  it('previews a restore point from the strip and restores it, from the keyboard', async () => {
    await startApp();
    await userEvent.keyboard('Premier jet.');
    await userEvent.keyboard('{ControlOrMeta>}s{/ControlOrMeta}');
    await screen.findByText('Point de restauration créé.');
    await userEvent.keyboard(' Ajout regretté.');

    await userEvent.keyboard('{ControlOrMeta>}{Shift>}p{/Shift}{/ControlOrMeta}');
    const strip = await screen.findByRole('contentinfo', { name: /Variantes et restauration/ });
    await waitFor(() => expect(strip.textContent).toContain('Point manuel'));
    // H: into the restore points; ↵ opens the preview.
    await userEvent.keyboard('h');
    await waitFor(() => expect(document.activeElement?.textContent).toContain('Point manuel'));
    await userEvent.keyboard('{Enter}');
    const preview = await screen.findByRole('dialog');
    expect(preview.textContent).toContain('Premier jet.');
    expect(preview.textContent).toContain('2 mots, soit 2 de moins qu’aujourd’hui');
    await waitFor(() => expect(document.activeElement).toBe(preview));
    // ↵ restores, no confirmation; the previous state is a restore point itself.
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(strip.textContent).toContain('Avant une restauration'));
    await userEvent.keyboard('{Escape}{Escape}');
    const editor = await screen.findByRole('textbox', { name: 'Texte de la scène' });
    await waitFor(() => expect(editor.textContent).toBe('Premier jet.'));
  });
});
