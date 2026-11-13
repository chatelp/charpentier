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
  const usb = { plugged: false, mounted: null as string | null };
  const screens = { external: false, externalActive: false, internalActive: true, scale: 1 };
  const runs: string[][] = [];
  const bt = { paired: false };
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
            return ok(
              args[1] === 'Paired'
                ? `Device 00:1B:66:AA:BB:CC Casque Sennheiser\n${bt.paired ? 'Device 34:88:5D:11:22:33 Clavier K380\n' : ''}`
                : args[1] === 'Connected'
                  ? ''
                  : 'Device 00:1B:66:AA:BB:CC Casque Sennheiser\nDevice 34:88:5D:11:22:33 Clavier K380\nDevice 5A:6B:7C:8D:9E:0F 5A-6B-7C-8D-9E-0F\n',
            );
          if (args.includes('pair')) bt.paired = true;
          return ok();
        case 'lsblk':
          return ok(
            JSON.stringify({
              blockdevices: [
                {
                  name: 'sda',
                  tran: 'sata',
                  type: 'disk',
                  children: [{ name: 'sda1', fstype: 'vfat' }],
                },
                ...(usb.plugged
                  ? [
                      {
                        name: 'sdb',
                        tran: 'usb',
                        type: 'disk',
                        model: 'DataTraveler',
                        children: [
                          {
                            name: 'sdb1',
                            fstype: 'vfat',
                            label: 'KINGSTON',
                            mountpoint: usb.mounted,
                          },
                        ],
                      },
                    ]
                  : []),
              ],
            }),
          );
        case 'udisksctl':
          if (args[0] === 'mount') {
            usb.mounted = '/run/media/auteur/KINGSTON';
            return ok(`Mounted /dev/sdb1 at ${usb.mounted}\n`);
          }
          if (args[0] === 'power-off') usb.plugged = false;
          return ok();
        case 'swaymsg':
          if (args[1] === 'get_outputs')
            return ok(
              JSON.stringify([
                {
                  name: 'eDP-1',
                  active: screens.internalActive,
                  make: 'Lenovo',
                  model: 'Unknown',
                  scale: 1.25,
                },
                ...(screens.external
                  ? [
                      {
                        name: 'HDMI-A-1',
                        active: screens.externalActive,
                        make: 'Dell',
                        model: 'U2419H',
                        scale: screens.scale,
                      },
                    ]
                  : []),
              ]),
            );
          if (args[0] === 'output' && args[1] === 'HDMI-A-1' && args[2] === 'enable') {
            screens.externalActive = true;
            screens.scale = Number(args[4]);
          }
          if (args[0] === 'output' && args[1] === 'eDP-1')
            screens.internalActive = args[2] === 'enable';
          return ok();
        case 'lpstat':
          return args[0] === '-e'
            ? ok('HP_LaserJet_bureau\nBrother_HL_L2350\n')
            : ok('system default destination: Brother_HL_L2350\n');
        case 'lp':
          return ok('request id is Brother_HL_L2350-12 (1 file(s))\n');
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
  return { tools, files, net, sound, usb, screens, runs, daemons };
}

const clock = { now: new Date('2026-11-13T15:00:00Z') };
const folders: string[] = [];
const systems: LinuxSystem[] = [];
afterEach(() => {
  clock.now = new Date('2026-11-13T15:00:00Z');
  for (const s of systems.splice(0)) s.dispose();
  for (const f of folders.splice(0)) fs.rmSync(f, { recursive: true, force: true });
});

async function start(
  x250 = fakeX250(),
  folder?: string,
  exportTexts?: (folder: string) => Promise<void>,
) {
  const dir = folder ?? fs.mkdtempSync(path.join(os.tmpdir(), 'charpentier-system-'));
  if (!folder) folders.push(dir);
  const system = createLinuxSystem({
    tools: x250.tools,
    appVersion: '0.5.0',
    hostname: 'x250',
    settingsFile: path.join(dir, 'system.json'),
    now: () => clock.now,
    periods: { cpu: 3_600_000, power: 3_600_000, slow: 3_600_000 },
    lockIterations: 1_000,
    ...(exportTexts && { exportTexts }),
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

  it('starts with the first start, then never again', async () => {
    const { system, dir } = await start();
    expect(system.state().firstStart).toBe(true);
    await system.finishFirstStart();
    system.dispose();
    const again = await start(fakeX250(), dir);
    expect(again.system.state().firstStart).toBe(false);
  });

  it('locks with a code, before sleeping, and keeps only its fingerprint', async () => {
    const { system, x250, dir } = await start();
    // Without a code, nothing locks.
    await system.lock();
    expect(system.state().lock.locked).toBe(false);

    expect(await system.setLockCode('12')).toBe('invalid');
    expect(await system.setLockCode('Loire44')).toBe('ok');
    expect(fs.readFileSync(path.join(dir, 'system.json'), 'utf8')).not.toContain('Loire44');
    expect(system.state().lock).toEqual({ locked: false, hasCode: true, retryAt: null });

    system.sleeping();
    expect(system.state().lock.locked).toBe(true);
    // Sway's locked mode: no rescue terminal.
    expect(ran(x250.runs, 'swaymsg', 'mode', 'locked')).toBe(true);
    await system.woke();
    expect(system.state().lock.locked).toBe(true);
    expect(await system.unlock('faux')).toBe('wrong');
    expect(system.state().lock.locked).toBe(true);
    expect(await system.unlock('Loire44')).toBe('ok');
    expect(system.state().lock.locked).toBe(false);
    expect(ran(x250.runs, 'swaymsg', 'mode', 'default')).toBe(true);

    // Changing it asks for the current one.
    expect(await system.setLockCode('Nantes1', 'faux')).toBe('wrong');
    expect(await system.setLockCode('Nantes1', 'Loire44')).toBe('ok');
    system.dispose();
    const again = await start(fakeX250(), dir);
    expect(again.system.state().lock.hasCode).toBe(true);
    await again.system.lock();
    expect(await again.system.unlock('Nantes1')).toBe('ok');
  });

  it('« after 15 min of sleep »: a shorter sleep opens on the text again', async () => {
    const { system } = await start();
    await system.setLockCode('1234');
    await system.setSetting('askCode', 'after15');
    system.sleeping();
    expect(system.state().lock.locked).toBe(true);
    clock.now = new Date(clock.now.getTime() + 10 * 60_000);
    await system.woke();
    expect(system.state().lock.locked).toBe(false);

    system.sleeping();
    clock.now = new Date(clock.now.getTime() + 20 * 60_000);
    await system.woke();
    expect(system.state().lock.locked).toBe(true);

    await system.unlock('1234');
    await system.setSetting('askCode', 'never');
    system.sleeping();
    expect(system.state().lock.locked).toBe(false);
  });

  it('copies the texts to a USB key, then ejects it (phase 5.7)', async () => {
    const copies: string[] = [];
    const x250 = fakeX250();
    const { system } = await start(x250, undefined, async (folder) => void copies.push(folder));
    expect(system.state().usb).toBeNull();
    x250.usb.plugged = true;
    x250.daemons.find((d) => d.command === 'udevadm')?.onLine?.('UDEV add /block/sdb');
    await new Promise((r) => setTimeout(r, 900));
    expect(system.state().usb).toEqual({ name: 'KINGSTON' });
    expect(system.journal().at(-1)?.text).toBe('clé « KINGSTON » branchée · ⊞U copier');

    expect(await system.copyToUsb()).toBe('copied');
    expect(copies).toEqual(['/run/media/auteur/KINGSTON/Charpentier/2026-11-13']);
    expect(system.journal().at(-1)?.text).toBe('textes copiés sur KINGSTON');
    await system.ejectUsb();
    expect(
      ran(x250.runs, 'udisksctl', 'power-off', '-b', '/dev/sdb', '--no-user-interaction'),
    ).toBe(true);
    expect(system.state().usb).toBeNull();
    expect(system.journal().at(-1)?.text).toBe('clé KINGSTON éjectée');
  });

  it('gives a plugged screen the app alone, and the laptop its screen back (phase 5.7)', async () => {
    const x250 = fakeX250();
    const { system } = await start(x250);
    x250.screens.external = true;
    x250.daemons.find((d) => d.command === 'swaymsg')?.onLine?.('{"change":"added"}');
    await new Promise((r) => setTimeout(r, 600));
    expect(x250.screens).toMatchObject({ externalActive: true, internalActive: false, scale: 1 });
    expect(system.state().externalScreen).toBe('Dell U2419H');
    await system.setSetting('externalScale', 125);
    expect(x250.screens.scale).toBe(1.25);
    x250.screens.external = false;
    x250.daemons.find((d) => d.command === 'swaymsg')?.onLine?.('{"change":"removed"}');
    await new Promise((r) => setTimeout(r, 600));
    expect(x250.screens.internalActive).toBe(true);
    expect(system.state().externalScreen).toBeNull();
  });

  it('sets the keyboard, the touchpad and the warm light of the night (phase 5.7)', async () => {
    const { system, x250 } = await start();
    expect(ran(x250.runs, 'swaymsg', 'input', 'type:keyboard', 'xkb_layout', 'fr')).toBe(true);
    expect(ran(x250.runs, 'swaymsg', 'input', 'type:touchpad', 'dwt', 'enabled')).toBe(true);
    await system.setSetting('keyboardLayout', 'bepo');
    expect(ran(x250.runs, 'swaymsg', 'input', 'type:keyboard', 'xkb_variant', 'bepo')).toBe(true);
    await system.setSetting('naturalScrolling', true);
    expect(ran(x250.runs, 'swaymsg', 'input', 'type:touchpad', 'natural_scroll', 'enabled')).toBe(
      true,
    );

    const night = () => x250.daemons.filter((d) => d.command === 'wlsunset');
    expect(night()[0]?.args).toEqual(['-S', '07:00', '-s', '21:00', '-t', '4000']);
    await system.setNightMode('on');
    expect(night()[0]?.stopped).toBe(true);
    expect(night().at(-1)?.args).toEqual(['-T', '4001', '-t', '4000']);
    expect(system.state().night).toEqual({ mode: 'on', active: true });
    await system.setNightMode('off');
    expect(night().at(-1)?.stopped).toBe(true);
    expect(system.state().night.active).toBe(false);
  });

  it('prints through CUPS, on the default printer of the network (phase 5.7)', async () => {
    const { system, x250 } = await start();
    expect(system.state().printers).toEqual([
      { name: 'HP_LaserJet_bureau', isDefault: false },
      { name: 'Brother_HL_L2350', isDefault: true },
    ]);
    const job = { printer: 'Brother_HL_L2350', copies: 2, title: 'Mon roman · Il pleut' };
    expect(await system.printPdf(new Uint8Array([37, 80, 68, 70]), job)).toBe('printed');
    const lp = x250.runs.find((r) => r[0] === 'lp');
    expect(lp?.slice(0, 7)).toEqual(['lp', '-d', 'Brother_HL_L2350', '-n', '2', '-t', job.title]);
    // The PDF is gone once CUPS has it.
    expect(fs.existsSync(lp?.[7] ?? '')).toBe(false);
    expect(system.journal().at(-1)?.text).toBe('impression envoyée · Brother_HL_L2350');
  });

  it('finds Bluetooth devices nearby and pairs one (phase 5.7)', async () => {
    const { system, x250 } = await start();
    const found = await system.scanBluetooth();
    // Known and unnamed devices are left out.
    expect(found.map((d) => d.name)).toEqual(['Clavier K380']);
    expect(await system.pairBluetooth('34:88:5D:11:22:33')).toBe('paired');
    expect(ran(x250.runs, 'bluetoothctl', 'trust', '34:88:5D:11:22:33')).toBe(true);
    expect(system.state().bluetooth.devices.map((d) => d.name)).toContain('Clavier K380');
    expect(system.journal().at(-1)?.text).toBe('Clavier K380 appairé');
  });
});
