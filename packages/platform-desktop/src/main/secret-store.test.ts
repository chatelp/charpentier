import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SecretStore, type Encryption } from './secret-store';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A reversible stand-in for safeStorage. */
const encryption = (available = true): Encryption => ({
  isEncryptionAvailable: () => available,
  encryptString: (plain) => Buffer.from([...plain].reverse().join('')),
  decryptString: (encrypted) => [...encrypted.toString()].reverse().join(''),
});

function store(available = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charpentier-secrets-'));
  dirs.push(dir);
  const file = path.join(dir, 'data', 'secrets.json');
  return { file, secrets: new SecretStore(file, encryption(available)) };
}

describe('the secret store', () => {
  it('keeps a secret encrypted, in a file its owner alone may read', () => {
    const { file, secrets } = store();
    expect(secrets.set('sync.account', 'jeton')).toBe(true);
    expect(secrets.get('sync.account')).toBe('jeton');
    expect(fs.readFileSync(file, 'utf8')).not.toContain('jeton');
    if (process.platform !== 'win32') expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    secrets.delete('sync.account');
    expect(secrets.get('sync.account')).toBeUndefined();
    if (process.platform !== 'win32') expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it('keeps nothing without encryption, and says so', () => {
    const { file, secrets } = store(false);
    expect(secrets.set('sync.account', 'jeton')).toBe(false);
    expect(fs.existsSync(file)).toBe(false);
  });
});
