import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { crc32, DocFile, readJournal } from './doc-file';

const dirs: string[] = [];
const tempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charpentier-doc-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function openDoc(dir: string, options = {}) {
  const file = new DocFile(dir, options);
  const doc = new Y.Doc();
  file.load(doc, 'load');
  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin !== 'load') file.append(update);
  });
  return { file, doc };
}

const journalOf = (dir: string) => path.join(dir, 'journal.bin');
const asideOf = (dir: string) =>
  fs
    .readdirSync(dir)
    .filter((name) => name.startsWith('journal.damaged-'))
    .map((name) => fs.readFileSync(path.join(dir, name)));
const quiet = () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  errors.mockClear();
  return errors;
};

/** One writer's successive insertions, as the updates a journal would hold. */
function updatesOf(...parts: string[]): Uint8Array[] {
  const doc = new Y.Doc();
  const updates: Uint8Array[] = [];
  doc.on('update', (update: Uint8Array) => updates.push(update));
  for (const part of parts) doc.getText('t').insert(doc.getText('t').length, part);
  return updates;
}

/** A record as written before the checksum: [uint32 length][bytes]. */
function legacyRecord(update: Uint8Array): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt32LE(update.length, 0);
  return Buffer.concat([header, update]);
}

function checkedRecord(update: Uint8Array): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32LE((update.length | 0x80000000) >>> 0, 0);
  header.writeUInt32LE(crc32(update), 4);
  return Buffer.concat([header, update]);
}

describe('DocFile', () => {
  it('replays the journal on top of the last compacted state', () => {
    const dir = tempDir();
    const a = openDoc(dir);
    a.doc.getText('t').insert(0, 'Il pleuvait');
    a.file.compact(a.doc);
    a.doc.getText('t').insert(11, ' sur Nantes.');
    // No close: as after a crash.
    const b = openDoc(dir);
    expect(b.doc.getText('t').toString()).toBe('Il pleuvait sur Nantes.');
  });

  it('ignores a torn last record and keeps appending after it', () => {
    const dir = tempDir();
    const errors = quiet();
    const a = openDoc(dir);
    a.doc.getText('t').insert(0, 'Un.');
    fs.appendFileSync(path.join(dir, 'journal.bin'), Buffer.from([200, 0, 0, 0, 1, 2]));
    const b = openDoc(dir);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(asideOf(dir)).toEqual([Buffer.from([200, 0, 0, 0, 1, 2])]);
    expect(b.doc.getText('t').toString()).toBe('Un.');
    b.doc.getText('t').insert(3, ' Deux.');
    expect(openDoc(dir).doc.getText('t').toString()).toBe('Un. Deux.');
    const { validBytes } = readJournal(fs.readFileSync(path.join(dir, 'journal.bin')));
    expect(validBytes).toBe(fs.statSync(path.join(dir, 'journal.bin')).size);
  });

  it('computes the CRC-32 of zlib', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('still reads a journal written before the checksum, and appends to it', () => {
    const dir = tempDir();
    const [one, two, three] = updatesOf('Un.', ' Deux.', ' Trois.') as [
      Uint8Array,
      Uint8Array,
      Uint8Array,
    ];
    fs.writeFileSync(journalOf(dir), Buffer.concat([legacyRecord(one), legacyRecord(two)]));
    const a = openDoc(dir);
    expect(a.doc.getText('t').toString()).toBe('Un. Deux.');
    expect(asideOf(dir)).toEqual([]);
    // Old and new records side by side until the next compaction.
    Y.applyUpdate(a.doc, three);
    expect(fs.statSync(journalOf(dir)).size).toBe(a.file.journalBytes);
    const b = openDoc(dir);
    expect(b.doc.getText('t').toString()).toBe('Un. Deux. Trois.');
    expect(asideOf(dir)).toEqual([]);
  });

  it('opens with what precedes a zero-filled tail, and sets the tail aside', () => {
    for (const record of [checkedRecord, legacyRecord]) {
      const dir = tempDir();
      const errors = quiet();
      const [one, two] = updatesOf('Un.', ' Deux.') as [Uint8Array, Uint8Array];
      const good = Buffer.concat([record(one), record(two)]);
      // Blocks allocated by the file system, never written (power loss).
      const zeros = Buffer.alloc(4096);
      fs.writeFileSync(journalOf(dir), Buffer.concat([good, zeros]));

      const a = openDoc(dir);
      expect(a.doc.getText('t').toString()).toBe('Un. Deux.');
      expect(errors).toHaveBeenCalledTimes(1);
      expect(asideOf(dir)).toEqual([zeros]);
      expect(fs.readFileSync(journalOf(dir))).toEqual(good);

      a.doc.getText('t').insert(9, ' Trois.');
      errors.mockClear();
      expect(openDoc(dir).doc.getText('t').toString()).toBe('Un. Deux. Trois.');
      expect(errors).not.toHaveBeenCalled();
      expect(asideOf(dir)).toHaveLength(1);
    }
  });

  it('opens with what precedes a garbage record, whole or not', () => {
    const [one, two, three] = updatesOf('Un.', ' Deux.', ' Trois.') as [
      Uint8Array,
      Uint8Array,
      Uint8Array,
    ];
    const noise = Buffer.alloc(64, 0xff);
    const flipped = Buffer.from(two);
    flipped[flipped.length - 3] = (flipped[flipped.length - 3] ?? 0) ^ 0x10;
    const tails = [
      // A full-length record of garbage, without and with a checksum word.
      legacyRecord(noise),
      Buffer.concat([checkedRecord(noise).subarray(0, 4), Buffer.alloc(4), noise]),
      // One flipped bit in an otherwise complete record, followed by a good one.
      Buffer.concat([checkedRecord(two).subarray(0, 8), flipped, checkedRecord(three)]),
      // Bytes that are not even a header.
      Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 1, 2, 3]),
    ];
    for (const tail of tails) {
      const dir = tempDir();
      const errors = quiet();
      const good = checkedRecord(one);
      fs.writeFileSync(journalOf(dir), Buffer.concat([good, tail]));
      const a = openDoc(dir);
      expect(a.doc.getText('t').toString()).toBe('Un.');
      expect(errors).toHaveBeenCalledTimes(1);
      expect(asideOf(dir)).toEqual([tail]);
      expect(fs.readFileSync(journalOf(dir))).toEqual(good);
    }
  });

  it('keeps the state and the first records when a partial record is followed by valid ones', () => {
    for (const record of [checkedRecord, legacyRecord]) {
      const dir = tempDir();
      const errors = quiet();
      const base = openDoc(dir);
      base.doc.getText('t').insert(0, 'Hier. ');
      base.file.close(base.doc);

      const [one, two, three, four] = updatesOf('Un.', ' Deux.', ' Trois.', ' Quatre.') as [
        Uint8Array,
        Uint8Array,
        Uint8Array,
        Uint8Array,
      ];
      const good = record(one);
      // The disk was full in the middle of the second record; the next ones went through.
      const partial = record(two);
      const tail = Buffer.concat([
        partial.subarray(0, partial.length - 5),
        record(three),
        record(four),
      ]);
      fs.writeFileSync(journalOf(dir), Buffer.concat([good, tail]));

      const a = openDoc(dir);
      expect(a.doc.getText('t').toString()).toContain('Hier. ');
      expect(a.doc.getText('t').toString()).toContain('Un.');
      expect(a.doc.getText('t').toString()).not.toContain('Trois.');
      expect(errors).toHaveBeenCalledTimes(1);
      expect(String(errors.mock.calls[0]?.[0])).toContain('journal.damaged-');
      expect(asideOf(dir)).toEqual([tail]);
      expect(fs.readFileSync(journalOf(dir))).toEqual(good);

      // The document is usable again: what is typed now is kept.
      a.doc.getText('t').insert(0, 'Demain. ');
      expect(openDoc(dir).doc.getText('t').toString()).toBe(a.doc.getText('t').toString());
      expect(asideOf(dir)).toHaveLength(1);
    }
  });

  it('leaves no partial record behind when a write fails (full disk)', () => {
    const dir = tempDir();
    const a = openDoc(dir);
    a.doc.getText('t').insert(0, 'Un.');
    const before = fs.readFileSync(journalOf(dir));

    const write = fs.writeSync.bind(fs) as (
      fd: number,
      data: Uint8Array,
      offset: number,
      length: number,
    ) => number;
    let calls = 0;
    const spy = vi.spyOn(fs, 'writeSync').mockImplementation(((
      fd: number,
      data: Uint8Array,
      offset: number,
      length: number,
    ) => {
      // A short write, then no space left.
      if (calls++ === 0) return write(fd, data, offset, Math.floor(length / 2));
      throw Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' });
    }) as typeof fs.writeSync);
    const [lost] = updatesOf('Perdu.') as [Uint8Array];
    expect(() => a.file.append(lost)).toThrow('ENOSPC');
    spy.mockRestore();
    expect(fs.readFileSync(journalOf(dir))).toEqual(before);

    // Space again: the following records are found where they are expected.
    a.doc.getText('t').insert(3, ' Deux.');
    const journal = fs.readFileSync(journalOf(dir));
    expect(readJournal(journal).validBytes).toBe(journal.length);
    expect(a.file.journalBytes).toBe(journal.length);
    expect(openDoc(dir).doc.getText('t').toString()).toBe('Un. Deux.');
    expect(asideOf(dir)).toEqual([]);
  });

  it('compacts by itself once the journal grows, and on close', () => {
    const dir = tempDir();
    const a = openDoc(dir, { compactAfterBytes: 200 });
    for (let i = 0; i < 100; i++) {
      a.doc.getText('t').insert(0, 'x');
      if (a.file.shouldCompact) a.file.compact(a.doc);
    }
    expect(a.file.journalBytes).toBeLessThan(250);
    a.file.close(a.doc);
    expect(fs.statSync(path.join(dir, 'journal.bin')).size).toBe(0);
    expect(openDoc(dir).doc.getText('t').toString()).toBe('x'.repeat(100));
  });

  it('loses nothing it reported as written when the process is killed', async () => {
    const dir = tempDir();
    const script = fileURLToPath(new URL('./testing/crash-writer.mjs', import.meta.url));
    const child = spawn(process.execPath, [script, dir], { stdio: ['ignore', 'pipe', 'inherit'] });
    let reported = 0;
    await new Promise<void>((resolve, reject) => {
      child.on('error', reject);
      child.stdout.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().trim().split('\n');
        reported = Number(lines[lines.length - 1]);
        // Kill it at full speed, in the middle of its writes, after a few compactions.
        if (reported >= 400) {
          child.kill('SIGKILL');
          resolve();
        }
      });
    });
    await new Promise((resolve) => child.on('exit', resolve));
    const text = openDoc(dir).doc.getText('t').toString();
    const written = text.split(';').filter(Boolean).map(Number);
    expect(written.length).toBeGreaterThanOrEqual(reported);
    expect(written).toEqual(written.map((_, i) => i + 1));
  }, 20_000);
});
