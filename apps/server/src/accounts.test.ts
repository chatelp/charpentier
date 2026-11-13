import { afterEach, describe, expect, it } from 'vitest';
import {
  createUser,
  listSessions,
  login,
  resetPassword,
  revokeSession,
  sessionFor,
} from './accounts';
import { LoginLimiter } from './http-api';
import { hashPassword, verifyPassword } from './passwords';
import { account, cleanUp, freshDatabase, startServer } from './testing';

afterEach(cleanUp);

describe('passwords (Argon2id)', () => {
  it('verifies the right password only, from a salted hash', async () => {
    const hash = await hashPassword('une serre sous la glace');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
    expect(hash).not.toBe(await hashPassword('une serre sous la glace'));
    expect(await verifyPassword('une serre sous la glace', hash)).toBe(true);
    expect(await verifyPassword('une serre sous la neige', hash)).toBe(false);
    expect(await verifyPassword('x', 'not a hash')).toBe(false);
  });
});

describe('accounts and device sessions', () => {
  it('signs a device in with the right password, and only then', async () => {
    const db = await freshDatabase();
    await createUser(db, 'Helene@Example.org ', 'une serre sous la glace');
    expect(await login(db, 'helene@example.org', 'mauvais mot de passe', 'Mac')).toBeNull();
    expect(await login(db, 'nobody@example.org', 'une serre sous la glace', 'Mac')).toBeNull();
    const session = await login(db, 'HELENE@example.org', 'une serre sous la glace', 'Mac');
    expect(session?.token).toMatch(/^[\w-]{43}$/);
    expect(await sessionFor(db, session?.token ?? '')).toMatchObject({
      sessionId: session?.sessionId,
    });
  });

  it('refuses a short password and a second account with the same e-mail', async () => {
    const db = await freshDatabase();
    await expect(createUser(db, 'a@example.org', 'court')).rejects.toThrow(/12 characters/);
    await createUser(db, 'a@example.org', 'une serre sous la glace');
    await expect(createUser(db, 'A@example.org', 'une serre sous la glace')).rejects.toThrow();
  });

  it('lists the devices and signs one out; a new password signs them all out', async () => {
    const db = await freshDatabase();
    const { userId, token, sessionId, email, password } = await account(db);
    const other = await login(db, email, password, 'X250');
    expect((await listSessions(db, userId)).map((s) => s.device).sort()).toEqual(['X250', 'test']);
    await revokeSession(db, userId, sessionId);
    expect(await sessionFor(db, token)).toBeNull();
    await resetPassword(db, email, 'un autre mot de passe');
    expect(await sessionFor(db, other?.token ?? '')).toBeNull();
    expect(await login(db, email, 'un autre mot de passe', 'Mac')).not.toBeNull();
  });
});

describe('sign-in limits', () => {
  it('allows ten attempts per address and e-mail in fifteen minutes', () => {
    let now = 0;
    const limiter = new LoginLimiter(() => now);
    for (let i = 0; i < 10; i++) expect(limiter.allow('ip|helene')).toBe(true);
    expect(limiter.allow('ip|helene')).toBe(false);
    expect(limiter.allow('ip|paul')).toBe(true);
    now += 15 * 60_000;
    expect(limiter.allow('ip|helene')).toBe(true);
  });
});

describe('HTTP API', () => {
  it('signs in, lists the devices, signs a device out', async () => {
    const db = await freshDatabase();
    const { http } = await startServer(db);
    const { email, password } = await account(db);
    const post = (path: string, body: unknown, token?: string) =>
      fetch(`${http}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify(body),
      });

    expect((await fetch(`${http}/api/health`)).status).toBe(200);
    expect((await post('/api/login', { email, password: 'faux mot de passe' })).status).toBe(401);
    const signedIn = await post('/api/login', { email, password, device: 'Mac de Pierre' });
    expect(signedIn.status).toBe(200);
    const { token } = (await signedIn.json()) as { token: string };

    expect((await fetch(`${http}/api/devices`)).status).toBe(401);
    const devices = (await (
      await fetch(`${http}/api/devices`, { headers: { Authorization: `Bearer ${token}` } })
    ).json()) as { devices: { id: string; device: string; current: boolean }[] };
    expect(devices.devices.find((d) => d.current)?.device).toBe('Mac de Pierre');
    const other = devices.devices.find((d) => !d.current);
    expect(
      (
        await fetch(`${http}/api/devices/${other?.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        })
      ).status,
    ).toBe(204);

    expect((await post('/api/logout', {}, token)).status).toBe(204);
    expect(
      (await fetch(`${http}/api/devices`, { headers: { Authorization: `Bearer ${token}` } }))
        .status,
    ).toBe(401);
  });
});
