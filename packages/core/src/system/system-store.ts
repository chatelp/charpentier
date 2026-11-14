import type { SystemMessage, SystemService, SystemState } from '@charpentier/platform';
import { useSyncExternalStore } from 'react';

/** The device's state, live. */
export const useSystemState = (system: SystemService): SystemState =>
  useSyncExternalStore(system.onChange, system.state);

/** The journal, live (a new array only when a message arrives). */
export function useJournal(system: SystemService): readonly SystemMessage[] {
  return useSyncExternalStore(system.onChange, system.journal);
}

/** The monitor's full-frame view (phase 5.5). */
export const MONITOR_VIEW = 'monitor';

/** The segments of the system line, left to right (docs/DESIGN.md §4.12). */
export const SEGMENTS = [
  'systeme',
  'message',
  'maj',
  'usb',
  'cpu',
  'wifi',
  'bt',
  'lum',
  'vol',
  'bat',
  'sync',
  'date',
] as const;
export type Segment = (typeof SEGMENTS)[number];

/**
 * What the line shows open, shared by the line and the commands that open
 * its panels (⊞W, :wifi…): one panel at a time, and a request to take the focus.
 */
interface UiState {
  readonly open: Segment | null;
  readonly focus: number;
  /** Lit for a second: its value just changed by a key of the device. */
  readonly lit: Segment | null;
  /** The print sheet, and what it prints first. */
  readonly print: 'scene' | 'chapter' | 'manuscript' | null;
}

let ui: UiState = { open: null, focus: 0, lit: null, print: null };
let unlight: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const set = (next: UiState) => {
  ui = next;
  for (const listener of listeners) listener();
};

export const systemUi = {
  get: () => ui,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  open: (segment: Segment | null) => set({ ...ui, open: segment }),
  toggle: (segment: Segment) => set({ ...ui, open: ui.open === segment ? null : segment }),
  /** Puts the focus on the line (⊞ alone). */
  focusLine: () => set({ ...ui, focus: ui.focus + 1 }),
  print: (scope: UiState['print']) => set({ ...ui, open: null, print: scope }),
  /** Lights a segment for a second (a key of the ThinkPad moved its gauge). */
  light: (segment: Segment) => {
    clearTimeout(unlight);
    set({ ...ui, lit: segment });
    unlight = setTimeout(() => set({ ...ui, lit: null }), 1000);
  },
};

export const useSystemUi = (): UiState => useSyncExternalStore(systemUi.subscribe, systemUi.get);
