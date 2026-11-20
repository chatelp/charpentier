import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { LlmResponse } from '@charpentier/platform';
import type { Database } from './database';

/**
 * The Compagnon provided by an account (docs/PLAN.md phase 4.8, D-43): the
 * administrator attaches an API key to a tester's account, with a ceiling of
 * spending per month. The key never leaves the server: it is sealed
 * (AES-256-GCM) by a secret of the server kept out of the base
 * (`COMPAGNON_SECRET`, in the host's .env), so that neither the base nor a
 * backup can read it, and the server uses it without the tester's password.
 *
 * Every call of the relay is counted, for every account, in US dollars (the
 * provider's currency), month by month in the server's time zone.
 */

/** Dollars per million tokens, Anthropic's prices (20 November 2026); a cache point lasts an hour. */
const PRICES = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 8 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.2 },
} as const;

export type PricedModel = keyof typeof PRICES;

/** What a call cost, in millionths of a dollar. */
export function costMicros(model: PricedModel, usage: LlmResponse['usage']): number {
  if (!usage) return 0;
  const price = PRICES[model];
  return Math.round(
    usage.inputTokens * price.input +
      usage.outputTokens * price.output +
      (usage.cacheReadTokens ?? 0) * price.cacheRead +
      (usage.cacheWriteTokens ?? 0) * price.cacheWrite,
  );
}

/** The month a call is counted in (« 2026-11 »), in the server's time zone. */
export function monthOf(date: Date, timeZone = 'Europe/Paris'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' })
    .format(date)
    .slice(0, 7);
}

/** The server's secret, from its hexadecimal form (64 digits); null if absent or malformed. */
export function providedSecret(hex: string | undefined): Buffer | null {
  return hex && /^[0-9a-f]{64}$/i.test(hex) ? Buffer.from(hex, 'hex') : null;
}

export interface Provided {
  /** The ceiling of the month, in cents of a dollar; null: none. */
  readonly ceilingCents: number | null;
}

function seal(secret: Buffer, apiKey: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secret, nonce);
  const sealed = Buffer.concat([
    cipher.update(apiKey, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return { nonce, sealed };
}

function open(secret: Buffer, nonce: Buffer, sealed: Buffer): string | null {
  try {
    const decipher = createDecipheriv('aes-256-gcm', secret, nonce);
    decipher.setAuthTag(sealed.subarray(sealed.length - 16));
    return Buffer.concat([
      decipher.update(sealed.subarray(0, sealed.length - 16)),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

/** Attaches a key to an account (or replaces it), with its ceiling. */
export async function provideCompagnon(
  db: Database,
  secret: Buffer,
  userId: string,
  apiKey: string,
  ceilingCents: number | null,
): Promise<void> {
  const { nonce, sealed } = seal(secret, apiKey.trim());
  await db.query(
    `insert into provided_compagnons (user_id, nonce, sealed, ceiling_cents) values ($1, $2, $3, $4)
     on conflict (user_id) do update
       set nonce = excluded.nonce, sealed = excluded.sealed,
           ceiling_cents = excluded.ceiling_cents, updated_at = now()`,
    [userId, nonce, sealed, ceilingCents],
  );
}

/** Changes the ceiling of an account that has a provided Compagnon; false if it has none. */
export async function setCeiling(
  db: Database,
  userId: string,
  ceilingCents: number | null,
): Promise<boolean> {
  const { rows } = await db.query<{ user_id: string }>(
    'update provided_compagnons set ceiling_cents = $2, updated_at = now() where user_id = $1 returning user_id',
    [userId, ceilingCents],
  );
  return rows.length > 0;
}

/** Takes the key away (the account goes back to a key of its own, if it has one). */
export async function withdrawCompagnon(db: Database, userId: string): Promise<boolean> {
  const { rows } = await db.query<{ user_id: string }>(
    'delete from provided_compagnons where user_id = $1 returning user_id',
    [userId],
  );
  return rows.length > 0;
}

export async function providedFor(db: Database, userId: string): Promise<Provided | null> {
  const { rows } = await db.query<{ ceiling_cents: number | null }>(
    'select ceiling_cents from provided_compagnons where user_id = $1',
    [userId],
  );
  const row = rows[0];
  return row ? { ceilingCents: row.ceiling_cents } : null;
}

/** The provided key, opened with the server's secret; null without one, or unreadable. */
export async function providedKey(
  db: Database,
  secret: Buffer | null,
  userId: string,
): Promise<string | null> {
  if (!secret) return null;
  const { rows } = await db.query<{ nonce: Buffer; sealed: Buffer }>(
    'select nonce, sealed from provided_compagnons where user_id = $1',
    [userId],
  );
  const row = rows[0];
  return row ? open(secret, Buffer.from(row.nonce), Buffer.from(row.sealed)) : null;
}

/** What an account spent in a month, in millionths of a dollar, and in how many calls. */
export async function spendOf(
  db: Database,
  userId: string,
  month: string,
): Promise<{ micros: number; calls: number }> {
  const { rows } = await db.query<{ micros: string | number; calls: number }>(
    'select micros, calls from compagnon_spend where user_id = $1 and month = $2',
    [userId, month],
  );
  return { micros: Number(rows[0]?.micros ?? 0), calls: rows[0]?.calls ?? 0 };
}

export async function addSpend(
  db: Database,
  userId: string,
  month: string,
  micros: number,
): Promise<void> {
  await db.query(
    `insert into compagnon_spend (user_id, month, micros, calls) values ($1, $2, $3, 1)
     on conflict (user_id, month) do update
       set micros = compagnon_spend.micros + excluded.micros, calls = compagnon_spend.calls + 1`,
    [userId, month, micros],
  );
}
