import { randomBytes, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { PhoneSettings } from '@charpentier/platform';

/**
 * The page the phone opens at the first start (docs/PLAN.md phase 5.13,
 * D-33): served by the app on the temporary network only (bound to its
 * address), behind a one-time token that lasts 15 minutes. The author fills
 * it in with the phone's password manager; the settings go straight to the
 * main process, never to the interface.
 */
export interface PhonePage {
  /** `http://10.42.0.1:8080/?t=…` */
  readonly url: string;
  /** The token was used, or its 15 minutes are over. */
  expired(): boolean;
  close(): Promise<void>;
}

export interface PhonePageOptions {
  /** The temporary network's address (10.42.0.1 with NetworkManager); 127.0.0.1 in the tests. */
  readonly host: string;
  /** 8080; 0 in the tests (any free port). */
  readonly port: number;
  readonly onSettings: (settings: PhoneSettings) => void;
  readonly now?: () => number;
  /** The server suggested on the page. */
  readonly server?: string;
}

export const TOKEN_LIFETIME = 15 * 60_000;
const MAX_BODY = 16 * 1024;
export const DEFAULT_SERVER = 'https://charpentier.chatel.pm';

/** The page's words: French, like the author (the page is outside the app's i18n). */
const TEXTS = {
  title: 'Charpentier · premier démarrage',
  lead: 'Ces réglages vont directement à votre X250, sur son réseau temporaire. Votre gestionnaire de mots de passe peut tout remplir.',
  wifi: 'Wi-Fi de la maison',
  ssid: 'Nom du réseau',
  wifiPassword: 'Mot de passe du Wi-Fi',
  sync: 'Synchronisation',
  server: 'Adresse du serveur',
  email: 'E-mail du compte',
  password: 'Mot de passe du compte',
  mentor: 'Le Compagnon',
  apiKey: 'Clé d’API Anthropic (facultative)',
  send: 'Envoyer au X250',
  sent: 'C’est envoyé. Le X250 s’en occupe : vous pouvez fermer cette page.',
  expired:
    'Ce lien n’est plus valable. Sur le X250, recommencez depuis le téléphone pour en avoir un nouveau.',
  invalid: 'Un champ ne va pas : {field}. Rien n’a été envoyé.',
};

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

function page(body: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escape(TEXTS.title)}</title>
<style>
:root { --bg: #e4e7ec; --ink: #1d2026; --muted: #5d636e; --field: #f3f4f7; --author: #c2412d; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #14161a; --ink: #e6e8ec; --muted: #9aa0aa; --field: #1f2228; --author: #e0644c; }
}
* { box-sizing: border-box; }
body { margin: 0; padding: 24px 16px 48px; background: var(--bg); color: var(--ink);
  font: 16px/1.5 system-ui, -apple-system, sans-serif; }
main { max-width: 32rem; margin: 0 auto; }
h1 { font: 500 1.4rem/1.3 Georgia, serif; margin: 0 0 8px; }
p { color: var(--muted); margin: 0 0 24px; }
fieldset { border: 0; margin: 0 0 24px; padding: 0; }
legend { font-variant: small-caps; letter-spacing: 0.06em; color: var(--muted); margin-bottom: 8px; }
label { display: block; margin: 12px 0 4px; }
input { width: 100%; padding: 12px; border: 0; border-radius: 10px; background: var(--field);
  color: var(--ink); font: inherit; }
button { width: 100%; padding: 14px; border: 0; border-radius: 10px; background: var(--ink);
  color: var(--bg); font: 500 1rem system-ui, sans-serif; }
.note { color: var(--author); }
</style>
</head>
<body><main>
<h1>${escape(TEXTS.title)}</h1>
${body}
</main></body>
</html>`;
}

function form(token: string, server: string, error?: string): string {
  const field = (
    name: string,
    label: string,
    type: string,
    autocomplete: string,
    extra = '',
  ) => `<label for="${name}">${escape(label)}</label>
<input id="${name}" name="${name}" type="${type}" autocomplete="${autocomplete}" autocapitalize="off" autocorrect="off" spellcheck="false" ${extra}>`;
  return page(`${error ? `<p class="note">${escape(error)}</p>` : `<p>${escape(TEXTS.lead)}</p>`}
<form method="post" action="/envoyer">
<input type="hidden" name="t" value="${escape(token)}">
<fieldset><legend>${escape(TEXTS.wifi)}</legend>
${field('ssid', TEXTS.ssid, 'text', 'off')}
${field('wifiPassword', TEXTS.wifiPassword, 'password', 'current-password')}
</fieldset>
<fieldset><legend>${escape(TEXTS.sync)}</legend>
${field('server', TEXTS.server, 'url', 'url', `value="${escape(server)}"`)}
${field('email', TEXTS.email, 'email', 'username')}
${field('password', TEXTS.password, 'password', 'current-password')}
</fieldset>
<fieldset><legend>${escape(TEXTS.mentor)}</legend>
${field('apiKey', TEXTS.apiKey, 'password', 'off')}
</fieldset>
<button type="submit">${escape(TEXTS.send)}</button>
</form>`);
}

/**
 * Reads the form: each part only when it is whole (a Wi-Fi without its name,
 * an account without its password are left out). Throws the name of a
 * field that cannot be right.
 */
export function readSettings(fields: URLSearchParams): PhoneSettings {
  const get = (name: string) => (fields.get(name) ?? '').trim();
  const ssid = get('ssid');
  const wifiPassword = fields.get('wifiPassword') ?? '';
  const server = get('server');
  const email = get('email');
  const password = fields.get('password') ?? '';
  const apiKey = get('apiKey');
  if (new TextEncoder().encode(ssid).length > 32) throw new Error(TEXTS.ssid);
  if (wifiPassword && (wifiPassword.length < 8 || wifiPassword.length > 63))
    throw new Error(TEXTS.wifiPassword);
  if ((email || password) && !/^https?:\/\/[^\s/]+/.test(server)) throw new Error(TEXTS.server);
  if (email && !/^[^\s@]+@[^\s@]+$/.test(email)) throw new Error(TEXTS.email);
  return {
    ...(ssid && { wifi: { ssid, password: wifiPassword } }),
    ...(email && password && { sync: { server, email, password } }),
    ...(apiKey && { apiKey }),
  };
}

export async function servePhonePage(options: PhonePageOptions): Promise<PhonePage> {
  const now = options.now ?? Date.now;
  const token = randomBytes(24).toString('base64url');
  const issued = now();
  let used = false;
  const expired = () => used || now() - issued > TOKEN_LIFETIME;
  const valid = (given: string | null) => {
    if (expired() || !given) return false;
    const a = Buffer.from(given);
    const b = Buffer.from(token);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  const server = options.server ?? DEFAULT_SERVER;

  const send = (response: http.ServerResponse, status: number, html: string) => {
    response.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
    });
    response.end(html);
  };
  const gone = (response: http.ServerResponse) =>
    send(response, 410, page(`<p class="note">${escape(TEXTS.expired)}</p>`));

  const httpServer = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://x250');
    if (request.method === 'GET' && url.pathname === '/') {
      if (!valid(url.searchParams.get('t'))) return gone(response);
      return send(response, 200, form(token, server));
    }
    if (request.method === 'POST' && url.pathname === '/envoyer') {
      const chunks: Buffer[] = [];
      let size = 0;
      request.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BODY) request.destroy();
        else chunks.push(chunk);
      });
      request.on('end', () => {
        const fields = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
        if (!valid(fields.get('t'))) return gone(response);
        let settings: PhoneSettings;
        try {
          settings = readSettings(fields);
        } catch (error) {
          const field = error instanceof Error ? error.message : '';
          return send(response, 400, form(token, server, TEXTS.invalid.replace('{field}', field)));
        }
        used = true;
        send(response, 200, page(`<p>${escape(TEXTS.sent)}</p>`));
        options.onSettings(settings);
      });
      return;
    }
    send(response, 404, page(''));
  });
  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(options.port, options.host, () => resolve());
  });
  const { port } = httpServer.address() as AddressInfo;
  return {
    url: `http://${options.host}:${port}/?t=${token}`,
    expired,
    close: () =>
      new Promise<void>((resolve) => {
        httpServer.closeAllConnections();
        httpServer.close(() => resolve());
      }),
  };
}
