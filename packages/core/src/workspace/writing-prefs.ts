import type { PreferencesService } from '@charpentier/platform';
import { useCallback, useEffect, useState } from 'react';

/** Reading comfort settings of the writing surface (docs/DESIGN.md §5.5). */
export interface WritingPrefs {
  readonly theme: 'system' | 'light' | 'dark';
  readonly reducedMotion: boolean;
  /** Scene text size, in px. */
  readonly textSize: number;
  /** Column width, in rem. */
  readonly measure: number;
  /** Dims every paragraph but the current one. */
  readonly focusMode: boolean;
  /** Keeps the current line around 42 % of the window height. */
  readonly typewriter: boolean;
  /** Interface sounds (docs/DESIGN.md §3.4), off by default. */
  readonly uiSounds: boolean;
  /** Typing sound, a separate option, off by default. */
  readonly typingSounds: boolean;
  /** Rejected values and entries shown in the Atelier (docs/DESIGN.md §4.5), hidden by default. */
  readonly showRejected: boolean;
  /** The interview with the Compagnon in guided mode (D-26), free by default. */
  readonly interviewGuided: boolean;
}

export const TEXT_SIZE = { min: 15, max: 26, step: 1, initial: 19 } as const;
export const MEASURE = { min: 30, max: 48, step: 2, initial: 38 } as const;

export const DEFAULT_WRITING_PREFS: WritingPrefs = {
  theme: 'system',
  reducedMotion: false,
  textSize: TEXT_SIZE.initial,
  measure: MEASURE.initial,
  focusMode: false,
  typewriter: true,
  uiSounds: false,
  typingSounds: false,
  showRejected: false,
  interviewGuided: false,
};

export const WRITING_PREFS_KEY = 'writing';

const clamp = (value: number, range: { min: number; max: number }) =>
  Math.min(range.max, Math.max(range.min, value));

/** Accepts whatever was stored (older versions, hand edits) and returns valid settings. */
export function normalizeWritingPrefs(raw: unknown): WritingPrefs {
  const stored = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const number = (key: string, range: { min: number; max: number; initial: number }) => {
    const value = stored[key];
    return typeof value === 'number' && Number.isFinite(value)
      ? clamp(value, range)
      : range.initial;
  };
  const flag = (key: keyof WritingPrefs) =>
    typeof stored[key] === 'boolean' ? stored[key] : (DEFAULT_WRITING_PREFS[key] as boolean);
  const theme = stored['theme'];
  return {
    theme: theme === 'light' || theme === 'dark' ? theme : 'system',
    reducedMotion: flag('reducedMotion'),
    textSize: number('textSize', TEXT_SIZE),
    measure: number('measure', MEASURE),
    focusMode: flag('focusMode'),
    typewriter: flag('typewriter'),
    uiSounds: flag('uiSounds'),
    typingSounds: flag('typingSounds'),
    showRejected: flag('showRejected'),
    interviewGuided: flag('interviewGuided'),
  };
}

export const nextTheme = (theme: WritingPrefs['theme']): WritingPrefs['theme'] =>
  theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';

export const stepTextSize = (prefs: WritingPrefs, direction: 1 | -1 | 0) => ({
  textSize:
    direction === 0
      ? TEXT_SIZE.initial
      : clamp(prefs.textSize + direction * TEXT_SIZE.step, TEXT_SIZE),
});

export const stepMeasure = (prefs: WritingPrefs, direction: 1 | -1) => ({
  measure: clamp(prefs.measure + direction * MEASURE.step, MEASURE),
});

export type PrefsUpdate = Partial<WritingPrefs> | ((prefs: WritingPrefs) => Partial<WritingPrefs>);

/** Loads the settings, applies theme and motion to the document root, saves every change. */
export function useWritingPrefs(preferences: PreferencesService) {
  const [prefs, setPrefs] = useState(DEFAULT_WRITING_PREFS);

  useEffect(() => {
    let cancelled = false;
    void preferences.get(WRITING_PREFS_KEY).then((stored) => {
      if (!cancelled && stored !== undefined) setPrefs(normalizeWritingPrefs(stored));
    });
    return () => {
      cancelled = true;
    };
  }, [preferences]);

  useEffect(() => {
    const root = document.documentElement;
    if (prefs.theme === 'system') delete root.dataset['theme'];
    else root.dataset['theme'] = prefs.theme;
    if (prefs.reducedMotion) root.dataset['motion'] = 'reduced';
    else delete root.dataset['motion'];
  }, [prefs.theme, prefs.reducedMotion]);

  const update = useCallback(
    (change: PrefsUpdate) => {
      setPrefs((current) => {
        const next = normalizeWritingPrefs({
          ...current,
          ...(typeof change === 'function' ? change(current) : change),
        });
        void preferences.set(WRITING_PREFS_KEY, next);
        return next;
      });
    },
    [preferences],
  );

  return [prefs, update] as const;
}
