import fs from 'node:fs';
import path from 'node:path';
import * as Y from 'yjs';

/**
 * Durable storage of one Yjs document in a directory (docs/SPEC.md §16):
 *
 *   state.bin    full state at the last compaction, replaced atomically
 *                (temporary file + fsync + rename);
 *   journal.bin  every update since, appended as [uint32 length][bytes].
 *
 * Each update is written to the journal with a synchronous write before the
 * call returns: once in the operating system's buffers it survives a killed
 * process. `fsync` follows shortly after (power loss). A torn last record
 * (crash in the middle of a write) is ignored on load: Yjs updates are
 * idempotent and commutative, so replaying the journal on top of a state
 * that already contains some of it is harmless.
 */
export class DocFile {
  #fd: number | undefined;
  #journalBytes = 0;
  #syncTimer: ReturnType<typeof setTimeout> | undefined;

  readonly dir: string;
  readonly #options: { compactAfterBytes?: number; syncDelayMs?: number };

  // No parameter properties: this file also runs under Node's type stripping (crash test).
  constructor(dir: string, options: { compactAfterBytes?: number; syncDelayMs?: number } = {}) {
    this.dir = dir;
    this.#options = options;
  }

  get #state() {
    return path.join(this.dir, 'state.bin');
  }

  get #journal() {
    return path.join(this.dir, 'journal.bin');
  }

  /** Applies everything stored to `doc` (with `origin`), then opens the journal for appends. */
  load(doc: Y.Doc, origin: unknown): void {
    fs.mkdirSync(this.dir, { recursive: true });
    if (fs.existsSync(this.#state)) Y.applyUpdate(doc, fs.readFileSync(this.#state), origin);
    if (fs.existsSync(this.#journal)) {
      const journal = fs.readFileSync(this.#journal);
      const { updates, validBytes } = readJournal(journal);
      for (const update of updates) Y.applyUpdate(doc, update, origin);
      // Drop a torn tail so that the next append starts on a record boundary.
      if (validBytes < journal.length) fs.truncateSync(this.#journal, validBytes);
      this.#journalBytes = validBytes;
    }
    this.#fd = fs.openSync(this.#journal, 'a');
  }

  /** Appends one update; returns once the bytes are in the operating system's hands. */
  append(update: Uint8Array): void {
    if (this.#fd === undefined) throw new Error(`Document file not loaded: ${this.dir}`);
    const header = Buffer.alloc(4);
    header.writeUInt32LE(update.length, 0);
    fs.writeSync(this.#fd, Buffer.concat([header, update]));
    this.#journalBytes += 4 + update.length;
    this.#scheduleSync();
  }

  get journalBytes(): number {
    return this.#journalBytes;
  }

  get shouldCompact(): boolean {
    return this.#journalBytes > (this.#options.compactAfterBytes ?? 512 * 1024);
  }

  /** Writes the full state atomically, then empties the journal. */
  compact(doc: Y.Doc): void {
    const temporary = `${this.#state}.tmp`;
    const fd = fs.openSync(temporary, 'w');
    try {
      fs.writeSync(fd, Y.encodeStateAsUpdate(doc));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temporary, this.#state);
    syncDirectory(this.dir);
    // A crash here leaves a journal already contained in the state: harmless.
    if (this.#fd !== undefined) {
      fs.ftruncateSync(this.#fd, 0);
      fs.fsyncSync(this.#fd);
    }
    this.#journalBytes = 0;
  }

  close(doc: Y.Doc): void {
    if (this.#fd === undefined) return;
    this.compact(doc);
    clearTimeout(this.#syncTimer);
    fs.closeSync(this.#fd);
    this.#fd = undefined;
  }

  #scheduleSync() {
    if (this.#syncTimer) return;
    this.#syncTimer = setTimeout(() => {
      this.#syncTimer = undefined;
      if (this.#fd !== undefined) fs.fsyncSync(this.#fd);
    }, this.#options.syncDelayMs ?? 300);
  }
}

/** Complete records of a journal, and how many bytes they span. */
export function readJournal(journal: Uint8Array): { updates: Uint8Array[]; validBytes: number } {
  const updates: Uint8Array[] = [];
  const view = new DataView(journal.buffer, journal.byteOffset, journal.byteLength);
  let offset = 0;
  while (offset + 4 <= journal.length) {
    const length = view.getUint32(offset, true);
    if (offset + 4 + length > journal.length) break;
    updates.push(journal.subarray(offset + 4, offset + 4 + length));
    offset += 4 + length;
  }
  return { updates, validBytes: offset };
}

/** Makes a rename durable (the directory entry itself). */
function syncDirectory(dir: string) {
  let fd: number | undefined;
  try {
    fd = fs.openSync(dir, 'r');
    fs.fsyncSync(fd);
  } catch {
    // Not supported everywhere (Windows); the rename is still atomic.
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
