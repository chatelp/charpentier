import { describe, expect, it } from 'vitest';
import {
  cpuLoad,
  deviceModel,
  generationOf,
  osVersion,
  parseAddress,
  parseBluetoothDevices,
  parseCpuTicks,
  parseKnownWifi,
  parseVolume,
  parseWifiList,
  readPower,
  splitTerse,
  wrongPassword,
} from './parse';

describe('reading the Linux tools (phase 5.4)', () => {
  it('splits a terse nmcli line, escaped colons included', () => {
    expect(splitTerse('*:Café\\: le port:72:WPA2')).toEqual(['*', 'Café: le port', '72', 'WPA2']);
    expect(splitTerse(':a\\\\b::')).toEqual(['', 'a\\b', '', '']);
  });

  it('lists the Wi-Fi networks: one per name, the strongest first, hidden ones left out', () => {
    const list = [
      ' :Livebox-4A2C:40:WPA2',
      '*:Maison-5G:92:WPA2 WPA3',
      ' :Maison-5G:30:WPA2',
      ' :Hotel_du_Port:61:',
      ' ::80:WPA2',
    ].join('\n');
    const { networks, inUse } = parseWifiList(list, new Set(['Maison-5G']));
    expect(inUse).toBe('Maison-5G');
    expect(networks).toEqual([
      { ssid: 'Maison-5G', signal: 4, secure: true, portal: false, known: true },
      { ssid: 'Hotel_du_Port', signal: 3, secure: false, portal: false, known: false },
      { ssid: 'Livebox-4A2C', signal: 2, secure: true, portal: false, known: false },
    ]);
    expect(
      parseKnownWifi('Maison-5G:802-11-wireless\nWired connection 1:802-3-ethernet\nlo:loopback'),
    ).toEqual(new Set(['Maison-5G']));
    expect(parseAddress('192.168.1.42/24 | 10.0.0.2/8\n')).toBe('192.168.1.42');
    expect(parseAddress('')).toBeNull();
  });

  it('tells a refused password from another failure', () => {
    expect(
      wrongPassword(
        'Error: Connection activation failed: (7) Secrets were required, but not provided.',
      ),
    ).toBe(true);
    expect(wrongPassword("Error: No network with SSID 'Loin' found.")).toBe(false);
  });

  it('reads the sound of PipeWire', () => {
    expect(parseVolume('Volume: 0.40\n')).toEqual({ volume: 40, muted: false });
    expect(parseVolume('Volume: 0.55 [MUTED]\n')).toEqual({ volume: 55, muted: true });
    expect(parseVolume('nothing')).toBeNull();
  });

  it('reads the two batteries of the X250: level, wear, watts and time left', () => {
    const power = readPower(
      [
        {
          name: 'BAT0',
          capacity: '80',
          status: 'Discharging',
          energyNow: '19000000',
          energyFull: '21000000',
          energyFullDesign: '23200000',
          powerNow: '4000000',
        },
        {
          name: 'BAT1',
          capacity: '84',
          status: 'Unknown',
          energyNow: '20000000',
          energyFull: '23800000',
          energyFullDesign: '23200000',
          powerNow: '2800000',
        },
      ],
      false,
      (n) => (n === 'BAT0' ? 'interne' : 'amovible'),
    );
    expect(power.batteries).toEqual([
      { name: 'interne', level: 80, health: 91 },
      { name: 'amovible', level: 84, health: 100 },
    ]);
    expect(power.charging).toBe(false);
    expect(power.watts).toBe(6.8);
    // 39 Wh at 6.8 W: 5 h 44.
    expect(power.remaining).toBe(344);
    expect(readPower([], true, (n) => n)).toMatchObject({ charging: true, remaining: null });
  });

  it('reads the processor between two moments', () => {
    const a = parseCpuTicks('cpu  100 0 100 700 100 0 0 0 0 0\ncpu0 1 2 3');
    const b = parseCpuTicks('cpu  130 0 120 840 110 0 0 0 0 0\n');
    expect(a && b && cpuLoad(a, b)).toBe(25);
  });

  it('says what the device is', () => {
    expect(
      deviceModel(
        'ThinkPad X250\n',
        'processor\t: 0\nmodel name\t: Intel(R) Core(TM) i5-5300U CPU @ 2.30GHz\n',
        'MemTotal:        8059972 kB\n',
      ),
    ).toBe('ThinkPad X250 · i5-5300U · 8 Go');
    expect(osVersion('NAME=NixOS\nID=nixos\nVERSION_ID="26.11"\n')).toBe('nixos 26.11');
    expect(generationOf('system-12-link')).toBe(12);
    expect(generationOf(null)).toBe(0);
  });

  it('reads the paired Bluetooth devices', () => {
    expect(
      parseBluetoothDevices(
        'Device 00:1B:66:AA:BB:CC Casque Sennheiser\nDevice 11:22:33:44:55:66 Clavier\n',
        new Set(['11:22:33:44:55:66']),
      ),
    ).toEqual([
      { id: '00:1B:66:AA:BB:CC', name: 'Casque Sennheiser', connected: false },
      { id: '11:22:33:44:55:66', name: 'Clavier', connected: true },
    ]);
  });
});
