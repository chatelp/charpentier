import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreferencesFile } from './preferences';

const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function prefsFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charpentier-prefs-'));
  dirs.push(dir);
  return path.join(dir, 'data', 'preferences.json');
}
const onDisk = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('the preferences file', () => {
  it('keeps what is set in memory and writes it once, after the delay, without a synchronous fsync', async () => {
    const file = prefsFile();
    const fsync = vi.spyOn(fs, 'fsyncSync');
    const rename = vi.spyOn(fs.promises, 'rename');
    const preferences = new PreferencesFile(file, 40);
    // The author types: the words of the day, saved again and again.
    for (let count = 1; count <= 200; count++) {
      preferences.set('wordsToday', { day: '2026-11-19', count });
      expect(preferences.get('wordsToday')).toEqual({ day: '2026-11-19', count });
    }
    expect(fs.existsSync(file)).toBe(false);
    await wait(80);
    await preferences.settled();
    expect(onDisk(file)).toEqual({ wordsToday: { day: '2026-11-19', count: 200 } });
    expect(rename).toHaveBeenCalledTimes(1);
    expect(fsync).not.toHaveBeenCalled();
    expect(fs.readdirSync(path.dirname(file))).toEqual(['preferences.json']);
  });

  it('never loses the last value: set while a write is running, it is written next', async () => {
    const file = prefsFile();
    const preferences = new PreferencesFile(file, 10);
    preferences.set('count', 1);
    for (let i = 2; i <= 30; i++) {
      await wait(3);
      preferences.set('count', i);
    }
    await wait(60);
    await preferences.settled();
    expect(onDisk(file)).toEqual({ count: 30 });
  });

  it('flushes at once on quitting, and a deferred write still running does not undo it', async () => {
    const file = prefsFile();
    const preferences = new PreferencesFile(file, 0);
    preferences.set('lastScene', 'ancienne');
    // The deferred write has started (its temporary file is being written)…
    await new Promise((resolve) => setImmediate(resolve));
    // …when the author changes scene and quits.
    preferences.set('lastScene', 'dernière');
    preferences.flush();
    expect(onDisk(file)).toEqual({ lastScene: 'dernière' });
    await preferences.settled();
    await wait(20);
    await preferences.settled();
    expect(onDisk(file)).toEqual({ lastScene: 'dernière' });
    expect(new PreferencesFile(file).get('lastScene')).toBe('dernière');
    expect(fs.readdirSync(path.dirname(file))).toEqual(['preferences.json']);
  });

  it('writes nothing when a value is set to what it already is, and removes an undefined one', async () => {
    const file = prefsFile();
    const preferences = new PreferencesFile(file, 0);
    preferences.set('a', { n: 1 });
    preferences.set('b', 2);
    preferences.flush();
    const rename = vi.spyOn(fs, 'renameSync');
    preferences.set('a', { n: 1 });
    preferences.flush();
    expect(rename).not.toHaveBeenCalled();
    preferences.set('b', undefined);
    preferences.flush();
    expect(onDisk(file)).toEqual({ a: { n: 1 } });
  });
});
