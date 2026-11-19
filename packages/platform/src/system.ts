import type { UnlockResult } from './lock-keeper';
import type { SystemMonitor } from './monitor';

/**
 * The device's system, on the X250 only (docs/SPEC.md D-24, docs/DESIGN.md
 * §4.12): what a window manager would offer, driven from the app. Absent
 * (null) on the Mac and the web; a simulated one stands in while developing.
 *
 * The state is read whole and watched; every change goes through an action.
 * Messages are the system's only channel to the author (no notification):
 * the service writes those born of a change of state, the interface those
 * born of the author's gestures, both into the same journal.
 */
export interface SystemService {
  state(): SystemState;
  /** The monitor's samples (phase 5.5), when the system can measure itself. */
  readonly monitor?: SystemMonitor | null;
  onChange(listener: () => void): () => void;
  /** The messages since the device started, oldest first (wiped at power off). */
  journal(): readonly SystemMessage[];
  /** A message of the interface (« luminosité 70 % »): 40 signs at most, no capital, no full stop. */
  post(text: string): void;

  setWifi(enabled: boolean): Promise<void>;
  /** `password` for a protected network seen for the first time. */
  connectWifi(ssid: string, password?: string): Promise<'connected' | 'wrong-password' | 'failed'>;
  forgetWifi(ssid: string): Promise<void>;
  setBluetooth(enabled: boolean): Promise<void>;
  forgetBluetooth(deviceId: string): Promise<void>;
  setBrightness(percent: number): Promise<void>;
  setNightMode(mode: NightMode): Promise<void>;
  setVolume(percent: number): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  /** A setting of the device (`screenOffAfter`, `keyboardLayout`…), see `SystemSettings`. */
  setSetting<K extends keyof SystemSettings>(key: K, value: SystemSettings[K]): Promise<void>;
  /**
   * Copies every project in Markdown to the key, in `Charpentier/<date>/`;
   * nothing on the key is erased.
   */
  copyToUsb(): Promise<'copied' | 'failed'>;
  ejectUsb(): Promise<void>;
  /**
   * Prints what the interface laid out for print (its `@media print` page)
   * on a printer of the network: A4, the running title and the folio.
   */
  print(job: PrintJob): Promise<'printed' | 'failed'>;
  /** Looks for Bluetooth devices nearby, not yet paired (a few seconds). */
  scanBluetooth(): Promise<readonly BluetoothDevice[]>;
  pairBluetooth(deviceId: string): Promise<'paired' | 'failed'>;
  /** Locks now (⊞L); nothing without a code. */
  lock(): Promise<void>;
  unlock(code: string): Promise<UnlockResult>;
  /**
   * A new code (4 to 8 letters or digits), or null for none. When a code is
   * set, `current` must be it.
   */
  setLockCode(code: string | null, current?: string): Promise<'ok' | 'wrong' | 'invalid'>;
  /** The four steps of the first start are done or put off (§4.12). */
  finishFirstStart(): Promise<void>;
  /** Whether the device can open a network for the phone (a Wi-Fi card that can). */
  phoneSetupAvailable(): Promise<boolean>;
  /**
   * The first start from the phone (phase 5.13, D-33): the device opens a
   * temporary network and, once a phone joined it, serves a page with a
   * one-time token, where the author fills in the settings. `retryWifi`: the
   * home Wi-Fi was refused; a new network, and a page for the Wi-Fi alone.
   */
  startPhoneSetup(retryWifi?: boolean): Promise<'ok' | 'unavailable'>;
  /** Closes the temporary network and the page (« Au clavier », Échap). */
  stopPhoneSetup(): Promise<void>;
  /** « Vérifier maintenant » (phase 5.12): the result comes as usual, in the state and the line. */
  checkUpdate(): Promise<void>;
  /**
   * Restarts on another version still in the boot menu: the previous one, or
   * the one set aside by going back. The device restarts when it is `ok`.
   */
  bootVersion(version: string): Promise<'ok' | 'failed'>;
  suspend(): Promise<void>;
  reboot(): Promise<void>;
  powerOff(): Promise<void>;
}

export type NightMode = 'auto' | 'on' | 'off';

export interface PrintJob {
  readonly printer: string;
  readonly copies: number;
  /** The running title, at the top of each page. */
  readonly title: string;
}

export interface SystemMessage {
  readonly id: string;
  readonly text: string;
  readonly at: string;
  /** Only in the journal, never shown on the line (« 0.6.0 : téléchargement interrompu »). */
  readonly quiet?: boolean;
}

/**
 * The X250's updates (docs/PLAN.md phase 5.12, docs/x250-update-contract.md):
 * received from the author's server by the system, announced by the app,
 * applied at the next start, whatever it is.
 */
export interface SystemUpdate {
  /** The version running: the system's, `X.Y.Z` or `X.Y.Z-N` (D-31). */
  readonly installed: {
    readonly version: string;
    readonly installedAt: string;
    readonly notes: readonly string[];
  };
  /** Verified and set for the next start. */
  readonly ready: {
    readonly version: string;
    readonly publishedAt: string;
    readonly notes: readonly string[];
  } | null;
  /** Still in the boot menu; `readable`: it can still read the projects. */
  readonly previous: { readonly version: string; readonly readable: boolean } | null;
  /** A newer version left by going back: no longer announced, one can return to it. */
  readonly setAside: { readonly version: string; readonly readable: boolean } | null;
  readonly lastCheck: string | null;
  readonly checking: boolean;
  readonly failure: {
    readonly version: string;
    readonly at: string;
    readonly reason: UpdateFailure;
  } | null;
}

export type UpdateFailure = 'signature' | 'unreadable' | 'disk-full' | 'interrupted';

/**
 * The first start from the phone, as the device shows it (phase 5.13,
 * docs/DESIGN.md §4.12). The settings themselves (passwords, key) never
 * reach the interface: the main process applies them and says how it went.
 */
export interface PhoneSetup {
  /** The temporary network, shown in clear beside its code. */
  readonly network: { readonly ssid: string; readonly password: string };
  /** The temporary network is open (the `wifi` segment says « temporaire »). */
  readonly open: boolean;
  /** `1 rejoindre`, `2 remplir`, `3 appliquer`, then done. */
  readonly stage: 'join' | 'fill' | 'apply' | 'done';
  /** The page, once a phone joined: its address with the token, and the six digits. */
  readonly page: {
    readonly url: string;
    readonly address: string;
    readonly code: string;
  } | null;
  /** The page is open on the phone. */
  readonly opened: boolean;
  /** What just happened: the phone left before sending, or a new code replaced the old. */
  readonly note: 'left' | 'renewed' | null;
  /** A second round for the home Wi-Fi alone, the rest kept on the device. */
  readonly wifiOnly: boolean;
  /** One line per setting received; a setting left empty has none. */
  readonly steps: {
    readonly wifi?: PhoneStep;
    readonly sync?: PhoneStep;
    readonly mentor?: PhoneStep;
  } | null;
}

/**
 * A setting received from the phone. `value`: what it is, never a secret
 * (the network, the server, `sk-ant-…4f2a`); `reason`: the action's result
 * when it failed (`wrong-password`, `invalid`, `unreachable`…).
 */
export interface PhoneStep {
  /** `waiting`: it waits for the home Wi-Fi, refused. */
  readonly status: 'todo' | 'running' | 'ok' | 'failed' | 'waiting';
  readonly value: string;
  readonly reason?: string;
}

/** What the phone sent, as the page posts it (empty fields left out). */
export interface PhoneSettings {
  readonly wifi?: { readonly ssid: string; readonly password: string };
  readonly sync?: { readonly server: string; readonly email: string; readonly password: string };
  readonly apiKey?: string;
}

export interface WifiNetwork {
  readonly ssid: string;
  /** 0 to 4 bars. */
  readonly signal: number;
  readonly secure: boolean;
  /** Asks for a sign-in page (captive portal): marked, never opened. */
  readonly portal: boolean;
  /** Known: joined before, its password kept. */
  readonly known: boolean;
}

export interface BluetoothDevice {
  readonly id: string;
  readonly name: string;
  readonly connected: boolean;
}

export interface Battery {
  readonly name: string;
  /** 0 to 100. */
  readonly level: number;
  /** Wear, 0 to 100 (100: as new). */
  readonly health: number;
}

export interface SystemSettings {
  /** Minutes, or null for never. */
  readonly screenOffAfter: 5 | 15 | null;
  readonly sleepAfter: 15 | 30 | null;
  readonly lowBattery: number;
  readonly askCode: 'wake' | 'after15' | 'never';
  readonly keyboardLayout: 'azerty' | 'qwerty';
  readonly touchpad: boolean;
  readonly touchpadWhileTyping: boolean;
  readonly tapToClick: boolean;
  readonly naturalScrolling: boolean;
  readonly paperSize: 'a4' | 'letter';
  readonly autoTime: boolean;
  readonly clock24: boolean;
  /** The `cpu` segment of the system line. */
  readonly showCpu: boolean;
  /** The external screen's scale, in % (« externe seul »). */
  readonly externalScale: 100 | 125 | 150;
  /** The laptop's own screen's scale, in % (D-37: 100 by default, 1920 px CSS on the X250). */
  readonly screenScale: 100 | 125 | 150;
  /** The night mode's warmth, in kelvin: light, medium or strong (docs/DESIGN.md §4.12). */
  readonly nightWarmth: NightWarmth;
}

export type NightWarmth = 5500 | 4800 | 4000;

export interface SystemState {
  readonly device: {
    readonly name: string;
    readonly model: string;
    readonly appVersion: string;
    /** The commit the app was built from (short), when known: shown beside the version. */
    readonly commit?: string;
    readonly osVersion: string;
    readonly generation: number;
    readonly installedAt: string;
    readonly bootedAt: string;
    readonly storage: { readonly used: number; readonly total: number };
    readonly diskEncrypted: boolean;
  };
  readonly wifi: {
    readonly enabled: boolean;
    readonly connected: string | null;
    readonly networks: readonly WifiNetwork[];
    readonly address: string | null;
  };
  readonly ethernet: { readonly connected: boolean };
  readonly bluetooth: { readonly enabled: boolean; readonly devices: readonly BluetoothDevice[] };
  readonly brightness: number;
  readonly night: { readonly mode: NightMode; readonly active: boolean };
  readonly externalScreen: string | null;
  readonly volume: number;
  readonly muted: boolean;
  readonly power: {
    readonly batteries: readonly Battery[];
    readonly charging: boolean;
    /** Watts drawn (or charged). */
    readonly watts: number;
    /** Minutes left, null when charging or unknown. */
    readonly remaining: number | null;
  };
  readonly usb: { readonly name: string } | null;
  /** Load in %, temperature in °C, the last minute in twelve 5 s averages. */
  readonly cpu: {
    readonly load: number;
    readonly temperature: number;
    readonly history: readonly number[];
  };
  readonly printers: readonly { readonly name: string; readonly isDefault: boolean }[];
  readonly timeZone: string;
  readonly settings: SystemSettings;
  /** The lock screen (phase 5.6): shown while `locked`; `retryAt` after 5 wrong codes. */
  readonly lock: {
    readonly locked: boolean;
    readonly hasCode: boolean;
    readonly retryAt: string | null;
  };
  /** A device just installed: its first start's four steps come before anything else. */
  readonly firstStart: boolean;
  /** Null without an update service (a development system, a machine of its own). */
  readonly update: SystemUpdate | null;
  /** The first start from the phone, while it runs (phase 5.13). */
  readonly phoneSetup: PhoneSetup | null;
}

/** The version shown everywhere: the system's when it has updates, else the app's. */
export const deviceVersion = (state: SystemState): string =>
  state.update?.installed.version ?? state.device.appVersion;

/**
 * The version as the author reads it: the number, then the commit it was
 * built from (« 0.1.1 (43d2f0a) »), since a development build keeps the last
 * release's number (decision of the author, 17 November 2026).
 */
export const deviceVersionLabel = (state: SystemState): string =>
  state.device.commit ? `${deviceVersion(state)} (${state.device.commit})` : deviceVersion(state);

/** The longest message of the system line (docs/DESIGN.md §4.12). */
export const MESSAGE_LENGTH = 40;

/**
 * A message about a name (« connecté à Maison-5G »): the name gives way, with
 * an ellipsis, so the words around it are always read whole.
 */
export function messageAbout(name: string, template: (name: string) => string): string {
  const room = MESSAGE_LENGTH - template('').length;
  return template(name.length <= room ? name : `${name.slice(0, Math.max(1, room - 1))}…`);
}

/** A new device's settings (docs/DESIGN.md §4.12). */
export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  screenOffAfter: 5,
  sleepAfter: 15,
  lowBattery: 15,
  askCode: 'wake',
  keyboardLayout: 'azerty',
  touchpad: true,
  touchpadWhileTyping: false,
  tapToClick: true,
  naturalScrolling: false,
  paperSize: 'a4',
  autoTime: true,
  clock24: true,
  showCpu: true,
  externalScale: 100,
  screenScale: 100,
  nightWarmth: 4800,
};

/** Below this level, on battery, the device saves the scene and sleeps (§4.12). */
export const CRITICAL_BATTERY = 3;

/**
 * Whether the device runs on batteries: a machine on mains alone (a desktop, a
 * virtual machine) has none, and then nothing about a battery is shown.
 */
export const hasBattery = (state: SystemState): boolean => state.power.batteries.length > 0;

/** The overall battery level, 0 to 100, over every battery. */
export const batteryLevel = (state: SystemState): number => {
  const { batteries } = state.power;
  return batteries.length
    ? Math.round(batteries.reduce((sum, b) => sum + b.level, 0) / batteries.length)
    : 0;
};

const FAILURE_WORDS: Record<Exclude<UpdateFailure, 'interrupted'>, string> = {
  signature: 'signature invalide',
  unreadable: 'version illisible',
  'disk-full': 'disque plein',
};

/**
 * The messages born of a change of the updates (docs/DESIGN.md §4.12): a
 * version ready, a version discarded (once per failure), a download cut short
 * (in the journal only).
 */
export function updateMessages(
  before: SystemUpdate | null,
  after: SystemUpdate | null,
): readonly { readonly text: string; readonly quiet?: boolean }[] {
  if (!after) return [];
  const messages: { text: string; quiet?: boolean }[] = [];
  const failure = after.failure;
  const old = before?.failure;
  if (
    failure &&
    (failure.version !== old?.version || failure.reason !== old.reason || failure.at !== old.at)
  )
    messages.push(
      failure.reason === 'interrupted'
        ? { text: `${failure.version} : téléchargement interrompu`, quiet: true }
        : // The same failure again (the next check) is not repeated on the line.
          {
            text: `mise à jour écartée · ${FAILURE_WORDS[failure.reason]}`,
            ...(failure.version === old?.version &&
              failure.reason === old.reason && { quiet: true }),
          },
    );
  if (after.ready && after.ready.version !== before?.ready?.version)
    messages.push({ text: 'mise à jour prête · ⊞R redémarrer' });
  return messages;
}

/**
 * The messages of a start (docs/DESIGN.md §4.12), from the version the app saw
 * last: back on an older one (the newer set aside), or on the one made ready.
 */
export function startMessages(
  lastSeen: string | null,
  update: SystemUpdate | null,
): readonly { readonly text: string; readonly quiet?: boolean }[] {
  const version = update?.installed.version;
  if (!version || !lastSeen || lastSeen === version) return [];
  if (update.setAside?.version === lastSeen)
    return [{ text: `revenu à ${version} · ${lastSeen} mise de côté` }];
  return [
    { text: 'redémarrage pour la mise à jour', quiet: true },
    { text: `à jour · ${version}` },
  ];
}
