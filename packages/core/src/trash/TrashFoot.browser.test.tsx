import { guids, readOutline } from '@charpentier/schema';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { page, userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type * as Y from 'yjs';
import { startApp } from '../conformance/app-under-test';
import '../styles/base.css';

beforeEach(() => page.viewport(1440, 900));
afterEach(cleanup);

const textFocused = () =>
  waitFor(() =>
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Texte de la scène'),
  );

async function command(name: string, answer?: string) {
  await userEvent.keyboard('{ControlOrMeta>}k{/ControlOrMeta}');
  await screen.findByRole('dialog', { name: 'Ligne de commande' });
  await userEvent.keyboard(`${name}{Enter}`);
  if (answer !== undefined) {
    await screen.findByRole('dialog', { name: 'Ligne de commande' });
    await userEvent.keyboard(`{ControlOrMeta>}a{/ControlOrMeta}${answer}{Enter}`);
  }
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Ligne de commande' })).toBeNull(),
  );
}

const openDrawer = async () => {
  await userEvent.keyboard('{ControlOrMeta>}j{/ControlOrMeta}');
  await screen.findByRole('tree', { name: 'Plan du manuscrit' });
};

/** « Chapitre 1 » (Scène 1, Le quai) and « Deux » (Nouvelle scène, open), nothing written. */
async function drawer() {
  const { docs, prefs } = await startApp();
  await textFocused();
  await command('Nouvelle scène', 'Le quai');
  await textFocused();
  await command('Nouveau chapitre', 'Deux');
  await textFocused();
  await openDrawer();
  const root = () => docs.get(guids.project(String(prefs.get('lastProjectId')))) as Y.Doc;
  const outline = () =>
    readOutline(root()).map((c) => `${c.title}: ${c.scenes.map((s) => s.title).join(', ')}`);
  return { outline, root };
}
const WHOLE = ['Chapitre 1: Scène 1, Le quai', 'Deux: Nouvelle scène'];
const line = (name: string) => screen.getByRole('treeitem', { name });
const link = (n: number) =>
  screen.findByRole('button', { name: `Corbeille, ${n} élément${n > 1 ? 's' : ''}` });

describe('the trash at the foot of a list (docs/DESIGN.md §4.7, rules 3 and 4 of §5.0)', () => {
  it('says nothing when empty; a scene comes back to its place, and has the focus', async () => {
    const { outline } = await drawer();
    expect(outline()).toEqual(WHOLE);
    expect(screen.queryByRole('button', { name: /^Corbeille/ })).toBeNull();

    line('Scène 1').focus();
    await userEvent.keyboard('{Backspace}');
    const folded = await link(1);
    expect(folded.getAttribute('aria-expanded')).toBe('false');
    expect(folded.textContent).toBe('Corbeille (1)');
    await userEvent.click(folded);
    const list = screen.getByRole('list', { name: 'Corbeille du manuscrit' });
    expect(list.textContent).toMatch(/^Scène 1scène de Chapitre 1 · aujourd’hui à \d/);
    await userEvent.click(within(list).getByRole('button', { name: 'Remettre Scène 1' }));
    expect(outline()).toEqual(WHOLE);
    await screen.findByText(/^Scène .+Scène 1.+ remise\.$/);
    await waitFor(() => expect(document.activeElement).toBe(line('Scène 1')));
    expect(screen.queryByRole('button', { name: /^Corbeille/ })).toBeNull();
    // It came back without being opened.
    expect(document.title).toBe('Mon projet — Nouvelle scène');
  });

  it('keeps a chapter and its scenes on one line, the most recent first', async () => {
    const { outline } = await drawer();
    line('Le quai').focus();
    await userEvent.keyboard('{Backspace}');
    await link(1);
    // The dates are to the millisecond.
    await new Promise((resolve) => setTimeout(resolve, 5));
    line('Chapitre 1').focus();
    await userEvent.keyboard('{Backspace}');
    await screen.findByRole('button', { name: /^Confirmer/ });
    await userEvent.keyboard('{Backspace}');
    await userEvent.click(await link(2));
    const items = screen.getAllByRole('listitem').map((i) => i.textContent);
    expect(items[0]).toMatch(/^Chapitre 1chapitre, avec 1 scène · /);
    expect(items[1]).toMatch(/^Le quaiscène de Chapitre 1 · /);
    // A scene whose chapter is in the trash brings it back, and says so.
    await userEvent.click(screen.getByRole('button', { name: 'Remettre Le quai' }));
    await screen.findByText(/^Scène .+Le quai.+ remise, avec son chapitre .+Chapitre 1.+\.$/);
    expect(outline()).toEqual(WHOLE);
  });

  it('walks with the keyboard from the last line, and ⌫ there erases nothing', async () => {
    const { outline } = await drawer();
    line('Scène 1').focus();
    await userEvent.keyboard('{Backspace}');
    const folded = await link(1);
    line('Nouvelle scène').focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(folded);
    await userEvent.keyboard('{Enter}{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remettre Scène 1' }));
    const before = outline();
    await userEvent.keyboard('{Backspace}');
    expect(outline()).toEqual(before);
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    await waitFor(() => expect(document.activeElement).toBe(line('Nouvelle scène')));
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(outline()).toEqual(WHOLE);
  });

  it('brings a variant back into its scene, without reading it', async () => {
    const { root } = await drawer();
    await userEvent.keyboard('{Escape}');
    await textFocused();
    await command('Nouvelle variante (copie', 'Au présent');
    await textFocused();
    await command('Mettre la variante à la corbeille');
    await textFocused();
    await openDrawer();
    await userEvent.click(await link(1));
    const list = screen.getByRole('list', { name: 'Corbeille du manuscrit' });
    expect(list.textContent).toMatch(/^Au présentvariante de Nouvelle scène · /);
    const scene = () => {
      const found = readOutline(root())
        .flatMap((c) => c.scenes)
        .find((s) => s.title === 'Nouvelle scène');
      return found && { variants: found.variants.length, active: found.activeVariantId };
    };
    const before = scene();
    expect(before?.variants).toBe(1);
    await userEvent.click(within(list).getByRole('button', { name: 'Remettre Au présent' }));
    await screen.findByText(/^Variante .+Au présent.+ remise\.$/);
    expect(scene()).toEqual({ variants: 2, active: before?.active });
  });

  it('in the Atelier: an entry comes back selected, and no key there aims at the entry above', async () => {
    await startApp();
    await textFocused();
    await command('Nouveau personnage', 'Hélène');
    await waitFor(() => screen.getByRole('listbox', { name: 'Personnages' }));
    await command('Nouveau personnage', 'Jules');
    const entries = () =>
      within(screen.getByRole('listbox', { name: 'Personnages' })).queryAllByRole('option');
    await waitFor(() => expect(entries()).toHaveLength(2));
    const helene = entries().find((e) => e.textContent?.includes('Hélène')) as HTMLElement;
    await userEvent.click(helene);
    helene.focus();
    await userEvent.keyboard('{Backspace}');
    await waitFor(() => expect(entries()).toHaveLength(1));
    (await link(1)).focus();
    await userEvent.keyboard('{Enter}{ArrowDown}{Backspace}');
    expect(entries()).toHaveLength(1);
    const list = screen.getByRole('list', { name: 'Corbeille de Personnages' });
    expect(list.textContent).toMatch(/^Hélènefiche de Personnages · /);
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(entries()).toHaveLength(2));
    await waitFor(() => {
      expect(document.activeElement?.getAttribute('role')).toBe('option');
      expect(document.activeElement?.textContent).toContain('Hélène');
    });
  });
});
