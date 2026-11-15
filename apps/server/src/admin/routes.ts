import type { IncomingMessage, ServerResponse } from 'node:http';
import type { BlockList } from 'node:net';
import type { Database } from '../database';
import { LoginLimiter } from '../http-api';
import {
  AdminError,
  accountDevices,
  adminLogin,
  adminLogout,
  adminSessionFor,
  backupsMounted,
  createAccount,
  getAccount,
  latestBackup,
  listAccounts,
  listBackups,
  listProjects,
  logAction,
  readLog,
  resetAccountPassword,
  revokeDevice,
  setAccountAdmin,
  setAccountDisabled,
  type AdminSession,
} from './data';
import { exportProject } from './export';
import { adminAsset, ADMIN_ASSETS, isAdminAsset } from './assets';
import { allowed, clientAddress } from './network';
import {
  accountPage,
  accountsPage,
  backupsPage,
  confirmPage,
  loginPage,
  logPage,
  passwordPage,
  projectsPage,
  type Clock,
  type Frame,
  type Section,
} from './pages';
import { fr } from './texts';

export interface AdminOptions {
  /** Who may reach the page (home network and Tailscale). */
  readonly networks: BlockList;
  /** The backups folder, mounted read-only (null: none). */
  readonly backupsDir: string | null;
  /** The administrator's time zone, for the dates shown. */
  readonly timeZone: string;
  /** The restore command shown (the page never restores). */
  readonly restoreCommand: string;
  /** Cuts off the live connections of revoked device sessions (their sync stops at once). */
  readonly cutOff: (sessionIds: readonly string[]) => void;
  readonly now?: () => Date;
}

/** The page's cookie: only this site, only HTTPS, never seen by scripts. */
const COOKIE = '__Host-charpentier-admin';
const MAX_FORM = 10_000;

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  // No referrer to other sites; to this one, the Origin of its forms.
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};

function sendHtml(response: ServerResponse, status: number, body: string, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    ...SECURITY_HEADERS,
    ...headers,
  });
  response.end(body);
}

function redirect(response: ServerResponse, location: string, headers = {}) {
  response.writeHead(303, { Location: location, ...SECURITY_HEADERS, ...headers });
  response.end();
}

function notFound(response: ServerResponse) {
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
  response.end('Not found');
}

function cookieOf(request: IncomingMessage): string {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === COOKIE) return value.join('=');
  }
  return '';
}

const setCookie = (token: string) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict${token ? '' : '; Max-Age=0'}`;

function readForm(request: IncomingMessage): Promise<URLSearchParams | null> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_FORM) request.destroy();
      else chunks.push(chunk);
    });
    request.on('end', () => resolve(new URLSearchParams(Buffer.concat(chunks).toString('utf8'))));
    request.on('error', () => resolve(null));
    request.on('close', () => resolve(null));
  });
}

/**
 * An action sent from another site is refused (besides SameSite=Strict and
 * the token): the browser's own word first (Sec-Fetch-Site), else the Origin.
 */
function sameOrigin(request: IncomingMessage): boolean {
  const site = request.headers['sec-fetch-site'];
  if (site !== undefined) return site === 'same-origin' || site === 'none';
  const origin = request.headers.origin;
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

const ACCOUNT =
  /^\/admin\/comptes\/([0-9a-f-]{36})(?:\/(reinitialiser|desactiver|reactiver|donner-admin|retirer-admin))?$/;
const DEVICE = /^\/admin\/comptes\/([0-9a-f-]{36})\/appareils\/([0-9a-f-]{36})\/revoquer$/;
const EXPORT = /^\/admin\/projets\/([A-Za-z0-9_-]{1,64})\/export$/;

/** Messages of the flash line, carried by the redirection (no free text from the URL is shown). */
const FLASHES = new Set(Object.keys(fr.done));

/**
 * The administration page (docs/PLAN.md phase 4.6, docs/DESIGN.md §4.13).
 * Returns false when the path is not /admin. Outside the allowed networks,
 * /admin does not exist.
 */
export function createAdmin(db: Database, options: AdminOptions) {
  const limiter = new LoginLimiter();
  const now = () => options.now?.() ?? new Date();

  const frameFor = async (session: AdminSession, section: Section, url: URL): Promise<Frame> => {
    const clock: Clock = { now: now(), timeZone: options.timeZone };
    const code = url.searchParams.get('fait') ?? '';
    const target = url.searchParams.get('sur') ?? '';
    const error = url.searchParams.get('erreur') ?? '';
    const flash = FLASHES.has(code)
      ? { text: [fr.done[code], target].filter(Boolean).join(' · ') }
      : error in fr.errors
        ? { text: fr.errors[error as keyof typeof fr.errors], error: true }
        : undefined;
    const mounted = backupsMounted(options.backupsDir);
    return {
      email: session.email,
      csrf: session.csrf,
      section,
      clock,
      backup: mounted ? latestBackup(options.backupsDir, clock.now.getTime()) : undefined,
      ...(flash && { flash }),
    };
  };

  const done = (code: string, target = '', path = '/admin/comptes') =>
    `${path}?fait=${encodeURIComponent(code)}${target ? `&sur=${encodeURIComponent(target)}` : ''}`;

  /** The next nightly backup (03:30 at the administrator's, infra/README.md). */
  const nextBackup = (clock: Clock) => {
    const local = new Date(clock.now.toLocaleString('en-US', { timeZone: clock.timeZone }));
    const tonight = local.getHours() < 3 || (local.getHours() === 3 && local.getMinutes() < 30);
    return `${tonight ? fr.dates.today : fr.dates.tomorrow} ${fr.dates.at} 03:30`;
  };

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname !== '/admin' && !url.pathname.startsWith('/admin/')) return false;
    if (!allowed(options.networks, request)) {
      notFound(response);
      return true;
    }
    const method = request.method ?? 'GET';
    const path = url.pathname.replace(/\/+$/, '') || '/admin';

    // The style: tokens, stylesheet, font.
    if (method === 'GET' && path.startsWith('/admin/style/')) {
      const name = path.slice('/admin/style/'.length);
      if (!isAdminAsset(name)) notFound(response);
      else {
        response.writeHead(200, {
          'Content-Type': ADMIN_ASSETS[name].type,
          'Cache-Control': 'public, max-age=3600',
          'X-Content-Type-Options': 'nosniff',
        });
        response.end(adminAsset(name));
      }
      return true;
    }

    // Signing in.
    if (path === '/admin/connexion') {
      if (method === 'GET') sendHtml(response, 200, loginPage());
      else if (method === 'POST') {
        const form = await readForm(request);
        const email = form?.get('email')?.trim() ?? '';
        const password = form?.get('password') ?? '';
        const key = `admin|${clientAddress(request)}|${email.toLowerCase()}`;
        if (!sameOrigin(request)) sendHtml(response, 403, loginPage(fr.errors.expired));
        else if (!limiter.allow(key)) {
          if (limiter.attempts(key) === LoginLimiter.MAX_ATTEMPTS + 1)
            await logAction(db, null, 'login.refused', email, String(limiter.attempts(key)));
          sendHtml(response, 429, loginPage(fr.errors.tooMany));
        } else {
          const signedIn = email && password ? await adminLogin(db, email, password) : null;
          // A non-administrator gets the same answer as a wrong password.
          if (!signedIn) sendHtml(response, 401, loginPage(fr.errors.credentials));
          else {
            limiter.reset(key);
            redirect(response, '/admin/comptes', { 'Set-Cookie': setCookie(signedIn.token) });
          }
        }
      } else notFound(response);
      return true;
    }

    const session = await adminSessionFor(db, cookieOf(request), now());
    if (!session) {
      if (method === 'GET') redirect(response, '/admin/connexion');
      else sendHtml(response, 401, loginPage(fr.errors.expired));
      return true;
    }

    if (method === 'POST') {
      const form = await readForm(request);
      if (!form || !sameOrigin(request) || form.get('csrf') !== session.csrf) {
        redirect(
          response,
          `${path.startsWith('/admin/comptes') ? '/admin/comptes' : '/admin'}?erreur=expired`,
        );
        return true;
      }
      await post(session, path, form, url, response);
      return true;
    }
    if (method !== 'GET') {
      notFound(response);
      return true;
    }
    await get(session, path, url, response);
    return true;
  }

  async function get(session: AdminSession, path: string, url: URL, response: ServerResponse) {
    if (path === '/admin') return redirect(response, '/admin/comptes');
    if (path === '/admin/comptes') {
      const page = await frameFor(session, 'accounts', url);
      return sendHtml(response, 200, accountsPage(page, await listAccounts(db), session.userId));
    }
    if (path === '/admin/projets') {
      const page = await frameFor(session, 'projects', url);
      return sendHtml(response, 200, projectsPage(page, await listProjects(db)));
    }
    if (path === '/admin/sauvegardes') {
      const page = await frameFor(session, 'backups', url);
      return sendHtml(
        response,
        200,
        backupsPage(
          page,
          listBackups(options.backupsDir, 5, page.clock.now.getTime()),
          backupsMounted(options.backupsDir),
          nextBackup(page.clock),
          options.restoreCommand,
        ),
      );
    }
    if (path === '/admin/journal') {
      const page = await frameFor(session, 'log', url);
      const before = Number(url.searchParams.get('avant') ?? '') || undefined;
      const entries = await readLog(db, 50, before);
      const last = entries.at(-1);
      return sendHtml(
        response,
        200,
        logPage(
          page,
          entries,
          entries.length === 50 && last ? `/admin/journal?avant=${last.id}` : null,
        ),
      );
    }
    const exported = EXPORT.exec(path);
    if (exported?.[1]) {
      const archive = await exportProject(db, exported[1]);
      if (!archive) return notFound(response);
      await logAction(db, session.userId, 'project.export', archive.title || exported[1]);
      response.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${archive.fileName}"; filename*=UTF-8''${encodeURIComponent(archive.fileName)}`,
        ...SECURITY_HEADERS,
      });
      response.end(archive.zip);
      return;
    }
    const device = DEVICE.exec(path);
    if (device?.[1] && device[2]) {
      const account = await getAccount(db, device[1]);
      const row = account && (await accountDevices(db, account.id)).find((d) => d.id === device[2]);
      if (!account || !row || row.revoked) return notFound(response);
      const page = await frameFor(session, 'accounts', url);
      const text = fr.confirm.device;
      return sendHtml(
        response,
        200,
        confirmPage(page, {
          question: text.question(row.device || '—'),
          lines: text.lines(),
          verb: text.verb,
          action: path,
          cancel: `/admin/comptes/${account.id}`,
        }),
      );
    }
    const match = ACCOUNT.exec(path);
    if (!match?.[1]) return notFound(response);
    const account = await getAccount(db, match[1]);
    if (!account) return notFound(response);
    const page = await frameFor(session, 'accounts', url);
    const base = `/admin/comptes/${account.id}`;
    const action = match[2];
    if (!action) {
      const projects = (await listProjects(db)).filter((p) => p.ownerId === account.id);
      return sendHtml(
        response,
        200,
        accountPage(page, account, await accountDevices(db, account.id), projects),
      );
    }
    if (action === 'reactiver') return notFound(response);
    const self = account.id === session.userId;
    const admins = (await listAccounts(db)).filter((a) => a.isAdmin && !a.disabledAt).length;
    const text =
      action === 'desactiver'
        ? fr.confirm.disable
        : action === 'reinitialiser'
          ? fr.confirm.reset
          : action === 'donner-admin'
            ? fr.confirm.grant
            : fr.confirm.revoke;
    const refusal =
      (action === 'desactiver' || action === 'retirer-admin') && self
        ? fr.errors['not-yourself']
        : action === 'retirer-admin' && admins <= 1
          ? fr.errors['last-admin']
          : undefined;
    return sendHtml(
      response,
      200,
      confirmPage(page, {
        question: text.question(account.email),
        lines: text.lines(account.devices),
        verb: text.verb,
        action: path,
        cancel: base,
        ...(refusal && { refusal }),
      }),
    );
  }

  async function post(
    session: AdminSession,
    path: string,
    form: URLSearchParams,
    url: URL,
    response: ServerResponse,
  ) {
    if (path === '/admin/deconnexion') {
      await adminLogout(db, session.sessionId);
      return redirect(response, '/admin/connexion', { 'Set-Cookie': setCookie('') });
    }
    try {
      if (path === '/admin/comptes') {
        const created = await createAccount(db, session, {
          email: form.get('email') ?? '',
          isAdmin: form.get('admin') === '1',
        });
        const page = await frameFor(session, 'accounts', url);
        return sendHtml(
          response,
          200,
          passwordPage(
            { ...page, flash: { text: `${fr.done['account.create']} · ${created.email}` } },
            created.email,
            created.password,
            `/admin/comptes/${created.id}`,
          ),
        );
      }
      const device = DEVICE.exec(path);
      if (device?.[1] && device[2]) {
        const account = await getAccount(db, device[1]);
        const name =
          account && (await accountDevices(db, account.id)).find((d) => d.id === device[2])?.device;
        if (!account || !(await revokeDevice(db, session, account.id, device[2])))
          return notFound(response);
        options.cutOff([device[2]]);
        return redirect(
          response,
          done(
            'device.revoke',
            [account.email, name].filter(Boolean).join(' · '),
            `/admin/comptes/${account.id}`,
          ),
        );
      }
      const match = ACCOUNT.exec(path);
      const userId = match?.[1];
      const action = match?.[2];
      if (!userId || !action) return notFound(response);
      const back = `/admin/comptes/${userId}`;
      if (action === 'reinitialiser') {
        const reset = await resetAccountPassword(db, session, userId);
        options.cutOff(reset.revoked);
        const page = await frameFor(session, 'accounts', url);
        return sendHtml(
          response,
          200,
          passwordPage(
            { ...page, flash: { text: `${fr.done['account.reset-password']} · ${reset.email}` } },
            reset.email,
            reset.password,
            back,
          ),
        );
      }
      const account = await getAccount(db, userId);
      if (!account) return notFound(response);
      if (action === 'desactiver' || action === 'reactiver') {
        const disable = action === 'desactiver';
        options.cutOff(await setAccountDisabled(db, session, userId, disable));
        return redirect(
          response,
          done(disable ? 'account.disable' : 'account.enable', account.email, back),
        );
      }
      const grant = action === 'donner-admin';
      await setAccountAdmin(db, session, userId, grant);
      return redirect(
        response,
        done(grant ? 'account.grant-admin' : 'account.revoke-admin', account.email, back),
      );
    } catch (error) {
      if (!(error instanceof AdminError)) throw error;
      const back = ACCOUNT.exec(path)?.[1]
        ? `/admin/comptes/${ACCOUNT.exec(path)?.[1]}`
        : '/admin/comptes';
      return redirect(response, `${back}?erreur=${error.code}`);
    }
  }

  return { handle };
}
