import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { shareUpdateAccess } from './update-access';

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
});
