import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Database } from './database';
import { DUMMY_HASH, hashPassword, verifyPassword } from './passwords';

/** Accounts and device sessions (D-21): one session per device, revocable. */

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

/** A password the server accepts: long enough to resist guessing. */
export const MIN_PASSWORD_LENGTH = 12;

function checkPassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH)
    throw new Error(`The password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
}

export async function createUser(
  db: Database,
  email: string,
  password: string,
  options: { readonly admin?: boolean } = {},
): Promise<string> {
  checkPassword(password);
  const id = randomUUID();
  // The first account is an administrator (phase 4.6), as the migration says.
  await db.query(
    `insert into users (id, email, password_hash, is_admin)
     values ($1, $2, $3, $4 or not exists (select 1 from users))`,
    [id, normalizeEmail(email), await hashPassword(password), options.admin ?? false],
  );
  return id;
}

/** Sets a new password and signs every device out. */
export async function resetPassword(db: Database, email: string, password: string): Promise<void> {
  checkPassword(password);
  const { rows } = await db.query<{ id: string }>(
    'update users set password_hash = $2 where email = $1 returning id',
    [normalizeEmail(email), await hashPassword(password)],
  );
  const user = rows[0];
  if (!user) throw new Error('No account with this e-mail.');
  await db.query(
    'update sessions set revoked_at = now() where user_id = $1 and revoked_at is null',
    [user.id],
  );
}

/** The account these credentials open, if it exists and is not disabled. */
export async function checkCredentials(
  db: Database,
  email: string,
  password: string,
): Promise<{ readonly id: string; readonly isAdmin: boolean } | null> {
  const { rows } = await db.query<{
    id: string;
    password_hash: string;
    is_admin: boolean;
    disabled_at: Date | null;
  }>('select id, password_hash, is_admin, disabled_at from users where email = $1', [
    normalizeEmail(email),
  ]);
  const user = rows[0];
  // Same work whether the account exists or not.
  const valid = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !valid || user.disabled_at) return null;
  return { id: user.id, isAdmin: user.is_admin };
}

export interface Login {
  readonly token: string;
  readonly userId: string;
  readonly sessionId: string;
}

/** A device signs in: a new session, its token given once (only its hash is kept). */
export async function login(
  db: Database,
  email: string,
  password: string,
  device: string,
): Promise<Login | null> {
  const user = await checkCredentials(db, email, password);
  if (!user) return null;
  const token = randomBytes(32).toString('base64url');
  const sessionId = randomUUID();
  await db.query('insert into sessions (id, user_id, token_hash, device) values ($1, $2, $3, $4)', [
    sessionId,
    user.id,
    tokenHash(token),
    device.slice(0, 120),
  ]);
  return { token, userId: user.id, sessionId };
}

export interface Session {
  readonly userId: string;
  readonly sessionId: string;
}

/** The live session a token stands for, or null (unknown or revoked). */
export async function sessionFor(db: Database, token: string): Promise<Session | null> {
  if (!token) return null;
  const { rows } = await db.query<{ id: string; user_id: string }>(
    `update sessions set last_seen_at = now()
     where token_hash = $1 and revoked_at is null
       and user_id in (select id from users where disabled_at is null)
     returning id, user_id`,
    [tokenHash(token)],
  );
  const row = rows[0];
  return row ? { userId: row.user_id, sessionId: row.id } : null;
}

export async function revokeSession(
  db: Database,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const { rows } = await db.query<{ id: string }>(
    `update sessions set revoked_at = now()
     where id = $1 and user_id = $2 and revoked_at is null returning id`,
    [sessionId, userId],
  );
  return rows.length > 0;
}

export interface DeviceSession {
  readonly id: string;
  readonly device: string;
  readonly createdAt: string;
  readonly lastSeenAt: string;
}

/** The devices signed in to an account, most recently seen first. */
export async function listSessions(db: Database, userId: string): Promise<DeviceSession[]> {
  const { rows } = await db.query<{
    id: string;
    device: string;
    created_at: Date;
    last_seen_at: Date;
  }>(
    `select id, device, created_at, last_seen_at from sessions
     where user_id = $1 and revoked_at is null order by last_seen_at desc`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.id,
    device: r.device,
    createdAt: new Date(r.created_at).toISOString(),
    lastSeenAt: new Date(r.last_seen_at).toISOString(),
  }));
}

/**
 * Who a project belongs to: the first account that opens it claims it (its
 * id is random and never guessed), after which only that account may.
 */
export async function claimProject(
  db: Database,
  projectId: string,
  userId: string,
): Promise<boolean> {
  await db.query('insert into projects (id, user_id) values ($1, $2) on conflict (id) do nothing', [
    projectId,
    userId,
  ]);
  const { rows } = await db.query<{ user_id: string }>(
    'select user_id from projects where id = $1',
    [projectId],
  );
  return rows[0]?.user_id === userId;
}
