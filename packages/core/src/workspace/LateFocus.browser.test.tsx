import { cleanup, screen, waitFor } from '@testing-library/react';
import { userEvent } from 'vitest/browser';
import { afterEach, expect, it } from 'vitest';
import fr from '../i18n/locales/fr.json';
import { startApp } from '../conformance/app-under-test';
import '../styles/base.css';

const createI18nTitle = (id: keyof typeof fr.commands) => fr.commands[id];
const frame = window.requestAnimationFrame;
afterEach(() => {
  window.requestAnimationFrame = frame;
  cleanup();
});

const textFocused = () =>
  waitFor(() =>
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Texte de la scène'),
  );

async function newScene(title: string) {
  await userEvent.keyboard('{ControlOrMeta>}{Alt>}n{/Alt}{/ControlOrMeta}');
  await screen.findByRole('dialog', { name: 'Ligne de commande' });
  await userEvent.keyboard(`{ControlOrMeta>}a{/ControlOrMeta}${title}{Enter}`);
}

// Seen on 24 November 2026, under load: a command's words were written in the novel. The text of
// the scene just opened took the focus a frame late, from a command line opened meanwhile.
it('a scene just opened never takes the focus from the command line', async () => {
  await startApp();
  await textFocused();
  await userEvent.keyboard('Il pleuvait.');
  // A slow machine: a frame comes late.
  window.requestAnimationFrame = (callback) =>
    window.setTimeout(() => callback(performance.now()), 400);
  await newScene('Le quai');
  await waitFor(() => expect(document.title).toBe('Mon projet — Le quai'));
  await userEvent.keyboard('{ControlOrMeta>}k{/ControlOrMeta}');
  await screen.findByRole('dialog', { name: 'Ligne de commande' });
  await new Promise((resolve) => setTimeout(resolve, 600));
  await userEvent.keyboard('changer de theme');
  expect(document.activeElement?.getAttribute('role')).toBe('combobox');
  expect(screen.getByRole('textbox', { name: 'Texte de la scène' }).textContent).not.toContain(
    'changer',
  );
  // Closed, the text has the focus again, its cursor at the end.
  await userEvent.keyboard('{Escape}');
  await textFocused();
});

it('the text of a scene just opened has the focus, its cursor at the end', async () => {
  await startApp();
  await textFocused();
  await userEvent.keyboard('Il pleuvait.');
  await newScene('Le quai');
  await waitFor(() => expect(document.title).toBe('Mon projet — Le quai'));
  await textFocused();
  await userEvent.keyboard('{ControlOrMeta>}k{/ControlOrMeta}');
  await screen.findByRole('dialog', { name: 'Ligne de commande' });
  await userEvent.keyboard('scene precedente{Enter}');
  await waitFor(() => expect(document.title).toBe('Mon projet — Scène 1'));
  await textFocused();
  await userEvent.keyboard(' Encore.');
  expect(screen.getByRole('textbox', { name: 'Texte de la scène' }).textContent).toBe(
    'Il pleuvait. Encore.',
  );
});

// The drawer open, the command line gives the focus to nobody when it closes: a command that acts
// on the text takes it there. At once, or it takes it from the command line opened next.
for (const [name, words] of [
  ['toggleItalic', 'italique'],
  ['toggleBlockquote', 'citation'],
  ['insertSceneBreak', 'separateur'],
  ['undo', 'annuler'],
  ['redo', 'retablir'],
] as const)
  it(`${name}, run from a panel, never takes the focus from the next command line`, async () => {
    await startApp();
    await textFocused();
    await userEvent.keyboard('Il pleuvait.');
    await userEvent.keyboard('{ControlOrMeta>}j{/ControlOrMeta}');
    await screen.findByRole('tree', { name: 'Plan du manuscrit' });
    await waitFor(() => expect(document.activeElement?.getAttribute('role')).toBe('treeitem'));
    window.requestAnimationFrame = (callback) =>
      window.setTimeout(() => callback(performance.now()), 400);
    await userEvent.keyboard('{ControlOrMeta>}k{/ControlOrMeta}');
    await screen.findByRole('dialog', { name: 'Ligne de commande' });
    const title = createI18nTitle(name);
    await userEvent.keyboard(words);
    expect(screen.getByRole('option', { selected: true }).textContent).toContain(title);
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const text = screen.getByRole('textbox', { name: 'Texte de la scène' });
    await userEvent.keyboard('{ControlOrMeta>}k{/ControlOrMeta}');
    await screen.findByRole('dialog', { name: 'Ligne de commande' });
    const before = text.textContent;
    await new Promise((resolve) => setTimeout(resolve, 600));
    await userEvent.keyboard('zzz');
    expect(document.activeElement?.getAttribute('role')).toBe('combobox');
    expect(text.textContent).toBe(before);
  });
