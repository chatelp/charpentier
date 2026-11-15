import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { App } from '../app/App';
import { createI18n } from '../i18n/i18n';
import { probeFeature } from '../testing/test-feature';
import { createTestPlatform } from '../testing/test-platform';

afterEach(cleanup);

const isMac = /Mac/.test(navigator.platform);
const mod = (keys: string) => `{ControlOrMeta>}${keys}{/ControlOrMeta}`;

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
  render(<App platform={platform} i18n={await createI18n('fr')} features={[probeFeature]} />);
  const editor = await screen.findByRole('textbox', { name: 'Texte de la scène' });
  await waitFor(() => expect(document.activeElement).toBe(editor));
  return editor;
}

/**
 * The surface's close cross: a button that says it does what Échap does. The
 * test runs without the app's styles, where panels overlap: the cross is
 * clicked through the DOM, and its placement is checked in the app.
 */
function crossIn(surface: HTMLElement, name: string) {
  const cross = within(surface).getByRole('button', { name });
  expect(cross.getAttribute('aria-keyshortcuts')).toBe('Escape');
  expect(cross.title).toBe(`${name} (Échap)`);
  return cross;
}

describe('the close cross (docs/DESIGN.md §4.8 « Sortie à la souris »)', () => {
  it('closes with the mouse every surface that Échap closes, and gives the text back', async () => {
    const editor = await start();
    const back = async (gone: () => HTMLElement | null) => {
      await waitFor(() => expect(gone()).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(editor));
    };

    // Tool panels: the manuscript, the Compagnon.
    await userEvent.click(screen.getByRole('button', { name: /Manuscrit/ }));
    const drawer = await screen.findByRole('complementary', { name: 'Plan du manuscrit' });
    crossIn(drawer, 'Fermer le panneau').click();
    await back(() => screen.queryByRole('complementary', { name: 'Plan du manuscrit' }));

    await userEvent.click(screen.getByRole('button', { name: /Compagnon/ }));
    const mentor = await screen.findByRole('complementary', { name: 'Le Compagnon' });
    crossIn(mentor, 'Fermer le panneau').click();
    await back(() => screen.queryByRole('complementary', { name: 'Le Compagnon' }));

    // The command line.
    await userEvent.click(screen.getByRole('button', { name: /Que voulez-vous faire/ }));
    const line = await screen.findByRole('dialog', { name: 'Ligne de commande' });
    crossIn(line, 'Fermer la ligne de commande').click();
    await back(() => screen.queryByRole('dialog', { name: 'Ligne de commande' }));

    // The « Aa » sheet: its first control takes the focus, not the cross.
    await userEvent.click(screen.getByRole('button', { name: 'Aa' }));
    const sheet = await screen.findByRole('dialog', { name: 'Affichage' });
    await waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true));
    expect(document.activeElement?.classList.contains('ch-close')).toBe(false);
    crossIn(sheet, 'Fermer').click();
    await back(() => screen.queryByRole('dialog', { name: 'Affichage' }));

    // Full-frame views: the overview, the settings, a feature's view.
    await userEvent.keyboard(mod('{Shift>}p{/Shift}'));
    const overview = await screen.findByRole('region', { name: 'Vue d’ensemble du manuscrit' });
    crossIn(overview, 'Revenir au texte').click();
    await back(() => screen.queryByRole('region', { name: 'Vue d’ensemble du manuscrit' }));

    await userEvent.keyboard(mod(','));
    const settings = await screen.findByRole('region', { name: 'Réglages' });
    crossIn(settings, 'Revenir au texte').click();
    await back(() => screen.queryByRole('region', { name: 'Réglages' }));

    await userEvent.keyboard(mod('k'));
    await userEvent.keyboard('vue sonde{Enter}');
    const view = await screen.findByRole('region', { name: 'Vue de la sonde' });
    crossIn(view, 'Revenir au texte').click();
    await back(() => screen.queryByRole('region', { name: 'Vue de la sonde' }));
  });
});
