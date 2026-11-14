import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCiToken } from './ci-tokens';
import { byteRange } from './installer';
import { account, cleanUp, freshDatabase, startServer } from './testing';

const dirs: string[] = [];
afterEach(async () => {
  await cleanUp();
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function setUp() {
  const db = await freshDatabase();
  const cacheDir = await mkdtemp(join(tmpdir(), 'charpentier-cache-'));
  dirs.push(cacheDir);
  const { http } = await startServer(db, cacheDir);
  const device = await account(db);
  const ci = await createCiToken(db, 'github-actions');
  return { cacheDir, http, device: device.token, ci };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const bytes = (size: number, seed = 7) => new Uint8Array(size).map((_, i) => (i * seed) % 253);
const parts = (data: Uint8Array, count: number) => {
  const size = Math.ceil(data.length / count);
  return Array.from({ length: count }, (_, i) => data.slice(i * size, (i + 1) * size));
};

/** Sends a part, as the CI does under Cloudflare's 100 MB. */
const sendPart = (
  url: string,
  token: string,
  data: Uint8Array,
  n: number,
  total: number,
  sum: string,
) =>
  fetch(url, {
    method: 'PUT',
    body: data,
    headers: { ...auth(token), 'X-Part': `${n}/${total}`, 'X-Checksum-SHA256': sum },
  });

describe('files in parts, under Cloudflare’s limit (phase 5.11)', () => {
  it('assembles a NAR sent in parts, out of order and with a part sent twice', async () => {
    const { cacheDir, http, device, ci } = await setUp();
    const nar = bytes(250_000);
    const [a, b, c] = parts(nar, 3) as [Uint8Array, Uint8Array, Uint8Array];
    const url = `${http}/nix-cache/nar/gros.nar.zst`;
    const sum = sha256(nar);
    expect((await sendPart(url, ci, c, 3, 3, sum)).status).toBe(202);
    expect((await sendPart(url, ci, a, 1, 3, sum)).status).toBe(202);
    expect((await sendPart(url, ci, a, 1, 3, sum)).status).toBe(202);
    // Not readable before the last part.
    expect((await fetch(url, { headers: auth(device) })).status).toBe(404);
    expect((await sendPart(url, ci, b, 2, 3, sum)).status).toBe(201);

    const back = await fetch(url, { headers: auth(device) });
    expect(new Uint8Array(await back.arrayBuffer())).toEqual(nar);
    // Nothing left behind: no parts, no half-written file.
    expect(await readdir(join(cacheDir, '.parts'))).toEqual([]);
    expect((await readdir(cacheDir)).filter((f) => f.startsWith('.upload-'))).toEqual([]);
  });

  it('refuses a file whose parts do not add up to its checksum, and bad headers', async () => {
    const { http, device, ci } = await setUp();
    const nar = bytes(10_000);
    const [a, b] = parts(nar, 2) as [Uint8Array, Uint8Array];
    const url = `${http}/nix-cache/nar/faux.nar.zst`;
    const wrong = sha256(bytes(10_000, 11));
    await sendPart(url, ci, a, 1, 2, wrong);
    expect((await sendPart(url, ci, b, 2, 2, wrong)).status).toBe(409);
    expect((await fetch(url, { headers: auth(device) })).status).toBe(404);

    const bad = (headers: Record<string, string>) =>
      fetch(url, { method: 'PUT', body: a, headers: { ...auth(ci), ...headers } });
    expect((await bad({ 'X-Part': '1/2' })).status).toBe(400);
    expect((await bad({ 'X-Part': '3/2', 'X-Checksum-SHA256': sha256(nar) })).status).toBe(400);
    expect((await bad({ 'X-Checksum-SHA256': 'pas une somme' })).status).toBe(400);
    // A whole file with a wrong checksum is refused too.
    expect((await bad({ 'X-Checksum-SHA256': wrong })).status).toBe(409);
  });
});

describe('the install key’s image (phase 5.11)', () => {
  const SYSTEM = `/nix/store/${'0123456789abcdfghijklmnpqrsvwxyz'}-nixos-system-x250`;

  async function publish(http: string, ci: string, version: string) {
    await fetch(`${http}/nix-cache/${'0123456789abcdfghijklmnpqrsvwxyz'}.narinfo`, {
      method: 'PUT',
      body: `StorePath: ${SYSTEM}\n`,
      headers: auth(ci),
    });
    const response = await fetch(`${http}/api/updates/latest`, {
      method: 'PUT',
      body: JSON.stringify({ version, notes: '', systems: { azerty: SYSTEM } }),
      headers: auth(ci),
    });
    expect(response.status).toBe(201);
  }

  async function sendImage(http: string, ci: string, version: string, image: Uint8Array) {
    const [a, b] = parts(image, 2) as [Uint8Array, Uint8Array];
    const url = `${http}/api/installer/${version}`;
    await sendPart(url, ci, a, 1, 2, sha256(image));
    return sendPart(url, ci, b, 2, 2, sha256(image));
  }

  it('takes the image of the published version only, and serves it with ranges', async () => {
    const { http, device, ci } = await setUp();
    const image = bytes(60_000);
    expect((await fetch(`${http}/api/installer/latest`, { headers: auth(device) })).status).toBe(
      404,
    );
    // No version published yet: nothing to attach an image to.
    expect((await sendImage(http, ci, '0.6.0', image)).status).toBe(409);
    await publish(http, ci, '0.6.0');
    expect((await sendImage(http, device, '0.6.0', image)).status).toBe(403);
    expect((await sendImage(http, ci, '0.5.0', image)).status).toBe(409);
    expect((await sendImage(http, ci, '0.6.0', image)).status).toBe(201);

    const latest = await fetch(`${http}/api/installer/latest`, { headers: auth(device) });
    expect(await latest.json()).toMatchObject({
      version: '0.6.0',
      size: 60_000,
      sha256: sha256(image),
    });
    expect((await fetch(`${http}/api/installer/0.6.0.iso`)).status).toBe(401);
    const whole = await fetch(`${http}/api/installer/0.6.0.iso`, { headers: auth(device) });
    expect(new Uint8Array(await whole.arrayBuffer())).toEqual(image);
    // Resuming a download: the rest of the file from byte 50 000.
    const rest = await fetch(`${http}/api/installer/0.6.0.iso`, {
      headers: { ...auth(device), Range: 'bytes=50000-' },
    });
    expect(rest.status).toBe(206);
    expect(rest.headers.get('content-range')).toBe('bytes 50000-59999/60000');
    expect(new Uint8Array(await rest.arrayBuffer())).toEqual(image.slice(50_000));
  });

  it('keeps the last two images', async () => {
    const { http, device, ci } = await setUp();
    for (const version of ['0.6.0', '0.6.1', '0.7.0']) {
      await publish(http, ci, version);
      expect((await sendImage(http, ci, version, bytes(1000, version.length + 3))).status).toBe(
        201,
      );
    }
    const status = async (v: string) =>
      (await fetch(`${http}/api/installer/${v}.iso`, { headers: auth(device) })).status;
    expect(await status('0.6.0')).toBe(404);
    expect(await status('0.6.1')).toBe(200);
    expect(await status('0.7.0')).toBe(200);
  });

  it('reads byte ranges as HTTP writes them', () => {
    expect(byteRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 });
    expect(byteRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 });
    expect(byteRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
    expect(byteRange('bytes=990-2000', 1000)).toEqual({ start: 990, end: 999 });
    expect(byteRange('bytes=1000-', 1000)).toBeNull();
    expect(byteRange('bytes=-', 1000)).toBeNull();
    expect(byteRange('lines=1-2', 1000)).toBeNull();
  });
});
