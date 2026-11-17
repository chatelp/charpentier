import type { MenuModel } from '@charpentier/platform';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { App } from '../app/App';
import { createI18n } from '../i18n/i18n';
import { probeFeature } from '../testing/test-feature';
import { createTestPlatform } from '../testing/test-platform';
import type { Feature } from './feature';

afterEach(cleanup);

const isMac = /Mac/.test(navigator.platform);
const mod = (keys: string) => `{ControlOrMeta>}${keys}{/ControlOrMeta}`;

async function start(features?: readonly Feature[]) {
  const prefs = new Map<string, unknown>([['welcomed', true]]);
  const docs = new Map<string, Y.Doc>();
  const menus: MenuModel[] = [];
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
    menu: { set: (model) => void menus.push(model), onCommand: () => () => {} },
  });
  render(<App platform={platform} i18n={await createI18n('fr')} {...(features && { features })} />);
  const editor = await screen.findByRole('textbox', { name: 'Texte de la scène' });
  await waitFor(() => expect(document.activeElement).toBe(editor));
  return { editor, lastMenu: () => menus.at(-1) };
}

const command = async (words: string) => {
  await userEvent.keyboard(mod('k'));
  await userEvent.keyboard(`${words}{Enter}`);
};

const appTop = () => getComputedStyle(document.querySelector('.ch-app') as Element).top;

describe('contribution points of the core (phase 5.1)', () => {
  it('shows what a feature brings, without touching the core', async () => {
    const { editor, lastMenu } = await start([probeFeature]);

    // A band at the top; the rest of the window starts below it.
    expect(screen.getByRole('region', { name: 'Bande de la sonde' }).textContent).toBe(
      'projet write',
    );
    expect(appTop()).toBe('24px');
    // A state in the footer.
    expect(screen.getByText('sonde ok').closest('footer')).toBeTruthy();

    // A command in the command line, and its group in the menu.
    await command('sonder');
    await screen.findByText('sonde : ping');
    expect(lastMenu()?.menus.map((m) => m.label)).toContain('Sonde');

    // A prefix of its own, which reads what follows it.
    await userEvent.keyboard(mod('k'));
    await userEvent.keyboard('!bonjour');
    await screen.findByRole('option', { name: 'écho bonjour' });
    await userEvent.keyboard('{Enter}');
    await screen.findByText('écho bonjour');

    // The machine's settings, opened by their shortcut on the board of dials (DESIGN 1.23);
    // ⏎ opens a section with its rail, which goes from one to the next; Échap back to the board.
    await userEvent.keyboard(mod('{Alt>},{/Alt}'));
    const board = await screen.findByRole('listbox', { name: 'Sections des réglages' });
    await waitFor(() => expect(document.activeElement?.getAttribute('data-dial')).toBe('probe'));
    expect(board.textContent).toContain('Autre sonde');
    expect(document.activeElement?.textContent).toContain('42');
    expect(screen.getByRole('region', { name: 'Bande de la sonde' }).textContent).toBe(
      'projet system-settings',
    );
    await userEvent.keyboard('{Enter}');
    expect((await screen.findByRole('region', { name: 'Sonde' })).textContent).toContain(
      'Régler la sonde',
    );
    await waitFor(() => expect(document.activeElement?.getAttribute('data-section')).toBe('probe'));
    await userEvent.keyboard('{ArrowDown}');
    await screen.findByRole('region', { name: 'Autre sonde' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('data-dial')).toBe('probeOther'),
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(editor));

    // A click on an empty spot leaves the focus on the body: Échap still goes back to the text.
    await userEvent.keyboard(mod('{Alt>},{/Alt}'));
    await screen.findByRole('listbox', { name: 'Sections des réglages' });
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(editor));

    // A full-frame view.
    await command('vue sonde');
    await userEvent.click(await screen.findByRole('button', { name: 'Fermer la sonde' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Fermer la sonde' })).toBeNull(),
    );
    expect(screen.getByRole('region', { name: 'Bande de la sonde' }).textContent).toBe(
      'projet write',
    );
  });

  it('leaves nothing of it once it is gone', async () => {
    const { editor, lastMenu } = await start();
    expect(screen.queryByRole('region', { name: 'Bande de la sonde' })).toBeNull();
    expect(appTop()).toBe('0px');
    expect(screen.queryByText('sonde ok')).toBeNull();

    await userEvent.keyboard(mod('k'));
    await userEvent.keyboard('sonder');
    await screen.findByText('Aucun résultat');
    await userEvent.keyboard('{Escape}');

    // Without it, ⌘, opens the app's settings, and nothing of the machine's.
    await waitFor(() => expect(document.activeElement).toBe(editor));
    await userEvent.keyboard(mod(','));
    const rail = await screen.findByRole('listbox', { name: 'Sections des réglages' });
    expect(rail.textContent).toContain('Apparence');
    expect(rail.textContent).not.toContain('Sonde');
    const ids = lastMenu()?.menus.flatMap((m) =>
      m.entries.flatMap((e) => (e.kind === 'command' ? [e.id] : [])),
    );
    expect(ids).toContain('openSettings');
    expect(ids).not.toContain('probeSettings');
    expect(lastMenu()?.menus.map((m) => m.label)).not.toContain('Sonde');
  });
});
