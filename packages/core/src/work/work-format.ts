import type { TFunction } from 'i18next';

/**
 * How a background work's cost, duration and dates are said (docs/DESIGN.md
 * §4.5 « Travaux de fond du Compagnon »).
 */

/**
 * Euros for one US dollar: a fixed rate kept here and reviewed with the
 * versions, never fetched from the network (« environ » covers the gap).
 */
export const EUROS_PER_DOLLAR = 0.86;

/** An amount in euros, rounded as the design says; `up` for « au plus ». */
export function formatAmount(t: TFunction, usd: number, up = false): string {
  const euros = usd * EUROS_PER_DOLLAR;
  if (euros < 0.01 && !up) return t('work.amount.lessThanCent');
  const round = up ? Math.ceil : Math.round;
  const cents = euros * 100;
  if (cents < 100) {
    const step = cents <= 10 ? 1 : 5;
    const rounded = Math.max(1, round(cents / step) * step);
    if (rounded < 100) return t('work.amount.cents', { count: rounded });
  }
  const tenths = Math.max(10, round(euros * 10)) / 10;
  return t('work.amount.euros', {
    amount: tenths.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  });
}

/** « moins d'une minute », « 1 minute environ », « 1 à 2 minutes »… */
export function formatDuration(t: TFunction, [low, high]: readonly [number, number]): string {
  if (high < 60) return t('work.duration.underMinute');
  const from = Math.max(1, Math.floor(low / 60));
  const to = Math.ceil(high / 60);
  if (to <= 1) return t('work.duration.oneMinute');
  return t('work.duration.minutes', { min: from, max: Math.max(to, from + 1) });
}

/** « 0:42 », « 12:05 ». */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const dayStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/**
 * « aujourd'hui à 14:32 », « hier à 18:05 », « le 12 nov. » (`short`: the
 * bilan's date, « aujourd'hui 14:32 »).
 */
export function formatWhen(
  t: TFunction,
  iso: string,
  language: string,
  now = new Date(),
  short = false,
): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' });
  const days = Math.round((dayStart(now).getTime() - dayStart(date).getTime()) / 86_400_000);
  const form = short ? 'whenShort' : 'when';
  if (days === 0) return t(`work.${form}.today`, { time });
  if (days === 1) return t(`work.${form}.yesterday`, { time });
  return t(`work.${form}.date`, {
    date: date.toLocaleDateString(language, { day: 'numeric', month: 'short' }),
  });
}
