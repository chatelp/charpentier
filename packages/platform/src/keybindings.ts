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
}
