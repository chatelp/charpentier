import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';

/**
 * Files the CI sends to the server (D-31): a cache's NAR, the install key's
 * image. Cloudflare, in front of the server, refuses a request body over
 * 100 MB, so a large file comes in parts of at most 95 MB, on the same path:
 *
 *   X-Part: <n>/<total>             this part, 1-based (absent: the whole file at once)
 *   X-Checksum-SHA256: <hex>        the whole file's SHA-256 (required with parts)
 *
 * Each part is kept until all have come (202), then the file is assembled,
 * checked against its SHA-256 (409 if wrong, and the parts are dropped),
 * and renamed into place (201). A part may be sent again. A reader never
 * sees half a file.
 */

/** Under Cloudflare's 100 MB. */
export const MAX_PART = 95 * 1024 ** 2;
/** The largest file (an image, a NAR). */
export const MAX_FILE = 8 * 1024 ** 3;
const MAX_PARTS = Math.ceil(MAX_FILE / MAX_PART);
/** Parts left without their siblings for a day are dropped. */
const STALE_MS = 24 * 60 * 60_000;
const PARTS = '.parts';

export interface Upload {
  readonly status: 201 | 202 | 400 | 409 | 413;
  /** The file's SHA-256, once it is in place. */
  readonly sha256?: string;
  readonly size?: number;
}

/** The SHA-256 announced by a request, or null. */
export function announcedChecksum(request: IncomingMessage): string | null {
  const value = request.headers['x-checksum-sha256'];
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) ? value : null;
}

/** Writes a request's body to a file, at most `max` bytes; returns its SHA-256 and size. */
async function writeBody(
  request: IncomingMessage,
  file: string,
  max: number,
): Promise<{ sha256: string; size: number } | 'too-large' | 'failed'> {
  const hash = createHash('sha256');
  let size = 0;
  request.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > max) request.destroy(new Error('too large'));
    else hash.update(chunk);
  });
  try {
    await pipeline(request, createWriteStream(file));
    return { sha256: hash.digest('hex'), size };
  } catch {
    await rm(file, { force: true });
    return size > max ? 'too-large' : 'failed';
  }
}

async function dropStaleParts(root: string) {
  const dir = join(root, PARTS);
  const now = Date.now();
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    const info = await stat(join(dir, name)).catch(() => null);
    if (info && now - info.mtimeMs > STALE_MS)
      await rm(join(dir, name), { recursive: true, force: true });
  }
}

/**
 * Receives a file, whole or in parts, into `target`. `root` holds the files
 * being received: on the same disk as the target, so that renaming is atomic.
 */
export async function receiveUpload(
  request: IncomingMessage,
  root: string,
  target: string,
  { requireChecksum = false }: { requireChecksum?: boolean } = {},
): Promise<Upload> {
  const announced = announcedChecksum(request);
  const header = request.headers['x-part'];
  if (request.headers['x-checksum-sha256'] !== undefined && !announced) return { status: 400 };
  if (Number(request.headers['content-length'] ?? 0) > MAX_FILE) return { status: 413 };
  await mkdir(dirname(target), { recursive: true });

  // The whole file at once.
  if (header === undefined) {
    if (requireChecksum && !announced) return { status: 400 };
    const temporary = join(root, `.upload-${randomUUID()}`);
    const body = await writeBody(request, temporary, MAX_FILE);
    if (body === 'too-large') return { status: 413 };
    if (body === 'failed') return { status: 400 };
    if (announced && body.sha256 !== announced) {
      await rm(temporary, { force: true });
      return { status: 409 };
    }
    await rename(temporary, target);
    return { status: 201, ...body };
  }

  // A part.
  const match = typeof header === 'string' ? /^(\d{1,4})\/(\d{1,4})$/.exec(header) : null;
  const part = Number(match?.[1]);
  const total = Number(match?.[2]);
  if (!match || !announced || part < 1 || part > total || total > MAX_PARTS) return { status: 400 };
  if (Number(request.headers['content-length'] ?? 0) > MAX_PART) return { status: 413 };
  await dropStaleParts(root);
  const dir = join(root, PARTS, `${announced}-${total}`);
  await mkdir(dir, { recursive: true });
  const temporary = join(dir, `.${part}-${randomUUID()}`);
  const body = await writeBody(request, temporary, MAX_PART);
  if (body === 'too-large') return { status: 413 };
  if (body === 'failed') return { status: 400 };
  await rename(temporary, join(dir, String(part)));

  const done = (await readdir(dir)).filter((name) => /^\d+$/.test(name));
  if (done.length < total) return { status: 202 };
  // The last part: one request assembles, the others (if any) wait their turn.
  try {
    await mkdir(`${dir}.assembling`);
  } catch {
    return { status: 202 };
  }
  try {
    const assembled = join(root, `.upload-${randomUUID()}`);
    const hash = createHash('sha256');
    const out = createWriteStream(assembled);
    let size = 0;
    for (let n = 1; n <= total; n++) {
      const input = createReadStream(join(dir, String(n)));
      input.on('data', (chunk: Buffer | string) => {
        const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        size += bytes.length;
        hash.update(bytes);
      });
      await pipeline(input, out, { end: false });
    }
    await new Promise<void>((resolve, reject) =>
      out.end((error?: Error | null) => (error ? reject(error) : resolve())),
    );
    const sha256 = hash.digest('hex');
    if (sha256 !== announced) {
      await rm(assembled, { force: true });
      return { status: 409 };
    }
    await rename(assembled, target);
    return { status: 201, sha256, size };
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(`${dir}.assembling`, { recursive: true, force: true });
  }
}
