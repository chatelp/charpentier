import { afterEach, describe, expect, it } from 'vitest';
import type { PhoneSettings } from '@charpentier/platform';
import { readSettings, servePhonePage, TOKEN_LIFETIME, type PhonePage } from './phone-page';

const pages: PhonePage[] = [];
afterEach(async () => {
  for (const p of pages.splice(0)) await p.close();
});

interface ServeOptions {
  readonly now?: () => number;
  readonly wifiOnly?: { readonly ssid: string; readonly why: string } | null;
}

async function serve({ now = () => 0, wifiOnly = null }: ServeOptions = {}) {
  const received: PhoneSettings[] = [];
  let opened = 0;
  const page = await servePhonePage({
    host: '127.0.0.1',
    port: 0,
    networks: ['Maison-5G', 'Maison-2G'],
    wifiOnly,
    onOpened: () => opened++,
    onSettings: (s) => received.push(s),
    now,
  });
  pages.push(page);
  const origin = `http://${page.address}`;
  const token = () => new URL(page.url()).searchParams.get('t') ?? '';
  const post = (path: string, fields: Record<string, string>) =>
    fetch(`${origin}${path}`, { method: 'POST', body: new URLSearchParams(fields) });
  return { page, origin, token, received, post, opened: () => opened };
}

const FULL = {
  ssid: 'Maison-5G',
  'wifi-password': 'motdepasse',
  server: 'https://charpentier.chatel.pm',
  email: 'auteur@exemple.fr',
  password: 'secret du compte',
  'anthropic-key': ' sk-ant-essai ',
};

describe('the page the phone opens at the first start (phase 5.13)', () => {
  it('serves its form with the token, for the password manager, and says it was opened', async () => {
    const { page, opened } = await serve();
    const answer = await fetch(page.url());
    expect(answer.status).toBe(200);
    const csp = answer.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).toMatch(/script-src 'nonce-[^']+'/);
    expect(answer.headers.get('cache-control')).toBe('no-store');
    const html = await answer.text();
    expect(html).toContain('Régler le X250');
    expect(html).toContain('<option>Maison-5G</option><option>Maison-2G</option>');
    expect(html).toContain('autocomplete="username"');
    expect(html).toContain('autocomplete="current-password"');
    expect(html).toContain('autocomplete="url"');
    expect(html).not.toContain('new-password');
    expect(html).toContain('value="https://charpentier.chatel.pm"');
    expect(opened()).toBe(1);
  });

  it('asks the six digits of a page opened by hand, five tries at most', async () => {
    const { page, origin, post, opened } = await serve();
    const hand = await fetch(`${origin}/`);
    expect(hand.status).toBe(200);
    expect(await hand.text()).toContain('Code affiché sur le X250');
    expect(opened()).toBe(0);
    const right = await post('/code', {
      code: `${page.code().slice(0, 3)} ${page.code().slice(3)}`,
    });
    expect(right.status).toBe(200);
    expect(await right.text()).toContain('Envoyer au X250');
    expect(opened()).toBe(1);
    for (let i = 0; i < 5; i++)
      await post('/code', { code: '000000' === page.code() ? '111111' : '000000' });
    expect(page.expired()).toBe(true);
    expect((await post('/code', { code: page.code() })).status).toBe(410);
  });

  it('takes the settings once; a renewed code makes an open page expire', async () => {
    const { page, token, received, post } = await serve();
    const old = token();
    const answer = await post('/reglages', { t: old, ...FULL });
    expect(answer.status).toBe(200);
    expect(await answer.text()).toContain('Le X250 a vos réglages.');
    expect(received).toEqual([
      {
        wifi: { ssid: 'Maison-5G', password: 'motdepasse' },
        sync: {
          server: 'https://charpentier.chatel.pm',
          email: 'auteur@exemple.fr',
          password: 'secret du compte',
        },
        apiKey: 'sk-ant-essai',
      },
    ]);
    expect(page.expired()).toBe(true);
    expect(await (await post('/reglages', { t: old, ...FULL })).text()).toContain(
      'Cette page a expiré.',
    );
    page.renew();
    expect(page.expired()).toBe(false);
    expect(token()).not.toBe(old);
    expect((await post('/reglages', { t: old, ...FULL })).status).toBe(410);
    expect(received).toHaveLength(1);
  });

  it('expires after 10 minutes, and marks a field that cannot be right', async () => {
    let time = 0;
    const { token, received, post } = await serve({ now: () => time });
    const bad = await post('/reglages', { t: token(), ssid: 'Maison', 'wifi-password': 'court' });
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain('Un mot de passe de Wi-Fi compte 8 à 63 signes.');
    time = TOKEN_LIFETIME + 1;
    expect((await post('/reglages', { t: token(), ssid: 'Maison' })).status).toBe(410);
    expect(received).toEqual([]);
  });

  it('keeps an opened page past 10 minutes, until it sends', async () => {
    let time = 0;
    const { page, token, received, post } = await serve({ now: () => time });
    expect((await fetch(page.url())).status).toBe(200);
    time = 45 * 60_000;
    expect(page.expired()).toBe(false);
    expect((await fetch(page.url())).status).toBe(200);
    expect((await post('/reglages', { t: token(), ...FULL })).status).toBe(200);
    expect(received).toHaveLength(1);
    expect(page.expired()).toBe(true);
  });

  it('shows the Wi-Fi alone, « à revoir », for a second round', async () => {
    const { page } = await serve({
      wifiOnly: { ssid: 'Livebox-4A2C', why: 'Livebox-4A2C a refusé ce mot de passe.' },
    });
    const html = await (await fetch(page.url())).text();
    expect(html).toContain('Seul le Wi-Fi est à revoir ; le X250 garde le reste.');
    expect(html).toContain('<option selected>Livebox-4A2C</option>');
    expect(html).toContain('Livebox-4A2C a refusé ce mot de passe.');
    expect(html).not.toContain('E-mail du compte');
  });

  it('keeps only the parts given whole', () => {
    const read = (fields: Record<string, string>) => readSettings(new URLSearchParams(fields));
    expect(read({ ssid: '', 'ssid-other': 'Café', server: 'https://x', email: 'a@b.fr' })).toEqual({
      wifi: { ssid: 'Café', password: '' },
    });
    expect(read({ 'anthropic-key': 'sk' })).toEqual({ apiKey: 'sk' });
    expect(() => read({ email: 'a@b.fr', password: 'p', server: 'ftp://x' })).toThrow('https://');
    expect(() => read({ ssid: 'x'.repeat(33) })).toThrow('trop long');
  });
});
