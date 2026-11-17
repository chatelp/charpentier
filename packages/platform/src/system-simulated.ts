import {
  DEFAULT_SYSTEM_SETTINGS,
  MESSAGE_LENGTH,
  messageAbout,
  type NightMode,
  type PhoneSetup,
  type PhoneStep,
  type SystemMessage,
  type SystemService,
  type SystemState,
  type SystemUpdate,
  type UpdateFailure,
  type WifiNetwork,
  updateMessages,
} from './system';
import { createLockKeeper, isValidCode, type LockRecord } from './lock-keeper';
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
    /** Takes the batteries out: a machine on mains alone (a virtual machine). */
    noBattery(): void;
    /** The networks in range (none: a virtual machine, a first scan not done yet). */
    networks(networks: readonly WifiNetwork[]): void;
    /** A cpu sample (load in %), as every 5 s on the device. */
    cpu(load: number, temperature?: number): void;
    /** Drops the connection (out of range). */
    wifiLost(): void;
    /** A version received, verified and set for the next start (phase 5.12). */
    updateReady(version?: string): void;
    /** A version received and discarded. */
    updateFailed(reason: UpdateFailure, version?: string): void;
    /** No update service (a development system). */
    noUpdates(): void;
    /** No Wi-Fi card that can open a network for the phone. */
    noHotspot(): void;
    /** A phone joined the temporary network of the first start (phase 5.13). */
    phoneJoined(): void;
    /** The page opened on the phone. */
    phoneOpened(): void;
    /** The phone left the network before sending. */
    phoneLeft(): void;
    /** The phone sent the settings; each line's end (all fine by default; none: not given). */
    phoneSent(steps?: Partial<Record<'wifi' | 'sync' | 'mentor', PhoneStep | null>>): void;
    /** The page's token ran out: a new one. */
    phoneExpired(): void;
    /** The actions called, for the tests (`suspend`, `reboot`…). */
    readonly calls: readonly string[];
  };
}

let sequence = 0;

export function createSimulatedSystem(
  options: {
    readonly now?: () => Date;
    /** A device just installed: the first start's steps come first. */
    readonly firstStart?: boolean;
    /** A code already chosen. */
    readonly code?: string;
  } = {},
): SimulatedSystem {
  const now = options.now ?? (() => new Date());
  const listeners = new Set<() => void>();
  // A new array at each message: the interface sees it changed.
  let journal: readonly SystemMessage[] = [];
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
      commit: '43d2f0a',
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
    lock: { locked: false, hasCode: false, retryAt: null },
    firstStart: options.firstStart ?? false,
    update: {
      installed: {
        version: '0.5.0',
        installedAt: '2026-11-12T10:20:00Z',
        notes: ['Le moniteur du système (⊞M).', 'La chaleur du mode nuit se règle.'],
      },
      ready: null,
      previous: { version: '0.4.2', readable: true },
      setAside: null,
      lastCheck: new Date(now().getTime() - 27 * 60_000).toISOString(),
      checking: false,
      failure: null,
    },
    phoneSetup: null,
  };
  let record: LockRecord | null = null;
  const keeper = createLockKeeper({
    load: () => record,
    save: (r) => void (record = r),
    now: () => now().getTime(),
    iterations: 1_000,
  });
  const lockState = (locked: boolean) => {
    const retry = keeper.retryAt();
    update((s) => ({
      ...s,
      lock: {
        locked: locked && keeper.hasCode(),
        hasCode: keeper.hasCode(),
        retryAt: retry === null ? null : new Date(retry).toISOString(),
      },
    }));
  };
  const ready = options.code ? keeper.setCode(options.code).then(() => lockState(false)) : null;

  const emit = () => {
    for (const listener of listeners) listener();
  };
  const update = (change: (s: SystemState) => SystemState) => {
    state = change(state);
    emit();
  };
  const post = (text: string, quiet = false) => {
    journal = [
      ...journal,
      {
        id: `m${++sequence}`,
        text: text.slice(0, MESSAGE_LENGTH),
        at: now().toISOString(),
        ...(quiet && { quiet }),
      },
    ];
    emit();
  };
  /** A change of the updates, with the messages it brings. */
  const changeUpdate = (change: (u: SystemUpdate) => SystemUpdate) => {
    const before = state.update;
    if (!before) return;
    update((s) => ({ ...s, update: change(before) }));
    for (const m of updateMessages(before, state.update)) post(m.text, m.quiet);
  };
  let hotspot = true;
  const PAGE = 'http://10.42.0.1:8080/?t=essai';
  const phone = (change: Partial<PhoneSetup>) =>
    update((s) => ({ ...s, phoneSetup: s.phoneSetup && { ...s.phoneSetup, ...change } }));
  const call = async (name: string) => {
    calls.push(name);
  };

  // The journal is never empty: the device's start is its first line.
  journal = [
    {
      id: `m${++sequence}`,
      text: `démarrage · charpentier ${state.device.appVersion}`,
      at: state.device.bootedAt,
    },
  ];

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
    print: async (job) => {
      calls.push('print');
      post(messageAbout(job.printer, (n) => `impression envoyée · ${n}`));
      return 'printed';
    },
    scanBluetooth: async () => [{ id: 'bt-2', name: 'Clavier K380', connected: false }],
    pairBluetooth: async (id) => {
      calls.push('pairBluetooth');
      const name = id === 'bt-2' ? 'Clavier K380' : id;
      update((s) => ({
        ...s,
        bluetooth: {
          ...s.bluetooth,
          devices: [
            ...s.bluetooth.devices.filter((d) => d.id !== id),
            { id, name, connected: true },
          ],
        },
      }));
      post(messageAbout(name, (n) => `${n} appairé`));
      return 'paired';
    },
    copyToUsb: async () => {
      calls.push('copyToUsb');
      const name = state.usb?.name;
      if (!name) return 'failed';
      post(messageAbout(name, (n) => `textes copiés sur ${n}`));
      return 'copied';
    },
    ejectUsb: async () => {
      const name = state.usb?.name;
      update((s) => ({ ...s, usb: null }));
      if (name) post(messageAbout(name, (n) => `clé ${n} éjectée`));
    },
    lock: async () => {
      await ready;
      lockState(true);
    },
    unlock: async (code) => {
      await ready;
      const result = await keeper.check(code);
      lockState(result !== 'ok');
      return result;
    },
    setLockCode: async (code, current) => {
      await ready;
      if (keeper.hasCode() && (await keeper.check(current ?? '')) !== 'ok') return 'wrong';
      if (code !== null && !isValidCode(code)) return 'invalid';
      await keeper.setCode(code);
      lockState(false);
      return 'ok';
    },
    finishFirstStart: async () => update((s) => ({ ...s, firstStart: false })),
    phoneSetupAvailable: async () => hotspot,
    startPhoneSetup: async (retryWifi = false) => {
      calls.push(retryWifi ? 'startPhoneSetup retryWifi' : 'startPhoneSetup');
      if (!hotspot) return 'unavailable';
      update((s) => ({
        ...s,
        phoneSetup: {
          network: { ssid: 'charpentier-7f3k', password: 'tilleul-cadran-47' },
          open: true,
          stage: 'join',
          page: null,
          opened: false,
          note: null,
          wifiOnly: retryWifi,
          steps: retryWifi ? (s.phoneSetup?.steps ?? null) : null,
        },
      }));
      post('réseau temporaire · charpentier-7f3k');
      return 'ok';
    },
    stopPhoneSetup: async () => {
      calls.push('stopPhoneSetup');
      update((s) => ({ ...s, phoneSetup: null }));
    },
    checkUpdate: async () => {
      calls.push('checkUpdate');
      changeUpdate((u) => ({ ...u, lastCheck: now().toISOString() }));
    },
    bootVersion: async (version) => {
      const u = state.update;
      const target = [u?.previous, u?.setAside].find((v) => v?.version === version);
      if (!target?.readable) return 'failed';
      calls.push(`bootVersion ${version}`);
      return 'ok';
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
      networks: (networks) =>
        update((s) => ({
          ...s,
          wifi: {
            ...s.wifi,
            networks,
            connected: networks.some((n) => n.ssid === s.wifi.connected) ? s.wifi.connected : null,
          },
        })),
      noBattery: () =>
        update((s) => ({
          ...s,
          power: { ...s.power, batteries: [], charging: false, remaining: null },
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
      updateReady: (version = '0.6.0') =>
        changeUpdate((u) => ({
          ...u,
          ready: {
            version,
            publishedAt: '2026-11-13T08:00:00Z',
            notes: [
              'L’entretien avec le Compagnon, en tête de l’Atelier (⌘0).',
              'Les mises à jour arrivent d’elles-mêmes par le serveur.',
              'La lumière suit le clavier dans les listes.',
            ],
          },
          failure: null,
        })),
      updateFailed: (reason, version = '0.6.0') =>
        changeUpdate((u) => ({ ...u, failure: { version, at: now().toISOString(), reason } })),
      noUpdates: () => update((s) => ({ ...s, update: null })),
      noHotspot: () => {
        hotspot = false;
      },
      phoneJoined: () => {
        phone({
          stage: 'fill',
          page: { url: PAGE, address: '10.42.0.1:8080', code: '482913' },
          note: null,
        });
        post('un téléphone a rejoint le réseau');
      },
      phoneOpened: () => {
        phone({ opened: true });
        post('page ouverte sur le téléphone');
      },
      phoneLeft: () => {
        phone({ stage: 'join', page: null, opened: false, note: 'left' });
        post('le téléphone a quitté le réseau');
      },
      phoneSent: (steps = {}) => {
        const line = (key: 'wifi' | 'sync' | 'mentor', value: string) => {
          const given = steps[key];
          return given === null ? {} : { [key]: given ?? { status: 'ok' as const, value } };
        };
        phone({
          stage: 'done',
          open: false,
          steps: {
            ...line('wifi', 'Maison-5G'),
            ...line('sync', 'charpentier.chatel.pm'),
            ...line('mentor', 'clé sk-ant-…4f2a'),
          },
        });
      },
      phoneExpired: () => {
        phone({
          page: { url: `${PAGE}2`, address: '10.42.0.1:8080', code: '517204' },
          opened: false,
          note: 'renewed',
        });
        post('nouveau code · le précédent a expiré');
      },
      wifiLost: () => {
        update((s) => ({ ...s, wifi: { ...s.wifi, connected: null, address: null } }));
        post('réseau perdu');
      },
      calls,
    },
  };
}
