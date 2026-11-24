import { afterEach, expect, it } from 'vitest';
import { apps, cleanUp, fakeAnthropic, folders, launch } from '../harness';

afterEach(cleanUp);

// The author's trial of 23 November 2026 (docs/PLAN.md 7.5, 7.6): at startup the footer said
// « Compagnon : saisir la clé » for several seconds, to an author whose key was saved.
// DESIGN §5.0, rule 7: the app says only what it knows.
it('never asks for the key at startup when one is saved', async () => {
  const anthropic = await fakeAnthropic({ analysis: {}, chat: {} });
  const dirs = folders();
  const env = { ANTHROPIC_BASE_URL: anthropic.url };

  // A first session: the key goes in by the app's own command, and is kept.
  const first = await launch(dirs, env);
  await first.window.getByText('Compagnon : saisir la clé').waitFor();
  await first.window.keyboard.press('ControlOrMeta+K');
  await first.window.keyboard.type('saisir la cle');
  await first.window.keyboard.press('Enter');
  await first.window.getByPlaceholder(/Clé d’API Anthropic/).waitFor();
  // A test value, for the stand-in provider of this test only.
  await first.window.keyboard.type('sk-ant-test');
  await first.window.keyboard.press('Enter');
  await expect
    .poll(() => first.window.getByText('Compagnon : saisir la clé').count(), { timeout: 15_000 })
    .toBe(0);
  await first.app.close();
  apps.splice(apps.indexOf(first.app), 1);

  // The app started again: from the first thing it shows, it knows the key is there.
  const second = await launch(dirs, env);
  const asked: number[] = [];
  for (let i = 0; i < 12; i += 1) {
    asked.push(await second.window.getByText('Compagnon : saisir la clé').count());
    await second.window.waitForTimeout(250);
  }
  expect(asked.every((count) => count === 0)).toBe(true);
}, 90_000);
