// Main-process (Node) side of the desktop platform.
export { DocFile, readJournal } from './doc-file';
export { DocStore, type UpdateListener } from './doc-store';
export { PreferencesFile } from './preferences';
export { documentLocator, folderName, FolderLibrary, STATE_DIR } from './projects';
export { RendererSession } from './renderer-session';
export { SyncEngine, type SyncAccount, type SyncCredentials } from './sync-engine';
export { toAccelerator } from './accelerator';
export { SpellClient } from './spell-client';
export { AgentHost, API_KEY_SECRET } from './agent-host';
export { REFERENCE_EXTENSIONS } from './reference-file';
export { AnthropicLlmService, HAIKU, OPUS, type ModelChoice } from './anthropic-llm';
export { SecretStore, type Encryption } from './secret-store';
export { ProjectMirror, type ImportResult, type MirrorStrings } from './project-mirror';
export {
  createLinuxSystem,
  type LinuxSystem,
  type LinuxSystemOptions,
} from './system/linux-system';
export { nodeTools, type SystemTools, type RunResult } from './system/tools';
export { exportTexts } from './export-texts';
export { createUpdateAccessSharer, shareUpdateAccess } from './update-access';
