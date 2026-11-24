import {
  listScenes,
  moveChapterStep,
  moveScene,
  moveSceneStep,
  readProjectMeta,
  setActiveVariant,
  type OutlineChapter,
} from '@charpentier/schema';
import {
  newVariant,
  promptRenameVariant,
  trashVariantOfScene,
  variantLabel,
} from '../commands/variant-commands';
import {
  newChapterAt,
  newSceneAfter,
  promptRenameChapter,
  promptRenameScene,
  trashChapterAndMove,
  trashSceneAndMove,
} from '../commands/workspace-commands';
import {
  commandKey,
  NO_KEY,
  ownKey,
  type MenuEntry,
  type MenuKey,
  type ThingMenu,
} from '../menu/thing-menu';
import { variantLetter } from '../workspace/SceneChrome';
import { toRoman } from '../workspace/roman';
import type { WorkspaceContext } from '../workspace/workspace-context';

/**
 * The menus of the manuscript drawer's things (docs/DESIGN.md §4.7, the table
 * « Contenu, par chose »): a scene, a chapter, a variant of the open scene,
 * the manuscript itself. Each entry does what its key does in the drawer, by
 * the same functions; the key shown is the one that works there: the
 * drawer's own (`R`, `N`, `⌫`…), or a command's where the command does the
 * same thing to the same thing. An entry that is a command of the registry
 * runs through `ctx.runCommand` and names it (`command`).
 */

/** What the drawer lends to its menus. */
export interface DrawerHands {
  /** Gives the focus to a line of the drawer (the open scene's when the line is gone). */
  focus(id: string | undefined): void;
  /** Opens a scene as ⏎ does on its line. */
  open(sceneId: string): void;
}

/**
 * The drawer's own keys (those its key handler answers, `Navigator.tsx`), in
 * the registry's syntax: its menus show them and act on them while open.
 */
export const DRAWER_KEYS = {
  open: ['Enter'],
  rename: ['r', 'F2'],
  newScene: ['n'],
  newChapter: ['Shift-n'],
  variants: ['v'],
  moveUp: ['Alt-ArrowUp'],
  moveDown: ['Alt-ArrowDown'],
  trash: ['Backspace', 'Delete'],
  menu: ['m', 'Shift-F10'],
} as const satisfies Record<string, readonly [string, ...string[]]>;

type Ctx = WorkspaceContext;

function keysOf(ctx: Ctx) {
  const primary = ctx.platform.keybindings.primaryModifier;
  return {
    own: (name: keyof typeof DRAWER_KEYS): MenuKey => {
      const [first, ...also] = DRAWER_KEYS[name];
      return ownKey(primary, first, ...also);
    },
    /** A command's key, only where the command does this very thing (`same`). */
    command: (id: string, same = true): MenuKey =>
      same ? commandKey(ctx.shortcutLabel(id), ctx.shortcutChord(id)) : NO_KEY,
  };
}

const entry = (
  id: string,
  label: string,
  key: MenuKey,
  action: Pick<MenuEntry, 'run' | 'choices' | 'empty' | 'command'>,
  inert?: string | false,
): MenuEntry => ({ id, label, ...key, ...action, ...(inert && { disabled: inert }) });

/** The line that takes the focus when `id` leaves the drawer: the next one, else the previous. */
function neighbourOf(outline: readonly OutlineChapter[], id: string): string | undefined {
  const ids = outline.flatMap((c) => [c.id, ...c.scenes.map((s) => s.id)]);
  const index = ids.indexOf(id);
  return ids[index + 1] ?? ids[index - 1];
}

/** Why the Compagnon cannot be asked now, if so (the entry stays, inert, and says it). */
function compagnonAway(ctx: Ctx): string | undefined {
  const status = ctx.platform.agents.status();
  if (status === 'disabled') return ctx.t('mentor.unavailableOnHost');
  if (status === 'unconfigured') return ctx.t('mentor.blocked.unconfigured.lead');
  if (status === 'locked') return ctx.t('mentor.status.locked');
  // Offline too (DESIGN 1.41): the four states of 1.32, each said in the tooltip.
  if (status === 'offline') return ctx.t('thingMenu.inert.compagnonOffline');
  return undefined;
}

export function sceneMenu(ctx: Ctx, sceneId: string, hands: DrawerHands): ThingMenu | null {
  const { t, outline, root } = ctx;
  const chapterIndex = outline.findIndex((c) => c.scenes.some((s) => s.id === sceneId));
  const chapter = outline[chapterIndex];
  const index = chapter?.scenes.findIndex((s) => s.id === sceneId) ?? -1;
  const scene = chapter?.scenes[index];
  if (!chapter || !scene) return null;
  const key = keysOf(ctx);
  // A command acts on the open scene: its key is this entry's only for that scene.
  const isOpen = sceneId === ctx.sceneId;
  const first = chapterIndex === 0 && index === 0;
  const last = chapterIndex === outline.length - 1 && index === chapter.scenes.length - 1;
  return {
    head: { kind: t('thingMenu.kind.scene'), name: scene.title },
    groups: [
      {
        id: 'scene',
        entries: [
          entry('open', t('thingMenu.entry.open'), key.own('open'), {
            run: () => hands.open(sceneId),
          }),
          entry('rename', t('thingMenu.entry.rename'), key.own('rename'), {
            run: () => promptRenameScene(ctx, sceneId),
          }),
        ],
      },
      {
        id: 'new',
        entries: [
          entry('newSceneAfter', t('thingMenu.entry.newSceneAfter'), key.own('newScene'), {
            run: () => hands.focus(newSceneAfter(ctx, chapter.id, index + 1)),
          }),
          entry(
            'newVariant',
            t('thingMenu.entry.newVariantCopy'),
            key.command('newVariant', isOpen),
            {
              command: 'newVariant',
              run: () => ctx.runOnScene(sceneId, 'newVariant'),
            },
          ),
          // Two variants or more: the list takes the sheet's place, as `V` asks in the drawer.
          ...(scene.variants.length > 1
            ? [
                entry(
                  'switchVariant',
                  t('thingMenu.entry.switchVariant'),
                  isOpen && ctx.shortcutChord('switchVariant')
                    ? {
                        shortcut: ctx.shortcutLabel('switchVariant'),
                        keys: [...key.command('switchVariant').keys, ...key.own('variants').keys],
                      }
                    : key.own('variants'),
                  {
                    choices: scene.variants.map((v, i) => ({
                      id: v.id,
                      label: `${variantLetter(i)} · ${variantLabel(t, scene, v.id)}`,
                      detail:
                        v.id === scene.activeVariantId ? t('navigator.activeVariant') : undefined,
                      run: () => {
                        setActiveVariant(root, scene.id, v.id);
                        ctx.openScene(scene.id);
                      },
                    })),
                  },
                ),
              ]
            : []),
          entry(
            'createCheckpoint',
            t('thingMenu.entry.createCheckpoint'),
            key.command('createCheckpoint', isOpen),
            { command: 'createCheckpoint', run: () => ctx.runOnScene(sceneId, 'createCheckpoint') },
          ),
        ],
      },
      {
        id: 'move',
        entries: [
          entry(
            'moveUp',
            t('thingMenu.entry.moveUp'),
            key.own('moveUp'),
            {
              run: () => {
                moveSceneStep(root, sceneId, -1);
                hands.focus(sceneId);
              },
            },
            first && t('thingMenu.inert.firstScene'),
          ),
          entry(
            'moveDown',
            t('thingMenu.entry.moveDown'),
            key.own('moveDown'),
            {
              run: () => {
                moveSceneStep(root, sceneId, 1);
                hands.focus(sceneId);
              },
            },
            last && t('thingMenu.inert.lastScene'),
          ),
          entry(
            'moveToChapter',
            t('thingMenu.entry.moveToChapter'),
            NO_KEY,
            {
              empty: t('thingMenu.noChapterNamed'),
              choices: outline
                .map((c, i) => ({ c, i }))
                .filter(({ c }) => c.id !== chapter.id)
                .map(({ c, i }) => ({
                  id: c.id,
                  label: `${toRoman(i + 1)} · ${c.title}`,
                  run: () => {
                    // At the end of the chapter, as « Déplacer la scène vers le chapitre… » does.
                    moveScene(root, sceneId, {
                      chapterId: c.id,
                      index: listScenes(root, c.id).length,
                    });
                    hands.focus(sceneId);
                  },
                })),
            },
            outline.length < 2 && t('thingMenu.inert.onlyChapter'),
          ),
        ],
      },
      {
        id: 'trash',
        entries: [
          entry('trash', t('thingMenu.entry.trash'), key.own('trash'), {
            run: () => {
              const next = neighbourOf(outline, sceneId);
              trashSceneAndMove(ctx, sceneId);
              hands.focus(next);
            },
          }),
        ],
      },
    ],
  };
}

export function chapterMenu(ctx: Ctx, chapterId: string, hands: DrawerHands): ThingMenu | null {
  const { t, outline, root } = ctx;
  const index = outline.findIndex((c) => c.id === chapterId);
  const chapter = outline[index];
  if (!chapter) return null;
  const key = keysOf(ctx);
  const away = compagnonAway(ctx);
  return {
    head: { kind: t('thingMenu.kind.chapter'), name: chapter.title },
    groups: [
      {
        id: 'chapter',
        entries: [
          entry('rename', t('thingMenu.entry.rename'), key.own('rename'), {
            run: () => promptRenameChapter(ctx, chapterId),
          }),
        ],
      },
      {
        id: 'new',
        entries: [
          entry('newSceneInChapter', t('thingMenu.entry.newSceneInChapter'), key.own('newScene'), {
            run: () => hands.focus(newSceneAfter(ctx, chapterId, chapter.scenes.length)),
          }),
          entry('newChapterAfter', t('thingMenu.entry.newChapterAfter'), key.own('newChapter'), {
            run: () => hands.focus(newChapterAt(ctx, index + 1).sceneId),
          }),
        ],
      },
      {
        id: 'move',
        entries: [
          entry(
            'moveUp',
            t('thingMenu.entry.moveUp'),
            key.own('moveUp'),
            {
              run: () => {
                moveChapterStep(root, chapterId, -1);
                hands.focus(chapterId);
              },
            },
            index === 0 && t('thingMenu.inert.firstChapter'),
          ),
          entry(
            'moveDown',
            t('thingMenu.entry.moveDown'),
            key.own('moveDown'),
            {
              run: () => {
                moveChapterStep(root, chapterId, 1);
                hands.focus(chapterId);
              },
            },
            index === outline.length - 1 && t('thingMenu.inert.lastChapter'),
          ),
        ],
      },
      {
        id: 'compagnon',
        title: t('thingMenu.compagnon'),
        entries: [
          entry(
            'analyzeChapter',
            t('thingMenu.entry.analyzeChapter'),
            NO_KEY,
            {
              run: () => {
                ctx.notify(t('mentor.analysing'));
                ctx.analyze(
                  chapter.scenes.map((s) => s.id),
                  false,
                );
              },
            },
            away,
          ),
          entry(
            'reviewChapter',
            t('thingMenu.entry.reviewChapter'),
            NO_KEY,
            {
              run: () => {
                ctx.notify(t('mentor.reviewing'));
                ctx.reviewChapter(chapterId, false);
              },
            },
            away,
          ),
        ],
      },
      {
        id: 'trash',
        entries: [
          entry('trash', t('thingMenu.entry.trash'), key.own('trash'), {
            run: () => {
              const next = neighbourOf(outline, chapterId);
              trashChapterAndMove(ctx, chapterId);
              hands.focus(next);
            },
          }),
        ],
      },
    ],
  };
}

/** A variant of the open scene (its lines show under that scene only). */
export function variantMenu(ctx: Ctx, variantId: string, hands: DrawerHands): ThingMenu | null {
  const { t, root } = ctx;
  const scene = ctx.outline.flatMap((c) => c.scenes).find((s) => s.id === ctx.sceneId);
  if (!scene?.variants.some((v) => v.id === variantId)) return null;
  const key = keysOf(ctx);
  const active = variantId === scene.activeVariantId;
  return {
    head: { kind: t('thingMenu.kind.variant'), name: variantLabel(t, scene, variantId) },
    groups: [
      {
        id: 'variant',
        entries: [
          ...(active
            ? []
            : [
                entry('read', t('thingMenu.entry.readVariant'), key.own('open'), {
                  run: () => setActiveVariant(root, scene.id, variantId),
                }),
              ]),
          entry('rename', t('thingMenu.entry.rename'), key.own('rename'), {
            run: () => promptRenameVariant(ctx, variantId),
          }),
        ],
      },
      {
        id: 'new',
        entries: [
          // The command copies the active variant: its key is this entry's for that one only.
          entry(
            'newVariantFrom',
            t('thingMenu.entry.newVariantFrom'),
            key.command('newVariant', active),
            active
              ? { command: 'newVariant', run: () => void ctx.runCommand('newVariant') }
              : { run: () => newVariant(ctx, true, variantId) },
          ),
        ],
      },
      {
        id: 'trash',
        entries: [
          entry(
            'trash',
            t('thingMenu.entry.trash'),
            key.own('trash'),
            {
              run: () => {
                trashVariantOfScene(ctx, variantId);
                hands.focus(scene.id);
              },
            },
            scene.variants.length < 2 && t('thingMenu.inert.onlyVariant'),
          ),
        ],
      },
    ],
  };
}

/**
 * The manuscript itself, from the drawer's title. « Nouveau chapitre » does
 * what ⇧N does in the drawer: after the chapter of the line that has the
 * focus there (`focusedId`), the open scene's by default.
 */
export function manuscriptMenu(ctx: Ctx, focusedId: string, hands: DrawerHands): ThingMenu {
  const { t, outline } = ctx;
  const key = keysOf(ctx);
  const chapterOf = (id: string) =>
    outline.findIndex((c) => c.id === id || c.scenes.some((s) => s.id === id));
  const focused = chapterOf(focusedId);
  const index = focused >= 0 ? focused : chapterOf(ctx.sceneId);
  return {
    head: { kind: t('thingMenu.kind.manuscript'), name: readProjectMeta(ctx.root)?.title ?? '' },
    groups: [
      {
        id: 'new',
        entries: [
          entry('newChapter', t('thingMenu.entry.newChapter'), key.own('newChapter'), {
            run: () => hands.focus(newChapterAt(ctx, index + 1).sceneId),
          }),
        ],
      },
      {
        id: 'compagnon',
        title: t('thingMenu.compagnon'),
        entries: [
          entry(
            'analyzeManuscript',
            t('thingMenu.entry.analyzeManuscript'),
            NO_KEY,
            { command: 'analyzeManuscript', run: () => void ctx.runCommand('analyzeManuscript') },
            compagnonAway(ctx),
          ),
        ],
      },
    ],
  };
}
