import {
  MONITOR_HISTORY,
  type MonitorInfo,
  type MonitorSample,
  type SystemMonitor,
} from '@charpentier/platform';
import {
  cpuLoad,
  parseCpuLines,
  parseDiskstats,
  parseGpu,
  parseLoadAverage,
  parseMemory,
  parseNetDev,
  parseOutputs,
  parseWifiRate,
  type Ticks,
} from './parse';
import type { SystemTools } from './tools';

/**
 * The X250's monitor (docs/PLAN.md phase 5.5): a sample a second from
 * `/proc` and `/sys`, an hour kept here, in the main process. It samples while
 * the screen is open, or in the background while the `cpu` segment is shown
 * (so the screen opens on an hour of curves); otherwise it rests.
 */
export interface LinuxMonitor extends SystemMonitor {
  /** Keep sampling with no screen open (the `cpu` segment is shown). */
  setBackground(on: boolean): void;
  /** One sample now (the tests; the timer otherwise). */
  sample(): Promise<MonitorSample | null>;
  dispose(): void;
}

export interface LinuxMonitorOptions {
  readonly tools: SystemTools;
  /** The app's processes and its open documents (Electron knows them). */
  readonly app: () => MonitorSample['app'];
  readonly now?: () => number;
  readonly period?: number;
}

const HWMON = '/sys/class/hwmon';
const THERMAL = '/sys/class/thermal';
const POWER = '/sys/class/power_supply';

export function createLinuxMonitor(options: LinuxMonitorOptions): LinuxMonitor {
  const { tools } = options;
  const now = options.now ?? (() => Date.now());
  const period = options.period ?? 1000;
  const history: MonitorSample[] = [];
  const listeners = new Set<(sample: MonitorSample) => void>();
  let background = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let previous: {
    at: number;
    total: Ticks;
    threads: Ticks[];
    net: { received: number; sent: number };
    disk: { read: number; written: number };
  } | null = null;
  let sensors: {
    cpu: string | null;
    board: string | null;
    fan: string | null;
    gpu: string | null;
    batteries: string[];
    ac: string | null;
    threads: number;
  } | null = null;
  let space: { used: number; total: number; at: number } | null = null;

  async function findSensors() {
    let cpu: string | null = null;
    let board: string | null = null;
    let fan: string | null = null;
    for (const zone of await tools.list(THERMAL)) {
      if (!zone.startsWith('thermal_zone')) continue;
      const type = (await tools.read(`${THERMAL}/${zone}/type`))?.trim();
      if (type === 'x86_pkg_temp') cpu = `${THERMAL}/${zone}/temp`;
      else if (type === 'acpitz' && !board) board = `${THERMAL}/${zone}/temp`;
    }
    // The ThinkPad's own sensors: the board's temperature and the fan.
    for (const mon of await tools.list(HWMON)) {
      const name = (await tools.read(`${HWMON}/${mon}/name`))?.trim();
      if (name === 'thinkpad') {
        fan = `${HWMON}/${mon}/fan1_input`;
        board = `${HWMON}/${mon}/temp1_input`;
      } else if (name === 'coretemp' && !cpu) cpu = `${HWMON}/${mon}/temp1_input`;
    }
    let gpu: string | null = null;
    for (const card of ['card0', 'card1'])
      if ((await tools.read(`/sys/class/drm/${card}/gt_cur_freq_mhz`)) !== null) {
        gpu = `/sys/class/drm/${card}/gt_cur_freq_mhz`;
        break;
      }
    const supplies = await tools.list(POWER);
    const batteries: string[] = [];
    let ac: string | null = null;
    for (const s of supplies) {
      const type = (await tools.read(`${POWER}/${s}/type`))?.trim();
      if (type === 'Battery') batteries.push(`${POWER}/${s}/power_now`);
      if (type === 'Mains') ac = `${POWER}/${s}/online`;
    }
    const stat = parseCpuLines((await tools.read('/proc/stat')) ?? '');
    return { cpu, board, fan, gpu, batteries, ac, threads: stat?.threads.length ?? 0 };
  }

  const number = async (file: string | null, scale = 1): Promise<number | null> => {
    if (!file) return null;
    const value = Number((await tools.read(file))?.trim());
    return Number.isFinite(value) ? value / scale : null;
  };

  async function sample(): Promise<MonitorSample | null> {
    sensors ??= await findSensors();
    const s = sensors;
    const at = now();
    const [stat, loadavg, meminfo, netdev, diskstats] = await Promise.all(
      ['/proc/stat', '/proc/loadavg', '/proc/meminfo', '/proc/net/dev', '/proc/diskstats'].map(
        (f) => tools.read(f),
      ),
    );
    const cpu = parseCpuLines(stat ?? '');
    if (!cpu) return null;
    const freqs = await Promise.all(
      cpu.threads.map((_, i) =>
        number(`/sys/devices/system/cpu/cpu${i}/cpufreq/scaling_cur_freq`, 1000),
      ),
    );
    const [cpuTemp, board, fan, gpuFrequency, onMains, ...powers] = await Promise.all([
      number(s.cpu, 1000),
      number(s.board, 1000),
      number(s.fan),
      number(s.gpu),
      number(s.ac),
      ...s.batteries.map((b) => number(b, 1e6)),
    ]);
    if (!space || at - space.at > 60_000) {
      const disk = await tools.disk('/');
      if (disk) space = { ...disk, at };
    }
    const net = parseNetDev(netdev ?? null);
    const disk = parseDiskstats(diskstats ?? null);
    const memory = parseMemory(meminfo ?? null);
    const seconds = previous ? Math.max(0.001, (at - previous.at) / 1000) : 1;
    const rate = (after: number, before: number | undefined) =>
      before === undefined ? 0 : Math.max(0, Math.round((after - before) / seconds));
    const known = freqs.filter((f): f is number => f !== null);
    const next: MonitorSample = {
      at,
      cpu: {
        load: previous ? cpuLoad(previous.total, cpu.total) : 0,
        threads: cpu.threads.map((t, i) => {
          const before = previous?.threads[i];
          return before ? cpuLoad(before, t) : 0;
        }),
        frequency: known.length ? Math.round(known.reduce((a, b) => a + b, 0) / known.length) : 0,
        average: parseLoadAverage(loadavg ?? null),
      },
      temperature: {
        cpu: cpuTemp === null ? null : Math.round(cpuTemp),
        board: board === null ? null : Math.round(board),
        fan,
      },
      memory: { used: memory.used, cache: memory.cache, swap: memory.swap },
      network: {
        down: rate(net.received, previous?.net.received),
        up: rate(net.sent, previous?.net.sent),
        received: net.received,
        sent: net.sent,
      },
      power:
        onMains === 1 ? 0 : Math.round(powers.reduce<number>((a, b) => a + (b ?? 0), 0) * 10) / 10,
      disk: {
        read: rate(disk.read, previous?.disk.read),
        write: rate(disk.written, previous?.disk.written),
        used: space?.used ?? 0,
        total: space?.total ?? 0,
      },
      app: options.app(),
      gpuFrequency,
    };
    previous = { at, total: cpu.total, threads: cpu.threads, net, disk };
    history.push(next);
    if (history.length > MONITOR_HISTORY) history.splice(0, history.length - MONITOR_HISTORY);
    for (const listener of listeners) listener(next);
    return next;
  }

  const run = () => {
    const wanted = background || listeners.size > 0;
    if (wanted && !timer) timer = setInterval(() => void sample().catch(() => {}), period);
    if (!wanted && timer) {
      clearInterval(timer);
      timer = null;
      // A gap in the curves: the next rate starts over.
      previous = null;
    }
  };

  async function info(): Promise<MonitorInfo> {
    const [lspci, outputs, wifi, meminfo] = await Promise.all([
      tools.run('lspci', []),
      tools.run('swaymsg', ['-t', 'get_outputs', '-r']),
      tools.run('nmcli', ['-t', '-f', 'IN-USE,RATE', 'device', 'wifi', 'list', '--rescan', 'no']),
      tools.read('/proc/meminfo'),
    ]);
    return {
      gpu: lspci.code === 0 ? parseGpu(lspci.stdout) : null,
      screen: outputs.code === 0 ? parseOutputs(outputs.stdout) : null,
      link: wifi.code === 0 ? parseWifiRate(wifi.stdout) : null,
      memoryTotal: parseMemory(meminfo).total,
    };
  }

  return {
    open: async (onSample) => {
      listeners.add(onSample);
      run();
      return {
        info: await info(),
        history: [...history],
        close: () => {
          listeners.delete(onSample);
          run();
        },
      };
    },
    setBackground: (on) => {
      background = on;
      run();
    },
    sample,
    dispose: () => {
      listeners.clear();
      background = false;
      run();
    },
  };
}
