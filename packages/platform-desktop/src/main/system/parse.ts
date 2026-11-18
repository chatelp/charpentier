import type {
  Battery,
  BluetoothDevice,
  SystemUpdate,
  UpdateFailure,
  WifiNetwork,
} from '@charpentier/platform';

/**
 * Readers of what the Linux tools print (docs/PLAN.md phase 5.4). Pure
 * functions, tested on real outputs; the service runs the tools.
 */

/** A line of `nmcli -t`: fields split on `:`, where `\:` and `\\` are literal. */
export function splitTerse(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\' && i + 1 < line.length) field += line[++i];
    else if (c === ':') {
      fields.push(field);
      field = '';
    } else field += c;
  }
  fields.push(field);
  return fields;
}

const lines = (text: string) => text.split('\n').filter((l) => l.trim() !== '');

/** nmcli's signal (0 to 100) as the line's bars (0 to 4). */
export const signalBars = (signal: number): number =>
  signal >= 75 ? 4 : signal >= 50 ? 3 : signal >= 25 ? 2 : signal > 0 ? 1 : 0;

/**
 * `nmcli -t -f IN-USE,SSID,SIGNAL,SECURITY device wifi list`: one network per
 * name (its strongest access point), hidden ones left out, strongest first.
 */
export function parseWifiList(
  text: string,
  known: ReadonlySet<string>,
): { readonly networks: WifiNetwork[]; readonly inUse: string | null } {
  const best = new Map<string, { signal: number; secure: boolean }>();
  let inUse: string | null = null;
  for (const line of lines(text)) {
    const [use = '', ssid = '', signal = '0', security = ''] = splitTerse(line);
    if (!ssid) continue;
    if (use.trim() === '*') inUse = ssid;
    const value = Number(signal) || 0;
    const secure = security.trim() !== '' && security.trim() !== '--';
    const seen = best.get(ssid);
    if (!seen || value > seen.signal) best.set(ssid, { signal: value, secure });
  }
  const networks = [...best]
    .sort((a, b) => b[1].signal - a[1].signal)
    .map(([ssid, { signal, secure }]) => ({
      ssid,
      signal: signalBars(signal),
      secure,
      portal: false,
      known: known.has(ssid),
    }));
  return { networks, inUse };
}

/** `nmcli -t -f NAME,TYPE connection show`: the names of saved Wi-Fi connections. */
export function parseKnownWifi(text: string): Set<string> {
  const names = new Set<string>();
  for (const line of lines(text)) {
    const [name = '', type = ''] = splitTerse(line);
    if (type === '802-11-wireless' && name) names.add(name);
  }
  return names;
}

export interface NetDevice {
  readonly device: string;
  readonly type: string;
  readonly state: string;
  readonly connection: string;
}

/** `nmcli -t -f DEVICE,TYPE,STATE,CONNECTION device`. */
export function parseDevices(text: string): NetDevice[] {
  return lines(text).map((line) => {
    const [device = '', type = '', state = '', connection = ''] = splitTerse(line);
    return { device, type, state, connection };
  });
}

/** `nmcli -g IP4.ADDRESS device show <dev>`: the first address, without its prefix length. */
export function parseAddress(text: string): string | null {
  const first = text.split(/[|\n]/)[0]?.trim() ?? '';
  return first ? (first.split('/')[0] ?? null) : null;
}

/** Why `nmcli … connect` failed: a refused password, or anything else. */
export const wrongPassword = (stderr: string): boolean =>
  /secrets were required|802-1x supplicant|psk|password/i.test(stderr);

/** `wpctl get-volume @DEFAULT_AUDIO_SINK@`: « Volume: 0.40 [MUTED] ». */
export function parseVolume(text: string): { volume: number; muted: boolean } | null {
  const match = /Volume:\s*([\d.]+)/.exec(text);
  if (!match) return null;
  return {
    volume: Math.max(0, Math.min(100, Math.round(Number(match[1]) * 100))),
    muted: /\[MUTED\]/.test(text),
  };
}

/** A `key=value` file (`/etc/os-release`, `timedatectl show`, a power supply's uevent). */
export function parseKeyValues(text: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of lines(text)) {
    const at = line.indexOf('=');
    if (at > 0)
      values.set(
        line.slice(0, at).trim(),
        line
          .slice(at + 1)
          .trim()
          .replace(/^"|"$/g, ''),
      );
  }
  return values;
}

/** One power supply of `/sys/class/power_supply/BATn`, as its files say. */
export interface BatteryFiles {
  readonly name: string;
  readonly capacity: string | null;
  readonly status: string | null;
  readonly energyNow: string | null;
  readonly energyFull: string | null;
  readonly energyFullDesign: string | null;
  readonly powerNow: string | null;
}

const num = (text: string | null): number | null => {
  const n = text === null ? NaN : Number(text.trim());
  return Number.isFinite(n) ? n : null;
};

/**
 * The batteries, the power and the time left, from the power supplies' files
 * (µWh and µW). The X250's BAT0 is the internal one, BAT1 the removable one.
 */
export function readPower(
  files: readonly BatteryFiles[],
  acOnline: boolean,
  names: (sysName: string) => string,
): {
  readonly batteries: Battery[];
  readonly charging: boolean;
  readonly watts: number;
  readonly remaining: number | null;
} {
  let energy = 0;
  let power = 0;
  let charging = acOnline;
  const batteries: Battery[] = [];
  for (const f of files) {
    const now = num(f.energyNow) ?? 0;
    const full = num(f.energyFull);
    const design = num(f.energyFullDesign);
    const level = num(f.capacity) ?? (full ? Math.round((now / full) * 100) : 0);
    const health = full && design ? Math.min(100, Math.round((full / design) * 100)) : 100;
    if (f.status?.trim() === 'Charging') charging = true;
    energy += now;
    power += num(f.powerNow) ?? 0;
    batteries.push({ name: names(f.name), level: Math.max(0, Math.min(100, level)), health });
  }
  const watts = Math.round(power / 100_000) / 10;
  const remaining = !charging && power > 0 ? Math.round((energy / power) * 60) : null;
  return { batteries, charging, watts, remaining };
}

/** The first line of `/proc/stat`: busy and total ticks of every processor. */
export function parseCpuTicks(text: string): { busy: number; total: number } | null {
  const line = text.split('\n').find((l) => l.startsWith('cpu '));
  if (!line) return null;
  const ticks = line.trim().split(/\s+/).slice(1).map(Number);
  const total = ticks.slice(0, 8).reduce((a, b) => a + (b || 0), 0);
  const idle = (ticks[3] ?? 0) + (ticks[4] ?? 0);
  return { busy: total - idle, total };
}

/** The load between two readings of `/proc/stat`, in %. */
export const cpuLoad = (
  before: { busy: number; total: number },
  after: { busy: number; total: number },
): number => {
  const total = after.total - before.total;
  return total > 0
    ? Math.max(0, Math.min(100, Math.round(((after.busy - before.busy) / total) * 100)))
    : 0;
};

/** « ThinkPad X250 · i5-5300U · 8 Go », from the firmware, `/proc/cpuinfo` and `/proc/meminfo`. */
export function deviceModel(
  product: string | null,
  cpuinfo: string | null,
  meminfo: string | null,
): string {
  const cpuName = /model name\s*:\s*(.*)/.exec(cpuinfo ?? '')?.[1] ?? '';
  const cpu = /\b(i[3579]-\w+|Ryzen \d \w+)/.exec(cpuName)?.[1] ?? '';
  const kb = Number(/MemTotal:\s*(\d+)/.exec(meminfo ?? '')?.[1] ?? 0);
  const memory = kb ? `${Math.round(kb / 1024 / 1024)} Go` : '';
  return [product?.trim(), cpu, memory].filter(Boolean).join(' · ');
}

/** `/etc/os-release`: « nixos 26.11 ». */
export function osVersion(osRelease: string | null): string {
  const values = parseKeyValues(osRelease ?? '');
  return [values.get('ID') ?? 'linux', values.get('VERSION_ID')].filter(Boolean).join(' ');
}

/** `/nix/var/nix/profiles/system` → `system-12-link`: the generation, 12. */
export const generationOf = (link: string | null): number =>
  Number(/system-(\d+)-link/.exec(link ?? '')?.[1] ?? 0);

/** `bluetoothctl show`: is the radio on. */
export const bluetoothPowered = (text: string): boolean => /^\s*Powered:\s*yes/m.test(text);

/** `bluetoothctl devices Paired`: « Device AA:BB:… Casque Sennheiser ». */
export function parseBluetoothDevices(
  text: string,
  connected: ReadonlySet<string>,
): BluetoothDevice[] {
  const devices: BluetoothDevice[] = [];
  for (const line of lines(text)) {
    const match = /^Device\s+([0-9A-F:]{17})\s+(.*)$/i.exec(line.trim());
    if (match?.[1])
      devices.push({
        id: match[1],
        name: match[2] ?? match[1],
        connected: connected.has(match[1]),
      });
  }
  return devices;
}

/** `/sys/block/dm-*\/dm/uuid`: a LUKS volume is there. */
export const isLuks = (uuid: string | null): boolean => (uuid ?? '').startsWith('CRYPT-LUKS');

// — The monitor (phase 5.5) —

export interface Ticks {
  readonly busy: number;
  readonly total: number;
}

/** Every line of `/proc/stat` about the processor: the whole, then each thread. */
export function parseCpuLines(text: string): { total: Ticks; threads: Ticks[] } | null {
  const total = parseCpuTicks(text);
  if (!total) return null;
  const threads = text
    .split('\n')
    .filter((l) => /^cpu\d+ /.test(l))
    .map((l) => parseCpuTicks(l.replace(/^cpu\d+/, 'cpu ')) ?? { busy: 0, total: 0 });
  return { total, threads };
}

/** `/proc/loadavg`: the averages at 1, 5 and 15 min. */
export function parseLoadAverage(text: string | null): [number, number, number] {
  const [a = 0, b = 0, c = 0] = (text ?? '').split(/\s+/).slice(0, 3).map(Number);
  return [a, b, c];
}

/** `/proc/meminfo`, in bytes: total, used (what is not available), cache, swap used. */
export function parseMemory(text: string | null): {
  total: number;
  used: number;
  cache: number;
  swap: number;
} {
  const kb = (key: string) =>
    Number(new RegExp(`^${key}:\\s*(\\d+)`, 'm').exec(text ?? '')?.[1] ?? 0) * 1024;
  const total = kb('MemTotal');
  return {
    total,
    used: total - kb('MemAvailable'),
    cache: kb('Cached') + kb('Buffers'),
    swap: kb('SwapTotal') - kb('SwapFree'),
  };
}

/** `/proc/net/dev`: bytes received and sent by every interface but the loopback. */
export function parseNetDev(text: string | null): { received: number; sent: number } {
  let received = 0;
  let sent = 0;
  for (const line of (text ?? '').split('\n')) {
    const match = /^\s*([^:\s]+):\s*(.*)$/.exec(line);
    if (!match || match[1] === 'lo') continue;
    const fields = (match[2] ?? '').trim().split(/\s+/).map(Number);
    received += fields[0] ?? 0;
    sent += fields[8] ?? 0;
  }
  return { received, sent };
}

/** `/proc/diskstats`: bytes read and written by the whole disks (not their partitions). */
export function parseDiskstats(text: string | null): { read: number; written: number } {
  let read = 0;
  let written = 0;
  for (const line of (text ?? '').split('\n')) {
    const f = line.trim().split(/\s+/);
    if (!/^(sd[a-z]+|nvme\d+n\d+|mmcblk\d+|vd[a-z]+)$/.test(f[2] ?? '')) continue;
    read += Number(f[5] ?? 0) * 512;
    written += Number(f[9] ?? 0) * 512;
  }
  return { read, written };
}

/** `lspci`: « VGA compatible controller: Intel Corporation HD Graphics 5500 (rev 09) » → « HD 5500 ». */
export function parseGpu(text: string): string | null {
  const line = text.split('\n').find((l) => /VGA compatible controller|3D controller/.test(l));
  const name = line
    ?.split(/: /)
    .slice(1)
    .join(': ')
    .replace(/\s*\(rev [^)]*\)/, '')
    .replace(/^(Intel Corporation|Advanced Micro Devices, Inc\.|NVIDIA Corporation)\s*/, '')
    .replace(/\bGraphics\s+/, '')
    .trim();
  return name || null;
}

/** `swaymsg -t get_outputs -r`: the active screen, « 1920 × 1080 · 125 % ». */
export function parseOutputs(text: string): string | null {
  try {
    const outputs = JSON.parse(text) as {
      active?: boolean;
      scale?: number;
      current_mode?: { width?: number; height?: number };
    }[];
    const o = outputs.find((x) => x.active) ?? outputs[0];
    if (!o?.current_mode?.width) return null;
    return `${o.current_mode.width} × ${o.current_mode.height} · ${Math.round((o.scale ?? 1) * 100)} %`;
  } catch {
    return null;
  }
}

/** `nmcli -t -f IN-USE,RATE device wifi`: the rate of the network in use. */
export function parseWifiRate(text: string): string | null {
  const line = text.split('\n').find((l) => l.startsWith('*'));
  return line ? (splitTerse(line)[1]?.trim() ?? null) || null : null;
}

// — Peripherals (phase 5.7) —

interface LsblkDevice {
  readonly name?: string;
  readonly label?: string | null;
  readonly model?: string | null;
  readonly tran?: string | null;
  readonly type?: string;
  readonly fstype?: string | null;
  readonly mountpoint?: string | null;
  readonly mountpoints?: readonly (string | null)[];
  readonly children?: readonly LsblkDevice[];
}

export interface UsbKey {
  /** The partition to mount, `/dev/sdb1`. */
  readonly partition: string;
  /** Its disk, to power off, `/dev/sdb`. */
  readonly disk: string;
  /** What the author calls it: its label, else its model. */
  readonly name: string;
  readonly mountpoint: string | null;
}

/**
 * `lsblk -J -o NAME,LABEL,MODEL,TRAN,TYPE,FSTYPE,MOUNTPOINT`: the first USB
 * disk with a file system (on a partition, or the whole disk).
 */
export function parseUsbKey(json: string): UsbKey | null {
  let devices: readonly LsblkDevice[];
  try {
    devices = (JSON.parse(json) as { blockdevices?: LsblkDevice[] }).blockdevices ?? [];
  } catch {
    return null;
  }
  for (const disk of devices) {
    if (disk.tran !== 'usb' || disk.type !== 'disk' || !disk.name) continue;
    const volume = [...(disk.children ?? []), disk].find((d) => d.fstype && d.name);
    if (!volume?.name) continue;
    const mount = volume.mountpoint ?? volume.mountpoints?.find((m) => m) ?? null;
    return {
      partition: `/dev/${volume.name}`,
      disk: `/dev/${disk.name}`,
      name: (volume.label ?? disk.model ?? volume.name).trim(),
      mountpoint: mount,
    };
  }
  return null;
}

/** `udisksctl mount`: « Mounted /dev/sdb1 at /run/media/auteur/KINGSTON ». */
export const parseMounted = (text: string): string | null =>
  /Mounted \S+ at (.+?)\.?\s*$/m.exec(text)?.[1] ?? null;

export interface Output {
  readonly name: string;
  readonly active: boolean;
  /** The laptop's own panel. */
  readonly internal: boolean;
  /** « Dell U2419H », or the connector's name. */
  readonly label: string;
  readonly scale: number;
}

/** `swaymsg -t get_outputs -r`: every screen, the laptop's own (eDP, LVDS) told apart. */
export function parseOutputList(text: string): Output[] {
  try {
    return (
      JSON.parse(text) as {
        name?: string;
        active?: boolean;
        make?: string;
        model?: string;
        scale?: number;
      }[]
    ).map((o) => {
      const name = o.name ?? '';
      const label = [o.make, o.model]
        .filter((p) => p && p !== 'Unknown')
        .join(' ')
        .trim();
      return {
        name,
        active: o.active ?? false,
        internal: /^(eDP|LVDS|DSI)/.test(name),
        label: label || name,
        scale: o.scale ?? 1,
      };
    });
  } catch {
    return [];
  }
}

/** The keyboard layouts of the settings, as xkb knows them. */
export const XKB_LAYOUTS = {
  azerty: { layout: 'fr', variant: '' },
  qwerty: { layout: 'us', variant: '' },
} as const;

/** Night mode « auto »: from 21 h to 7 h (docs/DESIGN.md §4.12). */
export const isNight = (date: Date): boolean => date.getHours() >= 21 || date.getHours() < 7;

/** `lpstat -e`: the printers CUPS knows (driverless ones of the network included). */
export const parsePrinterNames = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

/** `lpstat -d`: « system default destination: Brother_HL_L2350 ». */
export const parseDefaultPrinter = (text: string): string | null =>
  /destination:\s*(\S+)/.exec(text)?.[1] ?? null;

/** The update file's contract (docs/x250-update-contract.md). */
export const UPDATE_FILE = '/run/charpentier/update.json';
const UPDATE_CONTRACT = 1;
const FAILURES = new Set<UpdateFailure>(['signature', 'unreadable', 'disk-full', 'interrupted']);

/** A generation one can boot on: its version, and its number for the boot service. */
export interface UpdateTarget {
  readonly version: string;
  readonly generation: number;
}

/**
 * Reads `/run/charpentier/update.json`, written by the update service of
 * `charpentier-os`. Null when it is missing, of another contract, or not what
 * the contract says: nothing is shown then. A development system updates too,
 * from its own channel (D-42), and shows it the same way.
 */
export function parseUpdate(
  text: string | null,
): { readonly update: SystemUpdate; readonly targets: readonly UpdateTarget[] } | null {
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const o = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : null);
  const notes = (v: unknown) =>
    Array.isArray(v) ? v.filter((n): n is string => typeof n === 'string') : [];
  const root = o(raw);
  if (!root || root['contract'] !== UPDATE_CONTRACT) return null;
  const installed = o(root['installed']);
  const version = str(installed?.['version']);
  if (!installed || !version) return null;
  const format = int(installed['dataFormat']) ?? 1;
  const targets: UpdateTarget[] = [];
  const other = (v: unknown) => {
    const g = o(v);
    const otherVersion = str(g?.['version']);
    const generation = int(g?.['generation']);
    if (!g || !otherVersion || generation === null) return null;
    targets.push({ version: otherVersion, generation });
    return { version: otherVersion, readable: (int(g['dataFormat']) ?? 1) >= format };
  };
  const ready = o(root['ready']);
  const readyVersion = str(ready?.['version']);
  const failure = o(root['failure']);
  const reason = failure?.['reason'];
  const failed = str(failure?.['version']);
  return {
    targets,
    update: {
      installed: {
        version,
        installedAt: str(installed['installedAt']) ?? new Date(0).toISOString(),
        notes: notes(installed['notes']),
      },
      ready:
        ready && readyVersion
          ? {
              version: readyVersion,
              publishedAt: str(ready['publishedAt']) ?? str(ready['receivedAt']) ?? '',
              notes: notes(ready['notes']),
            }
          : null,
      previous: other(root['previous']),
      setAside: other(root['setAside']),
      lastCheck: str(root['lastCheck']),
      checking: root['checking'] === true,
      failure:
        failure && failed && FAILURES.has(reason as UpdateFailure)
          ? {
              version: failed,
              at: str(failure['at']) ?? '',
              reason: reason as UpdateFailure,
            }
          : null,
    },
  };
}
