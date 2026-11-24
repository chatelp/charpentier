import {
  formatBinding,
  parseKeybinding,
  type Chord,
  type PrimaryModifier,
} from '../commands/keybinding';

/**
 * The menu of a thing (docs/DESIGN.md §4.7 « Le menu d'une chose », rule 1 of
 * §5.0): what its « ⋯ » and the right click on its line open. One model for
 * every kind of thing; the workspace has one host that shows it.
 */
export interface ThingMenu {
  /** « Scène · Le quai de la Fosse »: the kind and the name of the thing. */
  readonly head: { readonly kind: string; readonly name: string };
  /** In order, an engraved rule between two of them. */
  readonly groups: readonly MenuGroup[];
}

export interface MenuGroup {
  readonly id: string;
  /** « Le Compagnon », in small capitals: the group is then a named `group`. */
  readonly title?: string | undefined;
  readonly entries: readonly MenuEntry[];
}

/**
 * One line of the menu. It runs, or opens a list of choices in place of the
 * sheet's content, or is inert for now: `disabled` then says why, and wins
 * over the two others.
 */
export interface MenuEntry {
  readonly id: string;
  /** Ends with « … » when something follows (a name to type, a choice to make). */
  readonly label: string;
  /** The key shown: the one that works where the menu opened; none when the action has no key. */
  readonly shortcut?: string | undefined;
  /**
   * The keys that act directly while the menu is open; the first one is the
   * key shown (`aria-keyshortcuts`). ⏎ always chooses the entry that has the
   * focus, whatever is listed here.
   */
  readonly keys?: readonly Chord[] | undefined;
  readonly run?: (() => void) | undefined;
  /**
   * The registry command this entry stands for (`data-command` on its line):
   * its `run` then goes through the workspace's `runCommand`, which announces it.
   */
  readonly command?: string | undefined;
  /**
   * The menu stays open after `run`: a first press that asks for a second one
   * (the two presses of DESIGN 1.37); the entry then reads its new label at
   * the next render.
   */
  readonly keepOpen?: boolean | undefined;
  /** Replaces the sheet's content, « ‹ Retour » at its head: no cascading submenu. */
  readonly choices?: readonly MenuChoice[] | undefined;
  /** Why the entry does not apply now: it keeps its place, inert, and says so in its tooltip. */
  readonly disabled?: string | undefined;
}

export interface MenuChoice {
  readonly id: string;
  readonly label: string;
  /** A word on the right, in the faint ink (« active »). */
  readonly detail?: string | undefined;
  run(): void;
}

/** Where the sheet opens: under a « ⋯ », right-aligned on it, or at the pointer. */
export type MenuAnchor =
  | { readonly kind: 'button'; readonly element: HTMLElement }
  | { readonly kind: 'point'; readonly x: number; readonly y: number };

/** What a line asks of the workspace's menu host. */
export interface MenuRequest<Ctx> {
  /** The thing (`scene:<id>`): its « ⋯ » stays lit while the menu is open. */
  readonly id: string;
  readonly anchor: MenuAnchor;
  /** The material of the surface where the thing lives: slate (a tool panel) or the page. */
  readonly surface: 'tool' | 'page';
  /**
   * The line of the thing: it has the focus again when the menu closes; the
   * menu closes by itself when the line leaves the document.
   */
  readonly line: HTMLElement | null;
  /** The content, read again at every render (null: the thing is gone). */
  build(ctx: Ctx): ThingMenu | null;
}

/** A key shown in a menu and the chords that act for it. */
export interface MenuKey {
  readonly shortcut: string | undefined;
  readonly keys: readonly Chord[];
}

/**
 * A key a list handles itself (`R`, `Alt-ArrowUp`…), named as the host's
 * keyboard names it; `also` are other keys that do the same (`F2`, `Delete`).
 */
export function ownKey(primary: PrimaryModifier, binding: string, ...also: string[]): MenuKey {
  return {
    shortcut: formatBinding(binding, primary),
    keys: [binding, ...also].map((b) => parseKeybinding(b, primary)),
  };
}

/** A command's key, from the registry's label and chord (nothing when the host keeps it). */
export function commandKey(shortcut: string | undefined, chord: Chord | undefined): MenuKey {
  return { shortcut: chord ? shortcut : undefined, keys: chord ? [chord] : [] };
}

export const NO_KEY: MenuKey = { shortcut: undefined, keys: [] };

/** A chord in the syntax of `aria-keyshortcuts` (« Meta+Shift+N », « Alt+ArrowUp », « R »). */
export function ariaKeyShortcut(chord: Chord): string {
  const key =
    chord.key === ' ' ? 'Space' : chord.key.length === 1 ? chord.key.toUpperCase() : chord.key;
  return [
    chord.ctrl && 'Control',
    chord.meta && 'Meta',
    chord.alt && 'Alt',
    chord.shift && 'Shift',
    key,
  ]
    .filter(Boolean)
    .join('+');
}

/** Whether an entry can be chosen now. */
export const isInert = (entry: MenuEntry): boolean => entry.disabled !== undefined;
