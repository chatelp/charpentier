import type { AccountRow, BackupInfo, DeviceRow, LogEntry, ProjectRow } from './data';
import { fr } from './texts';

/**
 * The administration page's HTML (docs/DESIGN.md §4.13, mock in
 * docs/design/admin/index.html): rendered by the server, classic forms, no
 * JavaScript. Every value from the database goes through `esc`.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
export const esc = (value: string) => value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);

/** Raw HTML, already escaped: what the templates put together. */
class Html {
  constructor(readonly text: string) {}
  toString() {
    return this.text;
  }
}
type Part = Html | string | number | false | null | undefined | readonly Part[];
const render = (part: Part): string =>
  part === false || part === null || part === undefined
    ? ''
    : part instanceof Html
      ? part.text
      : Array.isArray(part)
        ? part.map(render).join('')
        : esc(String(part));
/** A template: interpolated values are escaped, unless they are Html themselves. */
export function markup(strings: TemplateStringsArray, ...values: Part[]): Html {
  return new Html(
    strings.reduce((out, s, i) => out + s + (i < values.length ? render(values[i]) : ''), ''),
  );
}

// ─── Dates and sizes ───

export interface Clock {
  readonly now: Date;
  /** Where the administrator lives (the server runs in UTC). */
  readonly timeZone: string;
}

const dayKey = (date: Date, timeZone: string) =>
  date.toLocaleDateString('fr-FR', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
const time = (date: Date, timeZone: string) =>
  date.toLocaleTimeString('fr-FR', { timeZone, hour: '2-digit', minute: '2-digit' });

/** « aujourd'hui 09:12 », « hier 21:40 », « 4 nov. 2026 » (`withTime`: « 14 nov. 18:02 »). */
export function when(iso: string | null, clock: Clock, withTime = false): string {
  if (!iso) return '—';
  const date = new Date(iso);
  const { now, timeZone } = clock;
  const day = 86_400_000;
  if (dayKey(date, timeZone) === dayKey(now, timeZone))
    return `${fr.dates.today} ${time(date, timeZone)}`;
  if (dayKey(date, timeZone) === dayKey(new Date(now.getTime() - day), timeZone))
    return `${fr.dates.yesterday} ${time(date, timeZone)}`;
  const options: Intl.DateTimeFormatOptions = withTime
    ? { timeZone, day: 'numeric', month: 'short' }
    : { timeZone, day: 'numeric', month: 'short', year: 'numeric' };
  const text = date.toLocaleDateString('fr-FR', options);
  return withTime ? `${text} ${time(date, timeZone)}` : text;
}

/** « il y a 6 h », « il y a 3 jours ». */
export function ago(iso: string, clock: Clock): string {
  const hours = Math.floor((clock.now.getTime() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return fr.dates.ago.minutes;
  if (hours < 48) return fr.dates.ago.hours(hours);
  return fr.dates.ago.days(Math.floor(hours / 24));
}

/** « 640 ko », « 3,4 Mo ». */
export function size(bytes: number): string {
  if (bytes < 1000) return `${bytes} o`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} ko`;
  if (bytes < 1_000_000_000)
    return `${(bytes / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
  return `${(bytes / 1_000_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go`;
}

// ─── The frame ───

export type Section = 'accounts' | 'projects' | 'backups' | 'log';
const SECTIONS: readonly [Section, string][] = [
  ['accounts', '/admin/comptes'],
  ['projects', '/admin/projets'],
  ['backups', '/admin/sauvegardes'],
  ['log', '/admin/journal'],
];

export interface Frame {
  readonly email: string;
  readonly csrf: string;
  readonly section: Section;
  readonly clock: Clock;
  /** The last backup, for the alert of every page (undefined: no folder mounted, no alert). */
  readonly backup: BackupInfo | null | undefined;
  /** What the last action did (« compte créé · claire@exemple.fr »), or an error. */
  readonly flash?: { readonly text: string; readonly error?: boolean };
}

function document(title: string, body: Html): string {
  return markup`<!doctype html>
    <html lang="fr" class="ch-system">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
        <link rel="stylesheet" href="/admin/style/tokens.css" />
        <link rel="stylesheet" href="/admin/style/admin.css" />
      </head>
      <body class="adm">
        ${body}
      </body>
    </html> `.text;
}

const csrfField = (csrf: string) => markup`<input type="hidden" name="csrf" value="${csrf}" />`;

function frame(page: Frame, title: string, main: Html): string {
  const alert =
    page.backup === undefined
      ? null
      : page.backup === null
        ? markup`<p class="adm-alert">
            ${fr.backups.alertNone} · <a href="/admin/sauvegardes">${fr.backups.see}</a>
          </p>`
        : page.backup.stale
          ? markup`<p class="adm-alert">
              ${fr.backups.alertLate(when(page.backup.at, page.clock, true), ago(page.backup.at, page.clock))}
              · <a href="/admin/sauvegardes">${fr.backups.see}</a>
            </p>`
          : null;
  const flash = page.flash
    ? markup`<p class="${page.flash.error ? 'adm-error adm-flash' : 'adm-flash'}" role="status">
        ${page.flash.text}
      </p>`
    : null;
  return document(
    `${title} · ${fr.title}`,
    markup`<header class="adm-head">
        <span class="adm-brand"><i class="adm-dot"></i>${fr.brand}</span>
        <nav class="adm-nav" aria-label="${fr.sections}">
          ${SECTIONS.map(
            ([section, href]) =>
              markup`<a href="${href}" ${section === page.section ? markup` aria-current="page"` : ''}
                >${fr.nav[section]}</a
              >`,
          )}
        </nav>
        <span class="adm-who"
          >${page.email} ·
          <form method="post" action="/admin/deconnexion" style="display: inline">
            ${csrfField(page.csrf)}<button class="adm-link">${fr.signOut}</button>
          </form></span
        >
      </header>
      ${alert}${flash}
      <main class="adm-main">${main}</main>`,
  );
}

// ─── Pages ───

export function loginPage(error?: string): string {
  return document(
    fr.title,
    markup`<div class="adm-login">
      <form class="adm-card" method="post" action="/admin/connexion">
        <p class="adm-brand"><i class="adm-dot"></i>${fr.brand}</p>
        <div class="adm-form">
          ${error ? markup`<p class="adm-error" role="alert">${error}</p>` : null}
          <label class="adm-field"
            >${fr.login.email}
            <input type="email" name="email" autocomplete="username" required autofocus
          /></label>
          <label class="adm-field"
            >${fr.login.password}
            <input type="password" name="password" autocomplete="current-password" required
          /></label>
          <div class="adm-actions">
            <button class="adm-btn is-main">${fr.login.submit} <kbd>⏎</kbd></button>
          </div>
        </div>
      </form>
    </div>`,
  );
}

export function accountsPage(page: Frame, accounts: readonly AccountRow[], selfId: string): string {
  return frame(
    page,
    fr.accounts.title,
    markup`<h1>${fr.accounts.title} <small>${accounts.length}</small></h1>
      <div class="adm-scroll">
        <table class="adm-table">
          <thead>
            <tr>
              <th>${fr.accounts.email}</th>
              <th>${fr.accounts.role}</th>
              <th>${fr.accounts.created}</th>
              <th class="num">${fr.accounts.devices}</th>
              <th>${fr.accounts.lastSeen}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${accounts.map(
              (a) => markup`<tr${a.disabledAt ? markup` class="is-off"` : ''}>
        <td>${a.email}${a.id === selfId ? markup` <span class="adm-tag">${fr.accounts.you}</span>` : ''}${a.disabledAt ? markup` <span class="adm-tag">${fr.accounts.disabled}</span>` : ''}</td>
        <td>${a.isAdmin ? fr.accounts.admin : fr.accounts.author}</td>
        <td>${when(a.createdAt, page.clock)}</td>
        <td class="num">${a.devices}</td>
        <td>${when(a.lastSeenAt, page.clock)}</td>
        <td class="act"><a class="adm-btn" href="/admin/comptes/${a.id}">${fr.accounts.open}</a></td>
      </tr>`,
            )}
          </tbody>
        </table>
      </div>
      <h2>${fr.accounts.new}</h2>
      <form class="adm-form" method="post" action="/admin/comptes">
        ${csrfField(page.csrf)}
        <label class="adm-field"
          >${fr.accounts.email}
          <input type="email" name="email" placeholder="nom@exemple.fr" required
        /></label>
        <label class="adm-check"
          ><input type="checkbox" name="admin" value="1" /> ${fr.accounts.isAdmin}</label
        >
        <button class="adm-btn is-main">${fr.accounts.create}</button>
      </form>
      <p class="adm-note" style="margin-top: 10px">${fr.accounts.passwordNote}</p>`,
  );
}

/** The password drawn, shown once (after a creation or a reset). */
export function passwordPage(page: Frame, email: string, password: string, next: string): string {
  return frame(
    page,
    fr.accounts.title,
    markup`<div class="adm-card">
      <h1>${fr.password.title(email)}</h1>
      <p class="adm-secret">${password}</p>
      <p class="adm-note">${fr.password.note(email)}</p>
      <div class="adm-actions">
        <a class="adm-btn is-main" href="${next}" autofocus>${fr.password.ok}</a>
      </div>
    </div>`,
  );
}

export function accountPage(
  page: Frame,
  account: AccountRow,
  devices: readonly DeviceRow[],
  projects: readonly ProjectRow[],
): string {
  const base = `/admin/comptes/${account.id}`;
  const role = account.isAdmin ? fr.accounts.admin : fr.accounts.author;
  return frame(
    page,
    account.email,
    markup`<p class="adm-note" style="margin: 0 0 6px">
        <a href="/admin/comptes">${fr.accounts.back}</a>
      </p>
      <h1>
        ${account.email}
        <small>${fr.accounts.createdOn(role, when(account.createdAt, page.clock))}</small>
      </h1>
      <div class="adm-actions">
        <a class="adm-btn" href="${base}/reinitialiser">${fr.account.reset}</a>
        <a class="adm-btn" href="${base}/${account.isAdmin ? 'retirer-admin' : 'donner-admin'}"
          >${account.isAdmin ? fr.account.revoke : fr.account.grant}</a
        >
        ${
          account.disabledAt
            ? markup`<form method="post" action="${base}/reactiver" style="display: inline">
                ${csrfField(page.csrf)}<button class="adm-btn">${fr.account.enable}</button>
              </form>`
            : markup`<a class="adm-btn" href="${base}/desactiver">${fr.account.disable}</a>`
        }
      </div>
      <h2>${fr.account.devices(devices.filter((d) => !d.revoked).length)}</h2>
      <div class="adm-scroll">
        <table class="adm-table">
          <thead>
            <tr>
              <th>${fr.account.device}</th>
              <th>${fr.account.firstSeen}</th>
              <th>${fr.accounts.lastSeen}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${devices.map(
              (d) => markup`<tr${d.revoked ? markup` class="is-off"` : ''}>
        <td>${d.device || '—'}${d.revoked ? markup` <span class="adm-tag">${fr.account.revoked}</span>` : ''}</td>
        <td>${when(d.createdAt, page.clock)}</td>
        <td>${when(d.lastSeenAt, page.clock)}</td>
        <td class="act">${d.revoked ? '' : markup`<a class="adm-btn" href="${base}/appareils/${d.id}/revoquer">${fr.account.revokeDevice}</a>`}</td>
      </tr>`,
            )}
          </tbody>
        </table>
      </div>
      <h2>${fr.account.projects(projects.length)}</h2>
      ${projectTable(projects, page.clock, false)}`,
  );
}

function projectTable(projects: readonly ProjectRow[], clock: Clock, withOwner: boolean): Html {
  return markup`<div class="adm-scroll">
    <table class="adm-table">
      ${
        withOwner
          ? markup`<thead>
              <tr>
                <th>${fr.projects.name}</th>
                <th>${fr.projects.owner}</th>
                <th class="num">${fr.projects.size}</th>
                <th>${fr.projects.lastWrite}</th>
                <th></th>
              </tr>
            </thead>`
          : null
      }
      <tbody>
        ${projects.map(
          (p) => markup`<tr${p.trashed ? markup` class="is-off"` : ''}>
        <td>${p.title || fr.projects.untitled}${p.trashed ? markup` <span class="adm-tag">${fr.projects.trash}</span>` : ''}</td>
        ${withOwner ? markup`<td>${p.owner}</td>` : null}
        <td class="num">${size(p.size)}</td>
        <td>${when(p.lastWrite, clock)}</td>
        <td class="act"><a class="adm-btn" href="/admin/projets/${encodeURIComponent(p.id)}/export" download>${fr.projects.export}</a></td>
      </tr>`,
        )}
      </tbody>
    </table>
  </div>`;
}

export function projectsPage(page: Frame, projects: readonly ProjectRow[]): string {
  return frame(
    page,
    fr.projects.title,
    markup`<h1>${fr.projects.title} <small>${projects.length}</small></h1>
      ${projectTable(projects, page.clock, true)}`,
  );
}

/** A sensitive action, confirmed on a page of its own; `refusal`: said, without the button. */
export function confirmPage(
  page: Frame,
  input: {
    readonly question: string;
    readonly lines: readonly string[];
    readonly verb: string;
    readonly action: string;
    readonly cancel: string;
    readonly refusal?: string;
  },
): string {
  return frame(
    page,
    input.question,
    markup`<form class="adm-card" method="post" action="${input.action}">
      ${csrfField(page.csrf)}
      <h1>${input.question}</h1>
      ${
        input.refusal
          ? markup`<p class="adm-error" role="alert">${input.refusal}</p>`
          : markup`<ul>
              ${input.lines.map((l) => markup`<li>${l}</li>`)}
            </ul>`
      }
      <div class="adm-actions">
        ${input.refusal ? null : markup`<button class="adm-btn is-main" autofocus>${input.verb} <kbd>⏎</kbd></button>`}
        <a href="${input.cancel}">${fr.confirm.cancel}</a>
      </div>
    </form>`,
  );
}

export function backupsPage(
  page: Frame,
  backups: readonly BackupInfo[],
  mounted: boolean,
  next: string,
  restore: string,
): string {
  const last = backups[0];
  const late = !last || last.stale;
  return frame(
    page,
    fr.backups.title,
    markup`<h1>${fr.backups.title}</h1>
<div class="adm-status">
  <p${mounted && late ? markup` class="is-alert"` : ''}><b>${fr.backups.last}</b><span>${last ? `${when(last.at, page.clock, true)} · ${ago(last.at, page.clock)}` : '—'}</span></p>
  <p><b>${fr.backups.size}</b><span>${last ? size(last.size) : '—'}</span></p>
  <p><b>${fr.backups.next}</b><span>${next}</span></p>
</div>
<p class="adm-note">${!mounted ? fr.backups.unknown : !last ? fr.backups.none : last.stale ? fr.backups.late : fr.backups.rule}</p>
<h2>${fr.backups.recent}</h2>
<div class="adm-scroll">
  <table class="adm-table">
    <thead><tr><th>${fr.backups.date}</th><th class="num">${fr.backups.size}</th><th>${fr.backups.state}</th></tr></thead>
    <tbody>
      ${backups.map(
        (b) =>
          markup`<tr>
            <td>${when(b.at, page.clock, true)}</td>
            <td class="num">${size(b.size)}</td>
            <td>${b.size > 0 ? fr.backups.complete : fr.backups.empty}</td>
          </tr>`,
      )}
    </tbody>
  </table>
</div>
<h2>${fr.backups.restore}</h2>
<p style="margin: 0">${fr.backups.restoreNote}</p>
<code class="adm-code">${restore}</code>`,
  );
}

export function logPage(page: Frame, entries: readonly LogEntry[], older: string | null): string {
  return frame(
    page,
    fr.log.title,
    markup`<h1>${fr.log.title}</h1>
      <p class="adm-lead">${fr.log.lead}</p>
      <div class="adm-scroll">
        <table class="adm-table">
          <thead>
            <tr>
              <th>${fr.log.when}</th>
              <th>${fr.log.who}</th>
              <th>${fr.log.action}</th>
              <th>${fr.log.on}</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map(
              (e) =>
                markup`<tr>
                  <td>${when(e.at, page.clock, true)}</td>
                  <td>${e.admin || '—'}</td>
                  <td>
                    ${fr.done[e.action] ?? e.action}${e.action === 'login.refused' && e.detail ? ` · ${fr.log.attempts(e.detail)}` : ''}
                  </td>
                  <td>
                    ${[e.target, e.action === 'login.refused' ? '' : e.detail].filter(Boolean).join(' · ') || '—'}
                  </td>
                </tr>`,
            )}
          </tbody>
        </table>
      </div>
      ${older ? markup`<p class="adm-note" style="margin-top: 14px"><a href="${older}">${fr.log.older}</a></p>` : null}`,
  );
}
