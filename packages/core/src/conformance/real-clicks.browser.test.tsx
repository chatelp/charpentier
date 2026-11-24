import { cleanup } from '@testing-library/react';
import { page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import '../styles/base.css';
import { SCREENS, settled } from './screens';

afterEach(cleanup);

const CLICKABLE =
  'button, [role="button"], [role="tab"], [role="radio"], [role="option"], [role="menuitem"], [role="switch"], a[href], summary';

const describeEl = (el: Element) => {
  const text = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ');
  return `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} « ${text.slice(0, 40)} »`;
};

function visible(el: Element): boolean {
  const box = el.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) return false;
  for (let node: Element | null = el; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0')
      return false;
  }
  return true;
}

/** What is under the middle of the element, as the mouse finds it. */
function under(el: Element): Element | null {
  const box = el.getBoundingClientRect();
  return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
}

/**
 * Hears the clicks without letting the app act on them: the press and the release happen for
 * real (the focus moves, the styles follow), and no handler of the app runs.
 */
function swallowClicks() {
  let target: EventTarget | null = null;
  const quiet = (event: Event) => event.stopImmediatePropagation();
  const click = (event: Event) => {
    target = event.target;
    event.stopImmediatePropagation();
    event.preventDefault();
  };
  const silenced = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'focusout', 'blur'];
  for (const type of silenced) window.addEventListener(type, quiet, true);
  window.addEventListener('click', click, true);
  return {
    last: () => {
      const found = target;
      target = null;
      return found;
    },
    stop: () => {
      for (const type of silenced) window.removeEventListener(type, quiet, true);
      window.removeEventListener('click', click, true);
    },
  };
}

// DESIGN §5.0, rule 2: what looks like a button takes a real click of the mouse. With the
// app's styles: it is seen (or shows when the mouse comes over its line), nothing covers it,
// and it is still under the pointer between the press and the release.
describe.each(Object.keys(SCREENS))('a real click, %s', (name) => {
  it('lands on every control', async () => {
    await page.viewport(1440, 900);
    await SCREENS[name]?.();
    await settled();
    const clicks = swallowClicks();
    const faults: string[] = [];
    let tried = 0;
    for (const el of [...document.querySelectorAll(CLICKABLE)]) {
      if (!el.isConnected || el.closest('.ch-visually-hidden, [aria-hidden="true"], [inert]'))
        continue;
      if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true')
        continue;
      if (!visible(el)) {
        // Shown when the mouse comes over its line?
        const line = el.parentElement?.closest('li, [role="radio"], [role="option"], article, tr');
        if (line && visible(line)) await userEvent.hover(line);
        if (!visible(el)) {
          // In a part of the screen that is folded or scrolled away: not this screen's.
          if (line && visible(line)) faults.push(`jamais visible à la souris : ${describeEl(el)}`);
          continue;
        }
      }
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const top = under(el);
      if (!top || !(el.contains(top) || top.contains(el) || top.closest('label')?.contains(el))) {
        faults.push(`recouvert par ${top ? describeEl(top) : 'rien'} : ${describeEl(el)}`);
        continue;
      }
      tried += 1;
      try {
        await userEvent.click(el, { timeout: 1500 });
      } catch {
        faults.push(`le clic ne part pas : ${describeEl(el)}`);
        continue;
      }
      const hit = clicks.last();
      if (!(hit instanceof Node) || !el.contains(hit))
        faults.push(
          `le clic arrive ailleurs (${hit instanceof Element ? describeEl(hit) : 'nulle part'}) : ${describeEl(el)}`,
        );
    }
    clicks.stop();
    expect({ tried: tried > 3, faults }).toEqual({ tried: true, faults: [] });
  });
});
