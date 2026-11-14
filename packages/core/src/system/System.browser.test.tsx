import { createSimulatedSystem, type SimulatedSystem } from '@charpentier/platform';
import { listCheckpoints } from '@charpentier/schema';
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

async function start(system: SimulatedSystem | null, { focused = true } = {}) {
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
  if (focused) await waitFor(() => expect(document.activeElement).toBe(editor));
  return { editor, docs };
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

  it('shows nothing about a battery on a machine on mains alone (a virtual machine)', async () => {
    const system = createSimulatedSystem();
    system.simulate.noBattery();
    await start(system);
    expect(line().querySelector('[data-seg="bat"]')).toBeNull();
    expect(line().querySelector('.is-alert')).toBeNull();
    await userEvent.keyboard(sys(','));
    const rail = await screen.findByRole('listbox', { name: 'Sections des réglages' });
    await userEvent.click(within(rail).getByRole('option', { name: /Batterie et veille/ }));
    const page = await screen.findByRole('region', { name: 'Batterie et veille' });
    expect(page.textContent).toContain('Sur secteur, sans batterie.');
    expect(within(page).queryByText('Batteries')).toBeNull();
  });

  it('answers the ThinkPad keys of light and sound: the gauge moves, the segment lights up', async () => {
    const system = createSimulatedSystem();
    await start(system);
    const press = (key: string) =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    press('BrightnessUp');
    await waitFor(() => expect(system.state().brightness).toBe(65));
    expect(line().querySelector('[data-seg="lum"]')?.classList.contains('is-lit')).toBe(true);
    await waitFor(() => expect(line().textContent).toContain('luminosité 65 %'));
    press('AudioVolumeDown');
    press('AudioVolumeDown');
    await waitFor(() => expect(system.state().volume).toBe(30));
    press('AudioVolumeMute');
    await waitFor(() => expect(system.state().muted).toBe(true));
    await waitFor(() => expect(line().textContent).toContain('son coupé'));
    // The light goes out after a second.
    await waitFor(
      () =>
        expect(line().querySelector('[data-seg="vol"]')?.classList.contains('is-lit')).toBe(false),
      { timeout: 2000 },
    );
  });

  it('warns once under the threshold, then at 3 % saves and sleeps', async () => {
    const system = createSimulatedSystem();
    const { docs } = await start(system);
    const checkpoints = () =>
      [...docs.entries()]
        .filter(([guid]) => guid.endsWith('/history'))
        .reduce((n, [, doc]) => n + listCheckpoints(doc).length, 0);
    const before = checkpoints();
    system.simulate.battery(14);
    await waitFor(() =>
      expect(line().textContent).toContain('batterie faible · branchez l’appareil'),
    );
    system.simulate.battery(13);
    expect(system.journal().filter((m) => m.text.startsWith('batterie faible'))).toHaveLength(1);
    system.simulate.battery(3);
    await waitFor(() => expect(system.simulate.calls).toContain('suspend'));
    expect(system.journal().at(-1)?.text).toBe('batterie épuisée · mise en veille');
    // The scene was saved as a restore point before sleeping.
    expect(checkpoints()).toBe(before + 1);
    // Plugged in, then unplugged: it warns again.
    system.simulate.battery(10, true);
    system.simulate.battery(10);
    expect(system.journal().filter((m) => m.text.startsWith('batterie faible'))).toHaveLength(2);
  });

  it('opens the monitor full frame with its key, from :moniteur and from the cpu segment', async () => {
    const { editor } = await start(createSimulatedSystem());
    await userEvent.keyboard(sys('m'));
    const monitor = await screen.findByRole('region', { name: 'moniteur' });
    for (const dial of [
      'processeur',
      'températures',
      'mémoire',
      'réseau',
      'batterie',
      'disque',
      'charpentier',
      'graphique',
    ])
      within(monitor).getByRole('region', { name: dial });
    expect(within(monitor).getByRole('region', { name: 'graphique' }).textContent).toContain(
      'non mesurée',
    );
    // The durations, in tabs; the curve follows.
    await userEvent.click(within(monitor).getByRole('tab', { name: '1 h' }));
    expect(within(monitor).getByRole('tab', { name: '1 h' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('region', { name: 'moniteur' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(editor));

    await userEvent.keyboard(mod('k'));
    await userEvent.keyboard(':moniteur{Enter}');
    await screen.findByRole('region', { name: 'moniteur' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('region', { name: 'moniteur' })).toBeNull());

    await userEvent.click(line().querySelector('[data-seg="cpu"]') as HTMLElement);
    await screen.findByRole('region', { name: 'moniteur' });
  });

  it('locks with its key: nothing of the project shows, no shortcut passes, the code opens', async () => {
    const system = createSimulatedSystem({ code: '1234' });
    const { editor } = await start(system);
    await waitFor(() => expect(system.state().lock.hasCode).toBe(true));
    await userEvent.keyboard(sys('l'));
    const lock = await screen.findByRole('form', { name: 'verrouillé' });
    expect(editor.closest('[inert]')).not.toBeNull();
    // The line keeps only charpentier, verrouillé, the battery and the time.
    expect(line().textContent).toContain('verrouillé');
    expect(line().textContent).not.toContain('Maison-5G');
    // No shortcut of the app.
    await userEvent.keyboard(mod('k'));
    expect(screen.queryByRole('dialog', { name: 'Ligne de commande' })).toBeNull();
    await userEvent.keyboard('0000{Enter}');
    await within(lock).findByText('ce n’est pas le code');
    expect(system.state().lock.locked).toBe(true);
    await userEvent.keyboard('1234{Enter}');
    await waitFor(() => expect(screen.queryByRole('form', { name: 'verrouillé' })).toBeNull());
    // Straight back to the text.
    expect(editor.closest('[inert]')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(editor));
  });

  it('guides a new device through its first start, each step can wait', async () => {
    const system = createSimulatedSystem({ firstStart: true });
    const { editor } = await start(system, { focused: false });
    await screen.findByText('Bienvenue');
    expect(editor.closest('[inert]')).not.toBeNull();
    screen.getByText('Avant d’écrire, quatre réglages. Chacun peut attendre.');
    // Wi-Fi: already joined; ⏎ continues.
    await screen.findByRole('listbox', { name: 'Réseaux Wi-Fi' });
    await userEvent.keyboard('{Enter}');
    // The code: two that differ, then a good one.
    const code = await screen.findByLabelText('Votre code (4 à 8 lettres ou chiffres)');
    await userEvent.type(code, '1234');
    await userEvent.type(screen.getByLabelText('Encore une fois'), '1235{Enter}');
    await screen.findByText('Les deux codes diffèrent.');
    await userEvent.clear(screen.getByLabelText('Encore une fois'));
    await userEvent.type(screen.getByLabelText('Encore une fois'), '1234{Enter}');
    // The Compagnon: put off with Échap.
    await screen.findByLabelText('Clé d’API (sk-ant-…)');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText('Bienvenue')).toBeNull());
    expect(system.state()).toMatchObject({ firstStart: false, lock: { hasCode: true } });
    expect(editor.closest('[inert]')).toBeNull();
    // The writing starts there.
    await waitFor(() => expect(document.activeElement).toBe(editor));
  });

  it('lets the first start go on without any network in range (a virtual machine)', async () => {
    const system = createSimulatedSystem({ firstStart: true });
    const inRange = system.state().wifi.networks;
    system.simulate.networks([]);
    await start(system, { focused: false });
    await screen.findByText('Bienvenue');
    // No field to hold the keys: the step does, Échap puts the Wi-Fi off.
    await userEvent.keyboard('{Escape}');
    await screen.findByLabelText('Votre code (4 à 8 lettres ou chiffres)');
    expect(system.state().firstStart).toBe(true);

    // Networks that come after the step opened (a first scan) take the focus.
    cleanup();
    const late = createSimulatedSystem({ firstStart: true });
    late.simulate.networks([]);
    await start(late, { focused: false });
    await screen.findByText('Bienvenue');
    late.simulate.networks(inRange);
    const list = await screen.findByRole('listbox', { name: 'Réseaux Wi-Fi' });
    await waitFor(() =>
      expect(document.activeElement).toBe(within(list).getAllByRole('option')[0]),
    );
  });

  it('copies the texts to a USB key from its panel (phase 5.7)', async () => {
    const system = createSimulatedSystem();
    await start(system);
    system.simulate.usb('KINGSTON');
    await userEvent.keyboard(sys('u'));
    const panel = await screen.findByRole('dialog');
    await userEvent.click(within(panel).getByRole('button', { name: 'Copier mes textes' }));
    await waitFor(() => expect(system.simulate.calls).toContain('copyToUsb'));
    await waitFor(() => expect(line().textContent).toContain('textes copiés sur KINGSTON'));
  });

  it('prints the manuscript from its sheet (phase 5.7)', async () => {
    const system = createSimulatedSystem();
    const { editor } = await start(system);
    await userEvent.type(editor, 'Il pleuvait sur Nantes.');
    let printed: string | undefined;
    let job: unknown;
    const print = system.print;
    system.print = async (j) => {
      printed = document.querySelector('.ch-print')?.textContent ?? '';
      job = j;
      return print(j);
    };
    await userEvent.keyboard(sys('p'));
    const sheet = await screen.findByRole('dialog', { name: 'Imprimer' });
    await userEvent.click(within(sheet).getByRole('radio', { name: 'tout le manuscrit' }));
    await userEvent.click(within(sheet).getByRole('button', { name: /^Imprimer/ }));
    await waitFor(() => expect(system.simulate.calls).toContain('print'));
    expect(printed).toContain('Il pleuvait sur Nantes.');
    expect(job).toMatchObject({ printer: 'Brother HL-L2350 (réseau)', copies: 1 });
    // The page for the printer is gone, the sheet too, the cursor is back.
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Imprimer' })).toBeNull());
    expect(document.querySelector('.ch-print')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(editor));
  });

  it('pairs a Bluetooth device found nearby (phase 5.7)', async () => {
    const system = createSimulatedSystem();
    await start(system);
    await userEvent.keyboard(sys(','));
    const rail = await screen.findByRole('listbox', { name: 'Sections des réglages' });
    await userEvent.click(within(rail).getByRole('option', { name: /Bluetooth/ }));
    const page = await screen.findByRole('region', { name: 'Bluetooth' });
    await userEvent.click(within(page).getByRole('button', { name: 'Chercher' }));
    await userEvent.click(await within(page).findByRole('button', { name: 'Appairer' }));
    await waitFor(() =>
      expect(system.state().bluetooth.devices.map((d) => d.name)).toContain('Clavier K380'),
    );
    expect(line().textContent).toContain('Clavier K380 appairé');
  });

  it('is not there without a System service (the Mac, the web)', async () => {
    await start(null);
    expect(screen.queryByRole('toolbar', { name: 'ligne système' })).toBeNull();
    await userEvent.keyboard(mod('k'));
    await userEvent.keyboard(':lum');
    await screen.findByText('Aucun résultat');
  });
});
