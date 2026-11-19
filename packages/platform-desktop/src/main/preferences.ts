import fs from 'node:fs';
import path from 'node:path';
import { writeJsonAtomic } from './projects';

/** How long a changed preference may wait before it reaches the disk. */
const FLUSH_DELAY_MS = 5000;

/**
 * Small per-device preferences, in one JSON file of the app's data folder.
 *
 * The values live in memory. The interface saves some of them while the author
 * types (the words of the day, the scene being written): a change is written
 * at most every few seconds, off the main thread's back (no synchronous
 * fsync), and `flush` writes what is left at once (quitting, a choice that
 * must not be lost).
 */
export class PreferencesFile {
  #values: Map<string, unknown>;
  /** Changes not on disk yet. */
  #dirty = false;
  #timer: ReturnType<typeof setTimeout> | null = null;
  /** Counts the writes started: a deferred write overtaken by a later one gives up. */
  #writes = 0;
  #writing: Promise<void> | null = null;

  constructor(
    readonly file: string,
    private readonly delayMs = FLUSH_DELAY_MS,
  ) {
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
    // The same value again (the interface saves on a timer): nothing to write.
    if (JSON.stringify(value) === JSON.stringify(this.#values.get(key))) return;
    if (value === undefined) this.#values.delete(key);
    else this.#values.set(key, value);
    this.#dirty = true;
    this.#schedule();
  }

  /** Writes what has changed, now and for sure (fsync): on quitting, after a choice of the author. */
  flush(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    if (!this.#dirty) return;
    this.#dirty = false;
    this.#writes++;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      writeJsonAtomic(this.file, Object.fromEntries(this.#values));
    } catch (error) {
      this.#dirty = true;
      throw error;
    }
  }

  /** Resolves once no deferred write is running (tests). */
  async settled(): Promise<void> {
    while (this.#writing) await this.#writing;
  }

  #schedule() {
    if (this.#timer || this.#writing) return;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#writing = this.#write().finally(() => {
        this.#writing = null;
        // Changed again while writing: the next write takes it.
        if (this.#dirty) this.#schedule();
      });
    }, this.delayMs);
    // Quitting flushes: the timer never keeps the app alive.
    this.#timer.unref();
  }

  /** The deferred write: the same atomic replacement, without blocking the process. */
  async #write(): Promise<void> {
    if (!this.#dirty) return;
    this.#dirty = false;
    const write = ++this.#writes;
    const content = `${JSON.stringify(Object.fromEntries(this.#values), null, 2)}\n`;
    // Its own temporary file: `flush` may write through the other one meanwhile.
    const temporary = `${this.file}.${write}.tmp`;
    try {
      await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
      const handle = await fs.promises.open(temporary, 'w');
      try {
        await handle.writeFile(content);
        await handle.sync();
      } finally {
        await handle.close();
      }
      // A later write (a flush) is already on disk: this one is out of date.
      if (write !== this.#writes) await fs.promises.rm(temporary, { force: true });
      else await fs.promises.rename(temporary, this.file);
    } catch (error) {
      if (write === this.#writes) this.#dirty = true;
      await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
      console.error('Charpentier: the preferences could not be saved', error);
    }
  }
}
