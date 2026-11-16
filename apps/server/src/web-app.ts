import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';

/**
 * The app in the browser (docs/PLAN.md phase 4.7 a), served by the sync
 * server itself on its public address: the files Vite built (`apps/web`),
 * whatever path the other handlers left. A path without an extension is the
 * app (`index.html`); the hashed assets are kept for a year by the browser.
 */

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.aff': 'text/plain; charset=utf-8',
  '.dic': 'text/plain; charset=utf-8',
};

/**
 * Strict headers: everything from this origin only (the sync's WebSocket
 * included), nothing framed, no inline script. Inline style stays allowed:
 * the editor injects its own sheet.
 */
export const WEB_SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

/** The built app next to `main.js` in the server's image, or the sources' build in development. */
export function defaultWebDir(): string | null {
  const bundled = fileURLToPath(new URL('./web', import.meta.url));
  if (fs.existsSync(path.join(bundled, 'index.html'))) return bundled;
  const built = fileURLToPath(new URL('../../web/dist', import.meta.url));
  return fs.existsSync(path.join(built, 'index.html')) ? built : null;
}

export function createWebApp(dir: string | null) {
  const root = dir ? path.resolve(dir) : null;
  return {
    async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
      if (!root) return false;
      if (request.method !== 'GET' && request.method !== 'HEAD') return false;
      const url = new URL(request.url ?? '/', 'http://localhost');
      let pathname: string;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        return false;
      }
      const wanted = path.resolve(root, `.${path.posix.normalize(pathname)}`);
      // Never a file outside the app's folder.
      if (wanted !== root && !wanted.startsWith(root + path.sep)) return false;
      let file = wanted;
      const isFile = (f: string) => {
        try {
          return fs.statSync(f).isFile();
        } catch {
          return false;
        }
      };
      if (!isFile(file)) {
        // A missing file is missing; any other path is one of the app's own.
        if (path.extname(pathname)) {
          response.writeHead(404, { ...WEB_SECURITY_HEADERS, 'Content-Type': 'text/plain' });
          response.end();
          return true;
        }
        file = path.join(root, 'index.html');
        if (!isFile(file)) return false;
      }
      const content = await fs.promises.readFile(file);
      const hashed = path.relative(root, file).startsWith(`assets${path.sep}`);
      response.writeHead(200, {
        ...WEB_SECURITY_HEADERS,
        'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': String(content.length),
        'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
      response.end(request.method === 'HEAD' ? undefined : content);
      return true;
    },
  };
}
