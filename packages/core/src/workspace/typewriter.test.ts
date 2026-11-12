import { describe, expect, it } from 'vitest';
import { TYPEWRITER_LINE, typewriterScrollTop } from './use-writing-surface';

describe('typewriter scrolling', () => {
  const height = 1000;
  const start = 490; // The first line, under the scene's opening.

  it('does not move the page at the start of a scene: the opening stays in view', () => {
    expect(typewriterScrollTop(start, start, height)).toBe(0);
    expect(typewriterScrollTop(300, 300, height)).toBe(0);
  });

  it('catches up gradually, then keeps the line at 42 %', () => {
    const halfway = typewriterScrollTop(start + 200, start, height);
    expect(halfway).toBeGreaterThan(0);
    expect(halfway).toBeLessThan(start + 200 - height * TYPEWRITER_LINE);
    for (const offset of [start + 400, 2000, 5000])
      expect(typewriterScrollTop(offset, start, height)).toBe(offset - height * TYPEWRITER_LINE);
  });

  it('never jumps: each line moves the page by little', () => {
    let previous = 0;
    for (let offset = start; offset < 3000; offset += 30) {
      const top = typewriterScrollTop(offset, start, height);
      expect(top - previous).toBeLessThanOrEqual(80);
      expect(top).toBeGreaterThanOrEqual(previous);
      previous = top;
    }
  });
});
