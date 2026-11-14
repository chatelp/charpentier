import { createReadStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Database } from './database';
import { send } from './http-api';
import { accessFor, credential } from './nix-cache';
import { latestVersion, VERSION } from './updates';
import { receiveUpload } from './uploads';

/**
 * The install key's image (D-31, phase 5.11), kept on the sync server since
 * GitHub's Releases cap a file at 2 GiB:
 *
 *   PUT /api/installer/<version>       the CI sends the image of the version just published,
 *                                      in parts (uploads.ts), X-Checksum-SHA256 required
 *   GET /api/installer/latest          { version, size, sha256, publishedAt }, or 404
 *   GET /api/installer/<version>.iso   the image (Range accepted, to resume)
 *
 * Read by the CI or a device of an account (flash-installer.sh on the Mac).
 * Only the image of the published version is taken, and the last two are kept.
 */

export const INSTALLER_PREFIX = '/api/installer/';
const KEEP = 2;

const folder = (cacheDir: string) => join(cacheDir, 'installer');
const fileOf = (cacheDir: string, version: string) => join(folder(cacheDir), `${version}.iso`);

interface Installer {
  readonly version: string;
  readonly size: number;
  readonly sha256: string;
  readonly publishedAt: string;
}

async function installers(db: Database): Promise<Installer[]> {
  const { rows } = await db.query<{
    version: string;
    size: string | number;
    sha256: string;
    published_at: Date;
  }>('select version, size, sha256, published_at from installers order by published_at desc');
  return rows.map((r) => ({
    version: r.version,
    size: Number(r.size),
    sha256: r.sha256,
    publishedAt: new Date(r.published_at).toISOString(),
  }));
}

/** One range of `bytes=a-b`, `bytes=a-`, `bytes=-n`; null if unsatisfiable. */
export function byteRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === '' && match[2] === '')) return null;
  let start: number;
  let end: number;
  if (match[1] === '') {
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  return start <= end && start < size ? { start, end } : null;
}

/** Answers the install key's image. Returns false for any other path. */
export async function handleInstaller(
  db: Database,
  cacheDir: string | null,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith(INSTALLER_PREFIX)) return false;
  const name = url.pathname.slice(INSTALLER_PREFIX.length);
  const method = request.method ?? 'GET';
  if (!cacheDir) {
    send(response, 404, { error: 'not-found' });
    return true;
  }
  const access = await accessFor(db, credential(request));
  if (!access) {
    send(response, 401, { error: 'not-signed-in' });
    return true;
  }

  if (method === 'GET' && name === 'latest') {
    const latest = (await installers(db))[0];
    send(response, latest ? 200 : 404, latest ?? { error: 'no-installer' });
    return true;
  }

  if (method === 'PUT' && VERSION.test(name)) {
    if (access !== 'ci') {
      send(response, 403, { error: 'ci-only' });
      return true;
    }
    // Nothing that is not published: the image of the version the devices see.
    if ((await latestVersion(db))?.version !== name) {
      send(response, 409, { error: 'not-published' });
      return true;
    }
    const upload = await receiveUpload(request, cacheDir, fileOf(cacheDir, name), {
      requireChecksum: true,
    });
    if (upload.status !== 201) {
      send(
        response,
        upload.status,
        upload.status === 202 ? { received: true } : { error: 'upload' },
      );
      return true;
    }
    await db.query(
      `insert into installers (version, size, sha256) values ($1, $2, $3)
       on conflict (version) do update set size = excluded.size, sha256 = excluded.sha256,
         published_at = now()`,
      [name, upload.size, upload.sha256],
    );
    for (const old of (await installers(db)).slice(KEEP)) {
      await rm(fileOf(cacheDir, old.version), { force: true });
      await db.query('delete from installers where version = $1', [old.version]);
    }
    send(response, 201, (await installers(db))[0]);
    return true;
  }

  const version = /^(.+)\.iso$/.exec(name)?.[1];
  if ((method === 'GET' || method === 'HEAD') && version && VERSION.test(version)) {
    const known = (await installers(db)).some((i) => i.version === version);
    const path = fileOf(cacheDir, version);
    const size = known
      ? await stat(path).then(
          (s) => s.size,
          () => null,
        )
      : null;
    if (size === null) {
      send(response, 404, { error: 'not-found' });
      return true;
    }
    const headers = {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="charpentier-x250-${version}.iso"`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
    };
    const rangeHeader = request.headers.range;
    let start = 0;
    let end = size - 1;
    let status = 200;
    if (rangeHeader) {
      const range = byteRange(rangeHeader, size);
      if (!range) {
        response.writeHead(416, { 'Content-Range': `bytes */${size}` });
        response.end();
        return true;
      }
      ({ start, end } = range);
      status = 206;
    }
    response.writeHead(status, {
      ...headers,
      'Content-Length': String(end - start + 1),
      ...(status === 206 && { 'Content-Range': `bytes ${start}-${end}/${size}` }),
    });
    if (method === 'HEAD') response.end();
    else
      await pipeline(createReadStream(path, { start, end }), response).catch(() =>
        response.destroy(),
      );
    return true;
  }

  send(response, 404, { error: 'not-found' });
  return true;
}
