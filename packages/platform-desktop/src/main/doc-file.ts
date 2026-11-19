import fs from 'node:fs';
import path from 'node:path';
import * as Y from 'yjs';

/**
 * Durable storage of one Yjs document in a directory (docs/SPEC.md §16):
 *
 *   state.bin    full state at the last compaction, replaced atomically
 *                (temporary file + fsync + rename);
 *   journal.bin  every update since, appended as
 *                [uint32 length | CHECKED][uint32 CRC-32 of the bytes][bytes].
 *                Journals written before the checksum hold
 *                [uint32 length][bytes] records: both are read, in any mix
 *                (a length never reaches the CHECKED bit).
 *
 * Each update is written to the journal with a synchronous write before the
 * call returns: once in the operating system's buffers it survives a killed
 * process. `fsync` follows shortly after (power loss). Yjs updates are
 * idempotent and commutative, so replaying the journal on top of a state
 * that already contains some of it is harmless.
 *
 * Loading stops at the first record that is torn (crash in the middle of a
 * write), fails its checksum (zeros or garbage after a power loss, a partial
 * record followed by later ones after a full disk) or cannot be applied.
 * Everything before it is kept; the rest is moved to a sibling file
 * `journal.damaged-<date>.bin`, never deleted, and the document opens.
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
      const { updates, ends } = readJournal(journal);
      let validBytes = 0;
      for (const [index, update] of updates.entries()) {
        try {
          Y.applyUpdate(doc, update, origin);
        } catch (error) {
          console.error(`Charpentier: a journal record cannot be applied: ${this.#journal}`, error);
          break;
        }
        validBytes = ends[index] ?? validBytes;
      }
      // The next append must start on a record boundary.
      if (validBytes < journal.length) this.#setAside(journal.subarray(validBytes), validBytes);
      this.#journalBytes = validBytes;
    }
    this.#fd = fs.openSync(this.#journal, 'a');
  }

  /** Moves the unreadable end of the journal to a file of its own, durably, then cuts it off. */
  #setAside(tail: Uint8Array, validBytes: number) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    let aside = path.join(this.dir, `journal.damaged-${stamp}.bin`);
    for (let n = 2; fs.existsSync(aside); n++)
      aside = path.join(this.dir, `journal.damaged-${stamp}-${n}.bin`);
    const fd = fs.openSync(aside, 'wx');
    try {
      fs.writeSync(fd, tail);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    syncDirectory(this.dir);
    fs.truncateSync(this.#journal, validBytes);
    console.error(
      `Charpentier: the journal ${this.#journal} is damaged after ${validBytes} bytes; ` +
        `the document opens with what precedes, the ${tail.length} following bytes are kept in ${aside}`,
    );
  }

  /** Appends one update; returns once the bytes are in the operating system's hands. */
  append(update: Uint8Array): void {
    if (this.#fd === undefined) throw new Error(`Document file not loaded: ${this.dir}`);
    if (update.length === 0 || update.length >= CHECKED)
      throw new Error(`Not a storable update (${update.length} bytes): ${this.dir}`);
    const record = Buffer.alloc(HEADER_BYTES + update.length);
    record.writeUInt32LE((update.length | CHECKED) >>> 0, 0);
    record.writeUInt32LE(crc32(update), 4);
    record.set(update, HEADER_BYTES);
    try {
      let written = 0;
      while (written < record.length)
        written += fs.writeSync(this.#fd, record, written, record.length - written);
    } catch (error) {
      // A full disk may leave part of the record: cut it off, or the records
      // appended after it would no longer be found.
      try {
        fs.ftruncateSync(this.#fd, this.#journalBytes);
      } catch {
        // The load will stop there and set the rest aside.
      }
      throw error;
    }
    this.#journalBytes += record.length;
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

/** Bit of a record's first word saying that a checksum follows (lengths stay below it). */
const CHECKED = 0x80000000;
const HEADER_BYTES = 8;

/**
 * The records of a journal up to the first one that is incomplete or does
 * not hold an update (wrong checksum; for a record without checksum, bytes
 * that Yjs cannot decode), where each one ends, and how many bytes they span.
 */
export function readJournal(journal: Uint8Array): {
  updates: Uint8Array[];
  ends: number[];
  validBytes: number;
} {
  const updates: Uint8Array[] = [];
  const ends: number[] = [];
  const view = new DataView(journal.buffer, journal.byteOffset, journal.byteLength);
  let offset = 0;
  while (offset + 4 <= journal.length) {
    const word = view.getUint32(offset, true);
    const checked = word >= CHECKED;
    const length = checked ? word - CHECKED : word;
    const start = offset + (checked ? HEADER_BYTES : 4);
    const end = start + length;
    // An update is never empty: a zero length is a zero-filled tail.
    if (length === 0 || end > journal.length) break;
    const update = journal.subarray(start, end);
    if (checked ? view.getUint32(offset + 4, true) !== crc32(update) : !decodes(update)) break;
    updates.push(update);
    ends.push(end);
    offset = end;
  }
  return { updates, ends, validBytes: offset };
}

/** Whether Yjs can read these bytes as an update (all a record without checksum can prove). */
function decodes(update: Uint8Array): boolean {
  try {
    Y.decodeUpdate(update);
    return true;
  } catch {
    return false;
  }
}

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

/** CRC-32 (IEEE 802.3, as zlib's). */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
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
