import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createLockKeeper,
  DEFAULT_SYSTEM_SETTINGS,
  isValidCode,
  type LockRecord,
  MESSAGE_LENGTH,
  messageAbout,
  type MonitorSample,
  type PrintJob,
  type NightMode,
  type SystemMessage,
  type SystemService,
  type SystemSettings,
  type SystemState,
} from '@charpentier/platform';
import { writeJsonAtomic } from '../projects';
import {
  parseDefaultPrinter,
  parsePrinterNames,
  XKB_LAYOUTS,
  isNight,
  parseMounted,
  parseOutputList,
  parseUsbKey,
  type UsbKey,
  bluetoothPowered,
  cpuLoad,
  deviceModel,
  generationOf,
  isLuks,
  osVersion,
  parseAddress,
  parseBluetoothDevices,
  parseCpuTicks,
  parseDevices,
  parseKeyValues,
  parseKnownWifi,
  parseVolume,
  parseWifiList,
  readPower,
  wrongPassword,
  type BatteryFiles,
} from './parse';
import { createLinuxMonitor } from './linux-monitor';
import type { SystemTools } from './tools';

/**
 * The X250's System service (docs/PLAN.md phase 5.4), in the main process:
 * NetworkManager (`nmcli`), the backlight (`/sys`, `brightnessctl`),
 * PipeWire (`wpctl`), the power supplies (`/sys`), logind (`systemctl`),
 * `timedatectl`, BlueZ (`bluetoothctl`), and `swayidle` for the screen and
 * sleep delays. NixOS gives the user the rights to drive them without a
 * password (phase 5.9). USB keys, printers, night mode, the external screen
 * and the keyboard come with phase 5.7.
 *
 * The state is read whole at the start, then part by part: the processor
 * every 5 s, power, light and sound every 15 s, the network whenever
 * NetworkManager says something changed (and every minute), the rest every
 * minute and on waking.
 */
export interface LinuxSystem extends SystemService {
  /** Sends a PDF made by the host (Electron's printToPDF of the print page) to the printer. */
  printPdf(pdf: Uint8Array, job: PrintJob): Promise<'printed' | 'failed'>;
  /** Reads everything and starts watching. */
  start(): Promise<void>;
  /** Reads everything again. */
  refresh(): Promise<void>;
  /** The device goes to sleep: with a code, it locks first, so nothing shows at waking. */
  sleeping(): void;
  /** It woke up: everything is read again; « after 15 min » unlocks a shorter sleep. */
  woke(): Promise<void>;
  dispose(): void;
}

export interface LinuxSystemOptions {
  readonly tools: SystemTools;
  readonly appVersion: string;
  readonly hostname: string;
  /** Where the device's settings are kept (JSON). */
  readonly settingsFile: string;
  readonly now?: () => Date;
  /** The app's processes and open documents, for the monitor (Electron knows them). */
  readonly app?: () => MonitorSample['app'];
  /** Polling periods, in ms (the tests shorten them). */
  readonly periods?: { readonly cpu?: number; readonly power?: number; readonly slow?: number };
  /** The keyboard chosen at installation (`/etc/charpentier/keyboard`): the default layout. */
  readonly keyboard?: SystemSettings['keyboardLayout'];
  /** Writes every project in Markdown into `folder` (the USB key's copy). */
  readonly exportTexts?: (folder: string) => Promise<void>;
  /** PBKDF2 rounds of the code (fewer in the tests). */
  readonly lockIterations?: number;
}

const SINK = '@DEFAULT_AUDIO_SINK@';
const POWER = '/sys/class/power_supply';
const BACKLIGHT = '/sys/class/backlight';
const THERMAL = '/sys/class/thermal';

/** The X250's two batteries, by their kernel names. */
const BATTERY_NAMES: Record<string, string> = { BAT0: 'interne', BAT1: 'amovible' };

interface Stored {
  readonly settings?: Partial<SystemSettings>;
  readonly night?: NightMode;
  /** The code's fingerprint, never the code. */
  readonly lock?: LockRecord | null;
  readonly firstStartDone?: boolean;
}

function loadStored(file: string): Stored {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Stored;
  } catch {
    return {};
  }
}

let sequence = 0;

export function createLinuxSystem(options: LinuxSystemOptions): LinuxSystem {
  const { tools } = options;
  const now = options.now ?? (() => new Date());
  const periods = { cpu: 5_000, power: 15_000, slow: 60_000, ...options.periods };
  const listeners = new Set<() => void>();
  // A new array at each message: the interface sees it changed.
  let journal: readonly SystemMessage[] = [];
  const timers: ReturnType<typeof setInterval>[] = [];
  const stops: (() => void)[] = [];
  const stored = loadStored(options.settingsFile);
  let known = new Set<string>();
  let backlight: string | null = null;
  let thermal: string | null = null;
  let ticks: { busy: number; total: number } | null = null;
  let stopIdle: (() => void) | null = null;
  let disposed = false;
  /** Set while the app itself changes the network, so the change is not « réseau perdu ». */
  let networkAction = false;

  const monitor = createLinuxMonitor({
    tools,
    app: options.app ?? (() => ({ processes: [], documents: 0 })),
    now: () => now().getTime(),
  });

  let state: SystemState = {
    device: {
      name: options.hostname,
      model: '',
      appVersion: options.appVersion,
      osVersion: '',
      generation: 0,
      installedAt: now().toISOString(),
      bootedAt: now().toISOString(),
      storage: { used: 0, total: 0 },
      diskEncrypted: false,
    },
    wifi: { enabled: false, connected: null, networks: [], address: null },
    ethernet: { connected: false },
    bluetooth: { enabled: false, devices: [] },
    brightness: 100,
    night: { mode: stored.night ?? 'auto', active: false },
    externalScreen: null,
    volume: 0,
    muted: false,
    power: { batteries: [], charging: true, watts: 0, remaining: null },
    usb: null,
    cpu: { load: 0, temperature: 0, history: [] },
    printers: [],
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    settings: {
      ...DEFAULT_SYSTEM_SETTINGS,
      ...(options.keyboard && { keyboardLayout: options.keyboard }),
      ...stored.settings,
    },
    lock: { locked: false, hasCode: !!stored.lock, retryAt: null },
    firstStart: stored.firstStartDone !== true,
  };
  let lockRecord: LockRecord | null = stored.lock ?? null;
  const keeper = createLockKeeper({
    load: () => lockRecord,
    save: (record) => {
      lockRecord = record;
      save();
    },
    now: () => now().getTime(),
    ...(options.lockIterations !== undefined && { iterations: options.lockIterations }),
  });
  let sleptAt: number | null = null;
  let usbKey: UsbKey | null = null;
  let stopNight: (() => void) | null = null;
  const setLocked = (locked: boolean) => {
    const retry = keeper.retryAt();
    const was = state.lock.locked;
    update({
      lock: {
        locked: locked && keeper.hasCode(),
        hasCode: keeper.hasCode(),
        retryAt: retry === null ? null : new Date(retry).toISOString(),
      },
    });
    // Sway's « locked » mode: no rescue terminal while locked (phase 5.9).
    if (state.lock.locked !== was)
      void run('swaymsg', 'mode', state.lock.locked ? 'locked' : 'default');
  };

  let emitted = '';
  const emit = () => {
    // The processor changes every 5 s; nothing is sent when nothing changed.
    const key = JSON.stringify(state) + journal.length;
    if (key === emitted) return;
    emitted = key;
    for (const listener of listeners) listener();
  };
  const update = (change: Partial<SystemState>) => {
    state = { ...state, ...change };
    emit();
  };
  const post = (text: string) => {
    journal = [
      ...journal,
      {
        id: `s${++sequence}`,
        text: text.slice(0, MESSAGE_LENGTH),
        at: now().toISOString(),
      },
    ];
    emit();
  };
  const run = (command: string, ...args: string[]) => tools.run(command, args);

  const save = () => {
    fs.mkdirSync(path.dirname(options.settingsFile), { recursive: true });
    writeJsonAtomic(options.settingsFile, {
      settings: state.settings,
      night: state.night.mode,
      lock: lockRecord,
      firstStartDone: !state.firstStart,
    });
  };

  // — Reading —

  async function readDevice() {
    const [product, cpuinfo, meminfo, osRelease, link, uptime, installed, disk, blocks] =
      await Promise.all([
        tools.read('/sys/class/dmi/id/product_version'),
        tools.read('/proc/cpuinfo'),
        tools.read('/proc/meminfo'),
        tools.read('/etc/os-release'),
        tools.readlink('/nix/var/nix/profiles/system'),
        tools.read('/proc/uptime'),
        tools.modified('/etc/machine-id'),
        tools.disk('/'),
        tools.list('/sys/block'),
      ]);
    const uuids = await Promise.all(
      blocks.filter((b) => b.startsWith('dm-')).map((b) => tools.read(`/sys/block/${b}/dm/uuid`)),
    );
    const up = Number(uptime?.split(/\s/)[0] ?? 0);
    const gb = (bytes: number) => Math.round(bytes / 1e9);
    state = {
      ...state,
      device: {
        ...state.device,
        model: deviceModel(product, cpuinfo, meminfo),
        osVersion: osVersion(osRelease),
        generation: generationOf(link),
        installedAt: (installed ?? now()).toISOString(),
        bootedAt: new Date(now().getTime() - up * 1000).toISOString(),
        storage: disk ? { used: gb(disk.used), total: gb(disk.total) } : state.device.storage,
        diskEncrypted: uuids.some(isLuks),
      },
    };
  }

  async function readNetwork(rescan = false) {
    const [radio, devicesOut, list, connections, connectivity] = await Promise.all([
      run('nmcli', '-t', '-f', 'WIFI', 'radio'),
      run('nmcli', '-t', '-f', 'DEVICE,TYPE,STATE,CONNECTION', 'device'),
      run(
        'nmcli',
        '-t',
        '-f',
        'IN-USE,SSID,SIGNAL,SECURITY',
        'device',
        'wifi',
        'list',
        '--rescan',
        rescan ? 'auto' : 'no',
      ),
      run('nmcli', '-t', '-f', 'NAME,TYPE', 'connection', 'show'),
      run('nmcli', '-t', '-f', 'CONNECTIVITY', 'general'),
    ]);
    if (radio.code !== 0) return; // No NetworkManager: the network stays as it is.
    known = parseKnownWifi(connections.stdout);
    const enabled = radio.stdout.trim() === 'enabled';
    const devices = parseDevices(devicesOut.stdout);
    const wifiDevice = devices.find((d) => d.type === 'wifi');
    const { networks, inUse } = parseWifiList(list.stdout, known);
    const connected = enabled && wifiDevice?.state === 'connected' ? inUse : null;
    const portal = connected !== null && connectivity.stdout.trim() === 'portal';
    const address =
      connected && wifiDevice
        ? parseAddress(
            (await run('nmcli', '-g', 'IP4.ADDRESS', 'device', 'show', wifiDevice.device)).stdout,
          )
        : null;
    const before = state.wifi.connected;
    update({
      wifi: {
        enabled,
        connected,
        address,
        networks: networks.map((n) => (n.ssid === connected ? { ...n, portal } : n)),
      },
      ethernet: {
        connected: devices.some((d) => d.type === 'ethernet' && d.state === 'connected'),
      },
    });
    if (before && !connected && enabled && !networkAction) post('réseau perdu');
  }

  async function readBrightness() {
    if (backlight === null) {
      const entries = await tools.list(BACKLIGHT);
      backlight = entries.find((e) => e === 'intel_backlight') ?? entries[0] ?? '';
    }
    if (!backlight) return;
    const [value, max] = await Promise.all([
      tools.read(`${BACKLIGHT}/${backlight}/brightness`),
      tools.read(`${BACKLIGHT}/${backlight}/max_brightness`),
    ]);
    const percent = Math.round((Number(value) / Number(max)) * 100);
    if (Number.isFinite(percent)) update({ brightness: Math.max(1, Math.min(100, percent)) });
  }

  async function readVolume() {
    const sound = parseVolume((await run('wpctl', 'get-volume', SINK)).stdout);
    if (sound) update({ volume: sound.volume, muted: sound.muted });
  }

  async function readPowerSupplies() {
    const entries = await tools.list(POWER);
    const files: BatteryFiles[] = [];
    let ac = false;
    for (const entry of entries) {
      const dir = `${POWER}/${entry}`;
      const type = (await tools.read(`${dir}/type`))?.trim();
      if (type === 'Mains') ac = ac || (await tools.read(`${dir}/online`))?.trim() === '1';
      if (type !== 'Battery') continue;
      // Some batteries count in µAh and µA: their energy is charge × voltage.
      const [capacity, status, eNow, eFull, eDesign, pNow, cNow, cFull, cDesign, iNow, volt] =
        await Promise.all(
          [
            'capacity',
            'status',
            'energy_now',
            'energy_full',
            'energy_full_design',
            'power_now',
            'charge_now',
            'charge_full',
            'charge_full_design',
            'current_now',
            'voltage_now',
          ].map((f) => tools.read(`${dir}/${f}`)),
        );
      const v = Number(volt) / 1e6;
      const times = (charge: string | null | undefined) =>
        charge != null && Number.isFinite(v) ? String(Number(charge) * v) : null;
      files.push({
        name: entry,
        capacity: capacity ?? null,
        status: status ?? null,
        energyNow: eNow ?? times(cNow),
        energyFull: eFull ?? times(cFull),
        energyFullDesign: eDesign ?? times(cDesign),
        powerNow: pNow ?? times(iNow),
      });
    }
    files.sort((a, b) => a.name.localeCompare(b.name));
    update({ power: readPower(files, ac, (n) => BATTERY_NAMES[n] ?? n.toLowerCase()) });
  }

  async function readCpu() {
    if (thermal === null) {
      thermal = '';
      for (const zone of await tools.list(THERMAL)) {
        if (!zone.startsWith('thermal_zone')) continue;
        const type = (await tools.read(`${THERMAL}/${zone}/type`))?.trim();
        if (type === 'x86_pkg_temp' || !thermal) thermal = `${THERMAL}/${zone}/temp`;
        if (type === 'x86_pkg_temp') break;
      }
    }
    const [stat, temp] = await Promise.all([
      tools.read('/proc/stat'),
      thermal ? tools.read(thermal) : Promise.resolve(null),
    ]);
    const next = parseCpuTicks(stat ?? '');
    if (!next) return;
    const load = ticks ? cpuLoad(ticks, next) : 0;
    ticks = next;
    const temperature = temp ? Math.round(Number(temp) / 1000) : state.cpu.temperature;
    update({ cpu: { load, temperature, history: [...state.cpu.history, load].slice(-12) } });
  }

  async function readTime() {
    const out = await run('timedatectl', 'show');
    if (out.code !== 0) return;
    const values = parseKeyValues(out.stdout);
    const zone = values.get('Timezone');
    update({
      ...(zone && { timeZone: zone }),
      settings: { ...state.settings, autoTime: values.get('NTP') === 'yes' },
    });
  }

  async function readBluetooth() {
    const show = await run('bluetoothctl', 'show');
    if (show.code !== 0) return;
    const [paired, connected] = await Promise.all([
      run('bluetoothctl', 'devices', 'Paired'),
      run('bluetoothctl', 'devices', 'Connected'),
    ]);
    const connectedIds = new Set(
      parseBluetoothDevices(connected.stdout, new Set()).map((d) => d.id),
    );
    update({
      bluetooth: {
        enabled: bluetoothPowered(show.stdout),
        devices: parseBluetoothDevices(paired.stdout, connectedIds),
      },
    });
  }

  async function readPrinters() {
    const [all, chosen] = await Promise.all([run('lpstat', '-e'), run('lpstat', '-d')]);
    if (all.code !== 0) return;
    const fallback = parseDefaultPrinter(chosen.stdout);
    const names = parsePrinterNames(all.stdout);
    update({
      printers: names.map((name, i) => ({
        name,
        isDefault: fallback ? name === fallback : i === 0,
      })),
    });
  }

  async function readUsb(announce = true) {
    const out = await run('lsblk', '-J', '-o', 'NAME,LABEL,MODEL,TRAN,TYPE,FSTYPE,MOUNTPOINT');
    if (out.code !== 0) return;
    const key = parseUsbKey(out.stdout);
    const was = usbKey;
    usbKey = key;
    update({ usb: key ? { name: key.name } : null });
    if (key && announce && was?.partition !== key.partition)
      post(messageAbout(key.name, (n) => `clé « ${n} » branchée · ⊞U copier`));
  }

  /**
   * « Externe seul » (§4.12): a screen plugged in takes the app, the laptop's
   * own goes dark, and comes back when it is unplugged. Only what differs is
   * asked of Sway, so its own events settle.
   */
  async function applyOutputs() {
    const out = await run('swaymsg', '-t', 'get_outputs', '-r');
    if (out.code !== 0) return;
    const outputs = parseOutputList(out.stdout);
    const external = outputs.find((o) => !o.internal);
    const internal = outputs.find((o) => o.internal);
    const scale = state.settings.externalScale / 100;
    if (external) {
      if (!external.active || Math.abs(external.scale - scale) > 0.01)
        await run('swaymsg', 'output', external.name, 'enable', 'scale', String(scale));
      if (internal?.active) await run('swaymsg', 'output', internal.name, 'disable');
    } else if (internal && !internal.active)
      await run('swaymsg', 'output', internal.name, 'enable');
    const was = state.externalScreen;
    update({ externalScreen: external?.label ?? null });
    if (external && was !== external.label)
      post(messageAbout(external.label, (n) => `écran ${n} · externe seul`));
    if (!external && was) post('retour à l’écran du portable');
  }

  /** The keyboard's layout and the touchpad, given to Sway. */
  async function applyInput() {
    const s = state.settings;
    const { layout, variant } = XKB_LAYOUTS[s.keyboardLayout];
    const on = (yes: boolean) => (yes ? 'enabled' : 'disabled');
    const keyboard = ['input', 'type:keyboard'];
    const touchpad = ['input', 'type:touchpad'];
    await run('swaymsg', ...keyboard, 'xkb_layout', layout);
    await run('swaymsg', ...keyboard, 'xkb_variant', variant || '""');
    await run('swaymsg', ...touchpad, 'events', on(s.touchpad));
    // « Couper le pavé pendant la frappe »: Sway's disable-while-typing.
    await run('swaymsg', ...touchpad, 'dwt', on(!s.touchpadWhileTyping));
    await run('swaymsg', ...touchpad, 'tap', on(s.tapToClick));
    await run('swaymsg', ...touchpad, 'natural_scroll', on(s.naturalScrolling));
  }

  /** The warm light (wlsunset): always, or from 21 h to 7 h. */
  function applyNight() {
    stopNight?.();
    stopNight = null;
    const mode = state.night.mode;
    if (mode === 'on') stopNight = tools.daemon('wlsunset', ['-T', '4001', '-t', '4000']);
    if (mode === 'auto')
      stopNight = tools.daemon('wlsunset', ['-S', '07:00', '-s', '21:00', '-t', '4000']);
    updateNight();
  }
  const updateNight = () => {
    const mode = state.night.mode;
    const active = mode === 'on' || (mode === 'auto' && isNight(now()));
    if (active !== state.night.active) update({ night: { mode, active } });
  };

  const quietly = (read: () => Promise<void>) => () => {
    if (!disposed) void read().catch(() => {});
  };

  async function refresh() {
    await Promise.all([
      readDevice(),
      readNetwork(true),
      readBrightness(),
      readVolume(),
      readPowerSupplies(),
      readCpu(),
      readTime(),
      readBluetooth(),
      readUsb(false),
      readPrinters(),
    ]);
    updateNight();
    emit();
  }

  // — The delays of the screen and of sleep (swayidle) —

  function applyIdle() {
    stopIdle?.();
    const { screenOffAfter, sleepAfter } = state.settings;
    const args = ['-w'];
    if (screenOffAfter)
      args.push(
        'timeout',
        String(screenOffAfter * 60),
        'swaymsg "output * power off"',
        'resume',
        'swaymsg "output * power on"',
      );
    if (sleepAfter) args.push('timeout', String(sleepAfter * 60), 'systemctl suspend');
    stopIdle = args.length > 1 ? tools.daemon('swayidle', args) : null;
  }

  // — Acting —

  async function connectWifi(ssid: string, password?: string) {
    const network = state.wifi.networks.find((n) => n.ssid === ssid);
    const isKnown = known.has(ssid);
    networkAction = true;
    try {
      let result;
      if (isKnown) {
        // A known network: its saved password, or the new one given.
        if (password !== undefined)
          await run('nmcli', 'connection', 'modify', 'id', ssid, 'wifi-sec.psk', password);
        result = await run('nmcli', 'connection', 'up', 'id', ssid);
      } else {
        // The password crosses the command line: the device has a single user.
        result = await run(
          'nmcli',
          'device',
          'wifi',
          'connect',
          ssid,
          ...(password !== undefined ? ['password', password] : []),
          'name',
          ssid,
        );
      }
      if (result.code !== 0) {
        // A failed first try leaves no saved network behind.
        if (!isKnown) await run('nmcli', 'connection', 'delete', 'id', ssid);
        await readNetwork();
        return (network?.secure ?? true) && wrongPassword(result.stderr)
          ? ('wrong-password' as const)
          : ('failed' as const);
      }
      await readNetwork();
      const joined = state.wifi.networks.find((n) => n.ssid === ssid);
      post(
        messageAbout(ssid, (n) =>
          joined?.portal ? `${n} · page de connexion demandée` : `connecté à ${n}`,
        ),
      );
      return 'connected' as const;
    } finally {
      networkAction = false;
    }
  }

  const service: LinuxSystem = {
    monitor,
    state: () => state,
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    journal: () => journal,
    post,

    setWifi: async (enabled) => {
      networkAction = true;
      try {
        await run('nmcli', 'radio', 'wifi', enabled ? 'on' : 'off');
        await readNetwork();
      } finally {
        networkAction = false;
      }
      post(enabled ? 'wifi oui' : 'wifi non');
    },
    connectWifi,
    forgetWifi: async (ssid) => {
      networkAction = true;
      try {
        await run('nmcli', 'connection', 'delete', 'id', ssid);
        await readNetwork();
      } finally {
        networkAction = false;
      }
      post(messageAbout(ssid, (n) => `${n} oublié`));
    },
    setBluetooth: async (enabled) => {
      await run('bluetoothctl', 'power', enabled ? 'on' : 'off');
      await readBluetooth();
      post(enabled ? 'bluetooth oui' : 'bluetooth non');
    },
    forgetBluetooth: async (id) => {
      await run('bluetoothctl', 'remove', id);
      await readBluetooth();
    },
    setBrightness: async (percent) => {
      const value = Math.max(1, Math.min(100, Math.round(percent)));
      update({ brightness: value });
      await run('brightnessctl', '-q', 'set', `${value}%`);
    },
    setNightMode: async (mode) => {
      update({ night: { mode, active: state.night.active } });
      save();
      applyNight();
    },
    setVolume: async (percent) => {
      const value = Math.max(0, Math.min(100, Math.round(percent)));
      update({ volume: value, muted: false });
      await run('wpctl', 'set-volume', '-l', '1.0', SINK, (value / 100).toFixed(2));
      await run('wpctl', 'set-mute', SINK, '0');
    },
    setMuted: async (muted) => {
      update({ muted });
      await run('wpctl', 'set-mute', SINK, muted ? '1' : '0');
    },
    setSetting: async (key, value) => {
      update({ settings: { ...state.settings, [key]: value } });
      save();
      if (key === 'screenOffAfter' || key === 'sleepAfter') applyIdle();
      if (key === 'showCpu') monitor.setBackground(value === true);
      if (key === 'externalScale') await applyOutputs();
      if (
        key === 'keyboardLayout' ||
        key === 'touchpad' ||
        key === 'touchpadWhileTyping' ||
        key === 'tapToClick' ||
        key === 'naturalScrolling'
      )
        await applyInput();
      if (key === 'autoTime') await run('timedatectl', 'set-ntp', value ? 'true' : 'false');
    },
    // Printing needs the host's PDF (see `printPdf`): the service alone cannot lay out a page.
    print: async () => 'failed',
    printPdf: async (pdf, job) => {
      const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'charpentier-print-'));
      const file = path.join(dir, 'impression.pdf');
      try {
        await fs.promises.writeFile(file, pdf);
        const copies = String(Math.max(1, Math.min(99, Math.round(job.copies))));
        const sent = await run('lp', '-d', job.printer, '-n', copies, '-t', job.title, file);
        if (sent.code !== 0) {
          post(messageAbout(job.printer, (n) => `impression impossible · ${n}`));
          return 'failed';
        }
        post(messageAbout(job.printer, (n) => `impression envoyée · ${n}`));
        return 'printed';
      } finally {
        // CUPS has its own copy once `lp` returns.
        await fs.promises.rm(dir, { recursive: true, force: true });
      }
    },
    scanBluetooth: async () => {
      await run('bluetoothctl', 'power', 'on');
      await run('bluetoothctl', '--timeout', '8', 'scan', 'on');
      const [all, paired] = await Promise.all([
        run('bluetoothctl', 'devices'),
        run('bluetoothctl', 'devices', 'Paired'),
      ]);
      const known = new Set(parseBluetoothDevices(paired.stdout, new Set()).map((d) => d.id));
      await readBluetooth();
      // Unnamed devices show their address as their name: left out.
      return parseBluetoothDevices(all.stdout, new Set()).filter(
        (d) => !known.has(d.id) && d.name.replace(/-/g, ':') !== d.id,
      );
    },
    pairBluetooth: async (id) => {
      const paired = await run('bluetoothctl', '--timeout', '20', 'pair', id);
      if (paired.code !== 0) return 'failed';
      await run('bluetoothctl', 'trust', id);
      await run('bluetoothctl', 'connect', id);
      await readBluetooth();
      const name = state.bluetooth.devices.find((d) => d.id === id)?.name ?? id;
      post(messageAbout(name, (n) => `${n} appairé`));
      return 'paired';
    },
    copyToUsb: async () => {
      const key = usbKey;
      if (!key || !options.exportTexts) return 'failed';
      let mount = key.mountpoint;
      if (!mount) {
        const mounted = await run(
          'udisksctl',
          'mount',
          '-b',
          key.partition,
          '--no-user-interaction',
        );
        mount = mounted.code === 0 ? parseMounted(mounted.stdout) : null;
      }
      if (!mount) {
        post(messageAbout(key.name, (n) => `${n} illisible · rien n’est copié`));
        return 'failed';
      }
      // `Charpentier/<date>/`; a second copy the same day gets the time too.
      const d = now();
      const pad = (n: number) => String(n).padStart(2, '0');
      const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const base = path.join(mount, 'Charpentier');
      const taken = new Set(await tools.list(base));
      const name = taken.has(day) ? `${day} ${pad(d.getHours())}h${pad(d.getMinutes())}` : day;
      try {
        await options.exportTexts(path.join(base, name));
      } catch {
        post(messageAbout(key.name, (n) => `copie sur ${n} impossible`));
        return 'failed';
      }
      post(messageAbout(key.name, (n) => `textes copiés sur ${n}`));
      return 'copied';
    },
    ejectUsb: async () => {
      const key = usbKey;
      if (!key) return;
      await run('udisksctl', 'unmount', '-b', key.partition, '--no-user-interaction');
      await run('udisksctl', 'power-off', '-b', key.disk, '--no-user-interaction');
      usbKey = null;
      update({ usb: null });
      post(messageAbout(key.name, (n) => `clé ${n} éjectée`));
    },
    lock: async () => setLocked(true),
    unlock: async (code) => {
      const result = await keeper.check(code);
      setLocked(result !== 'ok');
      return result;
    },
    setLockCode: async (code, current) => {
      if (keeper.hasCode() && (await keeper.check(current ?? '')) !== 'ok') {
        setLocked(state.lock.locked);
        return 'wrong';
      }
      if (code !== null && !isValidCode(code)) return 'invalid';
      await keeper.setCode(code);
      setLocked(false);
      return 'ok';
    },
    finishFirstStart: async () => {
      update({ firstStart: false });
      save();
    },
    sleeping: () => {
      sleptAt = now().getTime();
      if (state.settings.askCode !== 'never') setLocked(true);
    },
    woke: async () => {
      const slept = sleptAt === null ? Infinity : now().getTime() - sleptAt;
      sleptAt = null;
      // « After 15 min of sleep »: a shorter one opens on the text again.
      if (state.settings.askCode === 'after15' && slept < 15 * 60_000 && state.lock.locked)
        setLocked(false);
      await refresh();
    },
    suspend: async () => {
      await run('systemctl', 'suspend');
    },
    reboot: async () => {
      await run('systemctl', 'reboot');
    },
    powerOff: async () => {
      await run('systemctl', 'poweroff');
    },

    start: async () => {
      await refresh();
      journal = [
        {
          id: `s${++sequence}`,
          text: `démarrage · charpentier ${options.appVersion}`,
          at: state.device.bootedAt,
        },
        ...journal,
      ];
      emit();
      timers.push(
        setInterval(quietly(readCpu), periods.cpu),
        setInterval(
          quietly(() =>
            Promise.all([readPowerSupplies(), readBrightness(), readVolume()]).then(() => {}),
          ),
          periods.power,
        ),
        setInterval(
          quietly(() =>
            Promise.all([readNetwork(true), readTime(), readBluetooth()]).then(() => {}),
          ),
          periods.slow,
        ),
      );
      // NetworkManager tells every change; they come in bursts.
      let pending: ReturnType<typeof setTimeout> | null = null;
      stops.push(
        tools.daemon('nmcli', ['monitor'], () => {
          if (pending) clearTimeout(pending);
          pending = setTimeout(
            quietly(() => readNetwork()),
            500,
          );
        }),
      );
      applyIdle();
      applyNight();
      await Promise.all([applyInput(), applyOutputs()]);
      monitor.setBackground(state.settings.showCpu);
      // A key plugged in or pulled out; a screen plugged in or unplugged.
      let usbPending: ReturnType<typeof setTimeout> | null = null;
      stops.push(
        tools.daemon('udevadm', ['monitor', '--udev', '--subsystem-match=block'], () => {
          if (usbPending) clearTimeout(usbPending);
          usbPending = setTimeout(
            quietly(() => readUsb()),
            800,
          );
        }),
      );
      let outputPending: ReturnType<typeof setTimeout> | null = null;
      stops.push(
        tools.daemon('swaymsg', ['-t', 'subscribe', '-m', '["output"]'], () => {
          if (outputPending) clearTimeout(outputPending);
          outputPending = setTimeout(quietly(applyOutputs), 500);
        }),
      );
    },
    refresh,
    dispose: () => {
      disposed = true;
      for (const timer of timers) clearInterval(timer);
      for (const stop of stops) stop();
      stopIdle?.();
      stopNight?.();
      monitor.dispose();
      listeners.clear();
    },
  };
  return service;
}
