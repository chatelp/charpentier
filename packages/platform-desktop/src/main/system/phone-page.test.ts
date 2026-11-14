import { afterEach, describe, expect, it } from 'vitest';
import type { PhoneSettings } from '@charpentier/platform';
import { readSettings, servePhonePage, TOKEN_LIFETIME, type PhonePage } from './phone-page';

const pages: PhonePage[] = [];
afterEach(async () => {
  for (const p of pages.splice(0)) await p.close();
});

async function serve(now = () => 0) {
  const received: PhoneSettings[] = [];
  const page = await servePhonePage({
    host: '127.0.0.1',
    port: 0,
    onSettings: (s) => received.push(s),
    now,
  });
  pages.push(page);
  const url = new URL(page.url);
  const token = url.searchParams.get('t') ?? '';
  const post = (fields: Record<string, string>) =>
    fetch(`${url.origin}/envoyer`, {
      method: 'POST',
      body: new URLSearchParams(fields),
      redirect: 'manual',
    });
  return { page, url, token, received, post };
}

describe('the page the phone opens at the first start (phase 5.13)', () => {
  it('serves its form with the token only, for the password manager', async () => {
    const { url, token } = await serve();
    const answer = await fetch(url);
    expect(answer.status).toBe(200);
    expect(answer.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(answer.headers.get('cache-control')).toBe('no-store');
    const html = await answer.text();
    expect(html).toContain(`value="${token}"`);
    expect(html).toContain('autocomplete="username"');
    expect(html).toContain('autocomplete="current-password"');
    expect(html).toContain('value="https://charpentier.chatel.pm"');
    expect((await fetch(`${url.origin}/?t=faux`)).status).toBe(410);
    expect((await fetch(`${url.origin}/`)).status).toBe(410);
    expect((await fetch(`${url.origin}/autre`)).status).toBe(404);
  });

  it('takes the settings once, then the link is spent', async () => {
    const { page, url, token, received, post } = await serve();
    const fields = {
      t: token,
      ssid: 'Maison-5G',
      wifiPassword: 'motdepasse',
      server: 'https://charpentier.chatel.pm',
      email: 'auteur@exemple.fr',
      password: 'secret du compte',
      apiKey: ' sk-ant-essai ',
    };
    const answer = await post(fields);
    expect(answer.status).toBe(200);
    expect(await answer.text()).toContain('vous pouvez fermer cette page');
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
    expect((await post(fields)).status).toBe(410);
    expect((await fetch(url)).status).toBe(410);
    expect(received).toHaveLength(1);
  });

  it('refuses a wrong token, an expired one, and says which field is wrong', async () => {
    let time = 0;
    const { token, received, post } = await serve(() => time);
    expect((await post({ t: 'faux', ssid: 'Maison' })).status).toBe(410);
    const bad = await post({ t: token, ssid: 'Maison', wifiPassword: 'court' });
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain('Mot de passe du Wi-Fi');
    time = TOKEN_LIFETIME + 1;
    expect((await post({ t: token, ssid: 'Maison' })).status).toBe(410);
    expect(received).toEqual([]);
  });

  it('keeps only the parts given whole', () => {
    const read = (fields: Record<string, string>) => readSettings(new URLSearchParams(fields));
    expect(read({ ssid: 'Café', server: 'https://x', email: 'a@b.fr' })).toEqual({
      wifi: { ssid: 'Café', password: '' },
    });
    expect(read({ apiKey: 'sk' })).toEqual({ apiKey: 'sk' });
    expect(() => read({ email: 'a@b.fr', password: 'p', server: 'ftp://x' })).toThrow(
      'Adresse du serveur',
    );
    expect(() => read({ ssid: 'x'.repeat(33) })).toThrow('Nom du réseau');
  });
});
