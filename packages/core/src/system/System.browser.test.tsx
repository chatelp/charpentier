import { createSimulatedSystem, type SimulatedSystem } from '@charpentier/platform';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { App } from '../app/App';
import { createI18n } from '../i18n/i18n';
import { createTestPlatform } from '../testing/test-platform';
import { createSystemFeature } from './system-feature';

afterEach(cleanup);

const isMac = /Mac/.test(navigator.platform);
const mod = (keys: string) => `{ControlOrMeta>}${keys}{/ControlOrMeta}`;
// The system's key: Super on the device; Ctrl where ⌘ is the app's.
const sysKey = isMac ? 'Control' : 'Meta';
const sys = (keys: string) => `{${sysKey}>}${keys}{/${sysKey}}`;

async function start(system: SimulatedSystem | null) {
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
    system,
  });
  render(
    <App
      platform={platform}
      i18n={await createI18n('fr')}
      features={[createSystemFeature({ modifier: sysKey })]}
    />,
  );
  const editor = await screen.findByRole('textbox', { name: 'Texte de la scène' });
  await waitFor(() => expect(document.activeElement).toBe(editor));
  return { editor };
}

const line = () => screen.getByRole('toolbar', { name: 'ligne système' });

describe('the system line of the X250 (phase 5.3)', () => {
  it('shows the device at the top, its segments, and the messages of the system', async () => {
    const system = createSimulatedSystem();
    await start(system);
    const text = line().textContent ?? '';
    for (const part of [
      'système',
      'démarrage · charpentier 0.5.0',
      'cpu',
      '12 % 48°',
      'Maison-5G',
      'lum',
      '60',
      'bat',
      '82 %',
      '5h40',
    ])
      expect(text).toContain(part);
    // Bluetooth is off: no segment.
    expect(line().querySelector('[data-seg="bt"]')).toBeNull();

    // A key plugged: its segment, and the message of the system.
    system.simulate.usb('KINGSTON');
    await waitFor(() => expect(line().textContent).toContain('usb'));
    expect(line().textContent).toContain('clé « KINGSTON » branchée');
    // The battery runs low: the segment is inverted.
    system.simulate.battery(12);
    await waitFor(() =>
      expect(line().querySelector('[data-seg="bat"]')?.classList.contains('is-alert')).toBe(true),
    );
  });

  it('opens the Wi-Fi from its key, joins a protected network with its password', async () => {
    const system = createSimulatedSystem();
    await start(system);

    await userEvent.keyboard(sys('w'));
    const panel = await screen.findByRole('dialog');
    expect(panel.textContent).toContain('Hotel_du_Port');
    await userEvent.click(within(panel).getByRole('option', { name: /Livebox-4A2C/ }));
    const password = await within(panel).findByLabelText('mot de passe de Livebox-4A2C…');
    await userEvent.type(password, 'faux{Enter}');
    await within(panel).findByText('mot de passe refusé');
    expect(system.state().wifi.connected).toBe('Maison-5G');

    // Échap closes the panel.
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('answers the « : » of the command line: :lum 40, :wifi non', async () => {
    const system = createSimulatedSystem();
    await start(system);
    await userEvent.keyboard(mod('k'));
    await userEvent.keyboard(':lum 40');
    await screen.findByRole('option', { name: /luminosité 40 %/ });
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(system.state().brightness).toBe(40));

    await userEvent.keyboard(mod('k'));
    await userEvent.keyboard(':wifi non{Enter}');
    await waitFor(() => expect(system.state().wifi.enabled).toBe(false));
    await waitFor(() => expect(line().textContent).toContain('wifi non'));
  });

  it('puts the focus on the line with the system key alone, and back to the text with Échap', async () => {
    const { editor } = await start(createSimulatedSystem());
    await userEvent.keyboard(`{${sysKey}}`);
    await waitFor(() => expect(document.activeElement?.closest('[role="toolbar"]')).toBe(line()));
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    expect((document.activeElement as HTMLElement).dataset['seg']).toBe('wifi');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(editor));
  });

  it('opens the settings of the system, its twelve sections in the rail', async () => {
    const system = createSimulatedSystem();
    await start(system);
    await userEvent.keyboard(sys(','));
    const rail = await screen.findByRole('listbox', { name: 'Sections des réglages' });
    expect(within(rail).getAllByRole('option')).toHaveLength(12);
    screen.getByText('réglages du système');
    await userEvent.click(within(rail).getByRole('option', { name: /Ligne système/ }));
    const page = await screen.findByRole('region', { name: 'Ligne système' });
    await userEvent.click(within(page).getByRole('radio', { name: 'non' }));
    await waitFor(() => expect(system.state().settings.showCpu).toBe(false));
    expect(line().querySelector('[data-seg="cpu"]')).toBeNull();
  });

  it('is not there without a System service (the Mac, the web)', async () => {
    await start(null);
    expect(screen.queryByRole('toolbar', { name: 'ligne système' })).toBeNull();
    await userEvent.keyboard(mod('k'));
    await userEvent.keyboard(':lum');
    await screen.findByText('Aucun résultat');
  });
});
