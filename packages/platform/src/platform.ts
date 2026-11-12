import type { AgentsService } from './agents';
import type { DocumentService } from './documents';
import type { FileMirrorService } from './file-mirror';
import type { KeybindingsService } from './keybindings';
import type { LlmService } from './llm';
import type { SecretsService } from './secrets';
import type { SpellcheckService } from './spellcheck';
import type { LibraryService, PreferencesService } from './storage';
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
  readonly preferences: PreferencesService;
  readonly keybindings: KeybindingsService;
  readonly agents: AgentsService;
  /** Used by the `agents` package; `null` in the UI process of hosts that run agents elsewhere. */
  readonly llm: LlmService | null;
  readonly fileMirror: FileMirrorService | null;
  readonly secrets: SecretsService | null;
  readonly spellcheck: SpellcheckService | null;
  readonly system: SystemService | null;
}
