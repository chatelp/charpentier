import type { AgentsService } from './agents';
import type { DocumentService } from './documents';
import type { FileMirrorService } from './file-mirror';
import type { KeybindingsService } from './keybindings';
import type { LlmService } from './llm';
import type { MenuService } from './menu';
import type { SecretsService } from './secrets';
import type { SpellcheckService } from './spellcheck';
import type { LibraryFolderService, LibraryService, PreferencesService } from './storage';
import type { SyncService } from './sync';
import type { SystemService } from './system';

export type HostKind = 'web' | 'desktop' | 'appliance';

/**
 * Everything core may know about its host. Core receives one `Platform` at
 * start-up and must never import a host API directly.
 *
 * A service a host does not offer is `null`: core checks for it and degrades
 * (hides the feature), it never assumes one is there.
 */
export interface Platform {
  readonly host: HostKind;
  readonly documents: DocumentService;
  readonly library: LibraryService;
  /** The library's folder on disk; `null` where projects do not live in folders (web). */
  readonly libraryFolder: LibraryFolderService | null;
  /**
   * The app's version and the commit it was built from, for « À propos »
   * (docs/PLAN.md phase 7.3); absent where the host does not know it.
   */
  readonly about?: { readonly version: string; readonly commit?: string } | null;
  readonly preferences: PreferencesService;
  readonly keybindings: KeybindingsService;
  readonly agents: AgentsService;
  /** Sync with the author's server; `null` where there is none. */
  readonly sync: SyncService | null;
  /** Used by the `agents` package; `null` in the UI process of hosts that run agents elsewhere. */
  readonly llm: LlmService | null;
  readonly fileMirror: FileMirrorService | null;
  readonly secrets: SecretsService | null;
  readonly spellcheck: SpellcheckService | null;
  readonly system: SystemService | null;
  /**
   * Height in px of a title bar drawn by the app over its content (macOS
   * window with integrated traffic lights), or 0.
   */
  readonly titleBarHeight?: number;
  /** The window entered or left full screen (the title bar is then absent); returns an unsubscribe function. */
  onFullScreenChange?(listener: (fullScreen: boolean) => void): () => void;
  /** The application menu (macOS menu bar); absent where the host has none. */
  readonly menu?: MenuService;
}
