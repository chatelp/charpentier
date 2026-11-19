import { createContext, useEffect, useRef } from 'react';

/**
 * How many times the author has asked to enter a tool panel (its key, its
 * command, a click on its entry point). A panel takes the focus for such a
 * gesture only: never because it mounts (panels reopen with the project),
 * because its data changes, or because the command line closes. Otherwise
 * its single-letter keys would act on what the author meant for the text.
 */
export const PanelEntryContext = createContext(0);

/**
 * Runs `enter` once per gesture, as soon as the panel is `ready` for it (the
 * command line that ran the gesture may still be closing).
 */
export function usePanelEntry(entry: number, ready: boolean, enter: () => void): void {
  const seen = useRef(0);
  const latest = useRef(enter);
  useEffect(() => {
    latest.current = enter;
  });
  useEffect(() => {
    if (!ready || entry === seen.current) return;
    seen.current = entry;
    latest.current();
  }, [entry, ready]);
}
