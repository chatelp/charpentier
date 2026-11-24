import { screen, waitFor } from '@testing-library/react';
import { userEvent } from 'vitest/browser';
import { expect } from 'vitest';
import { hostPrimary, startApp } from './app-under-test';

const mod = hostPrimary === 'Meta' ? 'Meta' : 'Control';
const chord = (keys: string) => `{${mod}>}${keys}{/${mod}}`;

async function command(title: string) {
  await userEvent.keyboard(chord('k'));
  await screen.findByRole('dialog', { name: 'Ligne de commande' });
  await userEvent.keyboard(`${title}{Enter}`);
}

/** The command line asks for a name: the answer. */
async function answer(text: string) {
  await screen.findByRole('dialog', { name: 'Ligne de commande' });
  await userEvent.keyboard(`${chord('a')}${text}{Enter}`);
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Ligne de commande' })).toBeNull(),
  );
}

/** The entry points fade while the author types: the mouse brings them back. */
async function mouseBack() {
  window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: 4, movementY: 2 }));
  await waitFor(() => expect(document.querySelector('.ch-app[data-typing]')).toBeNull());
}

/** A project with something in it: two chapters, three scenes, a variant, a restore point. */
async function written() {
  const app = await startApp();
  await waitFor(() => expect(document.activeElement).toBe(app.editor));
  await userEvent.keyboard('Hélène attache la barque au quai de la Fosse.');
  await command('Créer un point de restauration');
  await command('Nouvelle scène');
  await answer('La maison');
  await userEvent.keyboard('La maison du père sent le goudron.');
  await command('Nouveau chapitre');
  await answer('Le fleuve');
  await userEvent.keyboard('La Loire monte depuis trois jours.');
  await command('Nouvelle variante (copie');
  await answer('Au présent');
  await mouseBack();
  return app;
}

/** The views fade in: what is measured is the screen once it has stopped moving. */
export async function settled() {
  await waitFor(() => {
    const moving = document
      .getAnimations()
      .filter(
        (a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity,
      );
    expect(moving).toHaveLength(0);
  });
}

/**
 * The states of the app a conformance test walks through (docs/PLAN.md 7.6): each starts a new
 * app and brings it where the author can be. A screen added to the app gets its line here.
 */
export const SCREENS: Readonly<Record<string, () => Promise<unknown>>> = {
  'writing, at rest': () => written(),
  'the manuscript drawer': async () => {
    await written();
    await userEvent.keyboard(chord('j'));
    await screen.findByRole('complementary', { name: 'Plan du manuscrit' });
  },
  'the menu of a scene': async () => {
    await written();
    await userEvent.keyboard(chord('j'));
    await screen.findByRole('complementary', { name: 'Plan du manuscrit' });
    await userEvent.click(screen.getByRole('button', { name: 'Actions de la scène La maison' }));
    await screen.findByRole('menu', { name: 'Scène · La maison' });
  },
  'the Compagnon panel': async () => {
    await written();
    await userEvent.keyboard(chord('l'));
    await screen.findByRole('tab', { name: /Points à traiter/ });
  },
  'the display sheet': async () => {
    await written();
    await userEvent.click(screen.getByTitle(/^Affichage/));
    await screen.findByRole('dialog', { name: 'Affichage' });
  },
  'the project sheet': async () => {
    await written();
    await command('Nouvelle version de travail');
    const sheet = await screen.findByRole('dialog', { name: 'Le projet' });
    await userEvent.keyboard('Fin à Nantes{Enter}');
    await waitFor(() => expect(sheet.querySelectorAll('[role=radio]')).toHaveLength(2));
  },
  'the overview': async () => {
    await written();
    await userEvent.keyboard(chord('{Shift>}p{/Shift}'));
    await waitFor(() => expect(document.querySelector('.ch-overview')).not.toBeNull());
  },
  'the Atelier, a character': async () => {
    await written();
    await command('Nouveau personnage');
    await answer('Hélène Varenne');
    await waitFor(() => expect(document.querySelector('.ch-atelier')).not.toBeNull());
  },
  'the Atelier, the notebook': async () => {
    await written();
    await userEvent.keyboard(chord('7'));
    await waitFor(() => expect(document.querySelector('.ch-atelier')).not.toBeNull());
  },
  'the settings': async () => {
    await written();
    await command('Réglages de l');
    await waitFor(() => expect(document.querySelector('.ch-aset-group')).not.toBeNull());
  },
  'the library': async () => {
    await written();
    await userEvent.keyboard(chord('o'));
    await screen.findByRole('heading', { name: 'Bibliothèque' });
  },
};
