import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Passwords hashed with Argon2id (D-21), Node's own implementation (no native
 * dependency). OWASP's first recommended setting: 64 MiB, 3 passes, 1 lane.
 * Stored as a PHC string, so that the settings can change later.
 */
const PARAMS = { memory: 65_536, passes: 3, parallelism: 1, tagLength: 32 } as const;

interface Params {
  readonly memory: number;
  readonly passes: number;
  readonly parallelism: number;
  readonly tagLength: number;
}

function derive(password: string, nonce: Buffer, params: Params): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    argon2('argon2id', { message: password, nonce, ...params }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

const PREFIX = '$argon2id$v=19$';

/**
 * A key drawn from the password (the Compagnon's key is sealed with it, phase
 * 4.7 b): the same Argon2id, its own salt, 32 bytes for AES-256.
 */
export function keyFromPassword(password: string, salt: Buffer): Promise<Buffer> {
  return derive(password, salt, PARAMS);
}

export async function hashPassword(password: string): Promise<string> {
  const nonce = randomBytes(16);
  const key = await derive(password, nonce, PARAMS);
  const settings = `m=${PARAMS.memory},t=${PARAMS.passes},p=${PARAMS.parallelism}`;
  return `${PREFIX}${settings}$${nonce.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored.startsWith(PREFIX)) return false;
  const [settings = '', nonce = '', hash = ''] = stored.slice(PREFIX.length).split('$');
  const values = Object.fromEntries(
    settings.split(',').map((pair) => {
      const [name, value] = pair.split('=');
      return [name, Number(value)];
    }),
  );
  const expected = Buffer.from(hash, 'base64url');
  if (!values['m'] || !values['t'] || !values['p'] || expected.length < 16) return false;
  const key = await derive(password, Buffer.from(nonce, 'base64url'), {
    memory: values['m'],
    passes: values['t'],
    parallelism: values['p'],
    tagLength: expected.length,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A well-formed hash of nothing, so that an unknown account costs as much time as a known one. */
export const DUMMY_HASH = `${PREFIX}m=65536,t=3,p=1$${'A'.repeat(22)}$${'A'.repeat(43)}`;
