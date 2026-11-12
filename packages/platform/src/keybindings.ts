/**
 * Host facts the central keybinding registry (in core) needs. The registry
 * itself is host-agnostic; the host only says which modifier is primary and
 * which shortcuts it keeps for itself.
 */
export interface KeybindingsService {
  /** `Meta` (⌘) on macOS, `Control` elsewhere. */
  readonly primaryModifier: 'Meta' | 'Control';
  /** Shortcuts the host owns and core must not bind, e.g. `Meta+Q`. */
  readonly reserved: readonly string[];
}
