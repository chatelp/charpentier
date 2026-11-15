import type { MenuEntry, MenuModel, MenuRole } from '@charpentier/platform';
import type { TFunction } from 'i18next';
import type { Feature } from '../features/feature';
import type { CommandRegistry } from './registry';

type Item = string | `role:${MenuRole}` | '-';

/**
 * The application menu (docs/DESIGN.md §4.8, mockup's menu bar): every
 * command of the registry once, with its shortcut, plus what the host's
 * system does itself (clipboard, window, application).
 */
export const MENU_LAYOUT: readonly { readonly menu: string; readonly items: readonly Item[] }[] = [
  {
    menu: 'app',
    items: [
      'role:about',
      '-',
      'openSettings',
      '-',
      'role:hide',
      'role:hideOthers',
      '-',
      'role:quit',
    ],
  },
  {
    menu: 'file',
    items: [
      'openLibrary',
      'newProject',
      'renameProject',
      'chooseLibraryFolder',
      'revealLibraryFolder',
      '-',
      'syncSignIn',
      'syncDevices',
      'syncSignOut',
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
      'atelierInterview',
      'toggleInterviewMode',
      'interviewOtherSection',
      '-',
      'atelierMeta',
      'atelierCharacters',
      'atelierStructure',
      'atelierWorldRules',
      'atelierClues',
      '-',
      'toggleRejected',
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
      'checkStructure',
      'trackClues',
      'characterReport',
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
      'toggleUiSounds',
      'toggleTypingSounds',
      '-',
      'role:togglefullscreen',
    ],
  },
  { menu: 'window', items: ['role:minimize', 'role:zoom', '-', 'role:close'] },
  { menu: 'help', items: ['openPalette', 'replayTour'] },
];

/**
 * The menu model the host draws, labels and shortcuts from the registry. The
 * features' commands join the menus they name; a command the registry does
 * not hold (the settings without a section) is left out.
 */
export function buildMenuModel<Ctx>(
  registry: CommandRegistry<Ctx>,
  t: TFunction,
  /** Commands shown as ticked settings (Présentation › sounds…). */
  checked: Readonly<Record<string, boolean>> = {},
  features: readonly Feature[] = [],
): MenuModel {
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
      ...(item in checked && { checked: checked[item] ?? false }),
    };
  };
  const layout: { menu: string; label: string; items: Item[] }[] = MENU_LAYOUT.map((m) => ({
    menu: m.menu,
    label: t(`menu.${m.menu}` as 'menu.app'),
    items: [...m.items],
  }));
  for (const contribution of features.flatMap((f) => f.menu ?? [])) {
    const items = contribution.items as readonly Item[];
    const existing = layout.find((m) => m.menu === contribution.menu);
    if (existing) existing.items.push('-', ...items);
    else
      layout.splice(
        layout.findIndex((m) => m.menu === 'window'),
        0,
        {
          menu: contribution.menu,
          label: contribution.label
            ? (t as unknown as (key: string) => string)(contribution.label)
            : contribution.menu,
          items: [...items],
        },
      );
  }
  const known = new Set(registry.ids());
  return {
    menus: layout.map(({ label, items }) => ({
      label,
      entries: withoutStraySeparators(
        items.filter((item) => item === '-' || item.startsWith('role:') || known.has(item)),
      ).map(entry),
    })),
  };
}

/** No separator first, last, or next to another one. */
function withoutStraySeparators(items: readonly Item[]): Item[] {
  const kept: Item[] = [];
  for (const item of items)
    if (item !== '-' || (kept.length > 0 && kept.at(-1) !== '-')) kept.push(item);
  if (kept.at(-1) === '-') kept.pop();
  return kept;
}
