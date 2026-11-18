/**
 * Keybindings are written like TipTap/ProseMirror's: `Mod-Alt-Shift-ArrowUp`,
 * where `Mod` is ⌘ on macOS and Ctrl elsewhere (decided by the host).
 */

export type PrimaryModifier = 'Meta' | 'Control';

export interface Chord {
  readonly key: string; // lower-case letter, or a KeyboardEvent.key name (ArrowUp, Enter…)
  readonly meta: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
}

export function parseKeybinding(binding: string, primary: PrimaryModifier): Chord {
  // A trailing `--` is the minus key itself (`Mod--`).
  const minus = binding.endsWith('--');
  const parts = binding.slice(0, minus ? -2 : undefined).split('-');
  const rawKey = minus ? '-' : parts.pop();
  // A single character, or a KeyboardEvent.key name (ArrowUp, Enter, F2…).
  if (!rawKey || (rawKey.length > 1 && !/^[A-Z][A-Za-z0-9]*$/.test(rawKey)))
    throw new Error(`Invalid keybinding: ${binding}`);
  // `Control` (a KeyboardEvent modifier name, used by hosts) is `Ctrl`.
  const mods = new Set(
    parts.map((p) => p.toLowerCase()).map((p) => (p === 'control' ? 'ctrl' : p)),
  );
  for (const m of mods) {
    if (!['mod', 'alt', 'shift', 'ctrl', 'meta'].includes(m))
      throw new Error(`Invalid modifier in ${binding}: ${m}`);
  }
  const mod = mods.has('mod');
  return {
    key: rawKey.length === 1 ? rawKey.toLowerCase() : rawKey,
    meta: mods.has('meta') || (mod && primary === 'Meta'),
    ctrl: mods.has('ctrl') || (mod && primary === 'Control'),
    alt: mods.has('alt'),
    shift: mods.has('shift'),
  };
}

/**
 * The key an event stands for. With Alt, macOS turns letters into other
 * characters (⌥N gives "˜"), and AZERTY/QWERTY differ: for letters and
 * digits typed with Alt, fall back to the physical key code.
 */
export function eventKey(event: Pick<KeyboardEvent, 'key' | 'code' | 'altKey'>): string {
  if (event.altKey) {
    const letter = /^Key([A-Z])$/.exec(event.code);
    if (letter?.[1]) return letter[1].toLowerCase();
    const digit = /^Digit([0-9])$/.exec(event.code);
    if (digit?.[1]) return digit[1];
  }
  return event.key.length === 1 ? event.key.toLowerCase() : event.key;
}

type ChordEvent = Pick<
  KeyboardEvent,
  'key' | 'code' | 'altKey' | 'shiftKey' | 'metaKey' | 'ctrlKey'
>;

const sameModifiers = (chord: Chord, event: ChordEvent): boolean =>
  event.metaKey === chord.meta &&
  event.ctrlKey === chord.ctrl &&
  event.altKey === chord.alt &&
  event.shiftKey === chord.shift;

/** The chord's key is the character the event gives (the layout decides). */
export function matchesCharacter(chord: Chord, event: ChordEvent): boolean {
  return eventKey(event) === chord.key && sameModifiers(chord, event);
}

/**
 * A digit chord also goes by the physical key of the digit row: on AZERTY that
 * row gives `& é " ' ( - è _ ç à` unshifted, so ⌘1 arrives as ⌘& (`Digit1`).
 * The modifiers stay exactly those declared.
 */
export function matches(chord: Chord, event: ChordEvent): boolean {
  if (matchesCharacter(chord, event)) return true;
  return (
    /^[0-9]$/.test(chord.key) && event.code === `Digit${chord.key}` && sameModifiers(chord, event)
  );
}

export const sameChord = (a: Chord, b: Chord): boolean =>
  a.key === b.key &&
  a.meta === b.meta &&
  a.ctrl === b.ctrl &&
  a.alt === b.alt &&
  a.shift === b.shift;

const KEY_LABELS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Enter: '↵',
  Escape: 'Échap',
  Backspace: '⌫',
  Delete: 'Suppr',
  ' ': 'Espace',
  '-': '−',
};

/** Human label: `⌥⇧⌘↑` on macOS, `Ctrl+Alt+Maj+↑` elsewhere. */
export function formatChord(chord: Chord, primary: PrimaryModifier): string {
  const key = KEY_LABELS[chord.key] ?? chord.key.toUpperCase();
  if (primary === 'Meta') {
    return `${chord.ctrl ? '⌃' : ''}${chord.alt ? '⌥' : ''}${chord.shift ? '⇧' : ''}${chord.meta ? '⌘' : ''}${key}`;
  }
  return [chord.ctrl && 'Ctrl', chord.meta && 'Méta', chord.alt && 'Alt', chord.shift && 'Maj', key]
    .filter(Boolean)
    .join('+');
}
