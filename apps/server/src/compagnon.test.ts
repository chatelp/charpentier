import { LlmRefusalError, type LlmRequest, type LlmResponse } from '@charpentier/platform';
import { afterEach, describe, expect, it } from 'vitest';
import type { CreateLlm } from './compagnon';
import type { Database } from './database';
import { createSyncServer } from './sync-server';
import { account, cleanUp, freshDatabase } from './testing';

const servers: { destroy(): Promise<void> }[] = [];
afterEach(async () => {
  await cleanUp();
  for (const server of servers.splice(0)) await server.destroy();
});

const GOOD_KEY = 'sk-ant-api03-la-bonne-cle';

/** The model, played: it knows one key, records which key and model each call came with. */
function fakeModel() {
  const calls: { apiKey: string; light: string; request: LlmRequest }[] = [];
  const createLlm: CreateLlm = (apiKey, light) => ({
    checkKey: async (key) => (key === GOOD_KEY ? 'valid' : 'invalid'),
    generate: async (request): Promise<LlmResponse> => {
      calls.push({ apiKey, light, request });
      if (request.system === 'refuse') throw new LlmRefusalError('declined');
      return { text: 'Que veut Hélène ?' };
    },
  });
  return { createLlm, calls };
}

async function start(db: Database, createLlm: CreateLlm) {
  const server = createSyncServer({ db, port: 0, address: '127.0.0.1', createLlm });
  await server.listen();
  servers.push(server);
  return { server, base: `http://127.0.0.1:${server.address.port}` };
}

/** A browser on the app's page, with its cookie jar; `base` follows a restarted server. */
function browser(base: string) {
  let cookie = '';
  const page = {
    base,
    async call(method: string, path: string, body?: unknown) {
      const response = await fetch(`${page.base}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Sec-Fetch-Site': 'same-origin',
          ...(cookie && { Cookie: cookie }),
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
      const set = response.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0] ?? '';
      const text = await response.text();
      return {
        status: response.status,
        body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
      };
    },
    signIn: (email: string, password: string) =>
      page.call('POST', '/api/login', { email, password, device: 'Navigateur', cookie: true }),
    status: async () => (await page.call('GET', '/api/compagnon')).body['status'],
    ask: (system = 'Le Compagnon', light?: 'haiku') =>
      page.call('POST', '/api/compagnon/generate', {
        request: {
          tier: 'fast',
          system,
          messages: [{ role: 'user', content: 'Ma scène.' }],
          maxOutputTokens: 1_000_000,
        },
        ...(light && { light }),
      }),
  };
  return page;
}

describe('the browser’s Compagnon through the server (phase 4.7 b)', () => {
  it('seals the key with the password and relays the calls with it', async () => {
    const db = await freshDatabase();
    const model = fakeModel();
    const { base } = await start(db, model.createLlm);
    const helene = await account(db);

    const page = browser(base);
    expect((await page.signIn(helene.email, helene.password)).status).toBe(200);
    expect(await page.status()).toBe('unconfigured');
    expect((await page.ask()).body).toEqual({ error: 'no-key' });

    expect((await page.call('POST', '/api/compagnon/key', { key: 'sk-faux' })).body).toEqual({
      result: 'invalid',
    });
    expect((await page.call('POST', '/api/compagnon/key', { key: GOOD_KEY })).body).toEqual({
      result: 'saved',
    });
    expect(await page.status()).toBe('available');

    // The call goes to the model with the account's key, its output bounded; the key never comes back.
    const answer = await page.ask('Le Compagnon', 'haiku');
    expect(answer).toEqual({ status: 200, body: { text: 'Que veut Hélène ?' } });
    expect(model.calls.at(-1)).toMatchObject({ apiKey: GOOD_KEY, light: 'haiku' });
    expect(model.calls.at(-1)?.request.maxOutputTokens).toBe(64_000);
    expect((await page.ask('refuse')).body).toEqual({ error: 'refused' });

    // Nothing in the base reads as the key.
    const { rows } = await db.query<Record<string, unknown>>('select * from compagnon_keys');
    expect(rows).toHaveLength(1);
    const dump = JSON.stringify(rows, (_k, v: unknown) =>
      v instanceof Uint8Array ? Buffer.from(v).toString('latin1') : v,
    );
    expect(dump).not.toContain('la-bonne-cle');

    // Another account has no Compagnon of its own, and cannot use this one.
    const claire = await account(db, 'claire@example.org');
    const other = browser(base);
    await other.signIn(claire.email, claire.password);
    expect(await other.status()).toBe('unconfigured');
    expect((await other.ask()).body).toEqual({ error: 'no-key' });

    // Forgotten: for every session of the account.
    expect((await page.call('DELETE', '/api/compagnon/key')).status).toBe(204);
    expect(await page.status()).toBe('unconfigured');
    expect((await db.query('select * from compagnon_keys')).rows).toHaveLength(0);
  });

  it('asks for the password again after a restart, and opens the key with it only', async () => {
    const db = await freshDatabase();
    const model = fakeModel();
    const first = await start(db, model.createLlm);
    const helene = await account(db);
    const page = browser(first.base);
    await page.signIn(helene.email, helene.password);
    await page.call('POST', '/api/compagnon/key', { key: GOOD_KEY });

    // The server restarts; the browser keeps its session (its cookie).
    await first.server.destroy();
    page.base = (await start(db, model.createLlm)).base;
    expect((await page.call('GET', '/api/account')).status).toBe(200);
    expect(await page.status()).toBe('locked');
    expect((await page.ask()).body).toEqual({ error: 'locked' });
    expect((await page.call('POST', '/api/compagnon/key', { key: GOOD_KEY })).body).toEqual({
      error: 'locked',
    });

    expect(
      (await page.call('POST', '/api/compagnon/unlock', { password: 'pas le bon' })).status,
    ).toBe(401);
    expect(
      (await page.call('POST', '/api/compagnon/unlock', { password: helene.password })).body,
    ).toEqual({ status: 'available' });
    expect((await page.ask()).status).toBe(200);
    expect(model.calls.at(-1)?.apiKey).toBe(GOOD_KEY);
  });

  it('forgets a key sealed with an older password, and lets go of a signed-out session', async () => {
    const db = await freshDatabase();
    const model = fakeModel();
    const { base } = await start(db, model.createLlm);
    const helene = await account(db);
    const page = browser(base);
    await page.signIn(helene.email, helene.password);
    await page.call('POST', '/api/compagnon/key', { key: GOOD_KEY });

    // The administrator resets the password: the old seal cannot be opened.
    const { hashPassword } = await import('./passwords');
    await db.query('update users set password_hash = $1 where id = $2', [
      await hashPassword('un nouveau mot de passe'),
      helene.userId,
    ]);
    const later = browser(base);
    await later.signIn(helene.email, 'un nouveau mot de passe');
    expect(await later.status()).toBe('unconfigured');
    expect((await db.query('select * from compagnon_keys')).rows).toHaveLength(0);

    await later.call('POST', '/api/logout');
    expect((await later.call('GET', '/api/compagnon')).status).toBe(401);
  });
});
