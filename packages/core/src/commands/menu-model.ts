import type { MenuEntry, MenuModel, MenuRole } from '@charpentier/platform';
import type { TFunction } from 'i18next';
import type { CommandRegistry } from './registry';

type Item = string | `role:${MenuRole}` | '-';

/**
 * The application menu (docs/DESIGN.md §4.8, mockup's menu bar): every
 * command of the registry once, with its shortcut, plus what the host's
 * system does itself (clipboard, window, application).
 */
export const MENU_LAYOUT: readonly { readonly menu: string; readonly items: readonly Item[] }[] = [
  { menu: 'app', items: ['role:about', '-', 'role:hide', 'role:hideOthers', '-', 'role:quit'] },
  {
    menu: 'file',
    items: [
      'openLibrary',
      'newProject',
      'renameProject',
      'chooseLibraryFolder',
      'revealLibraryFolder',
      '-',
      'createCheckpoint',
      'createNamedCheckpoint',
      'restoreCheckpoint',
    ],
  },
  {
    menu: 'edit',
    items: [
      'undo',
      'redo',
      '-',
      'role:cut',
      'role:copy',
      'role:paste',
      'role:selectAll',
      '-',
      'toggleItalic',
      'toggleBlockquote',
      'insertSceneBreak',
      '-',
      'fixAllTypography',
      'fixAllSpelling',
    ],
  },
  {
    menu: 'scene',
    items: [
      'renameScene',
      '-',
      'newVariant',
      'newEmptyVariant',
      'switchVariant',
      'renameVariant',
      'trashVariant',
      '-',
      'variantFromCheckpoint',
      '-',
      'nextScene',
      'previousScene',
    ],
  },
  {
    menu: 'manuscript',
    items: [
      'toggleNavigator',
      'toggleOverview',
      'goToScene',
      '-',
      'newScene',
      'newChapter',
      'renameChapter',
      '-',
      'moveSceneUp',
      'moveSceneDown',
      'moveSceneToChapter',
      'moveChapterUp',
      'moveChapterDown',
      '-',
      'trashScene',
      'trashChapter',
      'restoreFromTrash',
    ],
  },
  {
    menu: 'atelier',
    items: [
      'toggleAtelier',
      '-',
      'atelierMeta',
      'atelierCharacters',
      'atelierStructure',
      'atelierWorldRules',
      'atelierClues',
      '-',
      'newCharacter',
      'newAct',
      'newArc',
      'newWorldRule',
      'newClue',
    ],
  },
  {
    menu: 'compagnon',
    items: [
      'toggleMentorPanel',
      'talkToMentor',
      '-',
      'analyzeScene',
      'analyzeChapter',
      'reviewChapter',
      'analyzeManuscript',
      '-',
      'nextRemark',
      'passageAction',
      '-',
      'moreHelp',
      'lessHelp',
      '-',
      'setApiKey',
      'forgetApiKey',
      'toggleLightModel',
    ],
  },
  {
    menu: 'view',
    items: [
      'increaseTextSize',
      'decreaseTextSize',
      'resetTextSize',
      '-',
      'widenColumn',
      'narrowColumn',
      '-',
      'toggleFocusMode',
      'toggleTypewriter',
      'cycleTheme',
      'toggleReducedMotion',
      '-',
      'role:togglefullscreen',
    ],
  },
  { menu: 'window', items: ['role:minimize', 'role:zoom', '-', 'role:close'] },
  { menu: 'help', items: ['openPalette', 'replayTour'] },
];

/** The menu model the host draws, labels and shortcuts from the registry. */
export function buildMenuModel<Ctx>(registry: CommandRegistry<Ctx>, t: TFunction): MenuModel {
  const entry = (item: Item): MenuEntry => {
    if (item === '-') return { kind: 'separator' };
    if (item.startsWith('role:')) {
      const role = item.slice(5) as MenuRole;
      return { kind: 'role', role, label: t(`menu.roles.${role}` as 'menu.roles.about') };
    }
    const shortcut = registry.chord(item);
    return {
      kind: 'command',
      id: item,
      // The command line is, in the Help menu, the beginner's question.
      label:
        item === 'openPalette'
          ? t('menu.whatToDo')
          : t(`commands.${item}` as 'commands.openPalette'),
      ...(shortcut && { shortcut }),
    };
  };
  return {
    menus: MENU_LAYOUT.map(({ menu, items }) => ({
      label: t(`menu.${menu}` as 'menu.app'),
      entries: items.map(entry),
    })),
  };
}
