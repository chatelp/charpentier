import { beforeAll, describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { createI18n } from '../i18n/i18n';
import {
  EUROS_PER_DOLLAR,
  formatAmount,
  formatDuration,
  formatElapsed,
  formatWhen,
} from './work-format';

let t: TFunction;
beforeAll(async () => {
  t = (await createI18n('fr')).t;
});

const usd = (euros: number) => euros / EUROS_PER_DOLLAR;

describe('what a background work announces (docs/DESIGN.md §4.5)', () => {
  it('rounds the cost as the design says', () => {
    expect(formatAmount(t, usd(0.004))).toBe('moins d’un centime');
    expect(formatAmount(t, usd(0.012))).toBe('1 centime');
    expect(formatAmount(t, usd(0.043))).toBe('4 centimes');
    expect(formatAmount(t, usd(0.31))).toBe('30 centimes');
    expect(formatAmount(t, usd(0.33))).toBe('35 centimes');
    expect(formatAmount(t, usd(0.998))).toBe('1,00 €');
    expect(formatAmount(t, usd(1.17))).toBe('1,20 €');
    // « au plus »: up.
    expect(formatAmount(t, usd(0.31), true)).toBe('35 centimes');
    expect(formatAmount(t, usd(0.004), true)).toBe('1 centime');
    expect(formatAmount(t, usd(1.11), true)).toBe('1,20 €');
  });

  it('says how long it takes', () => {
    expect(formatDuration(t, [20, 45])).toBe('moins d’une minute');
    expect(formatDuration(t, [40, 60])).toBe('1 minute environ');
    expect(formatDuration(t, [70, 110])).toBe('1 à 2 minutes');
    expect(formatDuration(t, [130, 170])).toBe('2 à 3 minutes');
    expect(formatElapsed(42_500)).toBe('0:42');
    expect(formatElapsed(125_000)).toBe('2:05');
  });

  it('dates the last run', () => {
    const now = new Date(2026, 10, 15, 21, 0);
    expect(formatWhen(t, new Date(2026, 10, 15, 14, 32).toISOString(), 'fr', now)).toBe(
      'aujourd’hui à 14:32',
    );
    expect(formatWhen(t, new Date(2026, 10, 14, 18, 5).toISOString(), 'fr', now)).toBe(
      'hier à 18:05',
    );
    expect(formatWhen(t, new Date(2026, 10, 12, 9, 0).toISOString(), 'fr', now)).toBe('le 12 nov.');
    expect(formatWhen(t, new Date(2026, 10, 15, 14, 32).toISOString(), 'fr', now, true)).toBe(
      'aujourd’hui 14:32',
    );
  });
});
