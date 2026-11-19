import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createUpdateAccessSharer, shareUpdateAccess } from './update-access';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('the update service reads the account (phase 5.12)', () => {
  it('writes the server and the token for the owner alone, and removes them at sign-out', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charpentier-access-'));
    dirs.push(dir);
    const file = path.join(dir, 'charpentier', 'update-access.json');
    shareUpdateAccess(file, { server: 'https://charpentier.chatel.pm/', token: 'jeton' });
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({
      server: 'https://charpentier.chatel.pm',
      token: 'jeton',
    });
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    shareUpdateAccess(file, null);
    expect(fs.existsSync(file)).toBe(false);
    shareUpdateAccess(file, null);
  });

  it('writes the file only when the account changes (sign-in, sign-out, another server)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charpentier-access-'));
    dirs.push(dir);
    const file = path.join(dir, 'charpentier', 'update-access.json');
    const account = { server: 'https://charpentier.chatel.pm/', token: 'jeton' };
    const share = createUpdateAccessSharer(file);
    expect(share(account)).toBe(true);
    const written = fs.statSync(file, { bigint: true }).ino;
    // Asked again at every state of the sync: nothing is written.
    for (let i = 0; i < 20; i++) expect(share({ ...account })).toBe(false);
    expect(fs.statSync(file, { bigint: true }).ino).toBe(written);
    // The app starts again: the file on disk already says it.
    expect(createUpdateAccessSharer(file)(account)).toBe(false);
    expect(fs.statSync(file, { bigint: true }).ino).toBe(written);
    // Another token, another server: written.
    expect(share({ ...account, token: 'autre' })).toBe(true);
    expect(share({ server: 'https://ailleurs.example', token: 'autre' })).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({
      server: 'https://ailleurs.example',
      token: 'autre',
    });
    // Signed out: removed, once.
    expect(share(null)).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
    expect(share(null)).toBe(false);
    // A file left readable by others is written again.
    expect(share(account)).toBe(true);
    fs.chmodSync(file, 0o644);
    expect(createUpdateAccessSharer(file)(account)).toBe(true);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });
});
