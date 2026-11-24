import { cleanup, screen, waitFor } from '@testing-library/react';
import { page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import { startApp } from '../conformance/app-under-test';
import { createTestPlatform } from '../testing/test-platform';
import '../styles/base.css';

afterEach(cleanup);

async function open(status: 'available' | 'unconfigured' | 'offline' | 'locked', panels: string) {
  const agents = createTestPlatform().agents;
  await startApp({ platform: { agents: { ...agents, status: () => status } } });
  await waitFor(() =>
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Texte de la scène'),
  );
  await userEvent.keyboard('Il pleuvait sur Nantes depuis trois jours.');
  for (const key of panels) await userEvent.keyboard(`{ControlOrMeta>}${key}{/ControlOrMeta}`);
  window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: 4, movementY: 2 }));
  await waitFor(() => expect(document.querySelector('.ch-app[data-typing]')).toBeNull());
  await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)));
}
const box = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
/** Where the foot's parts are: « Aa » in the foot, nothing over it, nothing over another. */
function measure() {
  const foot = box('.ch-footer') as DOMRect;
  const aa = screen.getByTitle(/^Affichage/).getBoundingClientRect();
  const hit = document.elementFromPoint((aa.left + aa.right) / 2, (aa.top + aa.bottom) / 2);
  const console = box('.ch-console');
  return {
    foot: Math.round(foot.width),
    inside: aa.right <= foot.right + 0.5 && aa.left >= foot.left - 0.5,
    reached: hit?.closest('.ch-display-toggle') !== null && hit !== null,
    console: Math.round(console?.width ?? 0),
    clear: (console?.right ?? 0) <= aa.left + 0.5,
    consoleIn: (console?.left ?? 0) >= foot.left - 0.5,
  };
}

describe('a tight foot (docs/DESIGN.md §4.7, 1.43 « Le pied serré »)', () => {
  for (const status of ['available', 'unconfigured', 'offline', 'locked'] as const)
    it(`keeps « Aa » in it and under the mouse, the Compagnon ${status}`, async () => {
      for (const [width, panels] of [
        [1280, ''],
        [1280, 'j'],
        [1280, 'l'],
        [1280, 'jl'],
        [1440, 'jl'],
        [1093, 'jl'],
        // The narrowest window, the Compagnon's panel open.
        [880, 'l'],
      ] as const) {
        await page.viewport(width, 800);
        await open(status, panels);
        const where = `${width} ${panels}`;
        const { foot, console, ...kept } = measure();
        expect(kept, where).toEqual({ inside: true, reached: true, clear: true, consoleIn: true });
        // 11 rem at least; under 30 rem of foot, without its words.
        expect(console, where).toBeGreaterThanOrEqual(176);
        const text = document.querySelector('.ch-console .ch-cmdzone-text') as HTMLElement;
        const shown = text.getBoundingClientRect().width;
        if (foot < 480) expect(shown, where).toBeLessThanOrEqual(1);
        else expect(shown, where).toBeGreaterThan(20);
        expect(
          document.querySelector('.ch-console .ch-cmdzone kbd')?.getClientRects(),
          where,
        ).toHaveLength(1);
        // What shows on the side shows in its column: a control is never half out of it.
        const side = box('.ch-footer-right') as DOMRect;
        for (const part of document.querySelectorAll<HTMLElement>('.ch-footer-right > *')) {
          const shown = part.getBoundingClientRect();
          if (shown.width > 0)
            expect(shown.left, `${where} ${part.className}`).toBeGreaterThanOrEqual(side.left - 1);
        }
        cleanup();
      }
    }, 60000);

  it('lets the day’s words go before the words, and neither is cut', async () => {
    await page.viewport(1280, 800);
    await open('available', 'jl');
    const words = document.querySelector('.ch-footer-words') as HTMLElement;
    expect(words.querySelector('.ch-footer-count')?.getClientRects()).toHaveLength(1);
    expect(words.querySelector('.ch-footer-today')?.getClientRects()).toHaveLength(0);
    expect(words.scrollWidth).toBeLessThanOrEqual(words.clientWidth);
    cleanup();
    await page.viewport(1440, 800);
    await open('available', '');
    expect(document.querySelector('.ch-footer-today')?.getClientRects()).toHaveLength(1);
  });
});
