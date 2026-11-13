import { describe, expect, it } from 'vitest';
import { createI18n } from '../i18n/i18n';
import { buildMenuModel, MENU_LAYOUT } from './menu-model';
import { createWorkspaceRegistry } from './workspace-commands';
import type { Feature } from '../features/feature';

/** A feature with a settings section: the settings command joins the registry. */
const withSettings: Feature = {
  id: 'withSettings',
  texts: { fr: { withSettings: { s: 'S' } } },
  settings: [{ id: 's', label: 'withSettings.s', component: () => null }],
};

describe('application menu', () => {
  it('holds every command of the registry exactly once', () => {
    const registry = createWorkspaceRegistry('Meta', [], [withSettings]);
    const inMenus = MENU_LAYOUT.flatMap((m) => m.items).filter(
      (item) => item !== '-' && !item.startsWith('role:'),
    );
    expect(new Set(inMenus).size).toBe(inMenus.length);
    expect([...inMenus].sort()).toEqual(registry.ids().sort());
  });

  it('gives French labels and the shortcut each command shows', async () => {
    const i18n = await createI18n('fr');
    const model = buildMenuModel(createWorkspaceRegistry('Meta', []), i18n.t);
    expect(model.menus.map((m) => m.label)).toEqual([
      'Charpentier',
      'Fichier',
      'Édition',
      'Scène',
      'Manuscrit',
      'Atelier',
      'Compagnon',
      'Présentation',
      'Fenêtre',
      'Aide',
    ]);
    const help = model.menus.at(-1)?.entries;
    expect(help?.[0]).toEqual({
      kind: 'command',
      id: 'openPalette',
      label: 'Que voulez-vous faire ?',
      shortcut: { key: 'k', meta: true, ctrl: false, alt: false, shift: false },
    });
    expect(model.menus[0]?.entries.at(-1)).toEqual({
      kind: 'role',
      role: 'quit',
      label: 'Quitter Charpentier',
    });
  });
});

describe('shortcuts on the writing device (phase 5.2)', () => {
  it('leaves the Super key to the system: no command of the core uses it', () => {
    const registry = createWorkspaceRegistry('Control', [], [withSettings]);
    const withSuper = registry.ids().filter((id) => registry.chord(id)?.meta);
    expect(withSuper).toEqual([]);
  });
});
