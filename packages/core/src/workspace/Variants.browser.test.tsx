import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { App } from '../app/App';
import { createI18n } from '../i18n/i18n';
import { createTestPlatform } from '../testing/test-platform';

afterEach(cleanup);

const isMac = /Mac/.test(navigator.platform);
const editorText = () => screen.getByRole('textbox', { name: 'Texte de la scène' }).textContent;
const editorFocused = () =>
  document.activeElement?.getAttribute('aria-label') === 'Texte de la scène';

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
  await screen.findByRole('textbox', { name: 'Texte de la scène' });
  await waitFor(() => expect(editorFocused()).toBe(true));
}

const command = async (query: string) => {
  await userEvent.keyboard('{ControlOrMeta>}k{/ControlOrMeta}');
  await screen.findByRole('dialog', { name: 'Ligne de commande' });
  await userEvent.keyboard(`${query}{Enter}`);
};

const replaceText = async (text: string) => {
  await waitFor(() => expect(editorFocused()).toBe(true));
  await userEvent.keyboard(`{ControlOrMeta>}a{/ControlOrMeta}${text}`);
};

describe('variants and restore points, keyboard only', () => {
  it('keeps two variants of a scene and switches between them', async () => {
    await startApp();
    await userEvent.keyboard('Il faisait beau.');

    await command('copie'); // « Nouvelle variante (copie de la variante active) »
    await userEvent.keyboard('{ControlOrMeta>}a{/ControlOrMeta}Sombre{Enter}');
    await waitFor(() => expect(document.title).toBe('Mon projet — Scène 1 (Sombre)'));
    expect(editorText()).toBe('Il faisait beau.');
    await replaceText('Il pleuvait.');

    await userEvent.keyboard('{ControlOrMeta>}{Alt>}v{/Alt}{/ControlOrMeta}'); // change variant…
    await userEvent.keyboard('variante 1{Enter}');
    await waitFor(() => expect(document.title).toBe('Mon projet — Scène 1 (Variante 1)'));
    expect(editorText()).toBe('Il faisait beau.');

    await command('changer de variante');
    await userEvent.keyboard('sombre{Enter}');
    await waitFor(() => expect(editorText()).toBe('Il pleuvait.'));
  });

  it('saves a restore point with ⌘S and goes back to it', async () => {
    await startApp();
    await userEvent.keyboard('Premier jet.');
    await userEvent.keyboard('{ControlOrMeta>}s{/ControlOrMeta}');
    expect(await screen.findByText('Point de restauration créé.')).toBeTruthy();
    await userEvent.keyboard(' Ajout regretté.');
    expect(editorText()).toBe('Premier jet. Ajout regretté.');

    await command('revenir'); // « Revenir à un point de restauration… »
    const newest = await screen.findByRole('option', { selected: true });
    expect(newest.textContent).toContain('Point manuel');
    expect(newest.textContent).toContain('Premier jet.');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(editorText()).toBe('Premier jet.'));
    expect(
      await screen.findByText(
        /^Retour au point de restauration \(.+\)\. Le texte d’avant reste dans les points de restauration\.$/,
      ),
    ).toBeTruthy();

    // The regretted state was kept: it can be brought back as a variant.
    await command('variante depuis');
    await userEvent.keyboard('avant une restauration{Enter}');
    await waitFor(() => expect(editorText()).toBe('Premier jet. Ajout regretté.'));
  });

  it('trashes a variant and restores it', async () => {
    await startApp();
    await userEvent.keyboard('Texte A.');
    await command('variante vide');
    await userEvent.keyboard('B{Enter}');
    await replaceText('Texte B.');

    await command('variante corbeille');
    await waitFor(() => expect(editorText()).toBe('Texte A.'));
    await waitFor(() => expect(document.title).toBe('Mon projet — Scène 1'));

    await command('restaurer depuis');
    await userEvent.keyboard('{Enter}');
    await command('changer de variante');
    await userEvent.keyboard('B{Enter}');
    await waitFor(() => expect(editorText()).toBe('Texte B.'));
  });
});
