import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createSyncServer, createUser, migrate } from '@charpentier/server';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { afterEach, describe, expect, it } from 'vitest';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp: string[] = [];
const apps: ElectronApplication[] = [];

const servers: http.Server[] = [];
const syncServers: ReturnType<typeof createSyncServer>[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close().catch(() => {});
  for (const server of servers.splice(0)) server.close();
  for (const server of syncServers.splice(0)) await server.destroy();
  for (const dir of temp.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function folders() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'charpentier-e2e-'));
  temp.push(root);
  return { library: path.join(root, 'Bibliothèque'), userData: path.join(root, 'data') };
}

async function launch(
  dirs: ReturnType<typeof folders>,
  env: Record<string, string> = {},
  args: readonly string[] = [],
) {
  const app = await electron.launch({
    args: [appDir, ...args],
    env: {
      ...process.env,
      CHARPENTIER_LIBRARY: dirs.library,
      CHARPENTIER_USER_DATA: dirs.userData,
      ...env,
    },
  });
  apps.push(app);
  const window = await app.firstWindow();
  const editor = window.getByRole('textbox', { name: 'Texte de la scène' });
  await editor.waitFor();
  return { app, window, editor };
}

interface SeenRequest {
  readonly headers: http.IncomingHttpHeaders;
  readonly body: {
    model?: string;
    system?: { text: string; cache_control?: unknown }[];
    output_config?: { effort?: string; format?: { type: string; schema: { properties: object } } };
  };
}

/**
 * A stand-in for Anthropic's Messages API (the SDK follows ANTHROPIC_BASE_URL):
 * answers a scene analysis or a chat turn with canned JSON, and records what
 * it was sent.
 */
async function fakeAnthropic(answers: { analysis: object; chat: object }) {
  const seen: SeenRequest[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.method === 'GET' && req.url?.startsWith('/v1/models/')) {
        res.end(JSON.stringify({ type: 'model', id: 'claude-opus-5-5', display_name: 'Opus' }));
        return;
      }
      const body = JSON.parse(raw || '{}') as SeenRequest['body'];
      seen.push({ headers: req.headers, body });
      const isAnalysis = 'characters' in (body.output_config?.format?.schema.properties ?? {});
      res.end(
        JSON.stringify({
          id: `msg_${seen.length}`,
          type: 'message',
          role: 'assistant',
          model: body.model,
          content: [
            { type: 'text', text: JSON.stringify(isAnalysis ? answers.analysis : answers.chat) },
          ],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      );
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, seen };
}

describe('desktop app', () => {
  it('opens the same app as the web, with a sandboxed renderer', async () => {
    const dirs = folders();
    const { app, window } = await launch(dirs);
    expect(await window.title()).toContain('Charpentier');
    expect(await window.evaluate(() => typeof (globalThis as { require?: unknown }).require)).toBe(
      'undefined',
    );
    const prefs = await app.evaluate(({ BrowserWindow }) => {
      const [w] = BrowserWindow.getAllWindows();
      // Documented, but absent from Electron's type definitions.
      return (
        w?.webContents as unknown as { getLastWebPreferences(): Record<string, unknown> }
      ).getLastWebPreferences();
    });
    expect(prefs).toMatchObject({ contextIsolation: true, sandbox: true, nodeIntegration: false });
    expect(
      fs.existsSync(path.join(dirs.library, 'Mon roman', '.charpentier', 'project.json')),
    ).toBe(true);
  });

  it('loses nothing when the app is killed while writing', async () => {
    const dirs = folders();
    const first = await launch(dirs);
    await first.editor.click();
    await first.window.keyboard.type('Il pleuvait sur Nantes depuis trois jours.');
    // Each keystroke crosses to the main process and is written before the next one is handled.
    await first.window.waitForTimeout(300);
    first.app.process().kill('SIGKILL');
    await new Promise((resolve) => first.app.process().once('exit', resolve));
    apps.splice(apps.indexOf(first.app), 1);

    const second = await launch(dirs);
    await expect
      .poll(() => second.editor.textContent())
      .toBe('Il pleuvait sur Nantes depuis trois jours.');
  });

  it('mirrors the scene in Markdown and takes in a correction made in another editor', async () => {
    const dirs = folders();
    const { editor, window } = await launch(dirs);
    await editor.click();
    await window.keyboard.type('Il pleuvait sur Nantes.');
    await window.keyboard.press('Enter');
    await window.keyboard.type('Hélène regardait la Loire.');
    const file = path.join(
      dirs.library,
      'Mon roman',
      'manuscrit',
      '01-chapitre-1',
      '01-scene-1.md',
    );
    await expect
      .poll(() => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''), { timeout: 10_000 })
      .toContain('Il pleuvait sur Nantes.\n\nHélène regardait la Loire.');

    // Another editor corrects the first sentence.
    fs.writeFileSync(
      file,
      fs.readFileSync(file, 'utf8').replace('sur Nantes', 'sur Nantes, encore'),
    );
    await expect
      .poll(() => editor.textContent(), { timeout: 10_000 })
      .toBe('Il pleuvait sur Nantes, encore.Hélène regardait la Loire.');
  });

  it('checks French spelling offline with the bundled dictionary', async () => {
    const dirs = folders();
    const { editor, window } = await launch(dirs);
    await editor.click();
    await window.keyboard.type('Il pleuvai sur Nantes depuis trois jours.');
    await expect
      .poll(() => window.locator('.ch-lang-spelling').allTextContents(), { timeout: 20_000 })
      .toEqual(['pleuvai']);
  });

  it('lets the Compagnon read the scene and answer, through the LLM service', async () => {
    const quote = 'Helene regardait la Loire';
    const anthropic = await fakeAnthropic({
      analysis: {
        characters: [{ name: 'Helene', existingId: null, quote, fields: [] }],
        worldRules: [],
        clues: [],
        knowledge: [],
        conflicts: [],
        remarks: [
          {
            kind: 'craft',
            quote,
            title: 'Un regard sans enjeu',
            message: 'Que cherche-t-elle dans ce regard ?',
            principle: 'Une scène avance quand un personnage veut quelque chose.',
            correction: null,
            example: null,
          },
        ],
      },
      chat: { reply: 'Demandez-vous ce que veut votre personnage ici.', example: null },
    });
    const { editor, window } = await launch(folders(), {
      ANTHROPIC_BASE_URL: anthropic.url,
      CHARPENTIER_ANTHROPIC_API_KEY: 'sk-ant-test',
    });
    await editor.click();
    await window.keyboard.type(`${quote} en silence.`);

    // Reading the scene on demand: a remark in the margin, a proposed sheet.
    await window.keyboard.press('ControlOrMeta+Shift+A');
    await expect
      .poll(() => window.locator('.ch-pastille').count(), { timeout: 15_000 })
      .toBeGreaterThan(0);
    const [analysis] = anthropic.seen;
    expect(analysis?.body.model).toBe('claude-opus-5-5');
    expect(analysis?.body.output_config).toMatchObject({
      effort: 'high',
      format: { type: 'json_schema' },
    });
    expect(analysis?.body.system?.[0]?.cache_control).toEqual({ type: 'ephemeral' });
    expect(analysis?.headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01');

    await window.keyboard.press('ControlOrMeta+L');
    const panel = window.getByRole('complementary', { name: 'Le Compagnon' });
    await expect.poll(() => panel.textContent()).toContain('Un regard sans enjeu');
    expect(await panel.textContent()).toContain('Helene');

    // A question in the conversation, answered.
    await window.keyboard.press('Escape');
    await editor.click();
    await window.keyboard.press('ControlOrMeta+K');
    await window.keyboard.type('Parler au Compagnon');
    await window.keyboard.press('Enter');
    const question = window.getByRole('textbox', { name: 'Votre question au Compagnon' });
    await question.fill('Que faire de cette scène ?');
    await question.press('Enter');
    await expect
      .poll(() => window.getByText('Demandez-vous ce que veut votre personnage ici.').count(), {
        timeout: 15_000,
      })
      .toBe(1);
    expect(anthropic.seen).toHaveLength(2);

    // The review of the chapter, on demand, in the conversation.
    await question.press('Escape');
    await window.keyboard.press('ControlOrMeta+K');
    await window.keyboard.type('Bilan du chapitre');
    await window.keyboard.press('Enter');
    await expect.poll(() => anthropic.seen.length, { timeout: 15_000 }).toBe(3);
    expect(JSON.stringify(anthropic.seen[2]?.body)).toContain(`${quote} en silence.`);
    await window.keyboard.press('ControlOrMeta+K');
    await window.keyboard.type('Parler au Compagnon');
    await window.keyboard.press('Enter');
    await expect
      .poll(() => window.getByText(/Bilan du chapitre « Chapitre 1 »/).count(), {
        timeout: 15_000,
      })
      .toBe(1);
  });

  it('runs as a writing device with --appliance (phase 5.2)', async () => {
    const { app, window } = await launch(folders(), {}, ['--appliance']);
    const host = await app.evaluate(({ BrowserWindow, Menu }) => ({
      kiosk: BrowserWindow.getAllWindows()[0]?.isKiosk(),
      menu: Menu.getApplicationMenu() !== null,
    }));
    expect(host.kiosk).toBe(true);
    // No menu bar on the device (the Mac keeps its hidden one, for ⌘Q while developing).
    if (process.platform !== 'darwin') expect(host.menu).toBe(false);
    expect(await window.locator('.ch-titlebar').count()).toBe(0);
    // Everything through the command zone, its shortcut written with Ctrl on the device.
    const zone = window.locator('.ch-cmdzone');
    expect(await zone.textContent()).toContain(process.platform === 'darwin' ? '⌘K' : 'Ctrl+K');
    await zone.click();
    await window.getByRole('dialog', { name: 'Ligne de commande' }).waitFor();
  });

  it("fits the writing screen and an unfolded note in the X250's 1536 × 864", async () => {
    const quote = 'Helene regardait la Loire';
    const anthropic = await fakeAnthropic({
      analysis: {
        characters: [],
        worldRules: [],
        clues: [],
        knowledge: [],
        conflicts: [],
        remarks: [
          {
            kind: 'craft',
            quote,
            title: 'Un regard sans enjeu',
            message:
              'Que cherche-t-elle dans ce regard ? Une scène avance quand un personnage veut quelque chose, et le lecteur le sent avant de le savoir.',
            principle: 'Une scène avance quand un personnage veut quelque chose.',
            correction: null,
            example: 'Elle cherchait la barque de son père.',
          },
        ],
      },
      chat: { reply: '', example: null },
    });
    const { app, editor, window } = await launch(folders(), {
      ANTHROPIC_BASE_URL: anthropic.url,
      CHARPENTIER_ANTHROPIC_API_KEY: 'sk-ant-test',
    });
    // 1536 × 864 under the Mac's title bar (the device has none).
    const titleBar = process.platform === 'darwin' ? 34 : 0;
    await app.evaluate(
      ({ BrowserWindow }, height) => BrowserWindow.getAllWindows()[0]?.setContentSize(1536, height),
      864 + titleBar,
    );
    await editor.click();
    await window.keyboard.type(`${quote} en silence.`);
    await window.keyboard.press('ControlOrMeta+Shift+A');
    const pastille = window.locator('.ch-pastille').first();
    await pastille.waitFor({ timeout: 15_000 });
    await pastille.click();
    await window.locator('.ch-note').waitFor();
    // (Runs in the page; the e2e tests are typed without the DOM.)
    interface Box {
      readonly bottom: number;
      readonly right: number;
      readonly top: number;
    }
    interface InPage {
      readonly innerWidth: number;
      readonly innerHeight: number;
      readonly document: {
        readonly documentElement: { readonly scrollHeight: number };
        querySelector(s: string): { getBoundingClientRect(): Box } | null;
      };
    }
    const layout = await window.evaluate(() => {
      const page = globalThis as unknown as InPage;
      const box = (selector: string) =>
        page.document.querySelector(selector)?.getBoundingClientRect();
      const rect = (b: Box | undefined) => b && { top: b.top, bottom: b.bottom, right: b.right };
      return {
        width: page.innerWidth,
        height: page.innerHeight,
        scroll: page.document.documentElement.scrollHeight - page.innerHeight,
        note: rect(box('.ch-note')),
        footer: rect(box('.ch-footer')),
      };
    });
    expect([layout.width, layout.height]).toEqual([1536, 864 + titleBar]);
    expect(layout.scroll).toBeLessThanOrEqual(0);
    expect(layout.note?.bottom).toBeLessThanOrEqual(layout.footer?.top ?? 0);
    expect(layout.note?.right).toBeLessThanOrEqual(1536);
  });

  it.runIf(process.platform === 'darwin')('has no title bar in full screen', async () => {
    const { app, window } = await launch(folders());
    await expect.poll(() => window.locator('.ch-titlebar').count()).toBe(1);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setFullScreen(true),
    );
    await expect.poll(() => window.locator('.ch-titlebar').count(), { timeout: 10_000 }).toBe(0);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setFullScreen(false),
    );
    await expect.poll(() => window.locator('.ch-titlebar').count(), { timeout: 10_000 }).toBe(1);
  });

  it.runIf(process.platform === 'darwin')(
    'has a full menu bar whose items run the commands',
    async () => {
      const { app, window } = await launch(folders());
      const menus = async () =>
        app.evaluate(({ Menu }) =>
          (Menu.getApplicationMenu()?.items ?? []).map((m) => ({
            label: m.label,
            items: (m.submenu?.items ?? []).map((i) => `${i.label}|${i.accelerator ?? ''}`),
          })),
        );
      await expect
        .poll(async () => (await menus()).map((m) => m.label).slice(1))
        .toEqual([
          'Fichier',
          'Édition',
          'Scène',
          'Manuscrit',
          'Atelier',
          'Compagnon',
          'Présentation',
          'Fenêtre',
          'Aide',
        ]);
      const manuscript = (await menus()).find((m) => m.label === 'Manuscrit');
      expect(manuscript?.items[0]).toBe('Afficher ou masquer le manuscrit|Command+J');

      // Choosing « Manuscrit › … » with the mouse opens the drawer.
      await app.evaluate(({ Menu }) => {
        const item = Menu.getApplicationMenu()?.items.find((m) => m.label === 'Manuscrit');
        item?.submenu?.items[0]?.click();
      });
      await window.getByRole('complementary', { name: 'Plan du manuscrit' }).waitFor();
    },
  );

  it("syncs a novel to a second installation through the author's server", async () => {
    const db = new PGlite();
    await migrate(db);
    await createUser(db, 'pierre@example.org', 'une serre sous la glace');
    const server = createSyncServer({ db, port: 0, address: '127.0.0.1' });
    await server.listen();
    syncServers.push(server);
    const url = `http://127.0.0.1:${server.address.port}`;

    const signIn = async (window: Page) => {
      await window.keyboard.press('ControlOrMeta+K');
      await window.keyboard.type('connecter serveur');
      await window.keyboard.press('Enter');
      await window.getByRole('textbox', { name: 'Adresse du serveur (https://…)' }).waitFor();
      await window.keyboard.press('ControlOrMeta+A');
      await window.keyboard.type(url);
      await window.keyboard.press('Enter');
      await window.getByRole('textbox', { name: 'Adresse e-mail du compte' }).waitFor();
      await window.keyboard.type('pierre@example.org');
      await window.keyboard.press('Enter');
      await window.getByLabel('Mot de passe').waitFor();
      await window.keyboard.type('une serre sous la glace');
      await window.keyboard.press('Enter');
      await window.getByText('Synchronisé').waitFor({ timeout: 15_000 });
    };

    // The Mac: a first sentence, then signing in.
    const mac = await launch(folders());
    await mac.editor.click();
    await mac.window.keyboard.type('Il pleuvait sur Nantes.');
    await signIn(mac.window);

    // A second installation signs in to the same account: the novel arrives,
    // mirrored in Markdown in its library.
    const secondDirs = folders();
    const second = await launch(secondDirs);
    await signIn(second.window);
    const mirrored = () => {
      const found: string[] = [];
      const walk = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.name.endsWith('.md')) found.push(fs.readFileSync(full, 'utf8'));
        }
      };
      walk(secondDirs.library);
      return found.join('\n');
    };
    await expect.poll(mirrored, { timeout: 20_000 }).toContain('Il pleuvait sur Nantes.');

    // A sentence written on the Mac reaches the other installation.
    await mac.editor.click();
    await mac.window.keyboard.press('End');
    await mac.window.keyboard.type(' Helene regardait la Loire.');
    await expect.poll(mirrored, { timeout: 20_000 }).toContain('Helene regardait la Loire.');
  }, 90_000);
});
