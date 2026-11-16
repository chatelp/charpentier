import { afterEach, describe, expect, it } from 'vitest';
import { createSyncServer } from './sync-server';
import { account, cleanUp, connect, freshDatabase } from './testing';

const servers: { destroy(): Promise<void> }[] = [];
afterEach(async () => {
  await cleanUp();
  for (const server of servers.splice(0)) await server.destroy();
});

async function start() {
  const db = await freshDatabase();
  const server = createSyncServer({ db, port: 0, address: '127.0.0.1' });
  await server.listen();
  servers.push(server);
  const host = `127.0.0.1:${server.address.port}`;
  return { db, base: `http://${host}`, ws: `ws://${host}`, host };
}

const signIn = (base: string, email: string, password: string, headers = {}) =>
  fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ email, password, device: 'Navigateur', cookie: true }),
  });

describe('the browser’s session (phase 4.7 a)', () => {
  it('keeps the token in a cookie the page cannot read, and knows the account by it', async () => {
    const { db, base } = await start();
    const helene = await account(db);
    const response = await signIn(base, helene.email, helene.password, {
      'Sec-Fetch-Site': 'same-origin',
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty('token');
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(
      /^__Host-charpentier=[\w-]+; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=\d+$/,
    );
    const jar = cookie.split(';')[0] ?? '';
    const me = await fetch(`${base}/api/account`, { headers: { Cookie: jar } });
    // The first account of a server is its administrator.
    expect(await me.json()).toEqual({ userId: helene.userId, email: helene.email, admin: true });
    // From another site, the cookie opens nothing.
    const elsewhere = await fetch(`${base}/api/account`, {
      headers: { Cookie: jar, 'Sec-Fetch-Site': 'cross-site' },
    });
    expect(elsewhere.status).toBe(401);

    // Signing out revokes the session and clears the cookie.
    const out = await fetch(`${base}/api/logout`, { method: 'POST', headers: { Cookie: jar } });
    expect(out.status).toBe(204);
    expect(out.headers.get('set-cookie')).toMatch(/^__Host-charpentier=; .*Max-Age=0$/);
    expect((await fetch(`${base}/api/account`, { headers: { Cookie: jar } })).status).toBe(401);
  });

  it('refuses a sign-in sent from another site', async () => {
    const { db, base } = await start();
    const helene = await account(db);
    const response = await signIn(base, helene.email, helene.password, {
      Origin: 'https://evil.example',
    });
    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('syncs by the cookie from the app’s pages, never from another site', async () => {
    const { db, base, ws, host } = await start();
    const helene = await account(db);
    const response = await signIn(base, helene.email, helene.password);
    const jar = response.headers.get('set-cookie')?.split(';')[0] ?? '';
    const name = `library:${helene.userId}`;
    const home = connect(ws, name, 'cookie', undefined, { Cookie: jar, Origin: `http://${host}` });
    expect(await home.synced).toBe(true);
    const evil = connect(ws, name, 'cookie', undefined, {
      Cookie: jar,
      Origin: 'https://evil.example',
    });
    expect(await evil.synced).toBe(false);
  });
});
