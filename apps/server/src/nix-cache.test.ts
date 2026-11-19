import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCiToken, revokeCiToken } from './ci-tokens';
import type { Database } from './database';
import { account, cleanUp, freshDatabase, startServer } from './testing';

const dirs: string[] = [];
afterEach(async () => {
  await cleanUp();
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function setUp(wrap: (db: Database) => Database = (db) => db) {
  const db = wrap(await freshDatabase());
  const cacheDir = await mkdtemp(join(tmpdir(), 'charpentier-cache-'));
  dirs.push(cacheDir);
  const { http } = await startServer(db, cacheDir);
  const device = await account(db);
  const ci = await createCiToken(db, 'github-actions');
  return { db, cacheDir, http, device: device.token, ci };
}

/** HTTP Basic, as Nix sends it from a netrc file. */
const basic = (token: string) => ({
  Authorization: `Basic ${Buffer.from(`ci:${token}`).toString('base64')}`,
});
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const HASH = '0123456789abcdfghijklmnpqrsvwxyz';
const SYSTEM = `/nix/store/${HASH}-nixos-system-x250-26.05`;
const NARINFO = `StorePath: ${SYSTEM}\nURL: nar/1abc.nar.zst\nCompression: zstd\nSig: charpentier-x250-1:abc\n`;

describe('the X250’s binary cache (phase 5.11)', () => {
  it('answers only a token: the CI’s or a device’s', async () => {
    const { http, device, ci } = await setUp();
    const anonymous = await fetch(`${http}/nix-cache/nix-cache-info`);
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get('www-authenticate')).toMatch(/^Basic/);
    expect(
      (await fetch(`${http}/nix-cache/nix-cache-info`, { headers: basic('faux') })).status,
    ).toBe(401);
    for (const token of [device, ci]) {
      const info = await fetch(`${http}/nix-cache/nix-cache-info`, { headers: basic(token) });
      expect(info.status).toBe(200);
      expect(await info.text()).toContain('StoreDir: /nix/store');
    }
  });

  it('takes the files of the CI, and gives them back to a device', async () => {
    const { http, cacheDir, device, ci } = await setUp();
    const nar = new Uint8Array(300_000).map((_, i) => i % 251);
    const put = (file: string, body: string | Uint8Array, token = ci) =>
      fetch(`${http}/nix-cache/${file}`, { method: 'PUT', body, headers: basic(token) });

    expect((await put(`${HASH}.narinfo`, NARINFO, device)).status).toBe(403);
    expect((await put(`${HASH}.narinfo`, NARINFO)).status).toBe(201);
    expect((await put('nar/1abc.nar.zst', nar)).status).toBe(201);
    // Nothing half-written stays behind.
    expect((await readdir(cacheDir)).filter((f) => f.startsWith('.upload-'))).toEqual([]);

    const narinfo = await fetch(`${http}/nix-cache/${HASH}.narinfo`, { headers: basic(device) });
    expect(narinfo.headers.get('content-type')).toBe('text/x-nix-narinfo');
    expect(await narinfo.text()).toBe(NARINFO);
    const back = await fetch(`${http}/nix-cache/nar/1abc.nar.zst`, { headers: basic(device) });
    expect(new Uint8Array(await back.arrayBuffer())).toEqual(nar);
    const head = await fetch(`${http}/nix-cache/nar/1abc.nar.zst`, {
      method: 'HEAD',
      headers: basic(device),
    });
    expect(head.headers.get('content-length')).toBe('300000');

    const missing = await fetch(`${http}/nix-cache/${'z'.repeat(32)}.narinfo`, {
      headers: basic(device),
    });
    expect(missing.status).toBe(404);
  });

  it('refuses any other file, and a revoked CI token', async () => {
    const { db, http, ci } = await setUp();
    for (const file of [
      '..%2Fescape',
      'nar/..%2F..%2Fescape',
      'nar/.hidden',
      'notes.txt',
      'a/b/c',
    ]) {
      const response = await fetch(`${http}/nix-cache/${file}`, {
        method: 'PUT',
        body: 'x',
        headers: basic(ci),
      });
      expect(response.status, file).toBe(404);
    }
    await revokeCiToken(db, 'github-actions');
    expect((await fetch(`${http}/nix-cache/nix-cache-info`, { headers: basic(ci) })).status).toBe(
      401,
    );
  });

  it('does not exist on a server without a cache directory', async () => {
    const db = await freshDatabase();
    const { http } = await startServer(db);
    const { token } = await account(db);
    expect(
      (await fetch(`${http}/nix-cache/nix-cache-info`, { headers: basic(token) })).status,
    ).toBe(404);
  });
});

describe('the X250’s version pointer (phase 5.11)', () => {
  const version = (
    v: string,
    systems: Record<string, string> = { azerty: SYSTEM, qwerty: SYSTEM },
  ) => JSON.stringify({ version: v, notes: 'Les fiches se replient.', systems });

  it('publishes a version once its systems are in the cache, for the CI only', async () => {
    const { http, device, ci } = await setUp();
    const publish = (body: string, token = ci) =>
      fetch(`${http}/api/updates/latest`, { method: 'PUT', body, headers: bearer(token) });

    expect((await fetch(`${http}/api/updates/latest`)).status).toBe(401);
    expect((await fetch(`${http}/api/updates/latest`, { headers: bearer(device) })).status).toBe(
      404,
    );
    expect((await publish(version('0.6.0'), device)).status).toBe(403);
    expect((await publish(version('six'))).status).toBe(400);
    expect((await publish(version('0.6.0', { azerty: '/etc/passwd' }))).status).toBe(400);
    // Not yet in the cache: a device could not download it.
    const early = await publish(version('0.6.0'));
    expect(early.status).toBe(409);

    await fetch(`${http}/nix-cache/${HASH}.narinfo`, {
      method: 'PUT',
      body: NARINFO,
      headers: basic(ci),
    });
    expect((await publish(version('0.6.0'))).status).toBe(201);
    expect((await publish(version('0.6.0-2'))).status).toBe(201);

    const latest = await fetch(`${http}/api/updates/latest`, { headers: basic(device) });
    expect(latest.status).toBe(200);
    expect(await latest.json()).toMatchObject({
      version: '0.6.0-2',
      notes: 'Les fiches se replient.',
      systems: { azerty: SYSTEM, qwerty: SYSTEM },
      publishedAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
    });
  });
});

describe('the X250’s development channel (D-42, phase 5.12 bis)', () => {
  const path = (letter: string, name: string) => `/nix/store/${letter.repeat(32)}-${name}`;
  const A = path('a', 'nixos-system-x250-26.05');
  const B = path('b', 'charpentier-0.6.0');
  const C = path('c', 'charpentier-0.6.0-dev.1');
  const D1 = path('d', 'nixos-system-x250-dev-26.05');
  const D2 = path('f', 'nixos-system-x250-dev-26.05');
  const U = path('g', 'not-published-yet');
  const base = (p: string) => p.slice('/nix/store/'.length);
  const hash = (p: string) => base(p).slice(0, 32);

  async function upload(http: string, ci: string, p: string, refs: string[]) {
    const nar = `nar/${hash(p)}.nar.zst`;
    await fetch(`${http}/nix-cache/${nar}`, { method: 'PUT', body: 'nar', headers: basic(ci) });
    const narinfo = `StorePath: ${p}\nURL: ${nar}\nCompression: zstd\nReferences: ${refs.map(base).join(' ')}\nSig: charpentier-x250-1:abc\n`;
    const r = await fetch(`${http}/nix-cache/${hash(p)}.narinfo`, {
      method: 'PUT',
      body: narinfo,
      headers: basic(ci),
    });
    expect(r.status).toBe(201);
  }
  const publish = (http: string, token: string, channel: string, v: string, system: string) =>
    fetch(`${http}/api/updates/${channel}`, {
      method: 'PUT',
      body: JSON.stringify({ version: v, notes: '', systems: { azerty: system, qwerty: system } }),
      headers: bearer(token),
    });

  it('has its own pointer and numbers, apart from the releases', async () => {
    const { http, device, ci } = await setUp();
    await upload(http, ci, B, []);
    await upload(http, ci, D1, [B]);
    expect((await fetch(`${http}/api/updates/dev`)).status).toBe(401);
    expect((await fetch(`${http}/api/updates/dev`, { headers: basic(device) })).status).toBe(404);
    expect((await publish(http, device, 'dev', '0.6.0-dev.1', D1)).status).toBe(403);
    expect((await publish(http, ci, 'dev', '0.6.0', D1)).status).toBe(400);
    expect((await publish(http, ci, 'dev', '0.6.0-2', D1)).status).toBe(400);
    expect((await publish(http, ci, 'latest', '0.6.0-dev.1', D1)).status).toBe(400);
    expect((await publish(http, ci, 'dev', '0.6.0-dev.1', D1)).status).toBe(201);

    const dev = await fetch(`${http}/api/updates/dev`, { headers: basic(device) });
    expect(await dev.json()).toMatchObject({
      version: '0.6.0-dev.1',
      systems: { azerty: D1 },
      publishedAt: expect.stringMatching(/^\d{4}-/),
    });
    // The CI reads it too (to count N); the releases never see it.
    expect((await fetch(`${http}/api/updates/dev`, { headers: bearer(ci) })).status).toBe(200);
    expect((await fetch(`${http}/api/updates/latest`, { headers: basic(device) })).status).toBe(
      404,
    );
  });

  it('refuses a version whose closure is not whole in the cache', async () => {
    const { http, ci } = await setUp();
    await upload(http, ci, D1, [B]);
    const refused = await publish(http, ci, 'dev', '0.6.0-dev.1', D1);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: 'not-in-cache', path: hash(B) });
    expect((await publish(http, ci, 'latest', '0.6.0', D1)).status).toBe(409);
  });

  it('keeps the last development version only, and never a file of a release', async () => {
    const { http, ci, cacheDir } = await setUp();
    await upload(http, ci, B, []);
    await upload(http, ci, A, [B]);
    await upload(http, ci, C, [B]);
    await upload(http, ci, D1, [B, C]);
    await upload(http, ci, D2, [B]);
    await upload(http, ci, U, []);
    expect((await publish(http, ci, 'latest', '0.6.0', A)).status).toBe(201);
    expect((await publish(http, ci, 'dev', '0.6.0-dev.1', D1)).status).toBe(201);
    expect((await publish(http, ci, 'dev', '0.6.0-dev.2', D2)).status).toBe(201);

    const files = new Set([
      ...(await readdir(cacheDir)),
      ...(await readdir(join(cacheDir, 'nar'))).map((f) => `nar/${f}`),
    ]);
    for (const kept of [A, B, D2, U]) {
      expect(files).toContain(`${hash(kept)}.narinfo`);
      expect(files).toContain(`nar/${hash(kept)}.nar.zst`);
    }
    for (const gone of [C, D1]) {
      expect(files).not.toContain(`${hash(gone)}.narinfo`);
      expect(files).not.toContain(`nar/${hash(gone)}.nar.zst`);
    }
    const ci2 = await fetch(`${http}/api/updates/latest`, { headers: bearer(ci) });
    expect(await ci2.json()).toMatchObject({ version: '0.6.0' });
  });

  it('publishes one version at a time: a release keeps what a development version forgets', async () => {
    // The release's row is written late: after the development version's
    // answer if nothing makes that one wait, after half a second otherwise.
    let reached = () => {};
    const writing = new Promise<void>((resolve) => (reached = resolve));
    let open = () => {};
    const gate = new Promise<void>((resolve) => (open = resolve));
    const { http, ci, cacheDir } = await setUp((db) => ({
      query: async (text, params) => {
        if (text.startsWith('insert into updates') && params?.[3] === 'release') {
          reached();
          await Promise.race([gate, new Promise((resolve) => setTimeout(resolve, 500))]);
        }
        return db.query(text, params);
      },
    }));
    await upload(http, ci, B, []);
    await upload(http, ci, A, [B]);
    await upload(http, ci, D1, [B]);
    await upload(http, ci, D2, []);
    expect((await publish(http, ci, 'dev', '0.6.0-dev.1', D1)).status).toBe(201);

    // The release has found its closure (A, B) whole; the next development
    // version no longer uses B, and arrives before the release's row.
    const release = publish(http, ci, 'latest', '0.6.0', A);
    await writing;
    const dev = publish(http, ci, 'dev', '0.6.0-dev.2', D2).finally(open);
    expect((await release).status).toBe(201);
    expect((await dev).status).toBe(201);

    const files = await readdir(cacheDir);
    for (const kept of [A, B, D2]) expect(files).toContain(`${hash(kept)}.narinfo`);
    expect(files).not.toContain(`${hash(D1)}.narinfo`);
    expect(await readdir(join(cacheDir, 'nar'))).toContain(`${hash(B)}.nar.zst`);
  });
});
