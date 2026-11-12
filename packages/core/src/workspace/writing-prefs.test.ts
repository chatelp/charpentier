import { describe, expect, it } from 'vitest';
import { toRoman } from './roman';
import {
  DEFAULT_WRITING_PREFS,
  nextTheme,
  normalizeWritingPrefs,
  stepMeasure,
  stepTextSize,
} from './writing-prefs';

describe('writing preferences', () => {
  it('repairs whatever was stored', () => {
    expect(normalizeWritingPrefs(undefined)).toEqual(DEFAULT_WRITING_PREFS);
    expect(normalizeWritingPrefs('dark')).toEqual(DEFAULT_WRITING_PREFS);
    expect(
      normalizeWritingPrefs({ theme: 'sepia', textSize: 400, measure: 'wide', focusMode: true }),
    ).toEqual({ ...DEFAULT_WRITING_PREFS, textSize: 26, focusMode: true });
  });

  it('steps within bounds and cycles the theme', () => {
    const prefs = { ...DEFAULT_WRITING_PREFS, textSize: 26, measure: 30 };
    expect(stepTextSize(prefs, 1)).toEqual({ textSize: 26 });
    expect(stepTextSize(prefs, -1)).toEqual({ textSize: 25 });
    expect(stepTextSize(prefs, 0)).toEqual({ textSize: 19 });
    expect(stepMeasure(prefs, -1)).toEqual({ measure: 30 });
    expect(stepMeasure(prefs, 1)).toEqual({ measure: 32 });
    expect([nextTheme('system'), nextTheme('light'), nextTheme('dark')]).toEqual([
      'light',
      'dark',
      'system',
    ]);
  });
});

describe('toRoman', () => {
  it('numbers chapters', () => {
    expect([1, 4, 9, 14, 40, 1999].map(toRoman)).toEqual(['I', 'IV', 'IX', 'XIV', 'XL', 'MCMXCIX']);
    expect(toRoman(0)).toBe('0');
  });
});
