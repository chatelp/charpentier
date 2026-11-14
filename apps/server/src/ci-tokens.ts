import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Database } from './database';

/**
 * The CI's tokens (D-31): GitHub Actions writes the X250's versions to the
 * cache and publishes the version pointer. A token is made on the server
 * (`create-ci-token <name>`), shown once, and only its hash is kept.
 */

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

/** A name the commands accept: letters, digits, `-` and `_`. */
export const isCiTokenName = (name: string) => /^[\w-]{1,60}$/.test(name);

/** Makes a token for a name, revoking any earlier one of that name. */
export async function createCiToken(db: Database, name: string): Promise<string> {
  if (!isCiTokenName(name)) throw new Error('A token name is letters, digits, - and _.');
  await revokeCiToken(db, name);
  const token = randomBytes(32).toString('base64url');
  await db.query('insert into ci_tokens (id, name, token_hash) values ($1, $2, $3)', [
    randomUUID(),
    name,
    tokenHash(token),
  ]);
  return token;
}

/** Revokes the live token of a name; false if there was none. */
export async function revokeCiToken(db: Database, name: string): Promise<boolean> {
  const { rows } = await db.query<{ id: string }>(
    `update ci_tokens set revoked_at = now()
     where name = $1 and revoked_at is null returning id`,
    [name],
  );
  return rows.length > 0;
}

/** Whether a token is a live CI token. */
export async function isCiToken(db: Database, token: string): Promise<boolean> {
  if (!token) return false;
  const { rows } = await db.query<{ id: string }>(
    `update ci_tokens set last_used_at = now()
     where token_hash = $1 and revoked_at is null returning id`,
    [tokenHash(token)],
  );
  return rows.length > 0;
}
