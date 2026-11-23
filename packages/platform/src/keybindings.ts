/**
 * Host facts the central keybinding registry (in core) needs. The registry
 * itself is host-agnostic; the host only says which modifier is primary and
 * which shortcuts it keeps for itself.
 */
export interface KeybindingsService {
  /** `Meta` (⌘) on macOS, `Control` elsewhere. */
  readonly primaryModifier: 'Meta' | 'Control';
  /**
   * Shortcuts the host owns and core must not bind, in the registry's syntax
   * (`Meta-q`, `Mod-Alt-ArrowLeft`). A browser keeps ⌘W, ⌘T, ⌘N…: commands
   * then fall back to their other shortcuts, or to the command line alone.
   */
  readonly reserved: readonly string[];
  /**
   * The character each physical key gives without modifier, by
   * `KeyboardEvent.code` (`KeyM` gives `,` on AZERTY), when the host can tell:
   * with Alt, macOS changes the character (⌥, gives ∞) and the registry reads
   * the key's own. Null, or absent, when it cannot.
   */
  keyboardLayout?(): Promise<ReadonlyMap<string, string> | null>;
}

interface LayoutNavigator {
  readonly keyboard?: { getLayoutMap?(): Promise<ReadonlyMap<string, string>> };
}

/**
 * The keyboard layout as Chromium reads it (`navigator.keyboard`, the web and
 * the desktop's renderer); null in a browser without it (Safari, Firefox).
 */
export async function navigatorKeyboardLayout(): Promise<ReadonlyMap<string, string> | null> {
  const keyboard = (globalThis.navigator as LayoutNavigator | undefined)?.keyboard;
  try {
    return (await keyboard?.getLayoutMap?.()) ?? null;
  } catch {
    return null;
  }
}
