import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AnthropicLlmService, HAIKU, OPUS } from '@charpentier/anthropic';
import {
  LlmOfflineError,
  LlmRefusalError,
  LlmUnconfiguredError,
  type LlmRequest,
} from '@charpentier/platform';
import type { Session } from './accounts';
import { clientAddress } from './admin/network';
import type { Database } from './database';
import { readJson, send, type LoginLimiter } from './http-api';
import { keyFromPassword, verifyPassword } from './passwords';
import {
  addSpend,
  costMicros,
  monthOf,
  providedFor,
  providedKey,
  spendOf,
  type PricedModel,
} from './provided';

/**
 * The Compagnon of the app in the browser (docs/PLAN.md phase 4.7 b, the
 * author's choice on 20 November 2026: the server relays the calls). The
 * agents run in the page, as on the desktop; each call to the model comes
 * here, and the server adds the account's key. The key never goes back to
 * the browser.
 *
 * The key is sealed (AES-256-GCM) by a key drawn from the account's
 * password, which the server sees only at sign-in: it opens the key then and
 * keeps it in memory for that session. Neither the base nor a backup can
 * open it; after a restart of the server, the Compagnon asks for the
 * password again (« locked »).
 *
 *   GET    /api/compagnon           { status: available | unconfigured | locked }
 *   POST   /api/compagnon/unlock    { password } → { status }
 *   POST   /api/compagnon/key       { key } → { result: saved | invalid | offline }
 *   DELETE /api/compagnon/key       forgets the key
 *   POST   /api/compagnon/generate  { request: LlmRequest, light?: opus | haiku } → LlmResponse
 */

/** `ceiling`: the account's Compagnon is provided, and its spending reached the month's ceiling. */
export type CompagnonStatus = 'available' | 'unconfigured' | 'locked' | 'ceiling';

/** Where the account's Compagnon stands, and whether the account provides it (phase 4.8). */
export interface CompagnonState {
  readonly status: CompagnonStatus;
  readonly provided: boolean;
}

export interface CompagnonOptions {
  /** For tests: the model, played without the network. */
  readonly createLlm?: CreateLlm;
  /** The secret that seals the keys the accounts provide (`COMPAGNON_SECRET`); without it, none. */
  readonly secret?: Buffer | null;
  readonly timeZone?: string;
  readonly now?: () => Date;
}

/** A whole manuscript goes in a deep work's request. */
const MAX_REQUEST = 16 * 1024 * 1024;
/** The longest answer an agent asks for (deep work, thinking included). */
const MAX_OUTPUT_TOKENS = 64_000;

interface Unlocked {
  readonly userId: string;
  /** The key drawn from the password, and the salt it was drawn with. */
  readonly kek: Buffer;
  readonly salt: Buffer;
  apiKey: string | null;
}

function seal(kek: Buffer, apiKey: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', kek, nonce);
  const sealed = Buffer.concat([
    cipher.update(apiKey, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return { nonce, sealed };
}

function open(kek: Buffer, nonce: Buffer, sealed: Buffer): string | null {
  try {
    const decipher = createDecipheriv('aes-256-gcm', kek, nonce);
    decipher.setAuthTag(sealed.subarray(sealed.length - 16));
    return Buffer.concat([
      decipher.update(sealed.subarray(0, sealed.length - 16)),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

/** For tests: the model, played without the network. */
export type CreateLlm = (
  apiKey: string,
  light: 'opus' | 'haiku',
) => Pick<AnthropicLlmService, 'checkKey' | 'generate'>;

const defaultLlm: CreateLlm = (apiKey, light) =>
  new AnthropicLlmService({
    apiKey: () => apiKey,
    models: () => ({ deep: OPUS, fast: light === 'haiku' ? HAIKU : OPUS }),
  });

export class CompagnonKeys {
  /** The sessions whose password the server has seen since it started. */
  readonly #unlocked = new Map<string, Unlocked>();

  readonly createLlm: CreateLlm;
  readonly #secret: Buffer | null;
  readonly #month: () => string;

  constructor(
    private readonly db: Database,
    options: CompagnonOptions = {},
  ) {
    this.createLlm = options.createLlm ?? defaultLlm;
    this.#secret = options.secret ?? null;
    const now = options.now ?? (() => new Date());
    this.#month = () => monthOf(now(), options.timeZone);
  }

  /** The account's provided key, if it has one the server can open (phase 4.8). */
  async #provided(userId: string) {
    const provided = await providedFor(this.db, userId);
    if (!provided) return null;
    const apiKey = await providedKey(this.db, this.#secret, userId);
    return apiKey ? { ...provided, apiKey } : null;
  }

  /** The spending of the month has reached the account's ceiling. */
  async #atCeiling(userId: string, ceilingCents: number | null): Promise<boolean> {
    if (ceilingCents === null) return false;
    const { micros } = await spendOf(this.db, userId, this.#month());
    return micros >= ceilingCents * 10_000;
  }

  /** Counts a call against the account, in the month it was made. */
  async spend(session: Session, model: PricedModel, usage: Parameters<typeof costMicros>[1]) {
    await addSpend(this.db, session.userId, this.#month(), costMicros(model, usage));
  }

  async state(session: Session): Promise<CompagnonState> {
    const provided = await this.#provided(session.userId);
    if (provided)
      return {
        status: (await this.#atCeiling(session.userId, provided.ceilingCents))
          ? 'ceiling'
          : 'available',
        provided: true,
      };
    return { status: this.#ownStatus(session), provided: false };
  }

  /** The key a call goes with: the provided one first, else the account's own, opened. */
  async keyFor(
    session: Session,
  ): Promise<{ apiKey: string } | { refused: 'locked' | 'no-key' | 'ceiling' }> {
    const provided = await this.#provided(session.userId);
    if (provided)
      return (await this.#atCeiling(session.userId, provided.ceilingCents))
        ? { refused: 'ceiling' }
        : { apiKey: provided.apiKey };
    const apiKey = this.apiKey(session);
    if (apiKey) return { apiKey };
    return { refused: this.#ownStatus(session) === 'locked' ? 'locked' : 'no-key' };
  }

  async #row(userId: string) {
    const { rows } = await this.db.query<{ salt: Buffer; nonce: Buffer; sealed: Buffer }>(
      'select salt, nonce, sealed from compagnon_keys where user_id = $1',
      [userId],
    );
    return rows[0] ?? null;
  }

  /**
   * The password of this session, just checked (a sign-in, or « unlock »):
   * the key drawn from it opens the account's key, kept for this session.
   */
  async unlock(session: Session, password: string): Promise<void> {
    const row = await this.#row(session.userId);
    const salt = row ? Buffer.from(row.salt) : randomBytes(16);
    const kek = await keyFromPassword(password, salt);
    let apiKey: string | null = null;
    if (row) {
      apiKey = open(kek, Buffer.from(row.nonce), Buffer.from(row.sealed));
      // Sealed with an older password (reset by the administrator): it cannot be opened.
      if (apiKey === null)
        await this.db.query('delete from compagnon_keys where user_id = $1', [session.userId]);
    }
    this.#unlocked.set(session.sessionId, { userId: session.userId, kek, salt, apiKey });
  }

  #ownStatus(session: Session): 'available' | 'unconfigured' | 'locked' {
    const unlocked = this.#unlocked.get(session.sessionId);
    if (!unlocked || unlocked.userId !== session.userId) return 'locked';
    return unlocked.apiKey ? 'available' : 'unconfigured';
  }

  apiKey(session: Session): string | null {
    const unlocked = this.#unlocked.get(session.sessionId);
    return unlocked?.userId === session.userId ? unlocked.apiKey : null;
  }

  /** Seals the key for the account; every open session of it uses it at once. */
  async save(session: Session, apiKey: string): Promise<boolean> {
    const unlocked = this.#unlocked.get(session.sessionId);
    if (!unlocked || unlocked.userId !== session.userId) return false;
    const { nonce, sealed } = seal(unlocked.kek, apiKey);
    await this.db.query(
      `insert into compagnon_keys (user_id, salt, nonce, sealed) values ($1, $2, $3, $4)
       on conflict (user_id) do update
         set salt = excluded.salt, nonce = excluded.nonce, sealed = excluded.sealed, updated_at = now()`,
      [session.userId, unlocked.salt, nonce, sealed],
    );
    for (const other of this.#unlocked.values())
      if (other.userId === session.userId) other.apiKey = apiKey;
    return true;
  }

  async forget(session: Session): Promise<void> {
    await this.db.query('delete from compagnon_keys where user_id = $1', [session.userId]);
    for (const other of this.#unlocked.values())
      if (other.userId === session.userId) other.apiKey = null;
  }

  /** A session signed out or revoked: what it held in memory goes. */
  forgetSessions(sessionIds: readonly string[]): void {
    for (const id of sessionIds) this.#unlocked.delete(id);
  }
}

/** A request the model may take: the shape of `LlmRequest`, the output bounded. */
function llmRequest(value: unknown): LlmRequest | null {
  if (typeof value !== 'object' || value === null) return null;
  const r = value as Record<string, unknown>;
  if (typeof r['system'] !== 'string' || !Array.isArray(r['messages'])) return null;
  if (r['tier'] !== 'deep' && r['tier'] !== 'fast') return null;
  const max = r['maxOutputTokens'];
  if (typeof max !== 'number' || !Number.isInteger(max) || max < 1) return null;
  for (const m of r['messages'] as unknown[]) {
    const message = m as Record<string, unknown> | null;
    if (!message || (message['role'] !== 'user' && message['role'] !== 'assistant')) return null;
    if (typeof message['content'] !== 'string' && !Array.isArray(message['content'])) return null;
  }
  return { ...(r as unknown as LlmRequest), maxOutputTokens: Math.min(max, MAX_OUTPUT_TOKENS) };
}

/** Handles the Compagnon's routes for a signed-in session; false for another path. */
export async function handleCompagnon(
  db: Database,
  keys: CompagnonKeys,
  limiter: LoginLimiter,
  session: Session,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname !== '/api/compagnon' && !url.pathname.startsWith('/api/compagnon/'))
    return false;
  const route = `${request.method ?? 'GET'} ${url.pathname}`;

  if (route === 'GET /api/compagnon') {
    send(response, 200, await keys.state(session));
  } else if (route === 'POST /api/compagnon/unlock') {
    const body = await readJson(request);
    const password = typeof body?.['password'] === 'string' ? body['password'] : '';
    const key = `${clientAddress(request)}|unlock|${session.userId}`;
    if (!limiter.allow(key)) {
      send(response, 429, { error: 'too-many-attempts' });
      return true;
    }
    const { rows } = await db.query<{ password_hash: string }>(
      'select password_hash from users where id = $1',
      [session.userId],
    );
    if (!password || !(await verifyPassword(password, rows[0]?.password_hash ?? ''))) {
      send(response, 401, { error: 'invalid-credentials' });
      return true;
    }
    limiter.reset(key);
    await keys.unlock(session, password);
    send(response, 200, await keys.state(session));
  } else if (route === 'POST /api/compagnon/key') {
    const body = await readJson(request);
    const apiKey = typeof body?.['key'] === 'string' ? body['key'].trim() : '';
    const { status, provided } = await keys.state(session);
    if (!apiKey) send(response, 400, { error: 'key' });
    // The account's Compagnon is provided: no key of its own (phase 4.8).
    else if (provided) send(response, 409, { error: 'provided' });
    else if (status === 'locked') send(response, 409, { error: 'locked' });
    else {
      const check = await keys.createLlm(apiKey, 'opus').checkKey(apiKey);
      if (check === 'valid') await keys.save(session, apiKey);
      send(response, 200, { result: check === 'valid' ? 'saved' : check });
    }
  } else if (route === 'DELETE /api/compagnon/key') {
    await keys.forget(session);
    send(response, 204);
  } else if (route === 'POST /api/compagnon/generate') {
    await generate(keys, session, request, response);
  } else send(response, 404, { error: 'not-found' });
  return true;
}

async function generate(
  keys: CompagnonKeys,
  session: Session,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const key = await keys.keyFor(session);
  if ('refused' in key)
    return send(response, key.refused === 'ceiling' ? 429 : 409, { error: key.refused });
  const { apiKey } = key;
  const body = await readJson(request, MAX_REQUEST);
  const llmInput = llmRequest(body?.['request']);
  if (!llmInput) return send(response, 400, { error: 'request' });
  const light = body?.['light'] === 'haiku' ? 'haiku' : 'opus';
  // The page gave up (« Arrêter », a closed tab): the call to the model stops too.
  const controller = new AbortController();
  response.on('close', () => {
    if (!response.writableFinished) controller.abort();
  });
  try {
    const answer = await keys.createLlm(apiKey, light).generate(llmInput, controller.signal);
    // What each account spends, counted against its ceiling (phase 4.8).
    const model: PricedModel = llmInput.tier === 'fast' && light === 'haiku' ? HAIKU : OPUS;
    await keys.spend(session, model, answer.usage);
    console.info(
      `[compagnon] ${session.userId} · ${llmInput.tier} · ${answer.usage?.inputTokens ?? 0} in, ${answer.usage?.cacheReadTokens ?? 0} cached, ${answer.usage?.outputTokens ?? 0} out`,
    );
    send(response, 200, answer);
  } catch (error) {
    if (controller.signal.aborted) return response.destroy();
    if (error instanceof LlmRefusalError) return send(response, 422, { error: 'refused' });
    if (error instanceof LlmUnconfiguredError) return send(response, 409, { error: 'key-refused' });
    if (error instanceof LlmOfflineError) return send(response, 502, { error: 'offline' });
    console.error('[compagnon] the call to the model failed', error);
    send(response, 502, { error: 'provider' });
  }
}
