import type { Platform } from '@charpentier/platform';
import type { OutlineChapter } from '@charpentier/schema';
import type { Editor } from '@tiptap/core';
import type { TFunction } from 'i18next';
import type * as Y from 'yjs';
import type { AtelierLocation } from '../atelier/Atelier';
import type { PaletteRequest } from '../palette/palette-request';
import type { PrefsUpdate, WritingPrefs } from './writing-prefs';

/** Everything a command may use. Rebuilt on every render of the workspace. */
export interface WorkspaceContext {
  readonly t: TFunction;
  readonly platform: Platform;
  readonly projectId: string;
  readonly root: Y.Doc;
  readonly sceneId: string;
  /** Chapters and their scenes, live. */
  readonly outline: readonly OutlineChapter[];
  readonly editor: Editor | null;
  /** The open scene's text and history documents (null while loading). */
  readonly sceneDocs: { readonly sceneDoc: Y.Doc; readonly historyDoc: Y.Doc } | null;
  /** UI language, for dates. */
  readonly language: string;
  openScene(sceneId: string): void;
  openPalette(request?: PaletteRequest): void;
  toggleNavigator(): void;
  /** The right panel of the Compagnon, if open, on which tab. */
  readonly mentorPanel: 'points' | 'conversation' | null;
  toggleMentorPanel(tab?: 'points' | 'conversation'): void;
  /** Unfolds a remark's note in the margin and gives it the focus. */
  openSignalNote(signalId: string): void;
  shortcutLabel(commandId: string): string | undefined;
  /** A short, discreet confirmation (read by screen readers). */
  notify(message: string): void;
  /** Writing surface, the Atelier (modules), or the overview of the manuscript. */
  readonly view: 'write' | 'atelier' | 'overview';
  openAtelier(location?: AtelierLocation): void;
  openWriting(): void;
  openOverview(): void;
  /** The library of projects; `creating` opens the new project form. */
  openLibrary(creating?: boolean): void;
  readonly prefs: WritingPrefs;
  updatePrefs(change: PrefsUpdate): void;
}
