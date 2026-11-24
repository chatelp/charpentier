import { useEffect, useState, useSyncExternalStore } from 'react';
import { matchesCharacter, type Chord } from '../commands/keybinding';

/**
 * The two presses (docs/DESIGN.md §4.7 « Les deux appuis », rule 5 of §5.0
 * [D-46]): a big piece (a project, a chapter that has scenes, a working
 * version, a scene that has text) and a gesture with no way back (forgetting
 * the key, disconnecting a device) go at the second press only. The first one
 * changes the label into « Confirmer : … » for 3 s, counting down; the second
 * does it. Past 3 s, or at Échap, nothing went and nothing is said.
 */
export const ARMED_FOR_SECONDS = 3;

export type ConfirmWhere = 'inline' | 'palette' | 'status';

export interface TwoPressRequest {
  /** What is armed (`trash:scene:<id>`): a press on something else arms that instead. */
  readonly id: string;
  /** What will go, with what it takes (« chapitre et 4 scènes à la corbeille »): « Confirmer : {what} ». */
  readonly what: string;
  /**
   * Where the phrase shows: on the button or the menu entry that was pressed
   * (`inline`), on the line chosen in the command line, which stays open
   * (`palette`), or, from the keyboard without a menu, in the status line with
   * a button (`status`).
   */
  readonly where: ConfirmWhere;
  /** The keys that press again (in the status line: any other key forgets it). */
  readonly keys?: readonly Chord[] | undefined;
  /** The key shown on the status line's button (« ⌫ »). */
  readonly shortcut?: string | undefined;
  run(): void;
}

export interface Armed extends TwoPressRequest {
  /** Seconds left, 3, 2, 1. */
  readonly left: number;
}

/** One thing armed at a time, for a workspace or a screen. */
export class TwoPresses {
  private current: Armed | null = null;
  private tick: ReturnType<typeof setInterval> | undefined;
  private readonly listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly armed = (): Armed | null => this.current;

  /** Where a request without its own `where` shows its phrase (see `within`). */
  private where: ConfirmWhere = 'status';

  /**
   * Runs `act` with requests showing their phrase `where` by default: a control that runs a
   * command and shows the phrase on its own label says so (synchronously, before it waits).
   */
  within<T>(where: ConfirmWhere, act: () => T): T {
    const before = this.where;
    this.where = where;
    try {
      return act();
    } finally {
      this.where = before;
    }
  }

  /** A press whose `where` defaults to the one `within` set. */
  pressHere(request: Omit<TwoPressRequest, 'where'> & Partial<Pick<TwoPressRequest, 'where'>>) {
    return this.press({ ...request, where: request.where ?? this.where });
  }

  /** Whether `id` is the one armed. */
  isArmed(id: string): boolean {
    return this.current?.id === id;
  }

  /**
   * A press: the first arms the request, the second (same id, within 3 s)
   * runs it. True when it ran.
   */
  press(request: TwoPressRequest): boolean {
    if (this.current?.id === request.id) {
      this.disarm();
      request.run();
      return true;
    }
    this.set({ ...request, left: ARMED_FOR_SECONDS });
    clearInterval(this.tick);
    this.tick = setInterval(() => {
      const armed = this.current;
      if (!armed) return;
      if (armed.left <= 1) this.disarm();
      else this.set({ ...armed, left: armed.left - 1 });
    }, 1000);
    return false;
  }

  /** The second press on what is armed, from the status line's button. */
  confirm(): boolean {
    const armed = this.current;
    return armed ? this.press(armed) : false;
  }

  disarm(): void {
    clearInterval(this.tick);
    this.tick = undefined;
    if (this.current) this.set(null);
  }

  /**
   * A key pressed while something is armed: Échap forgets it; in the status line and
   * in the command line, any key but the one that presses again forgets it too, in silence.
   * (A modifier alone changes nothing.) A key held down is one press: what the
   * host repeats is spent here, it neither presses again nor forgets.
   */
  keyDown(event: KeyboardEvent): void {
    const armed = this.current;
    if (!armed || MODIFIERS.has(event.key)) return;
    if (spendRepeat(event)) return;
    if (event.key === 'Escape') return this.disarm();
    if (armed.where === 'inline') return;
    // In the command line, ⏎ presses again, whatever key armed it elsewhere.
    if (armed.where === 'palette') {
      if (event.key !== 'Enter') this.disarm();
      return;
    }
    if (!armed.keys?.some((chord) => matchesCharacter(chord, event))) this.disarm();
  }

  private set(next: Armed | null) {
    this.current = next;
    for (const listener of this.listeners) listener();
  }
}

/**
 * A key the host repeats while it is held, spent before it reaches anything: the list's own
 * keys, and the click ⏎ makes on a button. (The arrows still walk.) True when it was.
 */
export function spendRepeat(event: KeyboardEvent): boolean {
  if (!event.repeat || event.key.startsWith('Arrow')) return false;
  event.preventDefault();
  event.stopPropagation();
  return true;
}

const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock']);

/**
 * A screen's own two presses (the library, the settings): the armed thing,
 * read at every change, and forgotten at Échap or when the screen goes.
 */
export function useTwoPresses(): { presses: TwoPresses; armed: Armed | null } {
  const [presses] = useState(() => new TwoPresses());
  const armed = useSyncExternalStore(presses.subscribe, presses.armed);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => presses.keyDown(event);
    // Before the screen's own keys: a second ⌫ is still the screen's to handle.
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      presses.disarm();
    };
  }, [presses]);
  return { presses, armed };
}
