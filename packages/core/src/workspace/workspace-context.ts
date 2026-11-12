import type { Editor } from '@tiptap/core';
import type { TFunction } from 'i18next';
import type * as Y from 'yjs';
import type { PaletteRequest } from '../palette/palette-request';

/** Everything a command may use. Rebuilt on every render of the workspace. */
export interface WorkspaceContext {
  readonly t: TFunction;
  readonly projectId: string;
  readonly root: Y.Doc;
  readonly sceneId: string;
  readonly editor: Editor | null;
  /** The open scene's text and history documents (null while loading). */
  readonly sceneDocs: { readonly sceneDoc: Y.Doc; readonly historyDoc: Y.Doc } | null;
  /** UI language, for dates. */
  readonly language: string;
  openScene(sceneId: string): void;
  openPalette(request?: PaletteRequest): void;
  toggleNavigator(): void;
  shortcutLabel(commandId: string): string | undefined;
  /** A short, discreet confirmation (read by screen readers). */
  notify(message: string): void;
}
