import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { App } from '../app/App';
import { createI18n } from '../i18n/i18n';
import { createTestPlatform } from '../testing/test-platform';
import { openedWhen } from './NovelTitle';

afterEach(cleanup);

const isMac = /Mac/.test(navigator.platform);
const mod = (keys: string) => `{ControlOrMeta>}${keys}{/ControlOrMeta}`;

/** Five novels; the last created is the most recent, the one that opens. */
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
        const d = docs.get(guid) ?? new Y.Doc({ guid });
        docs.set(guid, d);
        return { guid, doc: d, whenLoaded: Promise.resolve(), close: async () => {} };
      },
    },
  });
  for (const title of [
    'Le Grenier',
    'Nouvelles de l’estuaire',
    'La Saison des cerises',
    'Le Phare des Sept-Îles',
    'Avant Nantes',
  ])
    await platform.library.create({ title, kind: 'novel' });
  render(<App platform={platform} i18n={await createI18n('fr')} />);
  const editor = await screen.findByRole('textbox', { name: 'Texte de la scène' });
  await waitFor(() => expect(document.activeElement).toBe(editor));
  return { platform, editor };
}

const button = () =>
  screen.getByRole('button', { name: /le roman\u00A0: renommer, changer de roman/ });

describe('the novel’s title (docs/DESIGN.md §4.8, 1.19)', () => {
  it('opens the novel’s sheet: its figures, the three novels opened last, the library', async () => {
    const { editor } = await start();
    await waitFor(() => expect(button().textContent).toContain('Avant Nantes'));
    expect(button().getAttribute('aria-haspopup')).toBe('dialog');
    expect(button().getAttribute('aria-expanded')).toBe('false');

    await userEvent.click(button());
    const sheet = await screen.findByRole('dialog', { name: 'Le roman' });
    expect(button().getAttribute('aria-expanded')).toBe('true');
    expect(sheet.textContent).toContain('Roman · 1 chapitre · 1 scène · 0 mot');
    await within(sheet).findByRole('button', { name: /Le Phare des Sept-Îles/ });
    const others = [...sheet.querySelectorAll<HTMLElement>('.ch-novel-other')];
    expect(others.map((b) => b.querySelector('b')?.textContent)).toEqual([
      'Le Phare des Sept-Îles',
      'La Saison des cerises',
      'Nouvelles de l’estuaire',
    ]);
    // The first focus goes to the first novel of the list; ↑↓ choose.
    await waitFor(() => expect(document.activeElement).toBe(others[0]));
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(others[1]);
    within(sheet).getByRole('button', { name: /Tous les romans…/ });
    within(sheet).getByRole('button', { name: '+ Nouveau roman' });

    // Échap closes it, and the text has the focus again.
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Le roman' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(editor));
  });

  it('renames the novel with R, everywhere at once; an empty title is not saved', async () => {
    const { platform } = await start();
    await userEvent.click(button());
    await screen.findByRole('dialog', { name: 'Le roman' });
    await userEvent.keyboard('r');
    const field = await screen.findByRole('textbox', { name: 'Titre du roman' });
    expect(field).toHaveProperty('value', 'Avant Nantes');
    await userEvent.clear(field);
    expect(screen.getByRole('button', { name: /^Renommer/ })).toHaveProperty('disabled', true);
    await userEvent.type(field, 'Avant Nantes, 1910{Enter}');
    await waitFor(() => expect(button().textContent).toContain('Avant Nantes, 1910'));
    // The window's title too (the window list, Mission Control).
    await waitFor(() => expect(document.title).toBe('Avant Nantes, 1910 — Scène 1'));
    const all = await platform.library.list();
    expect(all.find((p) => p.title === 'Avant Nantes, 1910')).toBeDefined();
    // Back to the sheet, not closed.
    screen.getByRole('dialog', { name: 'Le roman' });

    // Échap on the field cancels without renaming, and leaves the sheet open.
    await userEvent.keyboard('r');
    await screen.findByRole('textbox', { name: 'Titre du roman' });
    await userEvent.keyboard('X{Escape}');
    expect(screen.queryByRole('textbox', { name: 'Titre du roman' })).toBeNull();
    screen.getByRole('dialog', { name: 'Le roman' });
    expect(button().textContent).toContain('Avant Nantes, 1910');
  });

  it('opens another novel from the sheet, without going through the library', async () => {
    await start();
    await userEvent.click(button());
    const sheet = await screen.findByRole('dialog', { name: 'Le roman' });
    // The test runs without the app's styles, where surfaces overlap: clicked through the DOM.
    (await within(sheet).findByRole('button', { name: /La Saison des cerises/ })).click();
    await waitFor(() => expect(button().textContent).toContain('La Saison des cerises'));
  });

  it('renames in place in the overview, and the drawer’s title opens the sheet', async () => {
    await start();
    await userEvent.keyboard(mod('{Shift>}p{/Shift}'));
    const overview = await screen.findByRole('region', { name: 'Vue d’ensemble du manuscrit' });
    within(overview).getByRole('button', { name: /Tous les romans…/ });
    await waitFor(() => expect(document.activeElement?.closest('.ch-card')).not.toBeNull());
    await userEvent.keyboard('r');
    const field = await within(overview).findByRole('textbox', { name: 'Titre du roman' });
    await userEvent.clear(field);
    await userEvent.type(field, 'Le Fleuve{Enter}');
    await waitFor(() =>
      expect(overview.querySelector('.ch-overview-title')?.textContent).toContain('Le Fleuve'),
    );
    await userEvent.keyboard('{Escape}');

    await userEvent.keyboard(mod('j'));
    const drawer = await screen.findByRole('complementary', { name: 'Plan du manuscrit' });
    within(drawer).getByRole('button', { name: 'Le Fleuve' }).click();
    await screen.findByRole('dialog', { name: 'Le roman' });
    expect(screen.queryByRole('complementary', { name: 'Plan du manuscrit' })).toBeNull();
  });
});

describe('when the author last opened a novel', () => {
  it('says « aujourd’hui », « hier », then the date', async () => {
    const i18n = await createI18n('fr');
    const t = i18n.t.bind(i18n) as Parameters<typeof openedWhen>[0];
    const now = new Date(2026, 10, 17, 9, 0);
    expect(openedWhen(t, 'fr', new Date(2026, 10, 17, 1, 0).toISOString(), now)).toBe(
      'aujourd’hui',
    );
    expect(openedWhen(t, 'fr', new Date(2026, 10, 16, 23, 0).toISOString(), now)).toBe('hier');
    expect(openedWhen(t, 'fr', new Date(2026, 10, 2, 12, 0).toISOString(), now)).toBe('le 2 nov.');
    expect(openedWhen(t, 'fr', new Date(2025, 9, 18, 12, 0).toISOString(), now)).toBe(
      'le 18 oct. 2025',
    );
  });
});
