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
  ejectUsb(): Promise<void>;
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
  suspend(): Promise<void>;
  reboot(): Promise<void>;
  powerOff(): Promise<void>;
}

export type NightMode = 'auto' | 'on' | 'off';

export interface SystemMessage {
  readonly id: string;
  readonly text: string;
  readonly at: string;
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
  readonly keyboardLayout: 'azerty' | 'bepo' | 'qwerty';
  readonly touchpad: boolean;
  readonly touchpadWhileTyping: boolean;
  readonly tapToClick: boolean;
  readonly naturalScrolling: boolean;
  readonly paperSize: 'a4' | 'letter';
  readonly autoTime: boolean;
  readonly clock24: boolean;
  /** The `cpu` segment of the system line. */
  readonly showCpu: boolean;
}

export interface SystemState {
  readonly device: {
    readonly name: string;
    readonly model: string;
    readonly appVersion: string;
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
}

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
};

/** Below this level, on battery, the device saves the scene and sleeps (§4.12). */
export const CRITICAL_BATTERY = 3;

/** The overall battery level, 0 to 100, over every battery. */
export const batteryLevel = (state: SystemState): number => {
  const { batteries } = state.power;
  return batteries.length
    ? Math.round(batteries.reduce((sum, b) => sum + b.level, 0) / batteries.length)
    : 0;
};
