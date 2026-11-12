import type { PreferencesService } from '@charpentier/platform';
import { useEffect, useRef, useState } from 'react';

interface Stored {
  readonly day: string;
  readonly count: number;
}

/** YYYY-MM-DD in local time. */
const today = () => new Date().toLocaleDateString('sv');

/**
 * Words written today in the project (docs/DESIGN.md §4.1, « +312
 * aujourd'hui »): what each scene gained while it was open, added up per day
 * and kept on the device. Deleting counts as negative progress.
 *
 * `words` is undefined while the scene's text is not loaded yet.
 */
export function useWordsToday(
  preferences: PreferencesService,
  projectId: string,
  sceneKey: string,
  words: number | undefined,
): number {
  const key = `wordsToday:${projectId}`;
  /** Words gained today in scenes already left. */
  const [banked, setBanked] = useState<Stored>({ day: today(), count: 0 });
  /** The open scene and its word count when it opened. */
  const [base, setBase] = useState<{ scene: string; words: number } | null>(null);
  const last = useRef<{ scene: string; words: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void preferences.get<Stored>(key).then((stored) => {
      if (!cancelled && stored?.day === today()) setBanked(stored);
    });
    return () => {
      cancelled = true;
    };
  }, [preferences, key]);

  // A scene (or variant) opens: bank what the previous one gained, start counting this one.
  useEffect(() => {
    if (words === undefined || base?.scene === sceneKey) return;
    const previous = last.current;
    if (base && previous && previous.scene === base.scene) {
      const gained = previous.words - base.words;
      setBanked((b) => ({ day: today(), count: (b.day === today() ? b.count : 0) + gained }));
    }
    setBase({ scene: sceneKey, words });
  }, [sceneKey, words, base]);

  if (words !== undefined) last.current = { scene: sceneKey, words };
  const gained = base && base.scene === sceneKey && words !== undefined ? words - base.words : 0;
  const total = (banked.day === today() ? banked.count : 0) + gained;

  // Saved shortly after each change, so that a crash keeps the day's count.
  useEffect(() => {
    const timer = setTimeout(() => void preferences.set(key, { day: today(), count: total }), 1000);
    return () => clearTimeout(timer);
  }, [preferences, key, total]);

  return Math.max(0, total);
}
