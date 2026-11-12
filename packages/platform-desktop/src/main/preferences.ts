import fs from 'node:fs';
import path from 'node:path';
import { writeJsonAtomic } from './projects';

/** Small per-device preferences, in one JSON file of the app's data folder. */
export class PreferencesFile {
  #values: Map<string, unknown>;

  constructor(readonly file: string) {
    try {
      const stored = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
      this.#values = new Map(Object.entries(stored));
    } catch {
      this.#values = new Map();
    }
  }

  get(key: string): unknown {
    return this.#values.get(key);
  }

  set(key: string, value: unknown): void {
    if (value === undefined) this.#values.delete(key);
    else this.#values.set(key, value);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    writeJsonAtomic(this.file, Object.fromEntries(this.#values));
  }
}
