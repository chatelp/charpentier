import { createSimulatedSystem } from '@charpentier/platform';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { App } from '../app/App';
import { createI18n } from '../i18n/i18n';
import { createSystemFeature } from '../system/system-feature';
import { createTestPlatform } from '../testing/test-platform';
// The host brings the styles (`@charpentier/core/styles.css`); this test measures the layout.
import '../styles/base.css';

afterEach(cleanup);

const isMac = /Mac/.test(navigator.platform);
const sysKey = isMac ? 'Control' : 'Meta';

/** An X250 with an HD screen, or the installer's virtual machine: 1024 × 640 CSS px. */
async function start() {
  await page.viewport(1024, 640);
  const prefs = new Map<string, unknown>();
  const docs = new Map<string, Y.Doc>();
  const platform = createTestPlatform({
    keybindings: { primaryModifier: isMac ? 'Meta' : 'Control', reserved: [] },
    preferences: {
      get: async <T,>(key: string) => prefs.get(key) as T | undefined,
      set: async (key, value) => void prefs.set(key, value),
    },
    documents: {
      open: async (guid) => {
        const d = docs.get(guid) ?? new Y.Doc({ guid });
        docs.set(guid, d);
        return { guid, doc: d, whenLoaded: Promise.resolve(), close: async () => {} };
      },
    },
    system: createSimulatedSystem(),
  });
  render(
    <App
      platform={platform}
      i18n={await createI18n('fr')}
      features={[createSystemFeature({ modifier: sysKey })]}
    />,
  );
  await screen.findByRole('textbox', { name: 'Texte de la scène' });
}

/** What sticks out on the right, or scrolls sideways (hidden helpers for screen readers aside). */
function overflows(): string[] {
  const found: string[] = [];
  const root = document.documentElement;
  if (root.scrollWidth > innerWidth) found.push(`page ${root.scrollWidth}`);
  for (const el of document.querySelectorAll<HTMLElement>('.ch-app *, .ch-sysline *')) {
    if (el.closest('.ch-visually-hidden')) continue;
    const box = el.getBoundingClientRect();
    if (box.width > 0 && box.right > innerWidth + 1)
      found.push(`${el.className} right ${Math.round(box.right)}`);
    const style = getComputedStyle(el);
    if (
      (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
      el.scrollWidth > el.clientWidth + 1
    )
      found.push(`${el.className} scrolls ${el.scrollWidth}`);
  }
  return found;
}

const overlap = (a: DOMRect, b: DOMRect) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

describe('a small screen (1024 × 640, the X250 in HD or a virtual machine)', () => {
  it('never scrolls sideways, and keeps the time and the battery whole', async () => {
    await start();
    // The first launch: the welcome note is there, in the column.
    await screen.findByText('Je lis par-dessus votre épaule');
    await waitFor(() => expect(overflows()).toEqual([]));

    const line = screen.getByRole('toolbar', { name: 'ligne système' });
    for (const id of ['date', 'bat']) {
      const seg = line.querySelector<HTMLElement>(`[data-seg="${id}"]`);
      expect(seg).toBeTruthy();
      expect(seg?.getBoundingClientRect().right).toBeLessThanOrEqual(innerWidth);
      expect(seg?.scrollWidth).toBeLessThanOrEqual(seg?.clientWidth ?? 0);
    }

    // Nothing in the footer passes under the command zone.
    const zone = document.querySelector('.ch-cmdzone')?.getBoundingClientRect();
    expect(zone).toBeTruthy();
    for (const item of document.querySelectorAll('.ch-footer-right > *, .ch-footer-words')) {
      const box = item.getBoundingClientRect();
      if (zone && box.width > 0) expect(overlap(box, zone)).toBe(false);
    }

    // The crumbs keep clear of « Écrire | Atelier », the text of the « Manuscrit » handle.
    const modes = document.querySelector('.ch-modes')?.getBoundingClientRect();
    for (const crumb of document.querySelectorAll('.ch-crumb')) {
      if (modes) expect(overlap(crumb.getBoundingClientRect(), modes)).toBe(false);
    }
    const handle = document.querySelector('.ch-edge.is-left')?.getBoundingClientRect();
    const text = document.querySelector('.ch-page')?.getBoundingClientRect();
    if (handle && text) expect(text.left).toBeGreaterThan(handle.right);
  });

  it('holds the Compagnon’s panel whole on the right', async () => {
    await start();
    await screen.findByText('Je lis par-dessus votre épaule');
    await userEvent.keyboard('{Escape}');
    const handle = document.querySelector<HTMLElement>('.ch-edge.is-right');
    expect(handle).toBeTruthy();
    handle?.click();
    const panel = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('.ch-mentor-panel');
      expect(found).toBeTruthy();
      return found;
    });
    await waitFor(() => expect(overflows()).toEqual([]));
    expect(panel?.getBoundingClientRect().right).toBeLessThanOrEqual(innerWidth);
  });
});
