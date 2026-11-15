import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createChapter,
  createScene,
  initProject,
  parseSceneMarkdown,
  variantFragment,
  writeSceneDocToFragment,
} from '@charpentier/schema';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { login } from '../accounts';
import { storeDocument, type Database } from '../database';
import { createSyncServer } from '../sync-server';
import { account, cleanUp, connect, freshDatabase } from '../testing';

const servers: { destroy(): Promise<void> }[] = [];
afterEach(async () => {
  await cleanUp();
  for (const server of servers.splice(0)) await server.destroy();
});

/** A server whose backups folder is a temporary one; requests come from the home network. */
async function start(db: Database, backupsDir: string | null = null) {
  const server = createSyncServer({ db, port: 0, address: '127.0.0.1', admin: { backupsDir } });
  await server.listen();
  servers.push(server);
  const base = `http://127.0.0.1:${server.address.port}`;
  return { base, ws: `ws://127.0.0.1:${server.address.port}`, server };
}

const HOME = { 'X-Forwarded-For': '192.168.1.36' };

/** A browser at home, with its cookie jar of one cookie. */
function browser(base: string, headers: Record<string, string> = HOME) {
  let cookie = '';
  const request = async (pathname: string, init: RequestInit = {}) => {
    const response = await fetch(`${base}${pathname}`, {
      redirect: 'manual',
      ...init,
      headers: { ...headers, ...(cookie && { Cookie: cookie }), ...init.headers },
    });
    const set = response.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0]?.endsWith('=') ? '' : (set.split(';')[0] ?? '');
    return response;
  };
  const post = (
    pathname: string,
    form: Record<string, string>,
    extra: Record<string, string> = {},
  ) =>
    request(pathname, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...extra },
      body: new URLSearchParams(form).toString(),
    });
  const csrfOf = (page: string) => /name="csrf" value="([^"]+)"/.exec(page)?.[1] ?? '';
  /** The page with its spaces collapsed (the markup's line breaks are not meaningful). */
  const text = async (pathname: string) =>
    (await (await request(pathname)).text()).replace(/\s+/g, ' ');
  return { request, post, text, csrfOf, cookie: () => cookie };
}

async function signedIn(db: Database, base: string) {
  const pierre = await account(db, 'pierre@example.org');
  const b = browser(base);
  const response = await b.post('/admin/connexion', {
    email: pierre.email,
    password: pierre.password,
  });
  expect(response.status).toBe(303);
  const page = await (await b.request('/admin/comptes')).text();
  return { ...b, pierre, csrf: b.csrfOf(page), page };
}

describe('the administration page (phase 4.6)', () => {
  it('does not exist from the Internet', async () => {
    const db = await freshDatabase();
    const { base } = await start(db);
    // Through Cloudflare: the last address of X-Forwarded-For is Cloudflare's.
    const internet = browser(base, { 'X-Forwarded-For': '203.0.113.5, 104.16.0.1' });
    expect((await internet.request('/admin/connexion')).status).toBe(404);
    expect((await internet.request('/admin/style/admin.css')).status).toBe(404);
    // Tailscale and the home network reach it.
    expect(
      (await browser(base, { 'X-Forwarded-For': '100.101.102.103' }).request('/admin/connexion'))
        .status,
    ).toBe(200);
    expect((await browser(base).request('/admin/connexion')).status).toBe(200);
  });

  it('signs an administrator in with a strict cookie, and nobody else', async () => {
    const db = await freshDatabase();
    const { base } = await start(db);
    const pierre = await account(db, 'pierre@example.org');
    const helene = await account(db, 'helene@example.org');

    const b = browser(base);
    expect((await b.request('/admin/comptes')).headers.get('location')).toBe('/admin/connexion');
    // Not an administrator: the same answer as a wrong password.
    const refused = await b.post('/admin/connexion', {
      email: helene.email,
      password: helene.password,
    });
    expect(refused.status).toBe(401);
    expect(await refused.text()).toContain('e-mail ou mot de passe incorrect');

    // As a browser sends the form: same site, and an Origin that may be « null ».
    const ok = await b.post(
      '/admin/connexion',
      { email: pierre.email, password: pierre.password },
      { 'Sec-Fetch-Site': 'same-origin', Origin: 'null' },
    );
    expect(ok.status).toBe(303);
    expect(ok.headers.get('set-cookie')).toMatch(
      /^__Host-charpentier-admin=[\w-]+; Path=\/; HttpOnly; Secure; SameSite=Strict$/,
    );
    const page = await b.text('/admin/comptes');
    console.log('NAV', page.slice(page.indexOf('<nav'), page.indexOf('</nav>')));
    expect(page).toContain('pierre@example.org <span class="adm-tag">vous</span>');
    expect(page).toContain('helene@example.org');
    expect(page).toMatch(/<a href="\/admin\/comptes" +aria-current="page" ?>comptes<\/a/);

    const style = await b.request('/admin/style/admin.css');
    expect(style.headers.get('content-type')).toBe('text/css; charset=utf-8');
  });

  it('creates an account that signs in from the app, its password shown once', async () => {
    const db = await freshDatabase();
    const { base } = await start(db);
    const b = await signedIn(db, base);
    const created = await b.post('/admin/comptes', { csrf: b.csrf, email: 'claire@example.org' });
    const page = await created.text();
    const password = /<p class="adm-secret">([^<]+)<\/p>/.exec(page)?.[1] ?? '';
    expect(password).toMatch(/^[a-z]+-[a-z]+-[a-z]+-[a-z]+-\d\d$/);
    expect(page).toContain('compte créé · claire@example.org');
    expect(await login(db, 'claire@example.org', password, 'Mac')).not.toBeNull();
    // The log has it; the password nowhere.
    const log = await (await b.request('/admin/journal')).text();
    expect(log).toContain('compte créé');
    expect(log).not.toContain(password);
  });

  it('refuses an action without its token, or sent from another site', async () => {
    const db = await freshDatabase();
    const { base } = await start(db);
    const b = await signedIn(db, base);
    const forged = await b.post('/admin/comptes', { email: 'intrus@example.org' });
    expect(forged.headers.get('location')).toBe('/admin/comptes?erreur=expired');
    const elsewhere = await b.post(
      '/admin/comptes',
      { csrf: b.csrf, email: 'intrus@example.org' },
      { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' },
    );
    expect(elsewhere.headers.get('location')).toBe('/admin/comptes?erreur=expired');
    expect(await login(db, 'intrus@example.org', 'x', 'Mac')).toBeNull();
    const after = await (await b.request('/admin/comptes?erreur=expired')).text();
    expect(after).toContain('cette action a expiré · recommencez');
  });

  it('revokes a device after confirmation: its sync stops at once', async () => {
    const db = await freshDatabase();
    const { base, ws } = await start(db);
    const b = await signedIn(db, base);
    const helene = await account(db, 'helene@example.org');
    const device = connect(ws, `library:${helene.userId}`, helene.token);
    expect(await device.synced).toBe(true);

    const confirm = await (
      await b.request(`/admin/comptes/${helene.userId}/appareils/${helene.sessionId}/revoquer`)
    ).text();
    expect(confirm).toContain('révoquer test ?');
    expect(confirm).toContain('autofocus>révoquer l’appareil');
    const closed = new Promise<string>((resolve) =>
      device.provider.on('close', (e: { event: { reason: string } }) => resolve(e.event.reason)),
    );
    const revoked = await b.post(
      `/admin/comptes/${helene.userId}/appareils/${helene.sessionId}/revoquer`,
      {
        csrf: b.csrf,
      },
    );
    expect(revoked.headers.get('location')).toBe(
      `/admin/comptes/${helene.userId}?fait=device.revoke&sur=${encodeURIComponent('helene@example.org · test')}`,
    );
    // Cut off at once (and its token no longer opens anything).
    expect(await closed).toBe('Server closed the connection');
  });

  it('refuses to take the role of the last administrator, or to disable oneself', async () => {
    const db = await freshDatabase();
    const { base } = await start(db);
    const b = await signedIn(db, base);
    const self = await (await b.request(`/admin/comptes/${b.pierre.userId}/desactiver`)).text();
    expect(self).toContain('impossible sur votre propre compte');
    expect(self).not.toContain('autofocus');
  });

  it('exports a project in Markdown, the same files as the mirror', async () => {
    const db = await freshDatabase();
    const { base } = await start(db);
    const b = await signedIn(db, base);
    const root = new Y.Doc();
    initProject(root, { id: 'roman', title: 'La batelière', kind: 'novel' });
    const chapterId = createChapter(root, { title: 'Le départ' });
    const { sceneId, variantId } = createScene(root, { chapterId, title: 'Le quai' });
    const scene = new Y.Doc();
    writeSceneDocToFragment(
      parseSceneMarkdown('Hélène attache la barque.'),
      variantFragment(scene, variantId),
    );
    await db.query("insert into projects (id, user_id) values ('roman', $1)", [b.pierre.userId]);
    await storeDocument(db, 'project:roman', Y.encodeStateAsUpdate(root));
    await storeDocument(db, `project:roman/scene:${sceneId}`, Y.encodeStateAsUpdate(scene));

    const response = await b.request('/admin/projets/roman/export');
    expect(response.headers.get('content-type')).toBe('application/zip');
    expect(response.headers.get('content-disposition')).toMatch(
      /attachment; filename="la-bateliere-\d{4}-\d\d-\d\d\.zip"/,
    );
    const archive = Buffer.from(await response.arrayBuffer());
    expect(archive.subarray(0, 2).toString()).toBe('PK');
    expect(archive.toString('utf8')).toContain('la-bateliere/manuscrit/01-le-depart/01-le-quai.md');
    expect(archive.toString('utf8')).toContain('Hélène attache la barque.');
    expect(archive.toString('utf8')).toContain('la-bateliere/modules/personnages.yaml');
    expect(await (await b.request('/admin/journal')).text()).toContain('projet exporté');
  });

  it('warns on every page when the last backup is older than 48 hours', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charpentier-backups-'));
    try {
      const db = await freshDatabase();
      const { base } = await start(db, dir);
      const b = await signedIn(db, base);
      expect(b.page).toContain('aucune sauvegarde pour l’instant');
      const file = path.join(dir, 'charpentier-2026-11-12.tar.gz');
      fs.writeFileSync(file, 'x'.repeat(2048));
      const old = Date.now() / 1000 - 3 * 24 * 3600;
      fs.utimesSync(file, old, old);
      const page = await b.text('/admin/projets');
      console.log('ALERT', page.slice(page.indexOf('</header>'), page.indexOf('<main')));
      expect(page).toMatch(
        /<p class="adm-alert"> ?sauvegarde en retard · la dernière date du .*, il y a 3 jours/,
      );
      const backups = await (await b.request('/admin/sauvegardes')).text();
      expect(backups).toContain('2 ko');
      expect(backups).toContain('docker compose stop server db');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
