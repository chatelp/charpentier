import { describe, expect, it } from 'vitest';
import { createLinuxMonitor } from './linux-monitor';
import type { SystemTools } from './tools';

/** The files the monitor reads on an X250, changed between two seconds. */
function machine() {
  const files = new Map<string, string>(
    Object.entries({
      '/proc/stat':
        'cpu  100 0 100 700 100 0 0 0\ncpu0 50 0 50 350 50 0 0 0\ncpu1 50 0 50 350 50 0 0 0\n',
      '/proc/loadavg': '0.42 0.38 0.31 1/234 5678\n',
      '/proc/meminfo': 'MemTotal: 8000000 kB\nMemAvailable: 5000000 kB\nCached: 1800000 kB\n',
      '/proc/net/dev': 'wlp3s0: 1000 0 0 0 0 0 0 0 500 0 0 0 0 0 0 0\n',
      '/proc/diskstats': '8 0 sda 0 0 0 0 0 0 100 0 0 0 0\n',
      '/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq': '1400000\n',
      '/sys/devices/system/cpu/cpu1/cpufreq/scaling_cur_freq': '1200000\n',
      '/sys/class/thermal/thermal_zone1/type': 'x86_pkg_temp\n',
      '/sys/class/thermal/thermal_zone1/temp': '48000\n',
      '/sys/class/hwmon/hwmon2/name': 'thinkpad\n',
      '/sys/class/hwmon/hwmon2/temp1_input': '39000\n',
      '/sys/class/hwmon/hwmon2/fan1_input': '0\n',
      '/sys/class/drm/card0/gt_cur_freq_mhz': '300\n',
      '/sys/class/power_supply/AC/type': 'Mains\n',
      '/sys/class/power_supply/AC/online': '0\n',
      '/sys/class/power_supply/BAT0/type': 'Battery\n',
      '/sys/class/power_supply/BAT0/power_now': '4000000\n',
      '/sys/class/power_supply/BAT1/type': 'Battery\n',
      '/sys/class/power_supply/BAT1/power_now': '3400000\n',
    }),
  );
  const dirs: Record<string, string[]> = {
    '/sys/class/thermal': ['thermal_zone1'],
    '/sys/class/hwmon': ['hwmon2'],
    '/sys/class/power_supply': ['AC', 'BAT0', 'BAT1'],
  };
  const tools: SystemTools = {
    run: async (command) => {
      if (command === 'lspci')
        return {
          code: 0,
          stdout:
            '00:02.0 VGA compatible controller: Intel Corporation HD Graphics 5500 (rev 09)\n',
          stderr: '',
        };
      return { code: -1, stdout: '', stderr: '' };
    },
    read: async (f) => files.get(f) ?? null,
    list: async (d) => dirs[d] ?? [],
    readlink: async () => null,
    modified: async () => null,
    disk: async () => ({ used: 41e9, total: 232e9 }),
    daemon: () => () => {},
  };
  return { tools, files };
}

describe('the monitor of the X250 (phase 5.5)', () => {
  it('measures a second of the machine from /proc and /sys', async () => {
    const { tools, files } = machine();
    let at = 1_000_000;
    const monitor = createLinuxMonitor({
      tools,
      now: () => at,
      app: () => ({ processes: [{ kind: 'main', cpu: 1, memory: 142e6 }], documents: 3 }),
    });
    await monitor.sample();
    files.set(
      '/proc/stat',
      'cpu  130 0 120 840 110 0 0 0\ncpu0 80 0 50 360 50 0 0 0\ncpu1 50 0 70 380 60 0 0 0\n',
    );
    files.set('/proc/net/dev', 'wlp3s0: 3000 0 0 0 0 0 0 0 1500 0 0 0 0 0 0 0\n');
    files.set('/proc/diskstats', '8 0 sda 0 0 0 0 0 0 124 0 0 0 0\n');
    at += 2000;
    const s = await monitor.sample();
    expect(s?.cpu).toEqual({
      load: 25,
      threads: [75, 33],
      frequency: 1300,
      average: [0.42, 0.38, 0.31],
    });
    expect(s?.temperature).toEqual({ cpu: 48, board: 39, fan: 0 });
    expect(s?.memory).toEqual({ used: 3_072_000_000, cache: 1_843_200_000, swap: 0 });
    // Per second, over the two seconds between the readings.
    expect(s?.network).toEqual({ down: 1000, up: 500, received: 3000, sent: 1500 });
    expect(s?.disk).toEqual({ read: 0, write: 6144, used: 41e9, total: 232e9 });
    expect(s?.power).toBe(7.4);
    expect(s?.gpuFrequency).toBe(300);
    expect(s?.app.documents).toBe(3);
  });

  it('keeps an hour, opens on it, and samples only while watched', async () => {
    const { tools } = machine();
    let at = 0;
    const monitor = createLinuxMonitor({
      tools,
      now: () => (at += 1000),
      app: () => ({ processes: [], documents: 0 }),
      period: 5,
    });
    for (let i = 0; i < 3605; i++) await monitor.sample();
    const seen: number[] = [];
    const session = await monitor.open((sample) => seen.push(sample.at));
    expect(session.history).toHaveLength(3600);
    expect(session.info.gpu).toBe('HD 5500');
    expect(session.info.memoryTotal).toBe(8_192_000_000);
    await new Promise((r) => setTimeout(r, 40));
    expect(seen.length).toBeGreaterThan(0);
    session.close();
    const count = seen.length;
    await new Promise((r) => setTimeout(r, 40));
    expect(seen.length).toBe(count);

    // In the background (the cpu segment shown) it keeps the hour going.
    const before = (await monitor.open(() => {})).history.at(-1)?.at ?? 0;
    monitor.setBackground(true);
    await new Promise((r) => setTimeout(r, 40));
    monitor.dispose();
    const after = (await monitor.open(() => {})).history.at(-1)?.at ?? 0;
    expect(after).toBeGreaterThan(before);
    monitor.dispose();
  });
});
