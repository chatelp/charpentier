import type { IncomingMessage, ServerResponse } from 'node:http';
import { listSessions, login, revokeSession, sessionFor, type Session } from './accounts';
import type { Database } from './database';

/**
 * The server's HTTP API (D-21), next to the WebSocket of the sync:
 *
 *   POST   /api/login          { email, password, device } → { token, userId, sessionId }
 *                               with `cookie: true` (the browser, phase 4.7 a): the token goes
 *                               in a cookie the page cannot read, never in the body
 *   POST   /api/logout         signs this device out
 *   GET    /api/account        { userId, email } of the signed-in device
 *   GET    /api/devices        the devices signed in to the account
 *   DELETE /api/devices/:id    signs a device out
 *   GET    /api/health         « ok », for the container's health check
 *
 * Every route but login and health needs `Authorization: Bearer <token>`,
 * or, from the app's own pages, its cookie.
 */

/** Sign-in attempts allowed per address and e-mail in a window. */
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60_000;
const MAX_BODY = 10_000;

export class LoginLimiter {
  static readonly MAX_ATTEMPTS = MAX_ATTEMPTS;
  readonly #attempts = new Map<string, { count: number; until: number }>();

  /** Attempts made in the current window (the log tells repeated refusals). */
  attempts(key: string): number {
    const entry = this.#attempts.get(key);
    return entry && entry.until > this.now() ? entry.count : 0;
  }

  constructor(private readonly now: () => number = Date.now) {}

  /** True if this attempt may go ahead (and counts it). */
  allow(key: string): boolean {
    const now = this.now();
    const entry = this.#attempts.get(key);
    if (!entry || entry.until <= now) {
      this.#attempts.set(key, { count: 1, until: now + WINDOW_MS });
      return true;
    }
    entry.count++;
    return entry.count <= MAX_ATTEMPTS;
  }

  /** A successful sign-in forgets the failed ones. */
  reset(key: string): void {
    this.#attempts.delete(key);
  }
}

export function send(response: ServerResponse, status: number, body?: unknown) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(body === undefined ? '' : JSON.stringify(body));
}

export function readJson(
  request: IncomingMessage,
  max = MAX_BODY,
): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > max) request.destroy();
      else chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(
          typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null,
        );
      } catch {
        resolve(null);
      }
    });
    request.on('error', () => resolve(null));
    // Destroyed for its size: no `end`, only `close`.
    request.on('close', () => resolve(null));
  });
}

export const bearer = (request: IncomingMessage) =>
  /^Bearer (\S+)$/.exec(request.headers.authorization ?? '')?.[1] ?? '';

/**
 * The browser's session (phase 4.7 a): `HttpOnly` (the page never reads the
 * token), `Secure`, `SameSite=Strict`, for this host only (`__Host-`).
 */
export const WEB_COOKIE = '__Host-charpentier';
/** What the browser's sync provider sends instead of a token: « read my cookie ». */
export const COOKIE_TOKEN = 'cookie';
const YEAR = 365 * 24 * 3600;

export const webCookie = (token: string, maxAge = YEAR) =>
  `${WEB_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

/** The token in a Cookie header, if any. */
export function cookieToken(header: string | null | undefined): string {
  for (const part of (header ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === WEB_COOKIE) return value.join('=');
  }
  return '';
}

/**
 * A request from the app's own pages: the browser says so (Sec-Fetch-Site),
 * or its Origin is this host. Without either (a script, a test), it passes:
 * the cookie alone is what a forged cross-site request would carry, and
 * SameSite=Strict already keeps it home.
 */
export function sameOrigin(headers: {
  readonly origin?: string | null;
  readonly host?: string | null;
  readonly site?: string | null;
}): boolean {
  if (headers.site) return headers.site === 'same-origin' || headers.site === 'none';
  if (!headers.origin) return true;
  try {
    return new URL(headers.origin).host === headers.host;
  } catch {
    return false;
  }
}

const requestOrigin = (request: IncomingMessage) => ({
  origin: request.headers.origin ?? null,
  host: request.headers.host ?? null,
  site: (request.headers['sec-fetch-site'] as string | undefined) ?? null,
});

/** The device's token: its Authorization header, or the browser's cookie from the app's pages. */
export const requestToken = (request: IncomingMessage) =>
  bearer(request) ||
  (sameOrigin(requestOrigin(request)) ? cookieToken(request.headers.cookie) : '');

/**
 * Handles a request of the API. Returns false when the path is not the
 * API's (Hocuspocus answers it then).
 */
export async function handleApi(
  db: Database,
  limiter: LoginLimiter,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return false;
  const route = `${request.method ?? 'GET'} ${url.pathname}`;

  if (route === 'GET /api/health') {
    send(response, 200, { ok: true });
    return true;
  }

  if (route === 'POST /api/login') {
    const body = await readJson(request);
    const email = typeof body?.['email'] === 'string' ? body['email'] : '';
    const password = typeof body?.['password'] === 'string' ? body['password'] : '';
    const device = typeof body?.['device'] === 'string' ? body['device'] : '';
    const inCookie = body?.['cookie'] === true;
    if (inCookie && !sameOrigin(requestOrigin(request))) {
      send(response, 403, { error: 'other-site' });
      return true;
    }
    if (!email || !password) {
      send(response, 400, { error: 'email-and-password' });
      return true;
    }
    const key = `${request.socket.remoteAddress ?? ''}|${email.trim().toLowerCase()}`;
    if (!limiter.allow(key)) {
      send(response, 429, { error: 'too-many-attempts' });
      return true;
    }
    const result = await login(db, email, password, device);
    if (!result) {
      send(response, 401, { error: 'invalid-credentials' });
      return true;
    }
    limiter.reset(key);
    if (inCookie) {
      response.setHeader('Set-Cookie', webCookie(result.token));
      send(response, 200, { userId: result.userId, sessionId: result.sessionId });
    } else send(response, 200, result);
    return true;
  }

  const token = requestToken(request);
  const session: Session | null = await sessionFor(db, token);
  // A cookie that no longer opens anything is forgotten.
  if (!session && !bearer(request) && token) response.setHeader('Set-Cookie', webCookie('', 0));
  if (!session) {
    send(response, 401, { error: 'not-signed-in' });
    return true;
  }
  if (route === 'POST /api/logout') {
    await revokeSession(db, session.userId, session.sessionId);
    if (!bearer(request)) response.setHeader('Set-Cookie', webCookie('', 0));
    send(response, 204);
  } else if (route === 'GET /api/account') {
    const { rows } = await db.query<{ email: string }>('select email from users where id = $1', [
      session.userId,
    ]);
    send(response, 200, { userId: session.userId, email: rows[0]?.email ?? '' });
  } else if (route === 'GET /api/devices') {
    const devices = await listSessions(db, session.userId);
    send(response, 200, {
      devices: devices.map((d) => ({ ...d, current: d.id === session.sessionId })),
    });
  } else if (request.method === 'DELETE' && url.pathname.startsWith('/api/devices/')) {
    const id = decodeURIComponent(url.pathname.slice('/api/devices/'.length));
    const revoked = /^[0-9a-f-]{36}$/.test(id) && (await revokeSession(db, session.userId, id));
    send(response, revoked ? 204 : 404);
  } else {
    send(response, 404, { error: 'not-found' });
  }
  return true;
}
