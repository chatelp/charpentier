import type { PreferencesService } from '@charpentier/platform';

const PREFIX = 'charpentier:pref:';

/**
 * Preferences in localStorage. Storage can be missing or throw (private
 * browsing, blocked site data): preferences are a convenience, so failures
 * fall back to an in-memory copy and never break the app.
 */
export class LocalStoragePreferences implements PreferencesService {
  readonly #fallback = new Map<string, string>();

  constructor(private readonly storage: Storage | undefined = globalThis.localStorage) {}

  async get<T>(key: string): Promise<T | undefined> {
    const raw = this.#read(PREFIX + key);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    const raw = JSON.stringify(value);
    this.#fallback.set(PREFIX + key, raw);
    try {
      this.storage?.setItem(PREFIX + key, raw);
    } catch {
      // Keep the in-memory copy only.
    }
  }

  #read(key: string): string | null {
    try {
      const value = this.storage?.getItem(key);
      if (value !== null && value !== undefined) return value;
    } catch {
      // Fall through to the in-memory copy.
    }
    return this.#fallback.get(key) ?? null;
  }
}
