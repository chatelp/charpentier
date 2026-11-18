import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { sessionFor } from './accounts';
import { isCiToken } from './ci-tokens';
import type { Database } from './database';
import { decodePath } from './http-api';
import { receiveUpload } from './uploads';

/**
 * The X250's binary cache (D-31, phase 5.11): a standard Nix HTTP binary
 * cache under /nix-cache, its files on the server's disk. The CI writes
 * (PUT) the signed systems, a large file in parts (uploads.ts: Cloudflare caps
 * a request at 100 MB); the account's devices read (GET, HEAD) them, and
 * nothing else does: the cache is not public.
 *
 * Nix authenticates with a netrc file, so a token is accepted as the password
 * of HTTP Basic (any login), or as a Bearer token.
 */

export const CACHE_PREFIX = '/nix-cache/';

/** What a Nix client reads first. */
const CACHE_INFO = 'StoreDir: /nix/store\nWantMassQuery: 1\nPriority: 40\n';

/**
 * The files of a cache: `<hash>.narinfo`, `<hash>.ls`, and the files under
 * `nar/`, `log/`, `realisations/`, `debuginfo/`. Nothing else, no `..`.
 */
const CACHE_FILE =
  /^(?:[0-9a-z]{32}\.(?:narinfo|ls)|(?:nar|log|realisations|debuginfo)\/[A-Za-z0-9_+=:!-][A-Za-z0-9._+=:!-]{0,250})$/;

/** A store path, as a version names its systems. */
export const STORE_PATH = /^\/nix\/store\/([0-9a-z]{32})-[A-Za-z0-9._+?=-]{1,200}$/;

/** The token of a request: HTTP Basic's password, or Bearer. */
export function credential(request: IncomingMessage): string {
  const header = request.headers.authorization ?? '';
  const basic = /^Basic ([A-Za-z0-9+/=]+)$/.exec(header)?.[1];
  if (basic) {
    const decoded = Buffer.from(basic, 'base64').toString('utf8');
    const colon = decoded.indexOf(':');
    return colon >= 0 ? decoded.slice(colon + 1) : '';
  }
  return /^Bearer (\S+)$/.exec(header)?.[1] ?? '';
}

export type Access = 'ci' | 'device' | null;

/** Who a token is: the CI, a device of an account, or nobody. */
export async function accessFor(db: Database, token: string): Promise<Access> {
  if (!token) return null;
  if (await isCiToken(db, token)) return 'ci';
  return (await sessionFor(db, token)) ? 'device' : null;
}

/** Whether the cache holds a store path (its `.narinfo`). */
export async function hasStorePath(cacheDir: string, path: string): Promise<boolean> {
  const hash = STORE_PATH.exec(path)?.[1];
  if (!hash) return false;
  try {
    return (await stat(join(cacheDir, `${hash}.narinfo`))).isFile();
  } catch {
    return false;
  }
}

function plain(response: ServerResponse, status: number, headers: Record<string, string> = {}) {
  response.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  response.end();
}

const contentType = (file: string) =>
  file.endsWith('.narinfo')
    ? 'text/x-nix-narinfo'
    : file.endsWith('.ls')
      ? 'application/json'
      : 'application/octet-stream';

/**
 * Answers a request of the cache. Returns false when the path is not the
 * cache's. Without a cache directory (`cacheDir` null), the cache does not
 * exist.
 */
export async function handleCache(
  db: Database,
  cacheDir: string | null,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith(CACHE_PREFIX)) return false;
  if (!cacheDir) {
    plain(response, 404);
    return true;
  }
  const method = request.method ?? 'GET';
  const access = await accessFor(db, credential(request));
  if (!access) {
    plain(response, 401, { 'WWW-Authenticate': 'Basic realm="charpentier"' });
    return true;
  }
  // Decoded after the token: a malformed path (`%FF`) is a bad request, not a crash.
  const file = decodePath(url.pathname.slice(CACHE_PREFIX.length));
  if (file === null) {
    plain(response, 400);
    return true;
  }

  if (file === 'nix-cache-info' && (method === 'GET' || method === 'HEAD')) {
    response.writeHead(200, {
      'Content-Type': 'text/x-nix-cache-info',
      'Content-Length': String(Buffer.byteLength(CACHE_INFO)),
    });
    response.end(method === 'HEAD' ? undefined : CACHE_INFO);
    return true;
  }
  if (!CACHE_FILE.test(file)) {
    plain(response, 404);
    return true;
  }
  const path = join(cacheDir, file);

  if (method === 'GET' || method === 'HEAD') {
    let size: number;
    try {
      const info = await stat(path);
      if (!info.isFile()) throw new Error('not a file');
      size = info.size;
    } catch {
      plain(response, 404);
      return true;
    }
    response.writeHead(200, {
      'Content-Type': contentType(file),
      'Content-Length': String(size),
      // A file of the cache never changes: its name is its content's hash.
      'Cache-Control': 'private, max-age=31536000, immutable',
    });
    if (method === 'HEAD') response.end();
    else await pipeline(createReadStream(path), response).catch(() => response.destroy());
    return true;
  }

  if (method === 'PUT') {
    if (access !== 'ci') {
      plain(response, 403);
      return true;
    }
    // Whole, or in parts under Cloudflare's limit (uploads.ts).
    const upload = await receiveUpload(request, cacheDir, path);
    plain(response, upload.status);
    return true;
  }

  plain(response, 405, { Allow: 'GET, HEAD, PUT' });
  return true;
}
