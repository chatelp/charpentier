import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLinuxSystem, type LinuxSystem } from './linux-system';
import type { RunResult, SystemTools } from './tools';

/**
 * A fake X250: the files of /sys and /proc, and NetworkManager, PipeWire,
 * logind as the programs answer them. Every program run is recorded.
 */
function fakeX250() {
  const files = new Map<string, string>(
    Object.entries({
      '/sys/class/dmi/id/product_version': 'ThinkPad X250\n',
      '/proc/cpuinfo': 'model name\t: Intel(R) Core(TM) i5-5300U CPU @ 2.30GHz\n',
      '/proc/meminfo': 'MemTotal:        8059972 kB\n',
      '/etc/os-release': 'ID=nixos\nVERSION_ID="26.11"\n',
      '/proc/uptime': '11520.5 40000.1\n',
      '/proc/stat': 'cpu  100 0 100 700 100 0 0 0 0 0\n',
      '/sys/block/dm-0/dm/uuid': 'CRYPT-LUKS2-0123-root\n',
      '/sys/class/backlight/intel_backlight/brightness': '600\n',
      '/sys/class/backlight/intel_backlight/max_brightness': '1000\n',
      '/sys/class/thermal/thermal_zone0/type': 'acpitz\n',
      '/sys/class/thermal/thermal_zone0/temp': '40000\n',
      '/sys/class/thermal/thermal_zone1/type': 'x86_pkg_temp\n',
      '/sys/class/thermal/thermal_zone1/temp': '48000\n',
      '/sys/class/power_supply/AC/type': 'Mains\n',
      '/sys/class/power_supply/AC/online': '0\n',
      '/sys/class/power_supply/BAT0/type': 'Battery\n',
      '/sys/class/power_supply/BAT0/capacity': '82\n',
      '/sys/class/power_supply/BAT0/status': 'Discharging\n',
      '/sys/class/power_supply/BAT0/energy_now': '19000000\n',
      '/sys/class/power_supply/BAT0/energy_full': '21000000\n',
      '/sys/class/power_supply/BAT0/energy_full_design': '23200000\n',
      '/sys/class/power_supply/BAT0/power_now': '6800000\n',
      '/sys/class/power_supply/BAT1/type': 'Battery\n',
      '/sys/class/power_supply/BAT1/capacity': '82\n',
      '/sys/class/power_supply/BAT1/status': 'Unknown\n',
      '/sys/class/power_supply/BAT1/energy_now': '20000000\n',
      '/sys/class/power_supply/BAT1/energy_full': '17600000\n',
      '/sys/class/power_supply/BAT1/energy_full_design': '23200000\n',
      '/sys/class/power_supply/BAT1/power_now': '0\n',
    }),
  );
  const dirs: Record<string, string[]> = {
    '/sys/block': ['sda', 'dm-0'],
    '/sys/class/backlight': ['intel_backlight'],
    '/sys/class/thermal': ['cooling_device0', 'thermal_zone0', 'thermal_zone1'],
    '/sys/class/power_supply': ['AC', 'BAT0', 'BAT1'],
  };
  const net = {
    radio: true,
    connected: 'Maison-5G' as string | null,
    known: new Set(['Maison-5G']),
    passwords: new Map([['Livebox-4A2C', 'bonjour']]),
    portal: false,
  };
  const sound = { volume: 0.4, muted: false };
  const runs: string[][] = [];
  const daemons: {
    command: string;
    args: readonly string[];
    stopped: boolean;
    onLine?: (l: string) => void;
  }[] = [];

  const ok = (stdout = ''): RunResult => ({ code: 0, stdout, stderr: '' });
  const fail = (stderr: string, code = 4): RunResult => ({ code, stdout: '', stderr });

  function nmcli(args: readonly string[]): RunResult {
    const a = args.join(' ');
    if (a === '-t -f WIFI radio') return ok(net.radio ? 'enabled\n' : 'disabled\n');
    if (a.startsWith('radio wifi')) {
      net.radio = args[2] === 'on';
      if (!net.radio) net.connected = null;
      return ok();
    }
    if (a === '-t -f DEVICE,TYPE,STATE,CONNECTION device')
      return ok(
        `wlp3s0:wifi:${net.connected ? 'connected' : 'disconnected'}:${net.connected ?? ''}\nenp0s25:ethernet:unavailable:\nlo:loopback:connected (externally):lo\n`,
      );
    if (a.startsWith('-t -f IN-USE,SSID,SIGNAL,SECURITY device wifi list'))
      return ok(
        net.radio
          ? [
              ['Maison-5G', 92, 'WPA2'],
              ['Hotel_du_Port', 61, ''],
              ['Livebox-4A2C', 40, 'WPA2'],
            ]
              .map(([s, g, sec]) => `${s === net.connected ? '*' : ' '}:${s}:${g}:${sec}`)
              .join('\n')
          : '',
      );
    if (a === '-t -f NAME,TYPE connection show')
      return ok([...net.known].map((k) => `${k}:802-11-wireless`).join('\n'));
    if (a === '-t -f CONNECTIVITY general') return ok(net.portal ? 'portal\n' : 'full\n');
    if (a === '-g IP4.ADDRESS device show wlp3s0') return ok('192.168.1.42/24\n');
    if (args[0] === 'connection' && args[1] === 'up') {
      net.connected = args[3] ?? null;
      return ok();
    }
    if (args[0] === 'connection' && args[1] === 'delete') {
      net.known.delete(args[3] ?? '');
      if (net.connected === args[3]) net.connected = null;
      return ok();
    }
    if (args[0] === 'device' && args[2] === 'connect') {
      const ssid = args[3] ?? '';
      const given = args[4] === 'password' ? args[5] : undefined;
      net.known.add(ssid);
      const expected = net.passwords.get(ssid);
      if (expected !== undefined && given !== expected)
        return fail(
          'Error: Connection activation failed: (7) Secrets were required, but not provided.',
        );
      net.connected = ssid;
      if (ssid === 'Hotel_du_Port') net.portal = true;
      return ok();
    }
    return fail(`unknown nmcli ${a}`, 2);
  }

  const tools: SystemTools = {
    run: async (command, args) => {
      runs.push([command, ...args]);
      switch (command) {
        case 'nmcli':
          return nmcli(args);
        case 'wpctl':
          if (args[0] === 'get-volume')
            return ok(`Volume: ${sound.volume.toFixed(2)}${sound.muted ? ' [MUTED]' : ''}\n`);
          if (args[0] === 'set-volume') sound.volume = Number(args.at(-1));
          if (args[0] === 'set-mute') sound.muted = args.at(-1) === '1';
          return ok();
        case 'timedatectl':
          return args[0] === 'show'
            ? ok('Timezone=Europe/Paris\nNTP=yes\nNTPSynchronized=yes\n')
            : ok();
        case 'bluetoothctl':
          if (args[0] === 'show') return ok('Controller 00:11 x250\n\tPowered: no\n');
          if (args[0] === 'devices')
            return ok(args[1] === 'Paired' ? 'Device 00:1B:66:AA:BB:CC Casque Sennheiser\n' : '');
          return ok();
        case 'brightnessctl':
        case 'systemctl':
          return ok();
        default:
          return { code: -1, stdout: '', stderr: '' };
      }
    },
    read: async (file) => files.get(file) ?? null,
    list: async (dir) => dirs[dir] ?? [],
    readlink: async (file) => (file === '/nix/var/nix/profiles/system' ? 'system-12-link' : null),
    modified: async () => new Date('2026-11-13T09:00:00Z'),
    disk: async () => ({ used: 38e9, total: 238e9 }),
    daemon: (command, args, onLine) => {
      const daemon = { command, args, stopped: false, ...(onLine && { onLine }) };
      daemons.push(daemon);
      return () => {
        daemon.stopped = true;
      };
    },
  };
  return { tools, files, net, sound, runs, daemons };
}

const folders: string[] = [];
const systems: LinuxSystem[] = [];
afterEach(() => {
  for (const s of systems.splice(0)) s.dispose();
  for (const f of folders.splice(0)) fs.rmSync(f, { recursive: true, force: true });
});

async function start(x250 = fakeX250(), folder?: string) {
  const dir = folder ?? fs.mkdtempSync(path.join(os.tmpdir(), 'charpentier-system-'));
  if (!folder) folders.push(dir);
  const system = createLinuxSystem({
    tools: x250.tools,
    appVersion: '0.5.0',
    hostname: 'x250',
    settingsFile: path.join(dir, 'system.json'),
    now: () => new Date('2026-11-13T15:00:00Z'),
    periods: { cpu: 3_600_000, power: 3_600_000, slow: 3_600_000 },
  });
  systems.push(system);
  await system.start();
  return { system, x250, dir };
}

const ran = (runs: string[][], ...command: string[]) =>
  runs.some((r) => r.join(' ') === command.join(' '));

describe('the System service of the X250 (phase 5.4)', () => {
  it('reads the whole device at the start', async () => {
    const { system } = await start();
    const s = system.state();
    expect(s.device).toEqual({
      name: 'x250',
      model: 'ThinkPad X250 · i5-5300U · 8 Go',
      appVersion: '0.5.0',
      osVersion: 'nixos 26.11',
      generation: 12,
      installedAt: '2026-11-13T09:00:00.000Z',
      bootedAt: '2026-11-13T11:47:59.500Z',
      storage: { used: 38, total: 238 },
      diskEncrypted: true,
    });
    expect(s.wifi).toMatchObject({
      enabled: true,
      connected: 'Maison-5G',
      address: '192.168.1.42',
    });
    expect(s.wifi.networks.map((n) => [n.ssid, n.signal, n.secure, n.known])).toEqual([
      ['Maison-5G', 4, true, true],
      ['Hotel_du_Port', 3, false, false],
      ['Livebox-4A2C', 2, true, false],
    ]);
    expect(s.ethernet.connected).toBe(false);
    expect(s.brightness).toBe(60);
    expect([s.volume, s.muted]).toEqual([40, false]);
    expect(s.power).toEqual({
      batteries: [
        { name: 'interne', level: 82, health: 91 },
        { name: 'amovible', level: 82, health: 76 },
      ],
      charging: false,
      watts: 6.8,
      remaining: 344,
    });
    expect(s.cpu.temperature).toBe(48);
    expect(s.timeZone).toBe('Europe/Paris');
    expect(s.bluetooth).toEqual({
      enabled: false,
      devices: [{ id: '00:1B:66:AA:BB:CC', name: 'Casque Sennheiser', connected: false }],
    });
    expect(system.journal().map((m) => m.text)).toEqual(['démarrage · charpentier 0.5.0']);
  });

  it('joins a protected network: a wrong password leaves nothing behind, the right one connects', async () => {
    const { system, x250 } = await start();
    expect(await system.connectWifi('Livebox-4A2C', 'faux')).toBe('wrong-password');
    expect(ran(x250.runs, 'nmcli', 'connection', 'delete', 'id', 'Livebox-4A2C')).toBe(true);
    expect(x250.net.known.has('Livebox-4A2C')).toBe(false);
    expect(system.state().wifi.connected).toBe('Maison-5G');

    expect(await system.connectWifi('Livebox-4A2C', 'bonjour')).toBe('connected');
    expect(system.state().wifi.connected).toBe('Livebox-4A2C');
    expect(system.state().wifi.networks.find((n) => n.ssid === 'Livebox-4A2C')?.known).toBe(true);
    expect(system.journal().at(-1)?.text).toBe('connecté à Livebox-4A2C');
    // Never « réseau perdu » for a change the author asked for.
    expect(system.journal().map((m) => m.text)).not.toContain('réseau perdu');

    // A known network: its saved password.
    expect(await system.connectWifi('Maison-5G')).toBe('connected');
    expect(ran(x250.runs, 'nmcli', 'connection', 'up', 'id', 'Maison-5G')).toBe(true);
  });

  it('marks a network that asks for a sign-in page, and never opens it', async () => {
    const { system } = await start();
    expect(await system.connectWifi('Hotel_du_Port')).toBe('connected');
    expect(system.state().wifi.networks.find((n) => n.ssid === 'Hotel_du_Port')?.portal).toBe(true);
    expect(system.journal().at(-1)?.text).toBe('Hotel_du_P… · page de connexion demandée');
  });

  it('turns the Wi-Fi off and forgets a network; a lost network is said', async () => {
    const { system, x250 } = await start();
    await system.forgetWifi('Maison-5G');
    expect(system.journal().at(-1)?.text).toBe('Maison-5G oublié');
    await system.connectWifi('Hotel_du_Port');
    await system.setWifi(false);
    expect(system.state().wifi).toMatchObject({ enabled: false, connected: null, networks: [] });
    expect(system.journal().at(-1)?.text).toBe('wifi non');
    await system.setWifi(true);
    await system.connectWifi('Hotel_du_Port');

    // Out of range: NetworkManager says so.
    x250.net.connected = null;
    const monitor = x250.daemons.find((d) => d.command === 'nmcli');
    monitor?.onLine?.('wlp3s0: disconnected');
    await new Promise((r) => setTimeout(r, 700));
    expect(system.state().wifi.connected).toBeNull();
    expect(system.journal().at(-1)?.text).toBe('réseau perdu');
  });

  it('sets the light and the sound', async () => {
    const { system, x250 } = await start();
    await system.setBrightness(40);
    expect(system.state().brightness).toBe(40);
    expect(ran(x250.runs, 'brightnessctl', '-q', 'set', '40%')).toBe(true);
    // Never black.
    await system.setBrightness(0);
    expect(ran(x250.runs, 'brightnessctl', '-q', 'set', '1%')).toBe(true);

    await system.setMuted(true);
    expect(x250.sound.muted).toBe(true);
    await system.setVolume(55);
    expect(x250.sound).toEqual({ volume: 0.55, muted: false });
    expect(system.state()).toMatchObject({ volume: 55, muted: false });
  });

  it('keeps the delays, gives them to swayidle, and keeps the settings across a restart', async () => {
    const { system, x250, dir } = await start();
    const idle = () => x250.daemons.filter((d) => d.command === 'swayidle');
    expect(idle()[0]?.args).toEqual([
      '-w',
      'timeout',
      '300',
      'swaymsg "output * power off"',
      'resume',
      'swaymsg "output * power on"',
      'timeout',
      '900',
      'systemctl suspend',
    ]);
    await system.setSetting('screenOffAfter', null);
    await system.setSetting('sleepAfter', 30);
    expect(idle()[0]?.stopped).toBe(true);
    expect(idle().at(-1)?.args).toEqual(['-w', 'timeout', '1800', 'systemctl suspend']);
    await system.setSetting('autoTime', false);
    expect(ran(x250.runs, 'timedatectl', 'set-ntp', 'false')).toBe(true);
    await system.setNightMode('on');

    system.dispose();
    const again = await start(fakeX250(), dir);
    expect(again.system.state().settings).toMatchObject({ screenOffAfter: null, sleepAfter: 30 });
    expect(again.system.state().night.mode).toBe('on');
  });

  it('sleeps, restarts and powers off through logind', async () => {
    const { system, x250 } = await start();
    await system.suspend();
    await system.reboot();
    await system.powerOff();
    for (const verb of ['suspend', 'reboot', 'poweroff'])
      expect(ran(x250.runs, 'systemctl', verb)).toBe(true);
  });

  it('follows the processor and the batteries, and stops everything when disposed', async () => {
    const x250 = fakeX250();
    const { system } = await start(x250);
    x250.files.set('/proc/stat', 'cpu  130 0 120 840 110 0 0 0 0 0\n');
    x250.files.set('/sys/class/power_supply/AC/online', '1\n');
    x250.files.set('/sys/class/power_supply/BAT0/status', 'Charging\n');
    let changes = 0;
    system.onChange(() => changes++);
    await system.refresh();
    expect(system.state().cpu.load).toBe(25);
    expect(system.state().power).toMatchObject({ charging: true, remaining: null });
    expect(changes).toBeGreaterThan(0);
    system.dispose();
    expect(x250.daemons.every((d) => d.stopped)).toBe(true);
  });
});
