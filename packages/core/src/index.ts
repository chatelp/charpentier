// Host-agnostic application core.
export { App, type AppProps } from './app/App';
export { usePlatform } from './app/platform-context';
export { SceneEditor, type SceneEditorProps } from './editor/SceneEditor';
export { sceneEditorExtensions, sceneSchemaExtensions } from './editor/extensions';
export { createI18n, uiLanguages, type UiLanguage } from './i18n/i18n';
export { openDefaultScene, type OpenScene } from './workspace/default-scene';
