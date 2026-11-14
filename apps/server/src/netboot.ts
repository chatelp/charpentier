import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Database } from './database';
import { send } from './http-api';
import { byteRange } from './installer';
import { accessFor, credential } from './nix-cache';
import { latestVersion, VERSION } from './updates';
import { receiveUpload } from './uploads';

/**
 * The X250 installed over the network (docs/PLAN.md phase 5.9 ter, D-32).
 * Pixiecore, on the home network and off by default, asks this server what to
 * boot for each machine that starts on the network (its API mode):
 *
 *   GET /netboot/<secret>/v1/boot/<mac>        { kernel, initrd, cmdline }, for the X250 only
 *   GET /netboot/<secret>/files/<version>/<f>  the kernel or the initrd (Range accepted)
 *   PUT /api/netboot/<version>/<f>             the CI sends them, for the version published
 *
 * Only Pixiecore reaches the first two, straight from the host: a request that
 * came through the proxy (X-Forwarded-For) never gets them, nor one without
 * the secret, nor a machine whose MAC is not declared. The installer erases
 * a disk: these are its guards, ⏎ ⏎ on the X250 the last one.
 */

export const NETBOOT_PREFIX = '/netboot/';
export const NETBOOT_UPLOAD_PREFIX = '/api/netboot/';
const FILES = ['bzImage', 'initrd', 'cmdline'] as const;
type NetbootFile = (typeof FILES)[number];

export interface NetbootOptions {
  /** The secret in Pixiecore's API address; without it, no network boot. */
  readonly secret: string | null;
  /** The MAC addresses that may boot the installer (the X250's). */
  readonly macs: readonly string[];
}

/** `AA-BB-…`, `aabb…` or `aa:bb:…`: one spelling, lowercase with colons. */
export function normalizeMac(mac: string): string | null {
  const hex = mac.toLowerCase().replace(/[^0-9a-f]/g, '');
  return hex.length === 12 ? (hex.match(/../g) ?? []).join(':') : null;
}

const folder = (cacheDir: string, version: string) => join(cacheDir, 'netboot', version);

async function exists(path: string): Promise<number | null> {
  try {
    const info = await stat(path);
    return info.isFile() ? info.size : null;
  } catch {
    return null;
  }
}

/** Answers the network boot. Returns false for any other path. */
export async function handleNetboot(
  db: Database,
  cacheDir: string | null,
  options: NetbootOptions,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const method = request.method ?? 'GET';
  const answer = (status: number, body: unknown) => {
    send(response, status, body);
    return true;
  };

  // The CI sends the kernel, the initrd and the command line of the version published.
  if (url.pathname.startsWith(NETBOOT_UPLOAD_PREFIX)) {
    const [version, file] = url.pathname.slice(NETBOOT_UPLOAD_PREFIX.length).split('/');
    if (
      !cacheDir ||
      method !== 'PUT' ||
      !version ||
      !VERSION.test(version) ||
      !FILES.includes(file as NetbootFile)
    )
      return answer(404, { error: 'not-found' });
    const access = await accessFor(db, credential(request));
    if (access !== 'ci') return answer(access ? 403 : 401, { error: 'ci-only' });
    if ((await latestVersion(db))?.version !== version)
      return answer(409, { error: 'not-published' });
    const target = join(folder(cacheDir, version), file ?? '');
    const upload = await receiveUpload(request, cacheDir, target);
    return answer(upload.status, upload.status === 201 ? { version, file } : {});
  }

  if (!url.pathname.startsWith(NETBOOT_PREFIX)) return false;
  const [secret, ...rest] = url.pathname.slice(NETBOOT_PREFIX.length).split('/');
  // Nothing to say to anyone else: the same 404 whatever is wrong.
  const nothing = () => answer(404, { error: 'not-found' });
  if (
    !cacheDir ||
    !options.secret ||
    secret !== options.secret ||
    request.headers['x-forwarded-for'] !== undefined ||
    (method !== 'GET' && method !== 'HEAD')
  )
    return nothing();

  // Pixiecore's question, for a machine starting on the network.
  if (rest[0] === 'v1' && rest[1] === 'boot' && rest[2]) {
    const mac = normalizeMac(decodeURIComponent(rest[2]));
    const allowed = new Set(options.macs.map(normalizeMac).filter((m) => m !== null));
    if (!mac || !allowed.has(mac)) return nothing();
    const version = (await latestVersion(db))?.version;
    if (!version) return nothing();
    const dir = folder(cacheDir, version);
    if (
      (await exists(join(dir, 'bzImage'))) === null ||
      (await exists(join(dir, 'initrd'))) === null
    )
      return nothing();
    const cmdline =
      (await exists(join(dir, 'cmdline'))) === null
        ? ''
        : (await readFile(join(dir, 'cmdline'), 'utf8')).trim();
    // Pixiecore fetches them from here, then serves them to the machine itself.
    const base = `http://${request.headers.host ?? 'localhost'}${NETBOOT_PREFIX}${secret}/files/${version}`;
    return answer(200, { kernel: `${base}/bzImage`, initrd: [`${base}/initrd`], cmdline });
  }

  // The files themselves.
  if (
    rest[0] === 'files' &&
    rest[1] &&
    VERSION.test(rest[1]) &&
    FILES.includes(rest[2] as NetbootFile)
  ) {
    const path = join(folder(cacheDir, rest[1]), rest[2] ?? '');
    const size = await exists(path);
    if (size === null) return nothing();
    let start = 0;
    let end = size - 1;
    let status = 200;
    if (request.headers.range) {
      const range = byteRange(request.headers.range, size);
      if (!range) {
        response.writeHead(416, { 'Content-Range': `bytes */${size}` });
        response.end();
        return true;
      }
      ({ start, end } = range);
      status = 206;
    }
    response.writeHead(status, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
      ...(status === 206 && { 'Content-Range': `bytes ${start}-${end}/${size}` }),
    });
    if (method === 'HEAD') response.end();
    else
      await pipeline(createReadStream(path, { start, end }), response).catch(() =>
        response.destroy(),
      );
    return true;
  }
  return nothing();
}

/** For the tests: places a version's files as the CI would. */
export async function placeNetbootFiles(
  cacheDir: string,
  version: string,
  files: Partial<Record<NetbootFile, string | Uint8Array>>,
): Promise<void> {
  await mkdir(folder(cacheDir, version), { recursive: true });
  for (const [name, content] of Object.entries(files))
    await writeFile(join(folder(cacheDir, version), name), content);
}
