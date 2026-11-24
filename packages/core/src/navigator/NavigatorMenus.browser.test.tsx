import { guids, readOutline } from '@charpentier/schema';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { page, userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type * as Y from 'yjs';
import { formatBinding } from '../commands/keybinding';
import { hostPrimary, listenToCommands, startApp } from '../conformance/app-under-test';
import '../styles/base.css';

beforeEach(() => page.viewport(1440, 900));
afterEach(cleanup);

/** A key as the host names it: never a Mac sign written here. */
const key = (binding: string) => formatBinding(binding, hostPrimary);

/** `mod+alt+n` → the platform's chord. */
async function press(chord: string) {
  const parts = chord.split('+');
  const last = parts.pop() ?? '';
  const mods = parts.map((m) => ({ mod: 'ControlOrMeta', alt: 'Alt', shift: 'Shift' })[m] ?? m);
  await userEvent.keyboard(
    `${mods.map((m) => `{${m}>}`).join('')}${last.length > 1 ? `{${last}}` : last}${mods
      .reverse()
      .map((m) => `{/${m}}`)
      .join('')}`,
  );
}

async function answer(text: string) {
  await screen.findByRole('dialog', { name: 'Ligne de commande' });
  await userEvent.keyboard(`{ControlOrMeta>}a{/ControlOrMeta}${text}{Enter}`);
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Ligne de commande' })).toBeNull(),
  );
}

const editorFocused = () =>
  document.activeElement?.getAttribute('aria-label') === 'Texte de la scène';

/**
 * Two chapters, three scenes, the drawer open: « Chapitre 1 » (Scène 1, Scène B) and « Deux »
 * (Nouvelle scène, the open one).
 */
async function manuscript() {
  const { docs, prefs } = await startApp();
  await waitFor(() => expect(editorFocused()).toBe(true));
  await press('mod+alt+n');
  await answer('Scène B');
  await waitFor(() => expect(editorFocused()).toBe(true));
  await press('mod+alt+shift+n');
  await answer('Deux');
  await waitFor(() => expect(editorFocused()).toBe(true));
  await press('mod+j');
  await screen.findByRole('tree', { name: 'Plan du manuscrit' });
  const root = () => docs.get(guids.project(String(prefs.get('lastProjectId')))) as Y.Doc;
  const outline = () =>
    readOutline(root()).map((c) => `${c.title}: ${c.scenes.map((s) => s.title).join(', ')}`);
  return { outline };
}

const line = (name: string) => screen.getByRole('treeitem', { name });
const more = (name: string) => screen.getByRole('button', { name });
const menu = (name: string) => screen.findByRole('menu', { name });
const entry = (sheet: HTMLElement, name: string | RegExp) =>
  within(sheet).getByRole('menuitem', { name });
const noMenu = () => waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
const shownKey = (item: HTMLElement) => item.querySelector('kbd')?.textContent;

describe('the menu of a thing, in the manuscript drawer (docs/DESIGN.md §4.7)', () => {
  it('opens by « ⋯ », by right click and by M: the same menu, and Échap gives the line the focus back', async () => {
    await manuscript();
    const sceneB = line('Scène B');
    const button = more('Actions de la scène Scène B');
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    expect(button.tabIndex).toBe(-1);
    expect(button.title).toBe(`Actions (${key('m')})`);
    expect(button.getAttribute('aria-expanded')).toBe('false');

    // « ⋯ »: under it, right-aligned on it; the first entry has the focus.
    await userEvent.click(button);
    let sheet = await menu('Scène · Scène B');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(entry(sheet, 'Ouvrir')));
    const box = sheet.getBoundingClientRect();
    const anchor = button.getBoundingClientRect();
    expect(Math.round(box.right)).toBe(Math.round(anchor.right));
    expect(box.top).toBeGreaterThanOrEqual(anchor.bottom);
    expect(sheet.dataset['placement']).toBe('below');
    const labels = () =>
      within(sheet)
        .getAllByRole('menuitem')
        .map((item) => item.querySelector('.ch-menu-label')?.textContent);
    const content = labels();
    expect(content).toEqual([
      'Ouvrir',
      'Renommer…',
      'Nouvelle scène après',
      'Nouvelle variante (copie)',
      'Créer un point de restauration',
      'Monter',
      'Descendre',
      'Déplacer vers le chapitre…',
      'Mettre à la corbeille',
    ]);
    await userEvent.keyboard('{Escape}');
    await noMenu();
    expect(document.activeElement).toBe(sceneB);
    expect(button.getAttribute('aria-expanded')).toBe('false');

    // The right click: at the pointer.
    await userEvent.click(sceneB, { button: 'right', position: { x: 30, y: 8 } });
    sheet = await menu('Scène · Scène B');
    const at = sceneB.getBoundingClientRect();
    expect(Math.abs(sheet.getBoundingClientRect().left - (at.left + 30))).toBeLessThan(1.5);
    expect(Math.abs(sheet.getBoundingClientRect().top - (at.top + 8))).toBeLessThan(1.5);
    expect(labels()).toEqual(content);
    await userEvent.keyboard('{Escape}');
    await noMenu();
    expect(document.activeElement).toBe(sceneB);

    // M, then the menu key of the other keyboards, on the line that has the focus.
    await userEvent.keyboard('m');
    sheet = await menu('Scène · Scène B');
    expect(Math.round(sheet.getBoundingClientRect().right)).toBe(Math.round(anchor.right));
    expect(labels()).toEqual(content);
    await userEvent.keyboard('{Escape}');
    await noMenu();
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    await menu('Scène · Scène B');
    await userEvent.keyboard('{Escape}');
    await noMenu();
    expect(document.activeElement).toBe(sceneB);
  });

  it('runs an entry and closes, by a click, by ⏎ and by the key it shows', async () => {
    const { outline } = await manuscript();
    await userEvent.click(more('Actions de la scène Scène B'));
    let sheet = await menu('Scène · Scène B');
    const up = entry(sheet, 'Monter');
    expect(shownKey(up)).toBe(key('Alt-ArrowUp'));
    expect(up.getAttribute('aria-keyshortcuts')).toBe('Alt+ArrowUp');
    expect(shownKey(entry(sheet, 'Renommer…'))).toBe(key('r'));
    expect(shownKey(entry(sheet, 'Mettre à la corbeille'))).toBe(key('Backspace'));
    await userEvent.click(up);
    await noMenu();
    expect(outline()).toEqual(['Chapitre 1: Scène B, Scène 1', 'Deux: Nouvelle scène']);
    await waitFor(() => expect(document.activeElement).toBe(line('Scène B')));

    // The key shown acts directly, on the menu's thing.
    await userEvent.keyboard('m');
    await menu('Scène · Scène B');
    await press('alt+ArrowDown');
    await noMenu();
    expect(outline()).toEqual(['Chapitre 1: Scène 1, Scène B', 'Deux: Nouvelle scène']);

    // ↓ then ⏎: « Renommer… » closes the menu and asks for the name, as R does.
    await userEvent.keyboard('m');
    sheet = await menu('Scène · Scène B');
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(entry(sheet, 'Renommer…'));
    await userEvent.keyboard('{Enter}');
    await noMenu();
    await answer('Le quai');
    expect(outline()).toEqual(['Chapitre 1: Scène 1, Le quai', 'Deux: Nouvelle scène']);
    await waitFor(() => expect(document.activeElement).toBe(line('Le quai')));
  });

  it('keeps an entry that does not apply at its place, inert, and says why', async () => {
    const { outline } = await manuscript();
    await userEvent.click(more('Actions de la scène Scène 1'));
    const sheet = await menu('Scène · Scène 1');
    const up = entry(sheet, 'Monter');
    expect(up.getAttribute('aria-disabled')).toBe('true');
    expect(up.title).toBe('C’est déjà la première scène.');
    expect(shownKey(up)).toBeUndefined();
    expect(up.hasAttribute('aria-keyshortcuts')).toBe(false);
    expect(entry(sheet, 'Descendre').hasAttribute('aria-disabled')).toBe(false);

    // Neither the click nor its key does anything; ↑ ↓ pass over it.
    await userEvent.click(up, { force: true });
    await press('alt+ArrowUp');
    expect(screen.getByRole('menu')).toBe(sheet);
    expect(outline()).toEqual(['Chapitre 1: Scène 1, Scène B', 'Deux: Nouvelle scène']);
    entry(sheet, 'Créer un point de restauration').focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(entry(sheet, 'Descendre'));
    await userEvent.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(entry(sheet, 'Créer un point de restauration'));
  });

  it('closes at a click elsewhere, which does nothing more', async () => {
    await manuscript();
    await userEvent.click(more('Actions de la scène Scène B'));
    await menu('Scène · Scène B');
    // On another scene's line: with the menu open, the click only closes it.
    const other = line('Scène 1').getBoundingClientRect();
    const app = document.querySelector('.ch-app') as HTMLElement;
    const origin = app.getBoundingClientRect();
    await userEvent.click(app, {
      position: { x: other.left + 40 - origin.left, y: other.top + 10 - origin.top },
    });
    await noMenu();
    expect(screen.getByRole('tree', { name: 'Plan du manuscrit' })).toBeTruthy();
    expect(document.title).toBe('Mon projet — Nouvelle scène');
    await waitFor(() => expect(document.activeElement).toBe(line('Scène B')));
  });

  it('puts a scene in the trash from its menu, and the undo key brings it back', async () => {
    const { outline } = await manuscript();
    await userEvent.click(more('Actions de la scène Scène B'));
    const sheet = await menu('Scène · Scène B');
    // Always the last one, alone in its group.
    expect(within(sheet).getAllByRole('menuitem').at(-1)).toBe(
      entry(sheet, 'Mettre à la corbeille'),
    );
    await userEvent.click(entry(sheet, 'Mettre à la corbeille'));
    await noMenu();
    expect(outline()).toEqual(['Chapitre 1: Scène 1', 'Deux: Nouvelle scène']);
    expect(await screen.findByText(/Scène « Scène B » mise à la corbeille/)).toBeTruthy();
    await press('mod+z');
    await waitFor(() =>
      expect(outline()).toEqual(['Chapitre 1: Scène 1, Scène B', 'Deux: Nouvelle scène']),
    );
  });

  it('asks twice before a chapter that has scenes goes: the entry asks, the menu stays (DESIGN §4.7, rule 5)', async () => {
    const { outline } = await manuscript();
    await userEvent.click(more('Actions du chapitre Chapitre 1'));
    const sheet = await menu('Chapitre · Chapitre 1');
    await userEvent.click(entry(sheet, 'Mettre à la corbeille'));
    // Nothing went; the same entry now says what will go, lit, with the seconds left.
    const asking = entry(sheet, /^Confirmer\u00a0: chapitre et 2 scènes à la corbeille/);
    expect(asking.classList.contains('is-lit')).toBe(true);
    expect(asking.textContent).toMatch(/3\u00a0s$/);
    expect(screen.getByRole('menu')).toBe(sheet);
    expect(outline()).toEqual(['Chapitre 1: Scène 1, Scène B', 'Deux: Nouvelle scène']);
    // Past 3 s, the label comes back and nothing went.
    await waitFor(() => expect(entry(sheet, 'Mettre à la corbeille')).toBeTruthy(), {
      timeout: 4500,
    });
    expect(outline()).toEqual(['Chapitre 1: Scène 1, Scène B', 'Deux: Nouvelle scène']);
    // Two presses of its key, and it goes, with the way back on offer.
    await userEvent.keyboard('{Backspace}');
    entry(sheet, /^Confirmer\u00a0: chapitre/);
    await userEvent.keyboard('{Backspace}');
    await noMenu();
    expect(outline()).toEqual(['Deux: Nouvelle scène']);
    await screen.findByText(/^Chapitre .+Chapitre 1.+ et 2 scènes mis à la corbeille\.$/);
  }, 15000);

  it('asks in the status line at ⌫ on a chapter line; a second ⌫ does it, another key forgets it', async () => {
    const { outline } = await manuscript();
    line('Chapitre 1').focus();
    await userEvent.keyboard('{Backspace}');
    const ask = await screen.findByRole('button', {
      name: /^Confirmer\u00a0: chapitre et 2 scènes à la corbeille/,
    });
    expect(ask.querySelector('kbd')?.textContent).toBe(key('Backspace'));
    // The line keeps the focus; any other key forgets in silence.
    expect(document.activeElement).toBe(line('Chapitre 1'));
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Confirmer/ })).toBeNull());
    expect(outline()).toEqual(['Chapitre 1: Scène 1, Scène B', 'Deux: Nouvelle scène']);

    line('Chapitre 1').focus();
    await userEvent.keyboard('{Backspace}');
    await screen.findByRole('button', { name: /^Confirmer\u00a0: chapitre/ });
    await userEvent.keyboard('{Backspace}');
    await waitFor(() => expect(outline()).toEqual(['Deux: Nouvelle scène']));
    screen.getByRole('button', { name: 'Annuler la mise à la corbeille du chapitre Chapitre 1' });
  });

  it('a held ⌫ is one press: it neither confirms, nor forgets, on the line as in the menu', async () => {
    const { outline } = await manuscript();
    const repeats: boolean[] = [];
    const seen = (event: KeyboardEvent) => repeats.push(event.repeat);
    window.addEventListener('keydown', seen, true);
    const whole = ['Chapitre 1: Scène 1, Scène B', 'Deux: Nouvelle scène'];
    try {
      line('Chapitre 1').focus();
      // The host repeats the key while it is held: the first one is a press, not the others.
      await userEvent.keyboard('{Backspace>4/}');
      expect(repeats).toEqual([false, true, true, true]);
      expect(outline()).toEqual(whole);
      await screen.findByRole('button', { name: /^Confirmer\u00a0: chapitre/ });
      expect(document.activeElement).toBe(line('Chapitre 1'));
      // Another key forgets it.
      await userEvent.keyboard('{ArrowDown}');
      await waitFor(() => expect(screen.queryByRole('button', { name: /^Confirmer/ })).toBeNull());

      // An empty scene goes, and the line that takes the focus stays.
      line('Scène B').focus();
      await userEvent.keyboard('{Backspace>4/}');
      await waitFor(() =>
        expect(outline()).toEqual(['Chapitre 1: Scène 1', 'Deux: Nouvelle scène']),
      );
      await press('mod+z');
      await waitFor(() => expect(outline()).toEqual(whole));

      await userEvent.click(more('Actions du chapitre Chapitre 1'));
      const sheet = await menu('Chapitre · Chapitre 1');
      await userEvent.keyboard('{Backspace>4/}');
      expect(outline()).toEqual(whole);
      entry(sheet, /^Confirmer\u00a0: chapitre/);
      await userEvent.keyboard('{Escape}');
    } finally {
      window.removeEventListener('keydown', seen, true);
    }
  });

  it('puts an empty scene or chapter in the trash at the first press', async () => {
    const { outline } = await manuscript();
    line('Scène B').focus();
    await userEvent.keyboard('{Backspace}');
    await waitFor(() => expect(outline()).toEqual(['Chapitre 1: Scène 1', 'Deux: Nouvelle scène']));
    expect(screen.queryByRole('button', { name: /^Confirmer/ })).toBeNull();
  });

  it('replaces its content by the chapters for « Déplacer vers le chapitre… », and moves the scene', async () => {
    const { outline } = await manuscript();
    await userEvent.click(more('Actions de la scène Scène B'));
    const sheet = await menu('Scène · Scène B');
    await userEvent.click(entry(sheet, 'Déplacer vers le chapitre…'));
    // The list in place of the content: « ‹ Retour » at its head, the other chapters under it.
    const back = entry(sheet, '‹ Retour');
    expect(shownKey(back)).toBe(key('ArrowLeft'));
    expect(within(sheet).queryByRole('menuitem', { name: 'Ouvrir' })).toBeNull();
    const there = entry(sheet, 'II · Deux');
    expect(within(sheet).getAllByRole('menuitem')).toEqual([back, there]);
    await waitFor(() => expect(document.activeElement).toBe(there));

    // ← gives the content back, on the entry the list came from.
    await userEvent.keyboard('{ArrowLeft}');
    await waitFor(() =>
      expect(document.activeElement).toBe(entry(sheet, 'Déplacer vers le chapitre…')),
    );
    await userEvent.keyboard('{Enter}');
    await userEvent.click(entry(sheet, 'II · Deux'));
    await noMenu();
    expect(outline()).toEqual(['Chapitre 1: Scène 1', 'Deux: Nouvelle scène, Scène B']);
    await waitFor(() => expect(document.activeElement).toBe(line('Scène B')));
  });

  it('runs a command of the open scene for another one: that scene opens, then the command', async () => {
    await manuscript();
    const commands = listenToCommands();
    // On the open scene, the command's own key is shown.
    await userEvent.click(more('Actions de la scène Nouvelle scène'));
    let sheet = await menu('Scène · Nouvelle scène');
    let point = entry(sheet, 'Créer un point de restauration');
    expect(shownKey(point)).toBe(key('Mod-s'));
    expect(point.getAttribute('aria-keyshortcuts')).toBe(
      `${hostPrimary === 'Meta' ? 'Meta' : 'Control'}+S`,
    );
    await userEvent.keyboard('{Escape}');
    await noMenu();

    // On another scene that key would act on the open one: none is shown.
    await userEvent.click(more('Actions de la scène Scène 1'));
    sheet = await menu('Scène · Scène 1');
    point = entry(sheet, 'Créer un point de restauration');
    expect(shownKey(point)).toBeUndefined();
    expect(point.dataset['command']).toBe('createCheckpoint');
    await userEvent.click(point);
    await noMenu();
    await waitFor(() => expect(document.title).toBe('Mon projet — Scène 1'));
    expect(await screen.findByText('Point de restauration créé.')).toBeTruthy();
    expect(commands.heard).toEqual([{ id: 'createCheckpoint', from: 'control' }]);
    commands.stop();
  });

  it('has the menu of a chapter and of the manuscript, the Compagnon’s entries under his name', async () => {
    const { outline } = await manuscript();
    await userEvent.click(line('Deux'), { button: 'right' });
    let sheet = await menu('Chapitre · Deux');
    expect(
      within(sheet)
        .getAllByRole('menuitem')
        .map((item) => item.querySelector('.ch-menu-label')?.textContent),
    ).toEqual([
      'Renommer…',
      'Nouvelle scène dans ce chapitre',
      'Nouveau chapitre après',
      'Monter',
      'Descendre',
      'Avis sur tout le chapitre',
      'Bilan du chapitre',
      'Mettre à la corbeille',
    ]);
    const compagnon = within(sheet).getByRole('group', { name: 'Le Compagnon' });
    const review = within(compagnon).getByRole('menuitem', { name: 'Bilan du chapitre' });
    // The test platform has no Compagnon: inert, and it says so.
    expect(review.getAttribute('aria-disabled')).toBe('true');
    expect(review.title).toBe('Le Compagnon n’est pas disponible dans cette version.');
    expect(entry(sheet, 'Descendre').title).toBe('C’est déjà le dernier chapitre.');
    expect(shownKey(entry(sheet, 'Nouveau chapitre après'))).toBe(key('Shift-n'));
    await userEvent.click(entry(sheet, 'Monter'));
    await noMenu();
    expect(outline()).toEqual(['Deux: Nouvelle scène', 'Chapitre 1: Scène 1, Scène B']);

    // The manuscript: « ⋯ » beside the drawer's title, and the right click on the title.
    await userEvent.click(more('Actions du manuscrit Mon projet'));
    sheet = await menu('Manuscrit · Mon projet');
    expect(entry(sheet, 'Avis sur tout le manuscrit').getAttribute('aria-disabled')).toBe('true');
    await userEvent.keyboard('{Escape}');
    await noMenu();
    await userEvent.click(screen.getByText('Manuscrit', { selector: '.ch-panel-title-name' }), {
      button: 'right',
    });
    sheet = await menu('Manuscrit · Mon projet');
    await userEvent.click(entry(sheet, 'Nouveau chapitre'));
    await noMenu();
    await answer('Trois');
    // After the chapter of the line that has the focus in the drawer, as the drawer's own key does.
    expect(outline()).toEqual([
      'Deux: Nouvelle scène',
      'Trois: Nouvelle scène',
      'Chapitre 1: Scène 1, Scène B',
    ]);
  });

  it('has the menu of a variant of the open scene, whose keys are the variant’s', async () => {
    await manuscript();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(editorFocused()).toBe(true));
    await userEvent.keyboard('Texte A.');
    await press('mod+k');
    await screen.findByRole('dialog', { name: 'Ligne de commande' });
    await userEvent.keyboard('variante vide{Enter}');
    await answer('Sombre');
    await waitFor(() => expect(document.title).toBe('Mon projet — Nouvelle scène (Sombre)'));
    await press('mod+j');
    await screen.findByRole('tree', { name: 'Plan du manuscrit' });

    // The active variant: nothing to read, the command's key for a copy of it.
    await userEvent.click(more('Actions de la variante Sombre'));
    let sheet = await menu('Variante · Sombre');
    expect(within(sheet).queryByRole('menuitem', { name: 'Lire cette variante' })).toBeNull();
    expect(entry(sheet, 'Nouvelle variante à partir de celle-ci').dataset['command']).toBe(
      'newVariant',
    );
    await userEvent.keyboard('{Escape}');
    await noMenu();
    const sombre = screen.getByRole('button', { name: /B · Sombre/ });
    expect(document.activeElement).toBe(sombre);

    // The other one: « Lire cette variante » first, and it becomes the active one.
    await userEvent.click(screen.getByRole('button', { name: /A · Variante 1/ }), {
      button: 'right',
    });
    sheet = await menu('Variante · Variante 1');
    await waitFor(() => expect(document.activeElement).toBe(entry(sheet, 'Lire cette variante')));
    expect(
      entry(sheet, 'Nouvelle variante à partir de celle-ci').dataset['command'],
    ).toBeUndefined();
    await userEvent.keyboard('{Enter}');
    await noMenu();
    await waitFor(() => expect(document.title).toBe('Mon projet — Nouvelle scène (Variante 1)'));

    // M on a variant's line opens the variant's menu; its trash takes the variant, not the scene.
    sombre.focus();
    await userEvent.keyboard('m');
    sheet = await menu('Variante · Sombre');
    await userEvent.click(entry(sheet, 'Mettre à la corbeille'));
    await noMenu();
    expect(await screen.findByText(/Variante « Sombre » mise à la corbeille/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /B · Sombre/ })).toBeNull();
    expect(line('Nouvelle scène')).toBeTruthy();
  });
});
