import type { Platform } from '@charpentier/platform';
import type { OutlineChapter } from '@charpentier/schema';
import type { Editor } from '@tiptap/core';
import type { TFunction } from 'i18next';
import type * as Y from 'yjs';
import type { AtelierLocation } from '../atelier/Atelier';
import type { SheetTarget } from '../atelier/atelier-data';
import type { Chord } from '../commands/keybinding';
import type { MenuRequest } from '../menu/thing-menu';
import type { PaletteRequest } from '../palette/palette-request';
import type { WorkRef } from '@charpentier/schema';
import type { WorkState } from '../work/use-background-work';
import type { PrefsUpdate, WritingPrefs } from './writing-prefs';

export type WorkspaceView =
  'write' | 'atelier' | 'overview' | 'settings' | 'system-settings' | `view:${string}`;

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
  /** Plays the guided tour of the entry points again (docs/DESIGN.md §4.8). */
  startTour(): void;
  /** The right panel of the Compagnon, if open, on which tab. */
  readonly mentorPanel: 'points' | 'conversation' | null;
  toggleMentorPanel(tab?: 'points' | 'conversation'): void;
  /** The author's gestures to enter a panel so far (`usePanelEntry`). */
  readonly panelEntry: number;
  /** Unfolds a remark's note in the margin and gives it the focus. */
  openSignalNote(signalId: string): void;
  /** Opens a sheet beside the text (« fiche en volet »). */
  openSheet(target: SheetTarget): void;
  /** Words of each scene (the open one live). */
  readonly sceneWords: ReadonlyMap<string, number>;
  /** Plain text of each scene's active variant (as last read). */
  readonly sceneTexts: ReadonlyMap<string, string>;
  /** The Compagnon's intervention level for this project (D-19). */
  readonly mentorLevel: 1 | 2 | 3 | 4;
  /** Asks the Compagnon to read scenes (automatic: skips unchanged ones, may use the light model). */
  analyze(sceneIds: readonly string[], automatic: boolean): void;
  /** Asks the Compagnon for its review of a chapter, left in the conversation. */
  reviewChapter(chapterId: string, automatic: boolean): void;
  /** The Compagnon's background work (D-27): asked, running, ended. */
  readonly work: WorkState;
  /** Opens the Atelier where a work's results arrive, its block in confirmation. */
  askWork(ref: WorkRef): void;
  cancelWork(ref?: WorkRef): void;
  launchWork(): void;
  stopWork(): void;
  /** Where the Atelier stands (or last stood). */
  readonly atelierLocation: AtelierLocation;
  shortcutLabel(commandId: string): string | undefined;
  /** The chord behind that label, for a menu whose keys act while it is open. */
  shortcutChord(commandId: string): Chord | undefined;
  /** Opens the menu of a thing (docs/DESIGN.md §4.7), under its « ⋯ » or at the pointer. */
  openMenu(request: MenuRequest<WorkspaceContext>): void;
  /** The thing whose menu is open (`scene:<id>`), if any: its « ⋯ » stays lit. */
  readonly menuOf: string | null;
  /**
   * Runs a command that acts on the open scene, for another one: that scene
   * opens first, and the command runs once its documents are there.
   */
  runOnScene(sceneId: string, commandId: string): void;
  /** A short, discreet confirmation (read by screen readers). */
  notify(message: string): void;
  /**
   * A confirmation with a way back: what was just done (something put in the
   * trash) is undone by ⌘Z, as long as the author has typed nothing since.
   */
  offerUndo(message: string, undo: () => void): void;
  /** Takes the way back on offer, if any; false when there is none. */
  undoOffered(): boolean;
  /**
   * Writing surface, the Atelier (modules), the overview of the manuscript,
   * the settings (sections from the features) or a feature's view.
   */
  readonly view: WorkspaceView;
  openAtelier(location?: AtelierLocation): void;
  /** The app's settings (docs/DESIGN.md §4.8, phase 7.3), on a section. */
  openSettings(sectionId?: string): void;
  /**
   * The machine's settings, which a feature brings (the X250's, in the
   * system's charter: D-36); does nothing without one.
   */
  openSystemSettings(sectionId?: string): void;
  /** A feature's full-frame view (docs/PLAN.md phase 5.1). */
  openView(viewId: string): void;
  /** Runs a command of the registry, a feature's included (false: unknown or disabled). */
  runCommand(commandId: string): Promise<boolean>;
  openWriting(): void;
  openOverview(): void;
  /** The library of projects; `creating` opens the new project form. */
  openLibrary(creating?: boolean): void;
  /** Opens another project of the library, where the author left it. */
  openProject(projectId: string): void;
  /** The novel's sheet (docs/DESIGN.md §4.8 « Le titre du roman »): open or not. */
  readonly novelOpen: boolean;
  /**
   * Opens or closes the novel's sheet; with a mode, opens it on the title as
   * a field, or on a new working version's name (DESIGN 1.20).
   */
  toggleNovel(mode?: 'renaming' | 'version'): void;
  /** Words written today in this project (the date panel of the system line). */
  readonly wordsToday: number;
  /** The author is typing (the entry points fade, the cpu curve stands still). */
  readonly typing: boolean;
  readonly prefs: WritingPrefs;
  updatePrefs(change: PrefsUpdate): void;
}
