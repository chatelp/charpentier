import {
  DEFAULT_SYSTEM_SETTINGS,
  MESSAGE_LENGTH,
  messageAbout,
  type NightMode,
  type SystemMessage,
  type SystemService,
  type SystemState,
} from './system';
import { simulatedMonitor } from './monitor-simulated';

/**
 * A simulated X250 (docs/PLAN.md phase 5.3): the System service that the
 * system line, its panels and the settings are developed and tested against,
 * on the Mac and the web. Its state is the mockup's (docs/design/x250); the
 * tests drive it through `simulate`.
 */
export interface SimulatedSystem extends SystemService {
  readonly simulate: {
    /** Plugs (a name) or pulls (null) a USB key. */
    usb(name: string | null): void;
    /** Sets the batteries' level, 0 to 100, and whether it charges. */
    battery(level: number, charging?: boolean): void;
    /** A cpu sample (load in %), as every 5 s on the device. */
    cpu(load: number, temperature?: number): void;
    /** Drops the connection (out of range). */
    wifiLost(): void;
    /** The actions called, for the tests (`suspend`, `reboot`…). */
    readonly calls: readonly string[];
  };
}

let sequence = 0;

export function createSimulatedSystem(
  options: { readonly now?: () => Date } = {},
): SimulatedSystem {
  const now = options.now ?? (() => new Date());
  const listeners = new Set<() => void>();
  const journal: SystemMessage[] = [];
  const calls: string[] = [];
  const passwords = new Map<string, string>([
    ['Maison-5G', 'secret'],
    ['Maison-2G', 'secret'],
  ]);
  let state: SystemState = {
    device: {
      name: 'x250',
      model: 'ThinkPad X250 · i5-5300U · 8 Go',
      appVersion: '0.5.0',
      osVersion: 'nixos 26.11',
      generation: 12,
      installedAt: '2026-11-13T09:00:00Z',
      bootedAt: new Date(now().getTime() - (3 * 60 + 12) * 60_000).toISOString(),
      storage: { used: 38, total: 238 },
      diskEncrypted: true,
    },
    wifi: {
      enabled: true,
      connected: 'Maison-5G',
      address: '192.168.1.42',
      networks: [
        { ssid: 'Maison-5G', signal: 4, secure: true, portal: false, known: true },
        { ssid: 'Maison-2G', signal: 3, secure: true, portal: false, known: true },
        { ssid: 'Hotel_du_Port', signal: 3, secure: false, portal: true, known: false },
        { ssid: 'Livebox-4A2C', signal: 2, secure: true, portal: false, known: false },
      ],
    },
    ethernet: { connected: false },
    bluetooth: {
      enabled: false,
      devices: [{ id: 'bt-1', name: 'Casque Sennheiser', connected: false }],
    },
    brightness: 60,
    night: { mode: 'auto', active: false },
    externalScreen: null,
    volume: 40,
    muted: false,
    power: {
      batteries: [
        { name: 'interne', level: 82, health: 91 },
        { name: 'amovible', level: 82, health: 76 },
      ],
      charging: false,
      watts: 6.8,
      remaining: 340,
    },
    usb: null,
    cpu: { load: 12, temperature: 48, history: [4, 6, 5, 9, 12, 8, 6, 22, 14, 9, 7, 12] },
    printers: [
      { name: 'Brother HL-L2350 (réseau)', isDefault: true },
      { name: 'HP LaserJet bureau', isDefault: false },
    ],
    timeZone: 'Europe/Paris',
    settings: DEFAULT_SYSTEM_SETTINGS,
  };

  const emit = () => {
    for (const listener of listeners) listener();
  };
  const update = (change: (s: SystemState) => SystemState) => {
    state = change(state);
    emit();
  };
  const post = (text: string) => {
    journal.push({
      id: `m${++sequence}`,
      text: text.slice(0, MESSAGE_LENGTH),
      at: now().toISOString(),
    });
    emit();
  };
  const call = async (name: string) => {
    calls.push(name);
  };

  // The journal is never empty: the device's start is its first line.
  journal.push({
    id: `m${++sequence}`,
    text: `démarrage · charpentier ${state.device.appVersion}`,
    at: state.device.bootedAt,
  });

  return {
    monitor: simulatedMonitor(now),
    state: () => state,
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    journal: () => journal,
    post,
    setWifi: async (enabled) => {
      update((s) => ({
        ...s,
        wifi: {
          ...s.wifi,
          enabled,
          connected: enabled ? s.wifi.connected : null,
          address: enabled ? s.wifi.address : null,
        },
      }));
      post(enabled ? 'wifi oui' : 'wifi non');
    },
    connectWifi: async (ssid, password) => {
      const network = state.wifi.networks.find((n) => n.ssid === ssid);
      if (!network) return 'failed';
      if (network.secure && !network.known && passwords.get(ssid) !== password)
        return 'wrong-password';
      update((s) => ({
        ...s,
        wifi: {
          ...s.wifi,
          enabled: true,
          connected: ssid,
          address: '192.168.1.42',
          networks: s.wifi.networks.map((n) => (n.ssid === ssid ? { ...n, known: true } : n)),
        },
      }));
      post(
        messageAbout(ssid, (n) =>
          network.portal ? `${n} · page de connexion demandée` : `connecté à ${n}`,
        ),
      );
      return 'connected';
    },
    forgetWifi: async (ssid) => {
      update((s) => ({
        ...s,
        wifi: {
          ...s.wifi,
          connected: s.wifi.connected === ssid ? null : s.wifi.connected,
          networks: s.wifi.networks.map((n) => (n.ssid === ssid ? { ...n, known: false } : n)),
        },
      }));
      post(messageAbout(ssid, (n) => `${n} oublié`));
    },
    setBluetooth: async (enabled) => {
      update((s) => ({ ...s, bluetooth: { ...s.bluetooth, enabled } }));
      post(enabled ? 'bluetooth oui' : 'bluetooth non');
    },
    forgetBluetooth: async (id) =>
      update((s) => ({
        ...s,
        bluetooth: { ...s.bluetooth, devices: s.bluetooth.devices.filter((d) => d.id !== id) },
      })),
    setBrightness: async (percent) =>
      update((s) => ({ ...s, brightness: Math.max(1, Math.min(100, Math.round(percent))) })),
    setNightMode: async (mode: NightMode) =>
      update((s) => ({ ...s, night: { mode, active: mode === 'on' } })),
    setVolume: async (percent) =>
      update((s) => ({
        ...s,
        volume: Math.max(0, Math.min(100, Math.round(percent))),
        muted: false,
      })),
    setMuted: async (muted) => update((s) => ({ ...s, muted })),
    setSetting: async (key, value) =>
      update((s) => ({ ...s, settings: { ...s.settings, [key]: value } })),
    ejectUsb: async () => {
      const name = state.usb?.name;
      update((s) => ({ ...s, usb: null }));
      if (name) post(messageAbout(name, (n) => `clé ${n} éjectée`));
    },
    suspend: () => call('suspend'),
    reboot: () => call('reboot'),
    powerOff: () => call('powerOff'),
    simulate: {
      usb: (name) => {
        update((s) => ({ ...s, usb: name ? { name } : null }));
        if (name) post(messageAbout(name, (n) => `clé « ${n} » branchée · ⊞U copier`));
      },
      battery: (level, charging = false) =>
        update((s) => ({
          ...s,
          power: {
            ...s.power,
            charging,
            remaining: charging ? null : Math.round(level * 4.1),
            batteries: s.power.batteries.map((b) => ({ ...b, level })),
          },
        })),
      cpu: (load, temperature) =>
        update((s) => ({
          ...s,
          cpu: {
            load,
            temperature: temperature ?? s.cpu.temperature,
            history: [...s.cpu.history.slice(1), load],
          },
        })),
      wifiLost: () => {
        update((s) => ({ ...s, wifi: { ...s.wifi, connected: null, address: null } }));
        post('réseau perdu');
      },
      calls,
    },
  };
}
