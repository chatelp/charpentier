import { syncCommands } from './sync-commands';
import {
  createChapter,
  createScene,
  getScene,
  listChapters,
  listVersionScenes,
  readOutline,
  listScenes,
  listTrash,
  listTrashedVersions,
  restoreVersion,
  readProjectMeta,
  moveChapterStep,
  moveScene,
  moveSceneStep,
  renameChapter,
  renameScene,
  restoreChapter,
  restoreSceneWithChapter,
  trashChapter,
  trashScene,
} from '@charpentier/schema';
import type { WorkspaceContext } from '../workspace/workspace-context';
import { ensureScene, renameProjectEverywhere } from '../workspace/default-scene';
import type { CommandId } from './command-id';
import type { Chord, PrimaryModifier } from './keybinding';
import { trashedVariantItems, variantCommands } from './variant-commands';
import { versionCommands } from './version-commands';
import { writingCommands } from './writing-commands';
import { atelierCommands } from './atelier-commands';
import { languageCommands } from './language-commands';
import { trashedEntityItems } from '../atelier/atelier-actions';
import { CommandRegistry, type Command } from './registry';
import type { Feature } from '../features/feature';

export type { CommandId } from './command-id';

type WorkspaceCommand = Command<WorkspaceContext> & { readonly id: CommandId };

const currentScene = (ctx: WorkspaceContext) => getScene(ctx.root, ctx.sceneId);

/** Opens the scene that follows (or precedes) `sceneId`, before it disappears. */
function neighbourOf(ctx: WorkspaceContext, sceneIds: ReadonlySet<string>): string | undefined {
  const all = listVersionScenes(ctx.root);
  const index = all.findIndex((s) => sceneIds.has(s.id));
  const after = all.slice(index + 1).find((s) => !sceneIds.has(s.id));
  const before = all
    .slice(0, Math.max(index, 0))
    .reverse()
    .find((s) => !sceneIds.has(s.id));
  return (after ?? before)?.id;
}

const defaultTitles = (ctx: WorkspaceContext) => ({
  chapter: ctx.t('manuscript.newChapterTitle'),
  scene: ctx.t('manuscript.newSceneTitle'),
});

function promptRenameScene(ctx: WorkspaceContext, sceneId: string): void {
  const scene = getScene(ctx.root, sceneId);
  if (!scene) return;
  ctx.openPalette({
    kind: 'input',
    placeholder: ctx.t('palette.sceneTitle'),
    initial: scene.title,
    onSubmit: (title) => title.trim() && renameScene(ctx.root, sceneId, title.trim()),
  });
}

function promptRenameChapter(ctx: WorkspaceContext, chapterId: string): void {
  const chapter = listChapters(ctx.root).find((c) => c.id === chapterId);
  if (!chapter) return;
  ctx.openPalette({
    kind: 'input',
    placeholder: ctx.t('palette.chapterTitle'),
    initial: chapter.title,
    onSubmit: (title) => title.trim() && renameChapter(ctx.root, chapterId, title.trim()),
  });
}

/** Creates a scene at `index` in `chapterId`, opens it and asks for its title. */
export function newSceneAfter(ctx: WorkspaceContext, chapterId: string, index: number): string {
  const { sceneId } = createScene(ctx.root, {
    chapterId,
    title: ctx.t('manuscript.newSceneTitle'),
    index,
  });
  ctx.openScene(sceneId);
  promptRenameScene(ctx, sceneId);
  return sceneId;
}

/** Creates a chapter with a first scene, opens that scene and asks for the chapter's title. */
export function newChapterAt(
  ctx: WorkspaceContext,
  index: number,
): { chapterId: string; sceneId: string } {
  const chapterId = createChapter(ctx.root, { title: ctx.t('manuscript.newChapterTitle'), index });
  const { sceneId } = createScene(ctx.root, {
    chapterId,
    title: ctx.t('manuscript.newSceneTitle'),
  });
  ctx.openScene(sceneId);
  promptRenameChapter(ctx, chapterId);
  return { chapterId, sceneId };
}

/**
 * A scene to write in when the trash took the last one: made, opened, and
 * remembered, so that undoing the trash takes it away again (with the chapter
 * made for it, if one was).
 */
function sceneToWriteIn(ctx: WorkspaceContext): { id: string; unmake(): void } {
  const chapters = new Set(listChapters(ctx.root).map((c) => c.id));
  const id = ensureScene(ctx.root, defaultTitles(ctx));
  const chapterId = listVersionScenes(ctx.root).find((s) => s.id === id)?.chapterId;
  return {
    id,
    unmake: () => {
      if (chapterId && !chapters.has(chapterId)) trashChapter(ctx.root, chapterId);
      else trashScene(ctx.root, id);
    },
  };
}

/** To the trash, with ⌘Z to bring it back (docs/PLAN.md 7.5). */
export function trashSceneAndMove(ctx: WorkspaceContext, sceneId: string): void {
  const title = ctx.outline.flatMap((c) => c.scenes).find((s) => s.id === sceneId)?.title ?? '';
  const open = sceneId === ctx.sceneId;
  const next = neighbourOf(ctx, new Set([sceneId]));
  trashScene(ctx.root, sceneId);
  const made = open && !next ? sceneToWriteIn(ctx) : undefined;
  if (open) ctx.openScene(next ?? made?.id ?? sceneId);
  ctx.offerUndo({
    message: ctx.t('status.sceneTrashed', { title }),
    name: title,
    label: ctx.t('status.undoTrash.scene', { name: title }),
    undo: () => {
      restoreSceneWithChapter(ctx.root, sceneId);
      if (open) ctx.openScene(sceneId);
      made?.unmake();
    },
  });
}

export function trashChapterAndMove(ctx: WorkspaceContext, chapterId: string): void {
  const title = ctx.outline.find((c) => c.id === chapterId)?.title ?? '';
  const inside = new Set(listScenes(ctx.root, chapterId).map((s) => s.id));
  const was = ctx.sceneId;
  const next = neighbourOf(ctx, inside);
  trashChapter(ctx.root, chapterId);
  const made = !next ? sceneToWriteIn(ctx) : undefined;
  if (inside.has(was) || !next) ctx.openScene(next ?? made?.id ?? was);
  ctx.offerUndo({
    // « Chapitre « Nantes » et 4 scènes mis à la corbeille. » (DESIGN §4.7, 1.37).
    message:
      inside.size === 0
        ? ctx.t('status.chapterTrashed', { title })
        : ctx.t('status.chapterWithScenesTrashed', { title, count: inside.size }),
    name: title,
    label: ctx.t('status.undoTrash.chapter', { name: title }),
    undo: () => {
      restoreChapter(ctx.root, chapterId);
      if (inside.has(was)) ctx.openScene(was);
      made?.unmake();
    },
  });
}

/** How a two-press request is shown and pressed again (`TwoPressRequest`). */
export interface AskFrom {
  readonly where?: 'inline' | 'status' | undefined;
  readonly keys?: readonly Chord[] | undefined;
  readonly shortcut?: string | undefined;
}

/**
 * What a scene takes to the trash if it is a big piece (docs/DESIGN.md §4.7 « Les deux
 * appuis »): a scene that has text, a word at least in one of its variants (D-46). Not knowing
 * yet is no reason to let it go: it asks.
 */
export function sceneBigPiece(ctx: WorkspaceContext, sceneId: string): string | undefined {
  const scene = ctx.outline.flatMap((c) => c.scenes).find((s) => s.id === sceneId);
  const hasText = ctx.sceneHasText(sceneId);
  if (!scene || hasText === false) return undefined;
  if (scene.variants.length > 1)
    return ctx.t('confirm.what.sceneVariants', { count: scene.variants.length });
  const words = hasText ? ctx.sceneWords.get(sceneId) : undefined;
  return words
    ? ctx.t('confirm.what.sceneWords', {
        count: words,
        formatted: new Intl.NumberFormat(ctx.language).format(words),
      })
    : ctx.t('confirm.what.scene');
}

/** A chapter that has scenes is a big piece: « chapitre et 4 scènes à la corbeille ». */
export function chapterBigPiece(ctx: WorkspaceContext, chapterId: string): string | undefined {
  const count = ctx.outline.find((c) => c.id === chapterId)?.scenes.length ?? 0;
  return count > 0 ? ctx.t('confirm.what.chapter', { count }) : undefined;
}

/** The id a scene's or a chapter's two presses are armed under. */
export const trashArmId = (id: string) => `trash:${id}`;

/**
 * The scene to the trash: at once when it is empty, at the second press when it has text
 * (DESIGN §4.7, rule 5). True when it went; `after` runs then (the focus moves on).
 */
export function askTrashScene(
  ctx: WorkspaceContext,
  sceneId: string,
  from: AskFrom = {},
  after?: () => void,
): boolean {
  const run = () => {
    trashSceneAndMove(ctx, sceneId);
    after?.();
  };
  const what = sceneBigPiece(ctx, sceneId);
  if (!what) return (run(), true);
  return ctx.confirmTwice({ id: trashArmId(sceneId), what, ...from, run });
}

/** The chapter to the trash: at the second press when it has scenes. */
export function askTrashChapter(
  ctx: WorkspaceContext,
  chapterId: string,
  from: AskFrom = {},
  after?: () => void,
): boolean {
  const run = () => {
    trashChapterAndMove(ctx, chapterId);
    after?.();
  };
  const what = chapterBigPiece(ctx, chapterId);
  if (!what) return (run(), true);
  return ctx.confirmTwice({ id: trashArmId(chapterId), what, ...from, run });
}

export { promptRenameChapter, promptRenameScene };

const withEditor = (ctx: WorkspaceContext) => ctx.editor !== null;

export const workspaceCommands: readonly WorkspaceCommand[] = [
  {
    id: 'openPalette',
    scope: 'global',
    keybinding: 'Mod-k',
    run: (ctx) => ctx.openPalette({ kind: 'commands' }),
  },
  {
    id: 'replayTour',
    scope: 'global',
    run: (ctx) => ctx.startTour(),
  },
  {
    id: 'toggleNavigator',
    scope: 'global',
    keybinding: 'Mod-j',
    run: (ctx) => ctx.toggleNavigator(),
  },
  {
    id: 'openLibrary',
    scope: 'global',
    keybinding: 'Mod-o',
    run: (ctx) => ctx.openLibrary(),
  },
  { id: 'newProject', scope: 'global', run: (ctx) => ctx.openLibrary(true) },
  {
    id: 'chooseLibraryFolder',
    scope: 'global',
    isEnabled: (ctx) => ctx.platform.libraryFolder !== null,
    run: (ctx) => void ctx.platform.libraryFolder?.choose(),
  },
  {
    id: 'revealLibraryFolder',
    scope: 'global',
    isEnabled: (ctx) => ctx.platform.libraryFolder !== null,
    run: (ctx) => void ctx.platform.libraryFolder?.reveal(),
  },
  {
    id: 'renameProject',
    scope: 'global',
    run: (ctx) =>
      ctx.openPalette({
        kind: 'input',
        placeholder: ctx.t('palette.projectTitle'),
        initial: readProjectMeta(ctx.root)?.title ?? '',
        onSubmit: (title) => {
          const trimmed = title.trim();
          if (trimmed) void renameProjectEverywhere(ctx.platform, ctx.projectId, trimmed, ctx.root);
        },
      }),
  },
  {
    id: 'toggleOverview',
    scope: 'global',
    keybinding: 'Mod-Shift-p',
    run: (ctx) => (ctx.view === 'overview' ? ctx.openWriting() : ctx.openOverview()),
  },
  {
    id: 'goToScene',
    scope: 'global',
    keybinding: 'Mod-p',
    // The command line, already in its `#` (scenes) mode.
    run: (ctx) => ctx.openPalette({ kind: 'commands', query: '#' }),
  },
  {
    id: 'nextScene',
    scope: 'global',
    keybinding: 'Mod-Alt-ArrowDown',
    run: (ctx) => {
      const all = listVersionScenes(ctx.root);
      const next = all[all.findIndex((s) => s.id === ctx.sceneId) + 1];
      if (next) ctx.openScene(next.id);
    },
  },
  {
    id: 'previousScene',
    scope: 'global',
    keybinding: 'Mod-Alt-ArrowUp',
    run: (ctx) => {
      const all = listVersionScenes(ctx.root);
      const previous = all[all.findIndex((s) => s.id === ctx.sceneId) - 1];
      if (previous) ctx.openScene(previous.id);
    },
  },
  {
    id: 'newScene',
    scope: 'global',
    // ⌘N where the host allows it (desktop); a browser keeps ⌘N for itself.
    keybinding: ['Mod-n', 'Mod-Alt-n'],
    run: (ctx) => {
      const scene = currentScene(ctx);
      if (!scene) return;
      // Indexes among what the version shows (other versions' scenes may sit in between).
      const shown = readOutline(ctx.root).find((c) => c.id === scene.chapterId)?.scenes ?? [];
      const index = shown.findIndex((s) => s.id === scene.id);
      newSceneAfter(ctx, scene.chapterId, index + 1);
    },
  },
  {
    id: 'newChapter',
    scope: 'global',
    keybinding: 'Mod-Alt-Shift-n',
    run: (ctx) => {
      const scene = currentScene(ctx);
      const index = readOutline(ctx.root).findIndex((c) => c.id === scene?.chapterId);
      newChapterAt(ctx, index + 1);
    },
  },
  { id: 'renameScene', scope: 'global', run: (ctx) => promptRenameScene(ctx, ctx.sceneId) },
  {
    id: 'renameChapter',
    scope: 'global',
    run: (ctx) => {
      const scene = currentScene(ctx);
      if (scene) promptRenameChapter(ctx, scene.chapterId);
    },
  },
  {
    id: 'moveSceneUp',
    scope: 'global',
    keybinding: 'Mod-Alt-Shift-ArrowUp',
    run: (ctx) => void moveSceneStep(ctx.root, ctx.sceneId, -1),
  },
  {
    id: 'moveSceneDown',
    scope: 'global',
    keybinding: 'Mod-Alt-Shift-ArrowDown',
    run: (ctx) => void moveSceneStep(ctx.root, ctx.sceneId, 1),
  },
  {
    id: 'moveSceneToChapter',
    scope: 'global',
    isEnabled: (ctx) => listChapters(ctx.root).length > 1,
    run: (ctx) => {
      const scene = currentScene(ctx);
      if (!scene) return;
      ctx.openPalette({
        kind: 'pick',
        placeholder: ctx.t('palette.pickChapter'),
        items: readOutline(ctx.root)
          .filter((c) => c.id !== scene.chapterId)
          .map((c) => ({ id: c.id, label: c.title })),
        onPick: (chapterId) =>
          moveScene(ctx.root, scene.id, {
            chapterId,
            index: listScenes(ctx.root, chapterId).length,
          }),
      });
    },
  },
  {
    id: 'moveChapterUp',
    scope: 'global',
    run: (ctx) => {
      const scene = currentScene(ctx);
      if (scene) moveChapterStep(ctx.root, scene.chapterId, -1);
    },
  },
  {
    id: 'moveChapterDown',
    scope: 'global',
    run: (ctx) => {
      const scene = currentScene(ctx);
      if (scene) moveChapterStep(ctx.root, scene.chapterId, 1);
    },
  },
  {
    id: 'trashScene',
    scope: 'global',
    confirms: (ctx) =>
      sceneBigPiece(ctx, ctx.sceneId) === undefined ? undefined : trashArmId(ctx.sceneId),
    run: (ctx) => void askTrashScene(ctx, ctx.sceneId),
  },
  {
    id: 'trashChapter',
    scope: 'global',
    confirms: (ctx) => {
      const id = currentScene(ctx)?.chapterId;
      return id && chapterBigPiece(ctx, id) !== undefined ? trashArmId(id) : undefined;
    },
    run: (ctx) => {
      const scene = currentScene(ctx);
      if (scene) askTrashChapter(ctx, scene.chapterId);
    },
  },
  {
    id: 'restoreFromTrash',
    scope: 'global',
    run: (ctx) => {
      const trash = listTrash(ctx.root);
      const variants = trashedVariantItems(ctx);
      const entities = trashedEntityItems(ctx);
      const chapterTitle = (id: string) => listChapters(ctx.root).find((c) => c.id === id)?.title;
      ctx.openPalette({
        kind: 'pick',
        placeholder: ctx.t('palette.pickTrash'),
        empty: ctx.t('palette.emptyTrash'),
        items: [
          ...variants.map(({ id, label, detail }) => ({ id, label, detail })),
          ...entities.map(({ id, label, detail }) => ({ id, label, detail })),
          ...trash.scenes.map((s) => ({
            id: `scene:${s.id}`,
            label: s.title,
            detail: [ctx.t('palette.trashedScene'), chapterTitle(s.chapterId)]
              .filter(Boolean)
              .join(' · '),
          })),
          ...trash.chapters.map((c) => ({
            id: `chapter:${c.id}`,
            label: c.title,
            detail: ctx.t('palette.trashedChapter'),
          })),
          // A working version comes back with its own scenes and variants (DESIGN 1.20).
          ...listTrashedVersions(ctx.root).map((v) => ({
            id: `version:${v.id}`,
            label: v.name,
            detail: ctx.t('palette.trashedVersion'),
          })),
        ],
        onPick: (key) => {
          const [kind, id = ''] = key.split(/:(.*)/s);
          if (kind === 'variant') {
            variants.find((v) => v.id === key)?.restore();
          } else if (kind === 'entity') {
            entities.find((e) => e.id === key)?.restore();
          } else if (kind === 'version') {
            restoreVersion(ctx.root, id);
          } else if (kind === 'scene') {
            restoreSceneWithChapter(ctx.root, id);
            ctx.openScene(id);
          } else {
            restoreChapter(ctx.root, id);
          }
        },
      });
    },
  },
  // Bound by TipTap; listed here for the palette and conflict detection.
  {
    id: 'toggleItalic',
    scope: 'editor',
    keybinding: 'Mod-i',
    isEnabled: withEditor,
    run: (ctx) => void ctx.editor?.chain().focus().toggleItalic().run(),
  },
  {
    id: 'insertSceneBreak',
    scope: 'editor',
    keybinding: 'Mod-Shift-Enter',
    isEnabled: withEditor,
    run: (ctx) => void ctx.editor?.chain().focus().insertSceneBreak().run(),
  },
  {
    id: 'toggleBlockquote',
    scope: 'editor',
    keybinding: 'Mod-Shift-b',
    isEnabled: withEditor,
    run: (ctx) => void ctx.editor?.chain().focus().toggleBlockquote().run(),
  },
  {
    id: 'undo',
    scope: 'editor',
    keybinding: 'Mod-z',
    isEnabled: withEditor,
    // What just went to the trash comes back first (from the menu too); else the text's undo.
    run: (ctx) => {
      if (!ctx.undoOffered()) ctx.editor?.chain().focus().undo().run();
    },
  },
  {
    id: 'redo',
    scope: 'editor',
    keybinding: 'Mod-Shift-z',
    isEnabled: withEditor,
    run: (ctx) => void ctx.editor?.chain().focus().redo().run(),
  },
];

/**
 * The app's settings (phase 7.3): ⌘, where the host leaves it, ⌥⌘, in a
 * browser that opens its own settings with ⌘, (Dia, Chrome, 23 November 2026).
 */
export const openSettingsCommand: WorkspaceCommand = {
  id: 'openSettings',
  scope: 'global',
  keybinding: ['Mod-,', 'Mod-Alt-,'],
  run: (ctx) => (ctx.view === 'settings' ? ctx.openWriting() : ctx.openSettings()),
};

/** The core's commands, then those of the active features. */
export function createWorkspaceRegistry(
  primary: PrimaryModifier,
  reserved: readonly string[],
  features: readonly Feature[] = [],
) {
  const registry = new CommandRegistry<WorkspaceContext>(primary, reserved);
  for (const command of [
    ...workspaceCommands,
    ...variantCommands,
    ...versionCommands,
    ...writingCommands,
    ...atelierCommands,
    ...languageCommands,
    ...syncCommands,
    // The app's settings, everywhere (phase 7.3).
    openSettingsCommand,
    ...features.flatMap((f) => f.commands ?? []),
  ])
    registry.register(command);
  return registry;
}
