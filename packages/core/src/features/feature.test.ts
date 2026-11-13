import { describe, expect, it } from 'vitest';
import { buildMenuModel } from '../commands/menu-model';
import { createWorkspaceRegistry } from '../commands/workspace-commands';
import { createI18n } from '../i18n/i18n';
import fr from '../i18n/locales/fr.json';
import { createTestPlatform } from '../testing/test-platform';
import { probeFeature } from '../testing/test-feature';
import { activeFeatures, checkFeatures, installFeatureTexts, type Feature } from './feature';

const bare: Feature = { id: 'bare', texts: { fr: {} } };

describe('features (phase 5.1)', () => {
  it('accepts a feature that uses every contribution point', () => {
    expect(() => checkFeatures([probeFeature, bare], fr)).not.toThrow();
  });

  it('refuses what two owners would claim, or a missing title', () => {
    const again = (change: Partial<Feature>): Feature => ({ ...bare, ...change });
    expect(() => checkFeatures([bare, bare], fr)).toThrow(/Feature bare/);
    expect(() =>
      checkFeatures(
        [
          again({
            texts: { fr: { bare: { p: 'P' } } },
            prefixes: [{ prefix: '#', label: 'bare.p', search: () => [], onPick: () => {} }],
          }),
        ],
        fr,
      ),
    ).toThrow(/Prefix # of bare is already declared by the core/);
    expect(() =>
      checkFeatures([again({ commands: [{ id: 'x', scope: 'global', run: () => {} }] })], fr),
    ).toThrow(/no text commands\.x/);
    expect(() =>
      checkFeatures([again({ texts: { fr: { commands: { openPalette: 'Autre' } } } })], fr),
    ).toThrow(/redefines the core's text commands\.openPalette/);
    expect(() => checkFeatures([again({ texts: { fr: { palette: { a: 'A' } } } })], fr)).toThrow(
      /outside bare/,
    );
    expect(() => checkFeatures([{ ...bare, id: 'palette' }], fr)).toThrow(/shadows/);
  });

  it('runs only the features active on the host', () => {
    const platform = createTestPlatform();
    const off: Feature = { ...bare, id: 'off', isActive: (p) => p.sync !== null };
    expect(activeFeatures([probeFeature, off], platform, fr).map((f) => f.id)).toEqual(['probe']);
  });

  it('adds its commands and the settings to the registry, and its menu', async () => {
    const i18n = await createI18n('fr');
    installFeatureTexts(i18n, [probeFeature]);
    installFeatureTexts(i18n, [probeFeature]);
    const registry = createWorkspaceRegistry('Meta', [], [probeFeature]);
    expect(registry.ids()).toEqual(expect.arrayContaining(['openSettings', 'probePing']));
    const model = buildMenuModel(registry, i18n.t, {}, [probeFeature]);
    expect(model.menus.map((m) => m.label).slice(-3)).toEqual(['Sonde', 'Fenêtre', 'Aide']);
    expect(model.menus.at(-3)?.entries).toEqual([
      { kind: 'command', id: 'probePing', label: 'Sonder la machine' },
      { kind: 'separator' },
      { kind: 'command', id: 'probeOpenView', label: 'Ouvrir la vue de la sonde' },
    ]);
    expect(model.menus[0]?.entries[2]).toMatchObject({
      id: 'openSettings',
      label: 'Ouvrir les réglages',
      shortcut: { key: ',', meta: true },
    });
  });

  it('leaves nothing behind when it is gone', async () => {
    const i18n = await createI18n('fr');
    const registry = createWorkspaceRegistry('Meta', []);
    expect(registry.ids()).not.toContain('openSettings');
    const app = buildMenuModel(registry, i18n.t).menus[0]?.entries ?? [];
    expect(app.map((e) => (e.kind === 'separator' ? '-' : e.kind))).toEqual([
      'role',
      '-',
      'role',
      'role',
      '-',
      'role',
    ]);
  });
});
