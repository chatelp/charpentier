import type { SyncService } from '@charpentier/platform';
import { guids, readOutline, variantFragment } from '@charpentier/schema';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { page, userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
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
  await textFocused();
}
const line = (name: string) => screen.getByRole('treeitem', { name });
const ask = (what: string) =>
  screen.findByRole('button', { name: new RegExp(`^Confirmer\\u00a0: ${what}`) });
const noQuestion = () => expect(screen.queryByRole('button', { name: /^Confirmer/ })).toBeNull();

/** Two scenes, « Scène 1 » and « Le quai », the second open. `slow` scenes never finish loading once asked. */
async function start(slow = () => false) {
  const docs = new Map<string, Y.Doc>();
  const app = await startApp({
    platform: {
      documents: {
        open: async (guid: string) => {
          const doc = docs.get(guid) ?? new Y.Doc({ guid });
          docs.set(guid, doc);
          const whenLoaded =
            slow() && guid.includes('/scene:') ? new Promise<void>(() => {}) : Promise.resolve();
          return { guid, doc, whenLoaded, close: async () => {} };
        },
      },
    },
  });
  await textFocused();
  const root = () => docs.get(guids.project(String(app.prefs.get('lastProjectId')))) as Y.Doc;
  const scenes = () =>
    readOutline(root())
      .flatMap((c) => c.scenes)
      .map((s) => s.title);
  /** The document of a scene, as another device's edits reach it. */
  const sceneDoc = (title: string) => {
    const scene = readOutline(root())
      .flatMap((c) => c.scenes)
      .find((s) => s.title === title);
    if (!scene) throw new Error(title);
    const doc = docs.get(guids.scene(String(app.prefs.get('lastProjectId')), scene.id)) as Y.Doc;
    return { doc, variantId: scene.activeVariantId };
  };
  return { scenes, sceneDoc };
}
/** Written on another device: an edit of a second replica, carried here. */
function writtenElsewhere({ doc, variantId }: { doc: Y.Doc; variantId: string }) {
  const other = new Y.Doc();
  Y.applyUpdate(other, Y.encodeStateAsUpdate(doc));
  other.transact(() => {
    const paragraph = new Y.XmlElement('paragraph');
    paragraph.insert(0, [new Y.XmlText('Écrit sur le X250.')]);
    variantFragment(other, variantId).push([paragraph]);
  }, 'author');
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(other), 'remote');
}
const drawer = async () => {
  await userEvent.keyboard('{ControlOrMeta>}j{/ControlOrMeta}');
  await screen.findByRole('tree', { name: 'Plan du manuscrit' });
};

describe('a scene that has text is a big piece (docs/DESIGN.md §4.7, rule 5 of §5.0)', () => {
  it('asks for a scene whose text is not read yet: not knowing is no reason to let it go', async () => {
    let slow = false;
    const { scenes } = await start(() => slow);
    await userEvent.keyboard('Il pleuvait sur Nantes.');
    await drawer();
    await userEvent.keyboard('{Escape}');
    await textFocused();
    // The scene just written is left for a new one; nothing is read again from here on.
    slow = true;
    await userEvent.keyboard('{ControlOrMeta>}k{/ControlOrMeta}');
    await screen.findByRole('dialog', { name: 'Ligne de commande' });
    await userEvent.keyboard('Nouvelle scène{Enter}');
    await screen.findByRole('dialog', { name: 'Ligne de commande' });
    await userEvent.keyboard('{ControlOrMeta>}a{/ControlOrMeta}Le quai{Enter}');
    await waitFor(() => expect(scenes()).toEqual(['Scène 1', 'Le quai']));
    await drawer();
    line('Scène 1').focus();
    await userEvent.keyboard('{Backspace}');
    await ask('scène');
    expect(scenes()).toEqual(['Scène 1', 'Le quai']);
  });

  it('asks for a scene read empty, then filled on another device', async () => {
    const { scenes, sceneDoc } = await start();
    await command('Nouvelle scène', 'Le quai');
    await drawer();
    // Read here, empty: it would go at the first press.
    await new Promise((resolve) => setTimeout(resolve, 300));
    writtenElsewhere(sceneDoc('Scène 1'));
    line('Scène 1').focus();
    await userEvent.keyboard('{Backspace}');
    await ask('scène');
    expect(scenes()).toEqual(['Scène 1', 'Le quai']);
  });

  it('a word in a single variant, not the one read, is enough to ask', async () => {
    const { scenes } = await start();
    await userEvent.keyboard('Il pleuvait sur Nantes.');
    await command('Nouvelle variante vide', 'Au présent');
    await command('Nouvelle scène', 'Le quai');
    await drawer();
    line('Scène 1').focus();
    await userEvent.keyboard('{Backspace}');
    await ask('scène et ses 2 variantes à la corbeille');
    await userEvent.keyboard('{Backspace}');
    await waitFor(() => expect(scenes()).toEqual(['Le quai']));
  });

  it('a scene whose variants are all empty goes at the first press', async () => {
    const { scenes } = await start();
    await command('Nouvelle variante vide', 'Au présent');
    await command('Nouvelle scène', 'Le quai');
    await drawer();
    // Once everything is read (the drawer shows the counts).
    await new Promise((resolve) => setTimeout(resolve, 300));
    line('Scène 1').focus();
    await userEvent.keyboard('{Backspace}');
    await waitFor(() => expect(scenes()).toEqual(['Le quai']));
    noQuestion();
  });

  it('says all that goes: the variants, not only the words of the one read', async () => {
    await start();
    await userEvent.keyboard('Il pleuvait sur Nantes.');
    await command('Nouvelle variante (copie', 'Au présent');
    await drawer();
    const scene = line('Scène 1');
    scene.focus();
    await userEvent.keyboard('{Backspace}');
    await ask('scène et ses 2 variantes à la corbeille');
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.click(within(scene).getByRole('button', { name: /^Actions de la scène/ }));
    await screen.findByRole('menu');
    await userEvent.click(screen.getByRole('menuitem', { name: /^Mettre à la corbeille/ }));
    await screen.findByRole('menuitem', { name: /scène et ses 2 variantes/ });
  });

  it('a word typed, then erased, in the open scene: it is empty again', async () => {
    const { scenes } = await start();
    await userEvent.keyboard('Oui');
    await userEvent.keyboard('{Backspace}{Backspace}{Backspace}');
    await command('Nouvelle scène', 'Le quai');
    await userEvent.keyboard('Non');
    await userEvent.keyboard('{Backspace}{Backspace}{Backspace}');
    await drawer();
    await new Promise((resolve) => setTimeout(resolve, 300));
    line('Le quai').focus();
    await userEvent.keyboard('{Backspace}');
    await waitFor(() => expect(scenes()).toEqual(['Scène 1']));
    noQuestion();
  });
});

describe('a phrase with a long name (docs/DESIGN.md §4.7)', () => {
  it('keeps the key and the seconds in the window', async () => {
    const name = 'Ordinateur de bureau de la bibliothèque municipale, salle de lecture '.repeat(3);
    const revoked: string[] = [];
    const sync: SyncService = {
      status: () => 'synced',
      onStatusChange: () => () => {},
      account: async () => ({ server: 'https://s.example.org', email: 'p@example.org' }),
      signIn: async () => 'ok',
      signOut: async () => {},
      devices: async () => [
        { id: 'b', device: name, lastSeenAt: '2026-11-12T18:00:00Z', current: false },
      ],
      revokeDevice: async (id) => (revoked.push(id), true),
      openAdmin: async () => 'opened',
    };
    for (const [width, height] of [
      [1280, 800],
      [880, 700],
      [390, 800],
    ] as const) {
      await page.viewport(width, height);
      await startApp({ platform: { sync } });
      await textFocused();
      await userEvent.keyboard('{ControlOrMeta>}k{/ControlOrMeta}');
      await screen.findByRole('dialog', { name: 'Ligne de commande' });
      await userEvent.keyboard('appareils{Enter}');
      await screen.findByText(/Ordinateur de bureau/);
      await userEvent.keyboard('{Enter}');
      // It asks in the command line (1.43): whole, in the window, the key and the seconds in sight.
      const option = await screen.findByRole('option', {
        name: /Confirmer\u00a0: déconnecter Ordinateur/,
      });
      const box = option.getBoundingClientRect();
      expect(box.left, `${width}: left`).toBeGreaterThanOrEqual(0);
      expect(box.right, `${width}: right`).toBeLessThanOrEqual(width);
      for (const part of ['kbd', '.ch-confirm-left'])
        expect(
          option.querySelector(part)?.getBoundingClientRect().right,
          `${width}: ${part}`,
        ).toBeLessThanOrEqual(box.right);
      expect(option.textContent).toContain(name.trim());
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(revoked.splice(0)).toEqual(['b']));
      cleanup();
    }
  }, 40000);
});
