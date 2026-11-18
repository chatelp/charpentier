import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCiToken } from './ci-tokens';
import { createPool, type Database } from './database';
import { account, cleanUp, freshDatabase, startServer } from './testing';

/**
 * A request must never end the server: Hocuspocus rethrows what `onRequest`
 * throws outside any handler, so an error escaping from a route would be an
 * unhandled rejection (Node ends the process on one).
 */

const dirs: string[] = [];
const escaped: unknown[] = [];
const onRejection = (reason: unknown) => escaped.push(reason);

beforeEach(() => {
  escaped.length = 0;
  process.on('unhandledRejection', onRejection);
});
afterEach(async () => {
  process.off('unhandledRejection', onRejection);
  vi.restoreAllMocks();
  await cleanUp();
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function cache() {
  const dir = await mkdtemp(join(tmpdir(), 'charpentier-cache-'));
  dirs.push(dir);
  return dir;
}
/** Lets a rejection nobody handles reach the process. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('a request the server cannot serve', () => {
  it('answers a malformed path of the cache, signed in or not', async () => {
    const db = await freshDatabase();
    const { http } = await startServer(db, await cache());
    const ci = await createCiToken(db, 'github-actions');

    expect((await fetch(`${http}/nix-cache/%FF`)).status).toBe(401);
    expect((await fetch(`${http}/nix-cache/%FF`, { headers: bearer(ci) })).status).toBe(400);
    await settle();
    expect(escaped).toEqual([]);
    // The server still answers.
    expect((await fetch(`${http}/api/health`)).status).toBe(200);
  });

  it('answers a malformed path of the devices and of the network boot', async () => {
    const db = await freshDatabase();
    const { http } = await startServer(db, await cache(), { secret: 'pixie', macs: [] });
    const { token } = await account(db);

    const device = await fetch(`${http}/api/devices/%FF`, {
      method: 'DELETE',
      headers: bearer(token),
    });
    expect(device.status).toBe(400);
    expect((await fetch(`${http}/netboot/pixie/v1/boot/%FF`)).status).toBe(400);
    await settle();
    expect(escaped).toEqual([]);
  });

  it('answers a request target that is not a path', async () => {
    const { http } = await startServer(await freshDatabase(), await cache());
    expect((await fetch(`${http}//`)).status).toBe(400);
    await settle();
    expect(escaped).toEqual([]);
  });

  it('answers 500 when a route fails (the database is down), and goes on', async () => {
    const real = await freshDatabase();
    let down = false;
    const db: Database = {
      query: (text, params) =>
        down ? Promise.reject(new Error('the database is down')) : real.query(text, params),
    };
    const { http } = await startServer(db, await cache());
    const { token } = await account(db);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    down = true;
    for (const path of ['/api/account', '/api/updates/latest', '/nix-cache/nix-cache-info']) {
      const failed = await fetch(`${http}${path}`, { headers: bearer(token) });
      expect(failed.status).toBe(500);
    }
    await settle();
    expect(escaped).toEqual([]);
    expect(logged).toHaveBeenCalledTimes(3);

    down = false;
    expect((await fetch(`${http}/api/account`, { headers: bearer(token) })).status).toBe(200);
  });
});

describe('the pool of Postgres connections', () => {
  it('logs an idle connection’s error instead of throwing it', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Never connects: a pool opens its first connection at its first query.
    const pool = createPool('postgres://charpentier@127.0.0.1:1/charpentier');
    expect(() => pool.emit('error', new Error('Connection terminated unexpectedly'))).not.toThrow();
    expect(logged).toHaveBeenCalledWith('[postgres]', 'Connection terminated unexpectedly');
    await pool.end();
  });
});
