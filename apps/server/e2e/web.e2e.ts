import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createUser } from '../src/accounts';
import { migrate } from '../src/database';
import { createSyncServer } from '../src/sync-server';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

/**
 * The web app as an author meets it (D-46, PLAN 7.6, layer 2): the built app
 * in a real Chromium, served by a real sync server (Postgres in memory), the
 * network between them a relay the test can cut.
 */

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
const PASSWORD = 'une serre sous la glace';

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/**
 * The network between the browsers and the server: a relay on its own port.
 * `cut()` drops every connection and refuses new ones until `restore()`.
 */
async function relay(target: number) {
  let up = true;
  const open = new Set<net.Socket>();
  const server = net.createServer((client) => {
    if (!up) {
      client.destroy();
      return;
    }
    const upstream = net.connect(target, '127.0.0.1');
    open.add(client).add(upstream);
    const drop = () => {
      client.destroy();
      upstream.destroy();
      open.delete(client);
      open.delete(upstream);
    };
    client.on('error', drop).on('close', drop);
    upstream.on('error', drop).on('close', drop);
    client.pipe(upstream).pipe(client);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        for (const socket of open) socket.destroy();
        server.close(() => resolve());
      }),
  );
  return {
    port: (server.address() as net.AddressInfo).port,
    cut() {
      up = false;
      for (const socket of open) socket.destroy();
      open.clear();
    },
    restore() {
      up = true;
    },
  };
}

/** A sync server serving the built app, with its accounts. */
async function startServer() {
  const db = new PGlite();
  await migrate(db);
  const server = createSyncServer({ db, port: 0, address: '127.0.0.1', webDir });
  await server.listen();
  cleanups.push(() => server.destroy());
  return {
    /** A way in for one browser, a network of its own that can be cut. */
    network: async () => {
      const network = await relay(server.address.port);
      // `localhost`: a secure origin for Chromium, where the `__Host-` cookie holds.
      return { ...network, url: `http://localhost:${network.port}/` };
    },
    account: async (email: string) => {
      await createUser(db, email, PASSWORD);
      return email;
    },
  };
}

type Network = Awaited<ReturnType<Awaited<ReturnType<typeof startServer>>['network']>>;

/** A browser never used, no storage, no cookie, on its own network. */
async function freshBrowser(network: Network) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  cleanups.push(() => context.close());
  const page = await context.newPage();
  return { context, page, network };
}

const editorOf = (page: Page) => page.getByRole('textbox', { name: 'Texte de la scène' });
const footerSays = (page: Page, status: string) =>
  page.getByText(status, { exact: true }).waitFor({ timeout: 20_000 });

const libraryOf = (page: Page) => page.getByRole('listbox', { name: 'Projets' });

/**
 * Signs in on the app's first screen. An account's first browser opens its
 * first project; once it has some, the library comes first.
 */
async function signIn(
  { page, network }: { readonly page: Page; readonly network: Network },
  email: string,
): Promise<'project' | 'library'> {
  await page.goto(network.url);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: /Se connecter/ }).click();
  try {
    await editorOf(page).or(libraryOf(page)).first().waitFor({ timeout: 30_000 });
  } catch (error) {
    if (process.env.E2E_DUMP) {
      const fs = await import('node:fs');
      fs.writeFileSync(`${process.env.E2E_DUMP}.txt`, await page.locator('body').innerText());
      await page.screenshot({ path: `${process.env.E2E_DUMP}.png` });
    }
    throw error;
  }
  if (await libraryOf(page).isVisible()) return 'library';
  await dismissWelcome(page);
  return 'project';
}

async function dismissWelcome(page: Page) {
  await footerSays(page, 'Synchronisé');
  const later = page.getByRole('button', { name: /Plus tard/ });
  if (await later.isVisible()) await later.click();
}

/** The library's projects (the trash folded), each by its first line. */
async function projects(page: Page) {
  const rows = await libraryOf(page).getByRole('option').allInnerTexts();
  return rows.map((row) => row.split('\n')[0]?.trim());
}

/** Opens a project of the library. */
async function open(page: Page, title: string) {
  await libraryOf(page)
    .getByRole('option', { name: new RegExp(title) })
    .first()
    .dblclick();
  await editorOf(page).waitFor();
  await dismissWelcome(page);
}

/** Types at the end of the scene's text. */
async function typeAtEnd(page: Page, text: string) {
  const editor = editorOf(page);
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(text);
}

/** A command of the command line, by its title. */
async function command(page: Page, title: string) {
  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.type(title);
  await page
    .getByRole('option', { name: new RegExp(title) })
    .first()
    .waitFor();
  await page.keyboard.press('Enter');
}

/** The drawer of the manuscript: its chapters and scenes, as listed. */
async function manuscript(page: Page) {
  // The console's key, at the foot of the page.
  await page.getByRole('button', { name: /^Manuscrit/ }).click();
  const tree = page.getByRole('tree');
  await tree.waitFor();
  const lines = (await tree.innerText())
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  await page.keyboard.press('Escape');
  return lines;
}

/** The project sheet says whether the account has other projects. */
async function otherProjects(page: Page) {
  await page.getByRole('button', { name: /le projet : renommer, changer de projet/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Le projet' });
  await sheet.waitFor();
  const text = await sheet.innerText();
  await page.keyboard.press('Escape');
  return text;
}

describe('the web app, through a real server (D-46, rules 11 and 4.7 a)', () => {
  it('shows a fresh browser exactly what the account has (rule 11)', async () => {
    const server = await startServer();
    const helene = await server.account('helene@example.org');
    const bob = await server.account('bob@example.org');

    // Hélène's first browser: her first project, a sentence in it.
    const first = await freshBrowser(await server.network());
    await signIn(first, helene);
    await typeAtEnd(first.page, 'Le bateau est prêt.');
    await footerSays(first.page, 'Synchronisé');
    // Another account, its own text, on the same server.
    const other = await freshBrowser(await server.network());
    await signIn(other, bob);
    await typeAtEnd(other.page, 'Le carnet de Bob.');
    await footerSays(other.page, 'Synchronisé');

    // A browser never used, Hélène's account: her project, once, with her sentence,
    // and nothing in a trash.
    const fresh = await freshBrowser(await server.network());
    expect(await signIn(fresh, helene)).toBe('library');
    expect(await projects(fresh.page)).toEqual(['Mon projet']);
    expect(await fresh.page.locator('body').innerText()).not.toMatch(/Corbeille\s*\(/);
    await open(fresh.page, 'Mon projet');
    await expect.poll(() => editorOf(fresh.page).innerText()).toContain('Le bateau est prêt.');
    expect(await editorOf(fresh.page).innerText()).not.toContain('Bob');
    expect(await otherProjects(fresh.page)).toContain('C’est votre seul projet pour l’instant.');
    // One chapter, one scene, as on the first browser: no starter made on top of hers.
    const drawer = await manuscript(fresh.page);
    expect(drawer.filter((line) => line.includes('Chapitre 1'))).toHaveLength(1);
    expect(drawer.filter((line) => line.includes('Scène 1'))).toHaveLength(1);
    expect(drawer).toEqual(await manuscript(first.page));

    // Signed out, then Bob on the same browser: nothing of Hélène's is left.
    await command(fresh.page, 'Se déconnecter du serveur');
    await fresh.page.getByLabel('E-mail').waitFor();
    expect(await signIn(fresh, bob)).toBe('library');
    expect(await projects(fresh.page)).toEqual(['Mon projet']);
    await open(fresh.page, 'Mon projet');
    await expect.poll(() => editorOf(fresh.page).innerText()).toContain('Le carnet de Bob.');
    expect(await editorOf(fresh.page).innerText()).not.toContain('bateau');
    expect(await otherProjects(fresh.page)).toContain('C’est votre seul projet pour l’instant.');
  });

  it('keeps what is written while the network is cut, and sends it back (4.7 a)', async () => {
    const server = await startServer();
    const helene = await server.account('helene@example.org');
    const mac = await freshBrowser(await server.network());
    await signIn(mac, helene);
    await typeAtEnd(mac.page, 'Avant la coupure.');
    await footerSays(mac.page, 'Synchronisé');
    const elsewhere = await freshBrowser(await server.network());
    await signIn(elsewhere, helene);
    await open(elsewhere.page, 'Mon projet');
    await expect.poll(() => editorOf(elsewhere.page).innerText()).toContain('Avant la coupure.');

    // The network goes: the footer says so, the writing goes on.
    mac.network.cut();
    await mac.context.setOffline(true);
    await footerSays(mac.page, 'Hors ligne');
    await typeAtEnd(mac.page, ' Pendant la coupure.');
    // Meanwhile, the other device writes too.
    await typeAtEnd(elsewhere.page, ' Écrit ailleurs.');
    await footerSays(elsewhere.page, 'Synchronisé');
    await mac.page.waitForTimeout(1_000);
    expect(await editorOf(elsewhere.page).innerText()).not.toContain('Pendant la coupure.');

    // The network comes back: both texts on both devices, nothing lost.
    mac.network.restore();
    await mac.context.setOffline(false);
    await footerSays(mac.page, 'Synchronisé');
    for (const device of [mac, elsewhere]) {
      await expect
        .poll(() => editorOf(device.page).innerText(), { timeout: 20_000 })
        .toMatch(/Avant la coupure\.(?=.*Pendant la coupure\.)(?=.*Écrit ailleurs\.)/s);
    }
    // And on the server: a browser never used finds it all.
    const fresh = await freshBrowser(await server.network());
    await signIn(fresh, helene);
    await open(fresh.page, 'Mon projet');
    await expect
      .poll(() => editorOf(fresh.page).innerText(), { timeout: 20_000 })
      .toMatch(/Pendant la coupure\.(?=[\s\S]*)/);
    expect(await editorOf(fresh.page).innerText()).toContain('Écrit ailleurs.');
  });
});
