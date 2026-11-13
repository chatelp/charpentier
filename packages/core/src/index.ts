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
export { initialProjectId, openProject, type ProjectSession } from './workspace/default-scene';
export {
  featureText,
  type CommandPrefix,
  type Feature,
  type FeatureMenu,
  type FeatureView,
  type FeatureViewProps,
  type FooterItem,
  type SettingsSection,
  type TextTree,
  type TopZone,
  type TopZoneProps,
  type WorkspaceProps,
} from './features/feature';
export type { WorkspaceContext, WorkspaceView } from './workspace/workspace-context';
export type { PickItem } from './palette/palette-request';
