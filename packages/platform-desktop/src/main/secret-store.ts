import fs from 'node:fs';
import path from 'node:path';
import { writeJsonAtomic } from './projects';

/** Electron's safeStorage, injected (this package does not import Electron). */
export interface Encryption {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

/** Readable by its owner only: on the X250 the secrets are encrypted by the disk alone (D-25). */
const OWNER_ONLY = 0o600;

/**
 * Secrets (the BYOK API key) encrypted with the OS keychain's key
 * (safeStorage: Keychain on macOS) in a file of the app's data folder.
 * Nothing is stored when encryption is unavailable.
 */
export class SecretStore {
  constructor(
    private readonly file: string,
    private readonly encryption: Encryption,
  ) {}

  #read(): Record<string, string> {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8')) as Record<string, string>;
    } catch {
      return {};
    }
  }

  get(key: string): string | undefined {
    const stored = this.#read()[key];
    if (!stored || !this.encryption.isEncryptionAvailable()) return undefined;
    try {
      return this.encryption.decryptString(Buffer.from(stored, 'base64'));
    } catch {
      return undefined;
    }
  }

  set(key: string, value: string): boolean {
    if (!this.encryption.isEncryptionAvailable()) return false;
    const all = this.#read();
    all[key] = this.encryption.encryptString(value).toString('base64');
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    writeJsonAtomic(this.file, all, OWNER_ONLY);
    return true;
  }

  delete(key: string): void {
    const all = this.#read();
    if (!(key in all)) return;
    const rest = Object.fromEntries(Object.entries(all).filter(([k]) => k !== key));
    writeJsonAtomic(this.file, rest, OWNER_ONLY);
  }
}
