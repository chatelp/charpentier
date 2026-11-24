import { guids, readOutline } from '@charpentier/schema';
import { cleanup, screen, waitFor } from '@testing-library/react';
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
async function command(name: string, answer: string) {
  await userEvent.keyboard('{ControlOrMeta>}k{/ControlOrMeta}');
  await screen.findByRole('dialog', { name: 'Ligne de commande' });
  await userEvent.keyboard(`${name}{Enter}`);
  await screen.findByRole('dialog', { name: 'Ligne de commande' });
  await userEvent.keyboard(`{ControlOrMeta>}a{/ControlOrMeta}${answer}{Enter}`);
  await textFocused();
}
/** « Scène 1 » with two variants (« Variante 1 », « Sombre », read), « Le quai »; the drawer open on the first. */
async function drawer() {
  const { docs, prefs } = await startApp();
  await textFocused();
  await command('Nouvelle scène', 'Le quai');
  await userEvent.keyboard('{ControlOrMeta>}k{/ControlOrMeta}');
  await screen.findByRole('dialog', { name: 'Ligne de commande' });
  await userEvent.keyboard('scene precedente{Enter}');
  await waitFor(() => expect(document.title).toBe('Mon projet — Scène 1'));
  await textFocused();
  await command('Nouvelle variante vide', 'Sombre');
  await userEvent.keyboard('{ControlOrMeta>}j{/ControlOrMeta}');
  await screen.findByRole('tree', { name: 'Plan du manuscrit' });
  await waitFor(() => expect(where()).toBe('Scène 1'));
  const root = () => docs.get(guids.project(String(prefs.get('lastProjectId')))) as Y.Doc;
  const scenes = () => readOutline(root()).flatMap((c) => c.scenes);
  return { scenes };
}
/** The line of the drawer that has the focus. */
function where() {
  const line = document.activeElement;
  return line?.classList.contains('ch-nav-variant')
    ? line.querySelector('span')?.textContent
    : (line?.getAttribute('aria-label') ?? line?.textContent);
}
async function walk(key: string, expected: readonly string[]) {
  for (const name of expected) {
    await userEvent.keyboard(`{${key}}`);
    await waitFor(() => expect(where()).toBe(name));
  }
}

describe('the variant lines of the drawer, from the keyboard (docs/DESIGN.md §5.0, rule 1)', () => {
  it('are on the way of the arrows, down and up', async () => {
    await drawer();
    await walk('ArrowDown', ['A · Variante 1', 'B · Sombre', 'Le quai']);
    // The last line: nothing under it.
    await walk('ArrowDown', ['Le quai']);
    await walk('ArrowUp', ['B · Sombre', 'A · Variante 1', 'Scène 1', 'Chapitre 1']);
    await walk('End', ['Le quai']);
    await walk('Home', ['Chapitre 1']);
  });

  it('hold the keys once reached: ⏎ reads it, M is its menu, ⌥↓ moves nothing, ⌫ takes it alone', async () => {
    const { scenes } = await drawer();
    const order = scenes().map((s) => s.title);
    await walk('ArrowDown', ['A · Variante 1']);
    await userEvent.keyboard('{Enter}');
    const scene = () => scenes().find((s) => s.title === 'Scène 1');
    await waitFor(() => expect(scene()?.activeVariantId).toBe(scene()?.variants[0]?.id));
    expect(where()).toBe('A · Variante 1');
    // Moving is the scene's: not from a variant's line (rule 6).
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(scenes().map((s) => s.title)).toEqual(order);
    expect(where()).toBe('A · Variante 1');
    await userEvent.keyboard('m');
    await screen.findByRole('menu', { name: 'Variante · Variante 1' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(where()).toBe('A · Variante 1'));
    await walk('ArrowDown', ['B · Sombre']);
    await userEvent.keyboard('{Backspace}');
    await waitFor(() => expect(scene()?.variants).toHaveLength(1));
    expect(scenes().map((s) => s.title)).toEqual(order);
    await waitFor(() => expect(where()).toBe('Scène 1'));
  });

  it('are between the last scene and the trash at the foot', async () => {
    await drawer();
    await walk('ArrowDown', ['A · Variante 1', 'B · Sombre', 'Le quai']);
    await userEvent.keyboard('{Backspace}');
    const link = await screen.findByRole('button', { name: 'Corbeille, 1 élément' });
    await waitFor(() => expect(where()).toBe('Scène 1'));
    await walk('ArrowDown', ['A · Variante 1', 'B · Sombre']);
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => expect(document.activeElement).toBe(link));
    await walk('ArrowUp', ['B · Sombre', 'A · Variante 1', 'Scène 1']);
  });
});
