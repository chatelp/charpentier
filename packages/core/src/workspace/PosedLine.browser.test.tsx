import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { page, userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatBinding } from '../commands/keybinding';
import { hostPrimary, startApp } from '../conformance/app-under-test';
import '../styles/base.css';

beforeEach(() => page.viewport(1280, 800));
afterEach(cleanup);

const NAME = 'Le quai de la Fosse un soir de novembre, avant que la Loire ne monte';
const key = (binding: string) => formatBinding(binding, hostPrimary);
const textFocused = () =>
  waitFor(() =>
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Texte de la scène'),
  );
const answer = async (text: string) => {
  await screen.findByRole('dialog', { name: 'Ligne de commande' });
  await userEvent.keyboard(`{ControlOrMeta>}a{/ControlOrMeta}${text}{Enter}`);
  await textFocused();
};
async function command(name: string, value?: string) {
  await userEvent.keyboard('{ControlOrMeta>}k{/ControlOrMeta}');
  await screen.findByRole('dialog', { name: 'Ligne de commande' });
  await userEvent.keyboard(`${name}{Enter}`);
  if (value !== undefined) await answer(value);
}
/** « Chapitre 1 » (Scène 1, written) and a chapter with the long name (an empty scene, open); the drawer open. */
async function drawer() {
  const { editor } = await startApp();
  await textFocused();
  await userEvent.keyboard('Il pleuvait sur Nantes hier.');
  await command('Nouveau chapitre', NAME);
  await userEvent.keyboard('{ControlOrMeta>}j{/ControlOrMeta}');
  await screen.findByRole('tree', { name: 'Plan du manuscrit' });
  return editor;
}
const line = (name: string) => screen.getByRole('treeitem', { name });
const foot = () => (document.querySelector('.ch-footer') as HTMLElement).getBoundingClientRect();
const settled = () =>
  Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)));
/** The plate: inside the foot's width, 6 px above it, its parts inside it. */
function onTheFoot() {
  const plate = document.querySelector('.ch-posed') as HTMLElement;
  const box = plate.getBoundingClientRect();
  expect(box.right).toBeCloseTo(foot().right, 0);
  expect(box.left).toBeGreaterThanOrEqual(foot().left - 0.5);
  expect(foot().top - box.bottom).toBeCloseTo(6, 0);
  for (const part of plate.querySelectorAll<HTMLElement>('kbd, button, .ch-confirm-left, span')) {
    const inner = part.getBoundingClientRect();
    expect(inner.right, part.className).toBeLessThanOrEqual(box.right + 0.5);
    expect(inner.left, part.className).toBeGreaterThanOrEqual(box.left - 0.5);
  }
  return plate;
}
const trashChapter = async () => {
  line(NAME).focus();
  await userEvent.keyboard('{Backspace}');
  await screen.findByRole('button', { name: /^Confirmer/ });
  await userEvent.keyboard('{Backspace}');
  return screen.findByRole('button', {
    name: `Annuler la mise à la corbeille du chapitre ${NAME}`,
  });
};

describe('the state line that carries a button, above the foot (docs/DESIGN.md §4.7, 1.43)', () => {
  it('the question, with the armed line of the drawer saying the same second', async () => {
    await drawer();
    const there = line('Chapitre 1');
    const height = there.getBoundingClientRect().height;
    there.focus();
    await userEvent.keyboard('{Backspace}');
    const ask = await screen.findByRole('button', {
      name: /^Confirmer\u00a0: chapitre et 1 scène/,
    });
    await settled();
    expect(onTheFoot()).toBe(ask);
    const meta = there.querySelector('.ch-nav-meta');
    expect(meta?.textContent).toBe(`${key('Backspace')}3\u00a0s`);
    expect(there.getBoundingClientRect().height).toBe(height);
    expect(document.activeElement).toBe(there);
    await waitFor(() => expect(meta?.textContent).toMatch(/2\u00a0s$/), { timeout: 2000 });
    expect(ask.querySelector('.ch-confirm-left')?.textContent).toBe('2\u00a0s');
    // Past 3 s: the words again.
    await waitFor(() => expect(there.querySelector('.ch-nav-armed')).toBeNull(), { timeout: 3500 });
    expect(there.querySelector('.ch-nav-meta')?.textContent).toBe('5');
  }, 15000);

  it('the message, whole on one line; only the name is cut, with both panels open', async () => {
    await drawer();
    let undo = await trashChapter();
    await settled();
    let plate = onTheFoot();
    expect(plate.contains(undo)).toBe(true);
    expect(plate.getBoundingClientRect().height).toBeLessThanOrEqual(32);
    // Read whole, whatever shows.
    await screen.findByText(`Chapitre « ${NAME} » et 1 scène mis à la corbeille.`);
    await userEvent.click(undo);
    await waitFor(() => line(NAME));

    await userEvent.keyboard('{ControlOrMeta>}l{/ControlOrMeta}');
    await screen.findByRole('complementary', { name: /Compagnon/ });
    await settled();
    undo = await trashChapter();
    await settled();
    plate = onTheFoot();
    expect(plate.getBoundingClientRect().height).toBeLessThanOrEqual(32);
    const name = plate.querySelector('.ch-posed-name') as HTMLElement;
    expect(name.scrollWidth).toBeGreaterThan(name.clientWidth);
    for (const part of plate.querySelectorAll<HTMLElement>(
      '.ch-posed-text > span:not(.ch-posed-name)',
    ))
      expect(part.scrollWidth).toBeLessThanOrEqual(Math.ceil(part.getBoundingClientRect().width));
    expect(plate.querySelector('.ch-posed-phrase')?.getAttribute('title')).toContain(NAME);
    await userEvent.click(undo);
    await waitFor(() => line(NAME));
    // « Remis en place. », without a button, is in the foot's column.
    expect((await screen.findByText('Remis en place.')).closest('.ch-footer-right')).toBeTruthy();
    expect(document.querySelector('.ch-posed')).toBeNull();
  }, 20000);

  it('on a phone’s width it wraps, upward, and stays in the window', async () => {
    await drawer();
    await userEvent.keyboard('{Escape}');
    await textFocused();
    await page.viewport(330, 700);
    await command('chapitre corbeille');
    await screen.findByRole('option', { name: /Confirmer/ });
    await userEvent.keyboard('{Enter}');
    await screen.findByRole('button', { name: /^Annuler la mise/ });
    await settled();
    const plate = document.querySelector('.ch-posed') as HTMLElement;
    const box = plate.getBoundingClientRect();
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(330);
    expect(box.bottom).toBeLessThanOrEqual(foot().top);
  });

  it('does not move the text, and leaves at the first key typed in it', async () => {
    const editor = await drawer();
    const before = () => editor.querySelector('p')?.getBoundingClientRect().top;
    await trashChapter();
    await screen.findByRole('button', { name: /^Annuler la mise/ });
    const at = screen.getByRole('textbox', { name: 'Texte de la scène' });
    const top = at.querySelector('p')?.getBoundingClientRect().top;
    expect(before()).toBeDefined();
    await userEvent.click(at);
    await userEvent.keyboard('Un');
    await waitFor(() => expect(document.querySelector('.ch-posed')).toBeNull());
    expect(at.querySelector('p')?.getBoundingClientRect().top).toBe(top);
  });
});

describe('one Échap does one thing (docs/DESIGN.md §4.7, 1.43)', () => {
  const tree = () => screen.queryByRole('tree', { name: 'Plan du manuscrit' });

  it('the drawer: it forgets, the line keeps the focus; the next one closes; held, it is one', async () => {
    await drawer();
    line('Chapitre 1').focus();
    await userEvent.keyboard('{Backspace}');
    await screen.findByRole('button', { name: /^Confirmer/ });
    await userEvent.keyboard('{Escape>4/}');
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Confirmer/ })).toBeNull());
    expect(tree()).not.toBeNull();
    expect(document.activeElement).toBe(line('Chapitre 1'));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(tree()).toBeNull());
  });

  it('the menu of a thing stays open', async () => {
    await drawer();
    await userEvent.click(screen.getByRole('button', { name: 'Actions du chapitre Chapitre 1' }));
    const sheet = await screen.findByRole('menu');
    await userEvent.keyboard('{Backspace}');
    within(sheet).getByRole('menuitem', { name: /^Confirmer/ });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => within(sheet).getByRole('menuitem', { name: 'Mettre à la corbeille' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(tree()).not.toBeNull();
  });

  it('the library stays, and so does the project sheet', async () => {
    await startApp();
    await textFocused();
    await userEvent.keyboard('{ControlOrMeta>}o{/ControlOrMeta}');
    await screen.findByRole('region', { name: 'Bibliothèque' });
    await waitFor(() => expect(document.activeElement?.getAttribute('role')).toBe('option'));
    await userEvent.keyboard('{Backspace}');
    await screen.findByRole('button', { name: /^Confirmer/ });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Confirmer/ })).toBeNull());
    screen.getByRole('region', { name: 'Bibliothèque' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Bibliothèque' })).toBeNull());

    await textFocused();
    await command('Nouvelle version de travail');
    const sheet = await screen.findByRole('dialog', { name: 'Le projet' });
    await userEvent.type(
      await within(sheet).findByRole('textbox', { name: 'Nom de la version' }),
      'Autre fin{Enter}',
    );
    await waitFor(() => expect(within(sheet).getAllByRole('radio')).toHaveLength(2));
    (within(sheet).getAllByRole('radio')[1] as HTMLElement).focus();
    await userEvent.keyboard('{Backspace}');
    await within(sheet).findByRole('button', { name: /^Confirmer/ });
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(within(sheet).queryByRole('button', { name: /^Confirmer/ })).toBeNull(),
    );
    screen.getByRole('dialog', { name: 'Le projet' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Le projet' })).toBeNull());
  }, 15000);
});
