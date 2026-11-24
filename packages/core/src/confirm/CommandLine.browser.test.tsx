import { guids, readOutline } from '@charpentier/schema';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { page, userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type * as Y from 'yjs';
import { startApp } from '../conformance/app-under-test';
import { createTestPlatform } from '../testing/test-platform';
import '../styles/base.css';

beforeEach(() => page.viewport(1280, 800));
afterEach(cleanup);

const bar = () => screen.findByRole('dialog', { name: 'Ligne de commande' });
const noBar = () =>
  waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ligne de commande' })).toBeNull());
const textFocused = () =>
  waitFor(() =>
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Texte de la scène'),
  );

/** One scene of five words; the command line open on « Mettre la scène à la corbeille ». */
async function asked(words = 'scene corbeille') {
  const { docs, prefs, editor } = await startApp();
  await textFocused();
  await userEvent.keyboard('Il pleuvait sur Nantes hier.');
  const text = paragraphs(editor);
  const root = () => docs.get(guids.project(String(prefs.get('lastProjectId')))) as Y.Doc;
  const scenes = () =>
    readOutline(root())
      .flatMap((c) => c.scenes)
      .map((s) => s.id);
  const before = scenes();
  await userEvent.keyboard('{ControlOrMeta>}k{/ControlOrMeta}');
  await bar();
  if (words) await userEvent.keyboard(words);
  return { editor, text, scenes, before };
}
/** The text, paragraph by paragraph (an empty one counts). */
const paragraphs = (editor: HTMLElement) =>
  [...editor.querySelectorAll('p')].map((p) => p.textContent);
const asking = async () =>
  within(await bar()).findByRole('option', {
    name: /Confirmer\u00a0: scène de 5 mots à la corbeille/,
  });

describe('the two presses from the command line (docs/DESIGN.md §4.7, 1.43)', () => {
  it('asks in the line itself: the second ⏎ does it, and no key reaches the text', async () => {
    const { text, scenes, before } = await asked();
    await userEvent.keyboard('{Enter}');
    const option = await asking();
    expect(option.textContent).toMatch(/3\u00a0s$/);
    expect(option.getAttribute('aria-selected')).toBe('true');
    expect(scenes()).toEqual(before);
    expect(document.activeElement?.getAttribute('role')).toBe('combobox');
    await userEvent.keyboard('{Enter}');
    await noBar();
    await waitFor(() => expect(scenes()).not.toContain(before[0]));
    // Back by ⌘Z: the text is what it was, not a paragraph more.
    await userEvent.keyboard('{ControlOrMeta>}z{/ControlOrMeta}');
    await waitFor(() => expect(scenes()).toEqual(before));
    await waitFor(() =>
      expect(paragraphs(screen.getByRole('textbox', { name: 'Texte de la scène' }))).toEqual(text),
    );
  });

  it('held down, ⏎ is one press; a key typed forgets, and so does the delay', async () => {
    const { text, editor, scenes, before } = await asked();
    await userEvent.keyboard('{Enter>4/}');
    await asking();
    expect(scenes()).toEqual(before);
    await userEvent.keyboard('e');
    await waitFor(() => expect(screen.queryByText(/Confirmer/)).toBeNull());
    await userEvent.keyboard('{Backspace}{Enter}');
    await asking();
    await waitFor(() => expect(screen.queryByText(/Confirmer/)).toBeNull(), { timeout: 4500 });
    await bar();
    await userEvent.keyboard('{Escape}');
    await noBar();
    await textFocused();
    expect(paragraphs(editor)).toEqual(text);
    expect(scenes()).toEqual(before);
  }, 15000);

  it('Échap forgets, and closes at the next one', async () => {
    const { text, editor, scenes, before } = await asked();
    await userEvent.keyboard('{Enter}');
    await asking();
    // One Échap, one thing: it forgets, the line stays; the next one closes it.
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText(/Confirmer/)).toBeNull());
    await bar();
    expect(document.activeElement?.getAttribute('role')).toBe('combobox');
    await userEvent.keyboard('{Escape}');
    await noBar();
    await textFocused();
    await userEvent.keyboard('{ControlOrMeta>}k{/ControlOrMeta}');
    await bar();
    await userEvent.keyboard('scene corbeille{Enter}');
    await asking();
    expect(scenes()).toEqual(before);
    expect(paragraphs(editor)).toEqual(text);
  });

  it('with the mouse: a click asks, a second one does it', async () => {
    const { scenes, before } = await asked();
    const option = within(await bar()).getByRole('option', { name: /scène à la corbeille/i });
    await userEvent.click(option);
    await userEvent.click(await asking());
    await noBar();
    await waitFor(() => expect(scenes()).not.toContain(before[0]));
  });

  it('a click asks, ⏎ does it: the line kept the keyboard', async () => {
    const { scenes, before } = await asked();
    await userEvent.click(
      within(await bar()).getByRole('option', { name: /scène à la corbeille/i }),
    );
    await asking();
    await userEvent.keyboard('{Enter}');
    await noBar();
    await waitFor(() => expect(scenes()).not.toContain(before[0]));
  });

  it('from the whole list, nothing typed: the line that asks is the one ⏎ chooses', async () => {
    const { scenes, before } = await asked('');
    const name = 'Mettre la scène à la corbeille';
    const option = () => screen.getByRole('option', { selected: true });
    for (let i = 0; i < 80 && !option().textContent?.startsWith('›' + name); i++)
      await userEvent.keyboard('{ArrowDown}');
    expect(option().textContent).toContain(name);
    await userEvent.keyboard('{Enter}');
    await asking();
    expect(option().textContent).toContain('Confirmer');
    await userEvent.keyboard('{Enter}');
    await noBar();
    await waitFor(() => expect(scenes()).not.toContain(before[0]));
  }, 20000);

  it('a chapter as well', async () => {
    const { scenes, before } = await asked('chapitre corbeille');
    await userEvent.keyboard('{Enter}');
    await within(await bar()).findByRole('option', {
      name: /Confirmer\u00a0: chapitre et 1 scène à la corbeille/,
    });
    await userEvent.keyboard('{Enter}');
    await noBar();
    await waitFor(() => expect(scenes()).not.toContain(before[0]));
  });

  it('forgetting the key as well: not at the first ⏎, and nothing written', async () => {
    const forgotten: string[] = [];
    const agents = {
      ...createTestPlatform().agents,
      status: () => 'available' as const,
      forgetApiKey: async () => void forgotten.push('key'),
    };
    const { editor } = await startApp({ platform: { agents } });
    await textFocused();
    await userEvent.keyboard('Il pleuvait.');
    const text = paragraphs(editor);
    await userEvent.keyboard('{ControlOrMeta>}k{/ControlOrMeta}');
    await bar();
    await userEvent.keyboard('oublier cle{Enter}');
    await within(await bar()).findByRole('option', { name: /Confirmer\u00a0: oublier la clé/ });
    expect(forgotten).toEqual([]);
    await userEvent.keyboard('{Enter}');
    await noBar();
    await waitFor(() => expect(forgotten).toEqual(['key']));
    await textFocused();
    expect(paragraphs(editor)).toEqual(text);
  });
});
