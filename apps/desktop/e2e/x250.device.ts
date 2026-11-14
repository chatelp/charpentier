import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The real X250, tested from the Yoga L13 (docs/PLAN.md phase 5.10 bis, D-32):
 * the app already runs on the device, in its development system, with its
 * test port (CHARPENTIER_TEST_PORT); an SSH tunnel brings it here:
 *
 *   ssh -N -L 9222:127.0.0.1:9222 auteur@x250 &
 *   CHARPENTIER_DEVICE=http://127.0.0.1:9222 pnpm --filter @charpentier/desktop test:device
 *
 * Nothing here writes: the author's novel and account are never touched.
 * Every test leaves the app as it found it. The system's key is Super on the
 * device (CHARPENTIER_DEVICE_SYSKEY=Control to try it on the Mac, where ⌘ is
 * the app's).
 */
const device = process.env['CHARPENTIER_DEVICE'];
const sysKey = process.env['CHARPENTIER_DEVICE_SYSKEY'] ?? 'Meta';
const mod = process.env['CHARPENTIER_DEVICE_MOD'] ?? 'Control';

describe.skipIf(!device)('the X250 itself', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.connectOverCDP(device ?? '');
    const found = browser
      .contexts()
      .flatMap((c) => c.pages())
      .find((p) => !p.url().startsWith('devtools:'));
    if (!found) throw new Error('No window of the app on the device.');
    page = found;
    await page.getByRole('textbox', { name: 'Texte de la scène' }).waitFor();
  });

  // Disconnects only: the app goes on running on the device.
  afterAll(() => browser?.close());

  const line = () => page.getByRole('toolbar', { name: 'ligne système' });
  const back = () => page.keyboard.press('Escape');

  it('is the whole screen, without title bar, its system line on top', async () => {
    await line().waitFor();
    expect(await page.locator('.ch-titlebar').count()).toBe(0);
    // Runs in the page: its globals, typed here (this file sees no DOM types).
    const size = await page.evaluate(() => {
      const w = globalThis as unknown as {
        innerWidth: number;
        innerHeight: number;
        screen: { width: number; height: number };
        document: { documentElement: { scrollWidth: number } };
      };
      return {
        inner: [w.innerWidth, w.innerHeight],
        screen: [w.screen.width, w.screen.height],
        scrolls: w.document.documentElement.scrollWidth > w.innerWidth,
      };
    });
    // The window is the screen (never wider: nothing cut on the right).
    expect(size.inner).toEqual(size.screen);
    expect(size.scrolls).toBe(false);
  });

  it('reads its system: the time, the battery, the Wi-Fi', async () => {
    const text = (await line().textContent()) ?? '';
    expect(text).toMatch(/\d{1,2}:\d{2}/);
    // The X250 runs on two batteries.
    await line().locator('[data-seg="bat"]').waitFor();
    await line().locator('[data-seg="wifi"]').waitFor();
    expect(text).not.toContain('bat 0 %');
  });

  it('opens and closes the command line, the settings and the monitor', async () => {
    await page.keyboard.press(`${mod}+k`);
    await page.getByRole('dialog', { name: 'Ligne de commande' }).waitFor();
    await back();
    await page.keyboard.press(`${sysKey}+Comma`);
    const rail = page.getByRole('listbox', { name: 'Sections des réglages' });
    await rail.waitFor();
    expect(await rail.getByRole('option').count()).toBeGreaterThan(8);
    await back();
    await rail.waitFor({ state: 'detached' });
    await page.keyboard.press(`${sysKey}+m`);
    await page.getByText('moniteur', { exact: false }).first().waitFor();
    await back();
    await page.getByRole('textbox', { name: 'Texte de la scène' }).waitFor();
  });

  it('opens the panels of the system line from its keys', async () => {
    for (const key of ['w', 'b']) {
      await page.keyboard.press(`${sysKey}+${key}`);
      await page.getByRole('dialog').first().waitFor();
      await back();
    }
  });
});
