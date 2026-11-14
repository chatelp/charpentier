import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCiToken } from './ci-tokens';
import { normalizeMac, placeNetbootFiles } from './netboot';
import { account, cleanUp, freshDatabase, startServer } from './testing';

const dirs: string[] = [];
afterEach(async () => {
  await cleanUp();
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

const SECRET = 'un-secret-de-pixiecore';
const X250 = '50:7B:9D:AA:BB:CC';
const HASH = '0123456789abcdfghijklmnpqrsvwxyz';
const SYSTEM = `/nix/store/${HASH}-nixos-system-x250`;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function setUp({ secret = SECRET as string | null } = {}) {
  const db = await freshDatabase();
  const cacheDir = await mkdtemp(join(tmpdir(), 'charpentier-netboot-'));
  dirs.push(cacheDir);
  const { http } = await startServer(db, cacheDir, { secret, macs: [X250] });
  const ci = await createCiToken(db, 'github-actions');
  const device = (await account(db)).token;
  // A version published, its system in the cache.
  await fetch(`${http}/nix-cache/${HASH}.narinfo`, {
    method: 'PUT',
    body: `StorePath: ${SYSTEM}\n`,
    headers: auth(ci),
  });
  await fetch(`${http}/api/updates/latest`, {
    method: 'PUT',
    body: JSON.stringify({ version: '0.6.0', notes: '', systems: { azerty: SYSTEM } }),
    headers: auth(ci),
  });
  return { http, cacheDir, ci, device };
}

const boot = (http: string, mac: string, headers: Record<string, string> = {}, secret = SECRET) =>
  fetch(`${http}/netboot/${secret}/v1/boot/${mac}`, { headers });

describe('the X250 installed over the network (phase 5.9 ter)', () => {
  it('tells Pixiecore what to boot, for the X250 only', async () => {
    const { http, cacheDir } = await setUp();
    // Nothing until the CI has sent the version's kernel and initrd.
    expect((await boot(http, X250)).status).toBe(404);
    await placeNetbootFiles(cacheDir, '0.6.0', {
      bzImage: 'noyau',
      initrd: 'initrd du X250',
      cmdline: 'init=/nix/store/…/init loglevel=4\n',
    });

    const answer = await boot(http, '50-7b-9d-aa-bb-cc');
    expect(answer.status).toBe(200);
    const body = (await answer.json()) as { kernel: string; initrd: string[]; cmdline: string };
    expect(body.cmdline).toBe('init=/nix/store/…/init loglevel=4');
    expect(body.kernel).toMatch(/\/netboot\/un-secret-de-pixiecore\/files\/0\.6\.0\/bzImage$/);
    expect(await (await fetch(body.kernel)).text()).toBe('noyau');
    const part = await fetch(body.initrd[0] ?? '', { headers: { Range: 'bytes=0-5' } });
    expect(part.status).toBe(206);
    expect(await part.text()).toBe('initrd');

    // Any other machine that starts on the network gets nothing.
    expect((await boot(http, '00:11:22:33:44:55')).status).toBe(404);
  });

  it('answers nothing through the proxy, without the secret, or with none set', async () => {
    const { http, cacheDir } = await setUp();
    await placeNetbootFiles(cacheDir, '0.6.0', { bzImage: 'noyau', initrd: 'initrd' });
    // From the Internet, every request comes through Traefik, which says so.
    expect((await boot(http, X250, { 'X-Forwarded-For': '203.0.113.7' })).status).toBe(404);
    expect((await boot(http, X250, {}, 'mauvais-secret')).status).toBe(404);
    expect(
      (
        await fetch(`${http}/netboot/${SECRET}/files/0.6.0/bzImage`, {
          headers: { 'X-Forwarded-For': '203.0.113.7' },
        })
      ).status,
    ).toBe(404);

    const off = await setUp({ secret: null });
    await placeNetbootFiles(off.cacheDir, '0.6.0', { bzImage: 'noyau', initrd: 'initrd' });
    expect((await boot(off.http, X250)).status).toBe(404);
  });

  it('takes the files of the version published, from the CI only', async () => {
    const { http, ci, device } = await setUp();
    const put = (version: string, file: string, token: string) =>
      fetch(`${http}/api/netboot/${version}/${file}`, {
        method: 'PUT',
        body: 'contenu',
        headers: auth(token),
      });
    expect((await put('0.6.0', 'bzImage', device)).status).toBe(403);
    expect((await put('0.5.0', 'bzImage', ci)).status).toBe(409);
    expect((await put('0.6.0', 'autre', ci)).status).toBe(404);
    expect((await put('0.6.0', 'bzImage', ci)).status).toBe(201);
    expect((await put('0.6.0', 'initrd', ci)).status).toBe(201);
    expect((await boot(http, X250)).status).toBe(200);
  });

  it('reads a MAC however it is written', () => {
    expect(normalizeMac('50:7B:9D:AA:BB:CC')).toBe('50:7b:9d:aa:bb:cc');
    expect(normalizeMac('50-7b-9d-aa-bb-cc')).toBe('50:7b:9d:aa:bb:cc');
    expect(normalizeMac('507b9daabbcc')).toBe('50:7b:9d:aa:bb:cc');
    expect(normalizeMac('pas une adresse')).toBeNull();
  });
});
