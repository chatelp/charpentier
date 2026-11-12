// Main-process (Node) side of the desktop platform.
export { DocFile, readJournal } from './doc-file';
export { DocStore, type UpdateListener } from './doc-store';
export { PreferencesFile } from './preferences';
export { documentLocator, folderName, FolderLibrary, STATE_DIR } from './projects';
export { RendererSession } from './renderer-session';
export { SpellClient } from './spell-client';
export { ProjectMirror, type ImportResult, type MirrorStrings } from './project-mirror';
