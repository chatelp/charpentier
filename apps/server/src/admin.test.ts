import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createUser, login, sessionFor } from './accounts';
import {
  ADMIN_IDLE_MS,
  AdminError,
  adminLogin,
  adminSessionFor,
  createAccount,
  latestBackup,
  listAccounts,
  listProjects,
  readLog,
  resetAccountPassword,
  revokeDevice,
  setAccountAdmin,
  setAccountDisabled,
} from './admin';
import { migrate, storeDocument } from './database';
import { account, cleanUp, freshDatabase } from './testing';

afterEach(cleanUp);

const PASSWORD = 'une serre sous la glace';

async function withAdmin() {
  const db = await freshDatabase();
  const pierre = await account(db, 'pierre@example.org');
  const signedIn = await adminLogin(db, pierre.email, pierre.password);
  if (!signedIn) throw new Error('The first account should be an administrator');
  return { db, pierre, admin: signedIn.session, token: signedIn.token };
}

describe('administration (phase 4.6)', () => {
  it('makes the first account an administrator, and only it', async () => {
    const db = await freshDatabase();
    await createUser(db, 'pierre@example.org', PASSWORD);
    await createUser(db, 'helene@example.org', PASSWORD);
    await migrate(db); // Every start: still one administrator.
    expect((await listAccounts(db)).map((a) => [a.email, a.isAdmin])).toEqual([
      ['pierre@example.org', true],
      ['helene@example.org', false],
    ]);
    expect(await adminLogin(db, 'helene@example.org', PASSWORD)).toBeNull();
    expect(await adminLogin(db, 'pierre@example.org', 'mauvais mot de passe')).toBeNull();
  });

  it('ends a session left idle', async () => {
    const { db, token } = await withAdmin();
    expect(await adminSessionFor(db, token)).not.toBeNull();
    const later = new Date(Date.now() + ADMIN_IDLE_MS + 60_000);
    expect(await adminSessionFor(db, token, later)).toBeNull();
  });

  it('creates an account that can then sign in from the app', async () => {
    const { db, admin } = await withAdmin();
    await createAccount(db, admin, {
      email: 'Helene@Example.org',
      password: PASSWORD,
      isAdmin: false,
    });
    expect(await login(db, 'helene@example.org', PASSWORD, 'Mac')).not.toBeNull();
    await expect(
      createAccount(db, admin, { email: 'helene@example.org', password: PASSWORD, isAdmin: false }),
    ).rejects.toThrow(new AdminError('email-taken'));
    await expect(
      createAccount(db, admin, { email: 'paul@example.org', password: 'court', isAdmin: false }),
    ).rejects.toThrow(new AdminError('short-password'));
    expect((await readLog(db))[0]).toMatchObject({
      admin: 'pierre@example.org',
      action: 'account.create',
      target: 'helene@example.org',
    });
  });

  it('disables an account: its devices lose the sync, its projects stay, it can come back', async () => {
    const { db, admin } = await withAdmin();
    const helene = await account(db, 'helene@example.org');
    await db.query("insert into projects (id, user_id) values ('roman', $1)", [helene.userId]);
    const revoked = await setAccountDisabled(db, admin, helene.userId, true);
    expect(revoked).toEqual([helene.sessionId]);
    expect(await sessionFor(db, helene.token)).toBeNull();
    expect(await login(db, helene.email, helene.password, 'Mac')).toBeNull();
    expect((await listProjects(db)).map((p) => p.id)).toEqual(['roman']);
    await setAccountDisabled(db, admin, helene.userId, false);
    expect(await login(db, helene.email, helene.password, 'Mac')).not.toBeNull();
    await expect(setAccountDisabled(db, admin, admin.userId, true)).rejects.toThrow(
      new AdminError('not-yourself'),
    );
  });

  it('resets a password, revokes one device, and keeps an administrator', async () => {
    const { db, admin } = await withAdmin();
    const helene = await account(db, 'helene@example.org');
    const second = await login(db, helene.email, helene.password, 'X250');
    expect(await revokeDevice(db, admin, helene.userId, second?.sessionId ?? '')).toBe(true);
    expect(await sessionFor(db, second?.token ?? '')).toBeNull();
    expect(await sessionFor(db, helene.token)).not.toBeNull();

    await resetAccountPassword(db, admin, helene.userId, 'un autre mot de passe long');
    expect(await sessionFor(db, helene.token)).toBeNull();
    expect(await login(db, helene.email, 'un autre mot de passe long', 'Mac')).not.toBeNull();

    await setAccountAdmin(db, admin, helene.userId, true);
    await setAccountAdmin(db, admin, helene.userId, false);
    expect((await listAccounts(db)).find((a) => a.id === helene.userId)?.isAdmin).toBe(false);
  });

  it('lists the projects with their title, size, last write and trash', async () => {
    const { db, pierre } = await withAdmin();
    await db.query("insert into projects (id, user_id) values ('a', $1), ('b', $1)", [
      pierre.userId,
    ]);
    await storeDocument(db, 'project:a', new Uint8Array(100));
    await storeDocument(db, 'project:a/scene:s1', new Uint8Array(50));
    await storeDocument(db, 'project:ab', new Uint8Array(999)); // Another project's name.
    const library = new Y.Doc();
    library.getMap('projects').set('a', { id: 'a', title: 'La batelière' });
    library.getMap('projects').set('b', { id: 'b', title: 'Brouillon', trashedAt: '2026-11-01' });
    await storeDocument(db, `library:${pierre.userId}`, Y.encodeStateAsUpdate(library));
    const projects = await listProjects(db);
    expect(projects.map((p) => [p.id, p.title, p.size, p.trashed])).toEqual([
      ['a', 'La batelière', 150, false],
      ['b', 'Brouillon', 0, true],
    ]);
    expect(projects[0]?.lastWrite).not.toBeNull();
  });

  it('tells the last backup and whether it is stale', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charpentier-backups-'));
    try {
      expect(latestBackup(dir)).toBeNull();
      fs.writeFileSync(path.join(dir, 'charpentier-2026-11-14.tar.gz'), 'x'.repeat(10));
      fs.writeFileSync(path.join(dir, 'charpentier-2026-11-15.tar.gz'), 'x'.repeat(20));
      const old = Date.now() / 1000 - 3 * 24 * 3600;
      fs.utimesSync(path.join(dir, 'charpentier-2026-11-14.tar.gz'), old, old);
      expect(latestBackup(dir)).toMatchObject({
        name: 'charpentier-2026-11-15.tar.gz',
        size: 20,
        stale: false,
      });
      expect(latestBackup(dir, Date.now() + 49 * 3600_000)?.stale).toBe(true);
      expect(latestBackup(null)).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
