import {
  createChapter,
  createScene,
  getScene,
  listAllScenes,
  listChapters,
  listScenes,
  listTrash,
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
import { ensureScene } from '../workspace/default-scene';
import type { CommandId } from './command-id';
import type { PrimaryModifier } from './keybinding';
import { trashedVariantItems, variantCommands } from './variant-commands';
import { writingCommands } from './writing-commands';
import { CommandRegistry, type Command } from './registry';

export type { CommandId } from './command-id';

type WorkspaceCommand = Command<WorkspaceContext> & { readonly id: CommandId };

const currentScene = (ctx: WorkspaceContext) => getScene(ctx.root, ctx.sceneId);

/** Opens the scene that follows (or precedes) `sceneId`, before it disappears. */
function neighbourOf(ctx: WorkspaceContext, sceneIds: ReadonlySet<string>): string | undefined {
  const all = listAllScenes(ctx.root);
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

export function trashSceneAndMove(ctx: WorkspaceContext, sceneId: string): void {
  const next = neighbourOf(ctx, new Set([sceneId]));
  trashScene(ctx.root, sceneId);
  if (sceneId === ctx.sceneId) ctx.openScene(next ?? ensureScene(ctx.root, defaultTitles(ctx)));
}

export function trashChapterAndMove(ctx: WorkspaceContext, chapterId: string): void {
  const inside = new Set(listScenes(ctx.root, chapterId).map((s) => s.id));
  const next = neighbourOf(ctx, inside);
  trashChapter(ctx.root, chapterId);
  if (inside.has(ctx.sceneId) || !next)
    ctx.openScene(next ?? ensureScene(ctx.root, defaultTitles(ctx)));
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
    id: 'toggleNavigator',
    scope: 'global',
    keybinding: 'Mod-j',
    run: (ctx) => ctx.toggleNavigator(),
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
      const all = listAllScenes(ctx.root);
      const next = all[all.findIndex((s) => s.id === ctx.sceneId) + 1];
      if (next) ctx.openScene(next.id);
    },
  },
  {
    id: 'previousScene',
    scope: 'global',
    keybinding: 'Mod-Alt-ArrowUp',
    run: (ctx) => {
      const all = listAllScenes(ctx.root);
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
      const index = listScenes(ctx.root, scene.chapterId).findIndex((s) => s.id === scene.id);
      newSceneAfter(ctx, scene.chapterId, index + 1);
    },
  },
  {
    id: 'newChapter',
    scope: 'global',
    keybinding: 'Mod-Alt-Shift-n',
    run: (ctx) => {
      const scene = currentScene(ctx);
      const index = listChapters(ctx.root).findIndex((c) => c.id === scene?.chapterId);
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
        items: listChapters(ctx.root)
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
  { id: 'trashScene', scope: 'global', run: (ctx) => trashSceneAndMove(ctx, ctx.sceneId) },
  {
    id: 'trashChapter',
    scope: 'global',
    run: (ctx) => {
      const scene = currentScene(ctx);
      if (scene) trashChapterAndMove(ctx, scene.chapterId);
    },
  },
  {
    id: 'restoreFromTrash',
    scope: 'global',
    run: (ctx) => {
      const trash = listTrash(ctx.root);
      const variants = trashedVariantItems(ctx);
      const chapterTitle = (id: string) => listChapters(ctx.root).find((c) => c.id === id)?.title;
      ctx.openPalette({
        kind: 'pick',
        placeholder: ctx.t('palette.pickTrash'),
        empty: ctx.t('palette.emptyTrash'),
        items: [
          ...variants.map(({ id, label, detail }) => ({ id, label, detail })),
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
        ],
        onPick: (key) => {
          const [kind, id = ''] = key.split(/:(.*)/s);
          if (kind === 'variant') {
            variants.find((v) => v.id === key)?.restore();
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
    run: (ctx) => void ctx.editor?.chain().focus().undo().run(),
  },
  {
    id: 'redo',
    scope: 'editor',
    keybinding: 'Mod-Shift-z',
    isEnabled: withEditor,
    run: (ctx) => void ctx.editor?.chain().focus().redo().run(),
  },
];

export function createWorkspaceRegistry(primary: PrimaryModifier, reserved: readonly string[]) {
  const registry = new CommandRegistry<WorkspaceContext>(primary, reserved);
  for (const command of [...workspaceCommands, ...variantCommands, ...writingCommands])
    registry.register(command);
  return registry;
}
