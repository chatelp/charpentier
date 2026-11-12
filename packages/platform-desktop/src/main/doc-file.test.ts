import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { DocFile, readJournal } from './doc-file';

const dirs: string[] = [];
const tempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charpentier-doc-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
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
    const a = openDoc(dir);
    a.doc.getText('t').insert(0, 'Un.');
    fs.appendFileSync(path.join(dir, 'journal.bin'), Buffer.from([200, 0, 0, 0, 1, 2]));
    const b = openDoc(dir);
    expect(b.doc.getText('t').toString()).toBe('Un.');
    b.doc.getText('t').insert(3, ' Deux.');
    expect(openDoc(dir).doc.getText('t').toString()).toBe('Un. Deux.');
    const { validBytes } = readJournal(fs.readFileSync(path.join(dir, 'journal.bin')));
    expect(validBytes).toBe(fs.statSync(path.join(dir, 'journal.bin')).size);
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
