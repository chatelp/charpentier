import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createSyncServer } from './sync-server';
import { cleanUp, freshDatabase } from './testing';

const servers: { destroy(): Promise<void> }[] = [];
const dirs: string[] = [];
afterEach(async () => {
  await cleanUp();
  for (const server of servers.splice(0)) await server.destroy();
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A server with a built app of two files. */
async function start() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charpentier-web-'));
  dirs.push(dir);
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Charpentier</title>');
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', 'index-abc123.js'), 'console.log(1)');
  const server = createSyncServer({
    db: await freshDatabase(),
    port: 0,
    address: '127.0.0.1',
    webDir: dir,
  });
  await server.listen();
  servers.push(server);
  return `http://127.0.0.1:${server.address.port}`;
}

describe('the app in the browser, served by the sync server (phase 4.7 a)', () => {
  it('serves the app on any of its paths, with strict headers', async () => {
    const base = await start();
    for (const pathname of ['/', '/projet/roman']) {
      const response = await fetch(`${base}${pathname}`);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('<title>Charpentier</title>');
      expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(response.headers.get('cache-control')).toBe('no-cache');
      expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
      expect(response.headers.get('content-security-policy')).toContain("script-src 'self'");
    }
  });

  it('keeps the hashed assets a year, and says when a file is missing', async () => {
    const base = await start();
    const asset = await fetch(`${base}/assets/index-abc123.js`);
    expect(asset.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect((await fetch(`${base}/assets/absent.js`)).status).toBe(404);
  });

  it('leaves the API to the API, and never serves a file outside the app', async () => {
    const base = await start();
    expect(await (await fetch(`${base}/api/health`)).json()).toEqual({ ok: true });
    const outside = await fetch(`${base}/%2e%2e/%2e%2e/etc/passwd`);
    expect(await outside.text()).not.toContain('root:');
  });
});
