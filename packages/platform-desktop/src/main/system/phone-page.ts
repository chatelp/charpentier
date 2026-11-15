import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { PhoneSettings } from '@charpentier/platform';

/**
 * The page the phone opens at the first start (docs/PLAN.md phase 5.13,
 * D-33, docs/DESIGN.md §4.12; its look: docs/design/telephone.html). Served
 * by the app on the temporary network only (bound to its address), behind a
 * one-time token, or the six digits shown on the device for a page opened by
 * hand. Both last 10 minutes until the page is opened, and the device renews
 * them. An opened page keeps its token until it sends, or the temporary
 * network closes: filling it can take long (the Companion's key is fetched
 * elsewhere, the phone off this network meanwhile). The settings go straight
 * to the main process, never to the interface.
 */
export interface PhonePage {
  /** `http://10.42.0.1:8080/?t=…` */
  url(): string;
  /** `10.42.0.1:8080` */
  readonly address: string;
  /** The six digits, `482913`. */
  code(): string;
  /**
   * The token and the code are over: sent, too many wrong codes, or 10 minutes
   * without the page being opened.
   */
  expired(): boolean;
  /** A new token and a new code; a page already open can no longer send. */
  renew(): void;
  close(): Promise<void>;
}

export interface PhonePageOptions {
  /** The temporary network's address (10.42.0.1 with NetworkManager); 127.0.0.1 in the tests. */
  readonly host: string;
  /** 8080; 0 in the tests (any free port). */
  readonly port: number;
  /** The networks the device saw before opening its own, strongest first. */
  readonly networks: readonly string[];
  /** A second round for the Wi-Fi alone: the network refused, and why it is to be redone. */
  readonly wifiOnly?: { readonly ssid: string; readonly why: string } | null;
  /** The page was opened on the phone (with a valid token). */
  readonly onOpened?: () => void;
  readonly onSettings: (settings: PhoneSettings) => void;
  readonly now?: () => number;
  /** The server suggested on the page. */
  readonly server?: string;
}

export const TOKEN_LIFETIME = 10 * 60_000;
const MAX_BODY = 16 * 1024;
const MAX_WRONG_CODES = 5;
export const DEFAULT_SERVER = 'https://charpentier.chatel.pm';

/** The page's look, from docs/design/telephone.html (the mock's state switcher left out). */
const STYLE = `
:root {
  color-scheme: light dark;
  --bg: #e3e7ed;
  --ink: #22262d;
  --ink-2: #474d57;
  --muted: #7a828e;
  --faint: #a6adb8;
  --hl: #ffffff;
  --sh: #b3becc;
  --mentor: #1f4f7c;
  --author: #b2432a;
  --lit: 0 9px 14px -7px rgb(255 255 255 / 0.75);
  --lit-bg: color-mix(in srgb, var(--bg) 35%, #fff);
  --raise-s: 3px 3px 7px var(--sh), -3px -3px 7px var(--hl);
  --inset: inset 3px 3px 6px var(--sh), inset -3px -3px 6px var(--hl);
  --serif: ui-serif, 'New York', 'Iowan Old Style', 'Noto Serif', Georgia, serif;
  --sans: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --mono: ui-monospace, 'SF Mono', Menlo, 'Roboto Mono', monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --bg: #1b1e23;
    --ink: #dfe3ea;
    --ink-2: #b9c0ca;
    --muted: #8a929e;
    --faint: #5d6470;
    --hl: #262a31;
    --sh: #101215;
    --mentor: #86aedb;
    --author: #e3876a;
    --lit-bg: transparent;
  }
}
:root[data-theme='dark'] {
  color-scheme: dark;
  --bg: #1b1e23;
  --ink: #dfe3ea;
  --ink-2: #b9c0ca;
  --muted: #8a929e;
  --faint: #5d6470;
  --hl: #262a31;
  --sh: #101215;
  --mentor: #86aedb;
  --author: #e3876a;
  --lit-bg: transparent;
}
*,
*::before,
*::after {
  box-sizing: border-box;
}
html {
  -webkit-text-size-adjust: 100%;
}
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font: 400 16px/1.45 var(--sans);
  -webkit-font-smoothing: antialiased;
}
main {
  width: min(30rem, 100%);
  margin: 0 auto;
  padding: max(28px, env(safe-area-inset-top)) 18px max(32px, env(safe-area-inset-bottom));
}
.brand {
  margin: 0;
  color: var(--muted);
  font: 500 12px var(--mono);
  letter-spacing: 0.04em;
}
h1 {
  margin: 6px 0 4px;
  font: 500 30px/1.15 var(--serif);
}
.mentor {
  margin: 0 0 22px;
  color: var(--mentor);
  font: italic 400 17px/1.45 var(--serif);
}
fieldset {
  margin: 0 0 22px;
  padding: 0;
  border: 0;
}
legend {
  display: flex;
  width: 100%;
  justify-content: space-between;
  align-items: baseline;
  margin: 0 0 8px;
  padding: 0;
  color: var(--ink);
  font: 600 15px var(--sans);
}
legend small {
  color: var(--muted);
  font: 400 13px var(--sans);
}
label {
  display: block;
  margin: 10px 0 5px 4px;
  color: var(--ink-2);
  font-size: 14px;
}
/* What the author fills: sunk, like every field of the app. 16 px so that iOS does not zoom. */
input,
select {
  width: 100%;
  min-height: 48px;
  padding: 12px 14px;
  border: 0;
  border-radius: 14px;
  background: var(--bg);
  box-shadow: var(--inset);
  color: var(--ink);
  font: 400 16px var(--sans);
  outline: none;
  appearance: none;
}
select {
  background-image:
    linear-gradient(45deg, transparent 50%, var(--muted) 50%),
    linear-gradient(-45deg, transparent 50%, var(--muted) 50%);
  background-position:
    calc(100% - 22px) 52%,
    calc(100% - 16px) 52%;
  background-size: 6px 6px;
  background-repeat: no-repeat;
}
input:focus-visible,
select:focus-visible {
  box-shadow: var(--inset), var(--lit);
}
input::placeholder {
  color: var(--faint);
}
.pair {
  position: relative;
}
.pair input {
  padding-right: 92px;
}
.show {
  position: absolute;
  top: 6px;
  right: 6px;
  bottom: 6px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background: var(--bg);
  box-shadow: var(--raise-s);
  color: var(--ink-2);
  font: 500 13px var(--sans);
}
.help {
  margin: 6px 4px 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.45;
}
.help b {
  color: var(--ink-2);
  font-weight: 600;
}
.wrong {
  margin: 6px 4px 0;
  color: var(--ink);
  font-size: 13.5px;
}
.wrong::before {
  content: 'à revoir';
  margin-right: 8px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--ink);
  color: var(--bg);
  font: 500 11.5px var(--mono);
}
/* The author's action: raised, in the author's ink. */
.send {
  display: block;
  width: 100%;
  min-height: 54px;
  margin: 8px 0 0;
  border: 0;
  border-radius: 16px;
  background: var(--bg);
  box-shadow: var(--raise-s);
  color: var(--author);
  font: 600 17px var(--sans);
}
.send:active,
.send[aria-busy='true'] {
  background: var(--lit-bg);
  box-shadow: var(--lit);
}
.send[aria-busy='true'] {
  color: var(--muted);
}
.foot {
  margin: 16px 4px 0;
  color: var(--muted);
  font-size: 12.5px;
  line-height: 1.5;
  text-align: center;
}
/* After sending, or when the link has expired: one message, nothing else. */
.done {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 70vh;
}
.done .mark {
  width: 56px;
  height: 56px;
  margin: 0 0 18px;
  border-radius: 50%;
  box-shadow: var(--inset);
  color: var(--author);
  font: 400 28px/56px var(--sans);
  text-align: center;
}
.done p {
  margin: 0 0 12px;
  color: var(--ink-2);
  font-size: 16px;
}
.done .big {
  color: var(--ink);
  font: 500 26px/1.2 var(--serif);
}
[hidden] {
  display: none !important;
}
    
`;

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

/** « Afficher », « Autre réseau… » and « Envoi au X250… »: the page's only script. */
const SCRIPT = `
for (const b of document.querySelectorAll('.show'))
  b.addEventListener('click', () => {
    const input = b.previousElementSibling;
    const shown = input.type === 'text';
    input.type = shown ? 'password' : 'text';
    b.textContent = shown ? 'Afficher' : 'Masquer';
  });
const ssid = document.getElementById('ssid');
const other = document.getElementById('ssid-other');
if (ssid && other) {
  const sync = () => { other.hidden = ssid.value !== ''; };
  ssid.addEventListener('change', sync);
  sync();
}
const form = document.getElementById('form');
if (form) form.addEventListener('submit', () => {
  const send = document.getElementById('send');
  send.textContent = 'Envoi au X250…';
  send.setAttribute('aria-busy', 'true');
});
`;

function page(body: string, nonce: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>Régler le X250 · Charpentier</title>
<style>${STYLE}</style>
</head>
<body><main>
${body}
</main>
<script nonce="${nonce}">${SCRIPT}</script>
</body>
</html>`;
}

const head = (mentor: string) => `<p class="brand">CHARPENTIER · X250</p>
<h1>Régler le X250</h1>
<p class="mentor">${escape(mentor)}</p>`;

const secret = (id: string, name: string, autocomplete: string, extra = '') => `<div class="pair">
<input id="${id}" name="${name}" type="password" autocomplete="${autocomplete}" autocapitalize="off" spellcheck="false"${extra}>
<button type="button" class="show">Afficher</button>
</div>`;

interface FormState {
  readonly token: string;
  readonly networks: readonly string[];
  readonly server: string;
  readonly wifiOnly: PhonePageOptions['wifiOnly'];
  /** A field that cannot be right, and why: nothing was sent. */
  readonly wrong?: { readonly field: 'wifi' | 'server' | 'email'; readonly why: string };
}

function form(state: FormState): string {
  const { wifiOnly, wrong } = state;
  const mark = (field: string, why: string | undefined) =>
    why ? `<p class="wrong" data-field="${field}">${escape(why)}</p>` : '';
  const chosen = wifiOnly?.ssid;
  const options = [...new Set([...(chosen ? [chosen] : []), ...state.networks])]
    .map((n) => `<option${n === chosen ? ' selected' : ''}>${escape(n)}</option>`)
    .join('');
  const wifi = `<fieldset>
<legend>Wi-Fi de la maison</legend>
<label for="ssid">Réseau</label>
<select id="ssid" name="ssid">${options}<option value="">Autre réseau…</option></select>
<input id="ssid-other" name="ssid-other" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Nom du réseau" aria-label="Nom du réseau" hidden>
<p class="help">Les réseaux que le X250 voit, du plus fort au plus faible.</p>
<label for="wifi-pass">Mot de passe du Wi-Fi</label>
${secret('wifi-pass', 'wifi-password', 'off')}
${mark('wifi', wifiOnly?.why ?? (wrong?.field === 'wifi' ? wrong.why : undefined))}
</fieldset>`;
  const rest = wifiOnly
    ? ''
    : `<fieldset>
<legend>Synchronisation</legend>
<label for="server">Adresse du serveur</label>
<input id="server" name="server" type="url" inputmode="url" autocomplete="url" value="${escape(state.server)}" autocapitalize="off" spellcheck="false">
${mark('server', wrong?.field === 'server' ? wrong.why : undefined)}
<label for="email">E-mail du compte</label>
<input id="email" name="email" type="email" autocomplete="username" autocapitalize="off" spellcheck="false">
${mark('email', wrong?.field === 'email' ? wrong.why : undefined)}
<label for="password">Mot de passe du compte</label>
${secret('password', 'password', 'current-password')}
<p class="help">Ce réseau est celui du X250 : votre gestionnaire ne proposera peut-être pas le compte de lui-même. Touchez la <b>clé</b> au-dessus du clavier et cherchez « charpentier ».</p>
</fieldset>
<fieldset>
<legend>Le Compagnon <small>facultatif</small></legend>
<label for="key">Clé d’API Anthropic</label>
${secret('key', 'anthropic-key', 'off', ' placeholder="sk-ant-…"')}
<p class="help">Sans clé, vous écrivez ; le Compagnon attendra qu’elle soit dans les réglages.</p>
</fieldset>`;
  return `<section>
${head(
  wifiOnly
    ? 'Seul le Wi-Fi est à revoir ; le X250 garde le reste.'
    : 'Remplissez ce qui est prêt ; laissez vide ce qui peut attendre.',
)}
<form id="form" method="post" action="/reglages" autocomplete="on">
<input type="hidden" name="t" value="${escape(state.token)}">
${wifi}
${rest}
<button class="send" id="send" type="submit">Envoyer au X250</button>
<p class="foot">Cette page n’existe que sur le réseau du X250 et ne sert qu’une fois. Rien ne passe par internet.</p>
</form>
</section>`;
}

/** A page opened by hand, without the token: the six digits shown on the device. */
const codeForm = (wrong: boolean) => `<section>
${head('Tapez le code affiché sur l’écran du X250.')}
<form method="post" action="/code">
<label for="code">Code affiché sur le X250</label>
<input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]*" maxlength="7">
${wrong ? '<p class="wrong">Ce n’est pas le code affiché sur le X250.</p>' : ''}
<button class="send" type="submit">Continuer</button>
</form>
</section>`;

const SENT = `<section class="done">
<div class="mark" aria-hidden="true">✓</div>
<p class="big">Le X250 a vos réglages.</p>
<p>Il ferme son réseau et rejoint le vôtre ; la suite se passe sur son écran.</p>
<p>Vous pouvez fermer cette page.</p>
</section>`;

const EXPIRED = `<section class="done">
<div class="mark" aria-hidden="true">↺</div>
<p class="big">Cette page a expiré.</p>
<p>Elle ne sert qu’une fois, et quelques minutes. Visez le code affiché sur l’écran du X250 : il en ouvre une nouvelle.</p>
</section>`;

/** Why a field cannot be right; nothing is sent then. */
export class WrongField extends Error {
  constructor(
    readonly field: 'wifi' | 'server' | 'email',
    why: string,
  ) {
    super(why);
  }
}

/**
 * Reads the form: each part only when it is whole (a Wi-Fi without its name,
 * an account without its password are left out).
 */
export function readSettings(fields: URLSearchParams): PhoneSettings {
  const get = (name: string) => (fields.get(name) ?? '').trim();
  const ssid = get('ssid') || get('ssid-other');
  const wifiPassword = fields.get('wifi-password') ?? '';
  const server = get('server');
  const email = get('email');
  const password = fields.get('password') ?? '';
  const apiKey = get('anthropic-key');
  if (new TextEncoder().encode(ssid).length > 32)
    throw new WrongField('wifi', 'Ce nom de réseau est trop long.');
  if (wifiPassword && (wifiPassword.length < 8 || wifiPassword.length > 63))
    throw new WrongField('wifi', 'Un mot de passe de Wi-Fi compte 8 à 63 signes.');
  if ((email || password) && !/^https?:\/\/[^\s/]+/.test(server))
    throw new WrongField('server', 'L’adresse commence par https:// (ou http://).');
  if (email && !/^[^\s@]+@[^\s@]+$/.test(email))
    throw new WrongField('email', 'Ce n’est pas une adresse e-mail.');
  return {
    ...(ssid && { wifi: { ssid, password: wifiPassword } }),
    ...(email && password && { sync: { server, email, password } }),
    ...(apiKey && { apiKey }),
  };
}

/** Six digits, `482913`. */
const sixDigits = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

const same = (given: string | null, expected: string) => {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

export async function servePhonePage(options: PhonePageOptions): Promise<PhonePage> {
  const now = options.now ?? Date.now;
  let token = '';
  let code = '';
  let issued = 0;
  let used = false;
  let wrongCodes = 0;
  let open = false;
  const renew = () => {
    token = randomBytes(24).toString('base64url');
    code = sixDigits();
    issued = now();
    used = false;
    wrongCodes = 0;
    open = false;
  };
  renew();
  const expired = () =>
    used || wrongCodes >= MAX_WRONG_CODES || (!open && now() - issued > TOKEN_LIFETIME);
  const valid = (given: string | null) => !expired() && same(given, token);
  const formState = (): FormState => ({
    token,
    networks: options.networks,
    server: options.server ?? DEFAULT_SERVER,
    wifiOnly: options.wifiOnly ?? null,
  });

  const send = (response: http.ServerResponse, status: number, body: string) => {
    const nonce = randomBytes(12).toString('base64');
    response.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; form-action 'self'; frame-ancestors 'none'`,
    });
    response.end(page(body, nonce));
  };
  const opened = () => {
    open = true;
    options.onOpened?.();
  };
  const readBody = (request: http.IncomingMessage, done: (fields: URLSearchParams) => void) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) request.destroy();
      else chunks.push(chunk);
    });
    request.on('end', () => done(new URLSearchParams(Buffer.concat(chunks).toString('utf8'))));
  };

  const httpServer = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://x250');
    if (request.method === 'GET' && url.pathname === '/') {
      const given = url.searchParams.get('t');
      // Opened by hand: the six digits first.
      if (given === null)
        return send(response, expired() ? 410 : 200, expired() ? EXPIRED : codeForm(false));
      if (!valid(given)) return send(response, 410, EXPIRED);
      opened();
      return send(response, 200, form(formState()));
    }
    if (request.method === 'POST' && url.pathname === '/code')
      return readBody(request, (fields) => {
        if (expired()) return send(response, 410, EXPIRED);
        if (!same((fields.get('code') ?? '').replace(/\s/g, ''), code)) {
          wrongCodes++;
          return send(response, expired() ? 410 : 400, expired() ? EXPIRED : codeForm(true));
        }
        opened();
        return send(response, 200, form(formState()));
      });
    if (request.method === 'POST' && url.pathname === '/reglages')
      return readBody(request, (fields) => {
        if (!valid(fields.get('t'))) return send(response, 410, EXPIRED);
        let settings: PhoneSettings;
        try {
          settings = readSettings(fields);
        } catch (error) {
          if (!(error instanceof WrongField)) throw error;
          return send(
            response,
            400,
            form({ ...formState(), wrong: { field: error.field, why: error.message } }),
          );
        }
        used = true;
        send(response, 200, SENT);
        options.onSettings(settings);
      });
    send(response, 404, EXPIRED);
  });
  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(options.port, options.host, () => resolve());
  });
  const { port } = httpServer.address() as AddressInfo;
  const address = `${options.host}:${port}`;
  return {
    url: () => `http://${address}/?t=${token}`,
    address,
    code: () => code,
    expired,
    renew,
    close: () =>
      new Promise<void>((resolve) => {
        httpServer.closeAllConnections();
        httpServer.close(() => resolve());
      }),
  };
}
