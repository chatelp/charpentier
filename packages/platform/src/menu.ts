/**
 * The application menu of a host that has one (the macOS menu bar,
 * docs/DESIGN.md §4.8): built by the core from its command registry, drawn
 * by the host, which sends back the command chosen.
 */

/** Items the host's system handles itself (window, clipboard, application). */
export type MenuRole =
  | 'about'
  | 'hide'
  | 'hideOthers'
  | 'quit'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'selectAll'
  | 'minimize'
  | 'zoom'
  | 'close'
  | 'togglefullscreen';

/** A shortcut, shown in the menu (the core handles the key itself). */
export interface MenuShortcut {
  /** Lower-case letter, or a KeyboardEvent key name (ArrowUp, Enter…). */
  readonly key: string;
  readonly meta: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
}

export type MenuEntry =
  | {
      readonly kind: 'command';
      readonly id: string;
      readonly label: string;
      readonly shortcut?: MenuShortcut;
      /** A setting, shown ticked or not. */
      readonly checked?: boolean;
    }
  | { readonly kind: 'role'; readonly role: MenuRole; readonly label: string }
  | { readonly kind: 'separator' };

export interface MenuModel {
  readonly menus: readonly { readonly label: string; readonly entries: readonly MenuEntry[] }[];
}

export interface MenuService {
  /** Replaces the application menu. */
  set(model: MenuModel): void;
  /** A command was chosen in the menu; returns an unsubscribe function. */
  onCommand(listener: (id: string) => void): () => void;
}
