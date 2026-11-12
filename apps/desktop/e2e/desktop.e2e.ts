import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication } from 'playwright';
import { afterEach, describe, expect, it } from 'vitest';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp: string[] = [];
const apps: ElectronApplication[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close().catch(() => {});
  for (const dir of temp.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function folders() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'charpentier-e2e-'));
  temp.push(root);
  return { library: path.join(root, 'Bibliothèque'), userData: path.join(root, 'data') };
}

async function launch(dirs: ReturnType<typeof folders>) {
  const app = await electron.launch({
    args: [appDir],
    env: {
      ...process.env,
      CHARPENTIER_LIBRARY: dirs.library,
      CHARPENTIER_USER_DATA: dirs.userData,
    },
  });
  apps.push(app);
  const window = await app.firstWindow();
  const editor = window.getByRole('textbox', { name: 'Texte de la scène' });
  await editor.waitFor();
  return { app, window, editor };
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
});
