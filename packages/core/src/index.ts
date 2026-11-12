// Host-agnostic application core.
export { App, type AppProps } from './app/App';
export { usePlatform } from './app/platform-context';
export { CommandRegistry, filterByQuery, type Command } from './commands/registry';
export {
  createWorkspaceRegistry,
  workspaceCommands,
  type CommandId,
} from './commands/workspace-commands';
export { SceneEditor, type SceneEditorProps } from './editor/SceneEditor';
export { sceneEditorExtensions, sceneSchemaExtensions } from './editor/extensions';
export { createI18n, uiLanguages, type UiLanguage } from './i18n/i18n';
export { openDefaultProject, type ProjectSession } from './workspace/default-scene';
