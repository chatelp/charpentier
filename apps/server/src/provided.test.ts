import { randomBytes } from 'node:crypto';
import type { LlmResponse } from '@charpentier/platform';
import { afterEach, describe, expect, it } from 'vitest';
import type { CreateLlm } from './compagnon';
import type { Database } from './database';
import {
  costMicros,
  monthOf,
  provideCompagnon,
  setCeiling,
  spendOf,
  withdrawCompagnon,
} from './provided';
import { createSyncServer } from './sync-server';
import { account, cleanUp, freshDatabase } from './testing';

const servers: { destroy(): Promise<void> }[] = [];
afterEach(async () => {
  await cleanUp();
  for (const server of servers.splice(0)) await server.destroy();
});

const PROVIDED = 'sk-ant-api03-la-cle-du-testeur';

/** The model, played: each call costs 1 000 tokens in and 1 000 out (2.4 cents on Opus). */
function fakeModel() {
  const keys: string[] = [];
  const createLlm: CreateLlm = (apiKey) => ({
    checkKey: async () => 'valid',
    generate: async (): Promise<LlmResponse> => {
      keys.push(apiKey);
      return {
        text: 'Que veut Hélène ?',
        usage: { inputTokens: 1000, outputTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0 },
      };
    },
  });
  return { createLlm, keys };
}

async function start(
  db: Database,
  createLlm: CreateLlm,
  secret: Buffer | null,
  now: () => Date = () => new Date('2026-11-20T10:00:00Z'),
) {
  const server = createSyncServer({
    db,
    port: 0,
    address: '127.0.0.1',
    createLlm,
    compagnonSecret: secret,
    admin: { now },
  });
  await server.listen();
  servers.push(server);
  return { server, base: `http://127.0.0.1:${server.address.port}` };
}

/** A browser on the app's page, with its cookie jar. */
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
    state: async () => (await page.call('GET', '/api/compagnon')).body,
    ask: () =>
      page.call('POST', '/api/compagnon/generate', {
        request: {
          tier: 'deep',
          system: 'Le Compagnon',
          messages: [{ role: 'user', content: 'Ma scène.' }],
          maxOutputTokens: 4000,
        },
      }),
  };
  return page;
}

describe('pricing (phase 4.8)', () => {
  it('counts a call in millionths of a dollar, at each model’s prices', () => {
    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      cacheReadTokens: 2_000_000,
      cacheWriteTokens: 500_000,
    };
    // Opus 5.5: 4 + 2 + 0.4 + 4 dollars.
    expect(costMicros('claude-opus-5-5', usage)).toBe(10_400_000);
    // Haiku 5.5: 0.1 + 0.05 + 0.02 + 0.1.
    expect(costMicros('claude-haiku-5-5', usage)).toBe(270_000);
    expect(costMicros('claude-opus-5-5', undefined)).toBe(0);
  });

  it('counts the month in the server’s time zone', () => {
    // 31 October, 23:30 UTC: already November in Paris.
    expect(monthOf(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11');
    expect(monthOf(new Date('2026-10-31T22:30:00Z'))).toBe('2026-10');
  });
});

describe('the Compagnon provided by an account (phase 4.8)', () => {
  it('answers a tester with the key the server keeps, never shown, up to the month’s ceiling', async () => {
    const db = await freshDatabase();
    const secret = randomBytes(32);
    const model = fakeModel();
    let now = new Date('2026-11-20T10:00:00Z');
    const { base } = await start(db, model.createLlm, secret, () => now);
    await account(db); // the author, first account and administrator
    const claire = await account(db, 'claire@example.org');
    // 3 cents a month: the first call (2.4 cents) passes, the second goes over.
    await provideCompagnon(db, secret, claire.userId, PROVIDED, 3);

    const page = browser(base);
    await page.signIn(claire.email, claire.password);
    expect(await page.state()).toEqual({ status: 'available', provided: true });
    // No key of her own over the provided one.
    expect((await page.call('POST', '/api/compagnon/key', { key: 'sk-ant-autre' })).body).toEqual({
      error: 'provided',
    });

    expect((await page.ask()).status).toBe(200);
    expect(model.keys).toEqual([PROVIDED]);
    expect(await spendOf(db, claire.userId, '2026-11')).toEqual({ micros: 24_000, calls: 1 });
    expect((await page.ask()).status).toBe(200);
    // Over the ceiling: the Compagnon stops and says so.
    expect(await page.state()).toEqual({ status: 'ceiling', provided: true });
    expect(await page.ask()).toEqual({ status: 429, body: { error: 'ceiling' } });
    expect(model.keys).toHaveLength(2);

    // The administrator raises the ceiling; next month, it starts again from zero.
    await setCeiling(db, claire.userId, 10);
    expect((await page.state())['status']).toBe('available');
    await setCeiling(db, claire.userId, 3);
    now = new Date('2026-12-01T08:00:00Z');
    expect((await page.state())['status']).toBe('available');

    // Nothing in the base reads as the key.
    const { rows } = await db.query<Record<string, unknown>>('select * from provided_compagnons');
    const dump = JSON.stringify(rows, (_k, v: unknown) =>
      v instanceof Uint8Array ? Buffer.from(v).toString('latin1') : v,
    );
    expect(dump).not.toContain('la-cle-du-testeur');

    // Withdrawn: the account has no Compagnon of its own.
    await withdrawCompagnon(db, claire.userId);
    expect(await page.state()).toEqual({ status: 'unconfigured', provided: false });
  });

  it('needs no password after a restart, and nothing without the server’s secret', async () => {
    const db = await freshDatabase();
    const secret = randomBytes(32);
    const model = fakeModel();
    const first = await start(db, model.createLlm, secret);
    await account(db);
    const claire = await account(db, 'claire@example.org');
    await provideCompagnon(db, secret, claire.userId, PROVIDED, null);
    const page = browser(first.base);
    await page.signIn(claire.email, claire.password);

    await first.server.destroy();
    page.base = (await start(db, model.createLlm, secret)).base;
    expect(await page.state()).toEqual({ status: 'available', provided: true });
    expect((await page.ask()).status).toBe(200);

    // A server without the secret (or another one) cannot open the key.
    page.base = (await start(db, model.createLlm, randomBytes(32))).base;
    expect((await page.state())['provided']).toBe(false);
    expect((await page.ask()).body).toEqual({ error: 'locked' });
  });

  it('leaves the author’s own key as it was', async () => {
    const db = await freshDatabase();
    const model = fakeModel();
    const { base } = await start(db, model.createLlm, randomBytes(32));
    const helene = await account(db);
    const page = browser(base);
    await page.signIn(helene.email, helene.password);
    expect((await page.call('POST', '/api/compagnon/key', { key: 'sk-ant-a-moi' })).body).toEqual({
      result: 'saved',
    });
    expect(await page.state()).toEqual({ status: 'available', provided: false });
    expect((await page.ask()).status).toBe(200);
    expect(model.keys).toEqual(['sk-ant-a-moi']);
    // Spending is counted for every account, without a ceiling here.
    expect((await spendOf(db, helene.userId, '2026-11')).calls).toBe(1);
  });
});
