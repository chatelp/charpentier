import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as Y from 'yjs';
import {
  checkCredentials,
  listSessions,
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
  tokenHash,
  type DeviceSession,
} from './accounts';
import { loadDocument, type Database } from './database';
import { hashPassword } from './passwords';

/**
 * What the administration page does (docs/PLAN.md phase 4.6), apart from
 * HTTP: its own sessions, the accounts (created, reset, disabled, never
 * deleted), their devices, the projects, the backups, and the log of every
 * administrative action.
 */

/** An administration session ends after 30 minutes without use, and after 8 hours at most. */
export const ADMIN_IDLE_MS = 30 * 60_000;
export const ADMIN_MAX_MS = 8 * 60 * 60_000;
/** A backup older than this is an alert. */
export const BACKUP_MAX_AGE_MS = 48 * 60 * 60_000;

export class AdminError extends Error {
  constructor(
    /** Key of the message in the page's catalogue. */
    readonly code:
      'short-password' | 'email-taken' | 'bad-email' | 'no-account' | 'not-yourself' | 'last-admin',
  ) {
    super(code);
  }
}

export interface AdminSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly email: string;
  /** The anti-CSRF token every action must carry. */
  readonly csrf: string;
}

/** An administrator signs in: a new session, its token for the cookie, only its hash kept. */
export async function adminLogin(
  db: Database,
  email: string,
  password: string,
): Promise<{ readonly token: string; readonly session: AdminSession } | null> {
  const user = await checkCredentials(db, email, password);
  if (!user?.isAdmin) return null;
  const token = randomBytes(32).toString('base64url');
  const csrf = randomBytes(24).toString('base64url');
  const sessionId = randomUUID();
  await db.query(
    'insert into admin_sessions (id, user_id, token_hash, csrf) values ($1, $2, $3, $4)',
    [sessionId, user.id, tokenHash(token), csrf],
  );
  return { token, session: { sessionId, userId: user.id, email: normalizeEmail(email), csrf } };
}

/** The live session of a cookie: an administrator still, account enabled, neither idle nor too old. */
export async function adminSessionFor(
  db: Database,
  token: string,
  now = new Date(),
): Promise<AdminSession | null> {
  if (!token) return null;
  const { rows } = await db.query<{
    id: string;
    user_id: string;
    email: string;
    csrf: string;
  }>(
    `update admin_sessions s set last_seen_at = $2
     from users u
     where s.token_hash = $1 and s.revoked_at is null and u.id = s.user_id
       and u.is_admin and u.disabled_at is null
       and s.last_seen_at > $3 and s.created_at > $4
     returning s.id, s.user_id, u.email, s.csrf`,
    [
      tokenHash(token),
      now,
      new Date(now.getTime() - ADMIN_IDLE_MS),
      new Date(now.getTime() - ADMIN_MAX_MS),
    ],
  );
  const row = rows[0];
  return row ? { sessionId: row.id, userId: row.user_id, email: row.email, csrf: row.csrf } : null;
}

export async function adminLogout(db: Database, sessionId: string): Promise<void> {
  await db.query('update admin_sessions set revoked_at = now() where id = $1', [sessionId]);
}

// ─── The log ───

export async function logAction(
  db: Database,
  adminId: string,
  action: string,
  target = '',
  detail = '',
): Promise<void> {
  await db.query(
    'insert into admin_log (admin_id, action, target, detail) values ($1, $2, $3, $4)',
    [adminId, action, target, detail],
  );
}

export interface LogEntry {
  readonly at: string;
  readonly admin: string;
  readonly action: string;
  readonly target: string;
  readonly detail: string;
}

export async function readLog(db: Database, limit = 100): Promise<LogEntry[]> {
  const { rows } = await db.query<{
    at: Date;
    email: string;
    action: string;
    target: string;
    detail: string;
  }>(
    `select l.at, u.email, l.action, l.target, l.detail
     from admin_log l join users u on u.id = l.admin_id
     order by l.id desc limit $1`,
    [limit],
  );
  return rows.map((r) => ({
    at: new Date(r.at).toISOString(),
    admin: r.email,
    action: r.action,
    target: r.target,
    detail: r.detail,
  }));
}

// ─── Accounts ───

export interface AccountRow {
  readonly id: string;
  readonly email: string;
  readonly isAdmin: boolean;
  readonly createdAt: string;
  readonly disabledAt: string | null;
  /** Devices signed in. */
  readonly devices: number;
  readonly lastSeenAt: string | null;
}

export async function listAccounts(db: Database): Promise<AccountRow[]> {
  const { rows } = await db.query<{
    id: string;
    email: string;
    is_admin: boolean;
    created_at: Date;
    disabled_at: Date | null;
    devices: string | number;
    last_seen_at: Date | null;
  }>(
    `select u.id, u.email, u.is_admin, u.created_at, u.disabled_at,
       count(s.id) filter (where s.revoked_at is null) as devices,
       max(s.last_seen_at) filter (where s.revoked_at is null) as last_seen_at
     from users u left join sessions s on s.user_id = u.id
     group by u.id order by u.created_at, u.id`,
  );
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    isAdmin: r.is_admin,
    createdAt: new Date(r.created_at).toISOString(),
    disabledAt: r.disabled_at ? new Date(r.disabled_at).toISOString() : null,
    devices: Number(r.devices),
    lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at).toISOString() : null,
  }));
}

async function emailOf(db: Database, userId: string): Promise<string> {
  const { rows } = await db.query<{ email: string }>('select email from users where id = $1', [
    userId,
  ]);
  const email = rows[0]?.email;
  if (!email) throw new AdminError('no-account');
  return email;
}

export async function createAccount(
  db: Database,
  admin: AdminSession,
  input: { readonly email: string; readonly password: string; readonly isAdmin: boolean },
): Promise<string> {
  const email = normalizeEmail(input.email);
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw new AdminError('bad-email');
  if (input.password.length < MIN_PASSWORD_LENGTH) throw new AdminError('short-password');
  const { rows } = await db.query('select 1 from users where email = $1', [email]);
  if (rows.length) throw new AdminError('email-taken');
  const id = randomUUID();
  await db.query('insert into users (id, email, password_hash, is_admin) values ($1, $2, $3, $4)', [
    id,
    email,
    await hashPassword(input.password),
    input.isAdmin,
  ]);
  await logAction(db, admin.userId, 'account.create', email, input.isAdmin ? 'admin' : '');
  return id;
}

/** A new password: every device of the account is signed out. Returns the sessions revoked. */
export async function resetAccountPassword(
  db: Database,
  admin: AdminSession,
  userId: string,
  password: string,
): Promise<string[]> {
  if (password.length < MIN_PASSWORD_LENGTH) throw new AdminError('short-password');
  const email = await emailOf(db, userId);
  await db.query('update users set password_hash = $2 where id = $1', [
    userId,
    await hashPassword(password),
  ]);
  const revoked = await revokeAll(db, userId);
  await logAction(db, admin.userId, 'account.reset-password', email);
  return revoked;
}

async function revokeAll(db: Database, userId: string): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(
    `update sessions set revoked_at = now()
     where user_id = $1 and revoked_at is null returning id`,
    [userId],
  );
  await db.query(
    'update admin_sessions set revoked_at = now() where user_id = $1 and revoked_at is null',
    [userId],
  );
  return rows.map((r) => r.id);
}

/**
 * Disables an account (its projects stay; it can no longer sign in or sync)
 * or enables it again. Returns the device sessions revoked, to cut them off.
 */
export async function setAccountDisabled(
  db: Database,
  admin: AdminSession,
  userId: string,
  disabled: boolean,
): Promise<string[]> {
  if (userId === admin.userId) throw new AdminError('not-yourself');
  const email = await emailOf(db, userId);
  await db.query(
    `update users set disabled_at = ${disabled ? 'coalesce(disabled_at, now())' : 'null'} where id = $1`,
    [userId],
  );
  const revoked = disabled ? await revokeAll(db, userId) : [];
  await logAction(db, admin.userId, disabled ? 'account.disable' : 'account.enable', email);
  return revoked;
}

export async function setAccountAdmin(
  db: Database,
  admin: AdminSession,
  userId: string,
  isAdmin: boolean,
): Promise<void> {
  if (userId === admin.userId) throw new AdminError('not-yourself');
  const email = await emailOf(db, userId);
  if (!isAdmin) {
    const { rows } = await db.query<{ n: string | number }>(
      'select count(*) as n from users where is_admin and disabled_at is null and id <> $1',
      [userId],
    );
    if (Number(rows[0]?.n ?? 0) === 0) throw new AdminError('last-admin');
    await db.query(
      'update admin_sessions set revoked_at = now() where user_id = $1 and revoked_at is null',
      [userId],
    );
  }
  await db.query('update users set is_admin = $2 where id = $1', [userId, isAdmin]);
  await logAction(
    db,
    admin.userId,
    isAdmin ? 'account.grant-admin' : 'account.revoke-admin',
    email,
  );
}

// ─── Devices ───

export const accountDevices = (db: Database, userId: string): Promise<DeviceSession[]> =>
  listSessions(db, userId);

export async function revokeDevice(
  db: Database,
  admin: AdminSession,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const { rows } = await db.query<{ device: string }>(
    `update sessions set revoked_at = now()
     where id = $1 and user_id = $2 and revoked_at is null returning device`,
    [sessionId, userId],
  );
  const device = rows[0];
  if (!device) return false;
  await logAction(db, admin.userId, 'device.revoke', await emailOf(db, userId), device.device);
  return true;
}

// ─── Projects ───

export interface ProjectRow {
  readonly id: string;
  readonly owner: string;
  readonly ownerId: string;
  readonly title: string;
  /** Bytes of all its documents on the server. */
  readonly size: number;
  readonly lastWrite: string | null;
  readonly trashed: boolean;
}

/** One entry of an account's library document (written by the devices). */
interface LibraryRecord {
  readonly title?: unknown;
  readonly trashedAt?: unknown;
}

async function libraryOf(db: Database, userId: string): Promise<Map<string, LibraryRecord>> {
  const state = await loadDocument(db, `library:${userId}`);
  const doc = new Y.Doc();
  if (state) Y.applyUpdate(doc, state);
  const records = new Map<string, LibraryRecord>();
  for (const [id, value] of doc.getMap<unknown>('projects'))
    if (typeof value === 'object' && value !== null) records.set(id, value as LibraryRecord);
  doc.destroy();
  return records;
}

export async function listProjects(db: Database): Promise<ProjectRow[]> {
  const { rows } = await db.query<{
    id: string;
    user_id: string;
    email: string;
    size: string | number | null;
    last_write: Date | null;
  }>(
    `select p.id, p.user_id, u.email,
       (select sum(octet_length(d.state)) from documents d
        where d.name = 'project:' || p.id or d.name like 'project:' || p.id || '/%') as size,
       (select max(d.updated_at) from documents d
        where d.name = 'project:' || p.id or d.name like 'project:' || p.id || '/%') as last_write
     from projects p join users u on u.id = p.user_id
     order by u.email, p.created_at`,
  );
  const libraries = new Map<string, Map<string, LibraryRecord>>();
  const result: ProjectRow[] = [];
  for (const r of rows) {
    let library = libraries.get(r.user_id);
    if (!library) {
      library = await libraryOf(db, r.user_id);
      libraries.set(r.user_id, library);
    }
    const record = library.get(r.id);
    result.push({
      id: r.id,
      owner: r.email,
      ownerId: r.user_id,
      title: typeof record?.title === 'string' ? record.title : '',
      size: Number(r.size ?? 0),
      lastWrite: r.last_write ? new Date(r.last_write).toISOString() : null,
      trashed: typeof record?.trashedAt === 'string' && record.trashedAt !== '',
    });
  }
  return result;
}

// ─── Backups ───

export interface BackupInfo {
  readonly name: string;
  readonly size: number;
  readonly at: string;
  /** Older than 48 hours. */
  readonly stale: boolean;
}

/**
 * The last archive in the backups folder (the nightly job's, infra/README.md),
 * mounted read-only into the server; null when there is none or no folder.
 */
export function latestBackup(dir: string | null, now = Date.now()): BackupInfo | null {
  if (!dir) return null;
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  let latest: { name: string; size: number; mtime: number } | null = null;
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    try {
      const stat = fs.statSync(path.join(dir, name));
      if (stat.isFile() && (!latest || stat.mtimeMs > latest.mtime))
        latest = { name, size: stat.size, mtime: stat.mtimeMs };
    } catch {
      // Gone meanwhile.
    }
  }
  if (!latest) return null;
  return {
    name: latest.name,
    size: latest.size,
    at: new Date(latest.mtime).toISOString(),
    stale: now - latest.mtime > BACKUP_MAX_AGE_MS,
  };
}
