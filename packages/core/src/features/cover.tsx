import type { Platform } from '@charpentier/platform';
import { useCallback, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { usePlatform } from '../app/platform-context';
import type { Feature } from './feature';
import { useFeatures } from './features-context';
import './cover.css';

/** Whether a feature's cover is shown: the shortcuts of the app then stay quiet. */
let covered = false;
export const isCovered = (): boolean => covered;

function useActiveCover(features: readonly Feature[], platform: Platform) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const stops = features.map((f) => f.cover?.subscribe(platform, onChange));
      return () => {
        for (const stop of stops) stop?.();
      };
    },
    [features, platform],
  );
  const index = useSyncExternalStore(subscribe, () =>
    features.findIndex((f) => f.cover?.active(platform) ?? false),
  );
  return index;
}

/**
 * The app under a feature's cover (the X250's lock, its first start): the
 * rest stays mounted (the cursor is where it was) but inert, and nothing
 * typed on the cover goes further.
 */
export function FeatureCovers({ children }: { readonly children: ReactNode }) {
  const features = useFeatures();
  const index = useActiveCover(features, usePlatform());
  // Where the author was: the cursor comes back there when the cover goes.
  const before = useRef<Element | null>(null);
  useLayoutEffect(() => {
    covered = index >= 0;
    if (index >= 0) before.current ??= document.activeElement;
    else {
      const element = before.current;
      before.current = null;
      // Back where the author was, or else in the text (the first start ends there).
      const target =
        element instanceof HTMLElement && element.isConnected && element !== document.body
          ? element
          : document.querySelector<HTMLElement>('.ch-under-cover .ProseMirror');
      target?.focus();
    }
    return () => {
      covered = false;
    };
  }, [index]);
  return (
    <>
      <div className="ch-under-cover" inert={index >= 0}>
        {children}
      </div>
      {features.map(
        ({ id, cover }, i) =>
          i === index &&
          cover && (
            <div key={id} className="ch-cover" onKeyDown={(event) => event.stopPropagation()}>
              <cover.component />
            </div>
          ),
      )}
    </>
  );
}
