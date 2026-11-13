import { nextTheme, stepMeasure, stepTextSize } from '../workspace/writing-prefs';
import type { WorkspaceContext } from '../workspace/workspace-context';
import type { CommandId } from './command-id';
import type { Command } from './registry';

type WritingCommand = Command<WorkspaceContext> & { readonly id: CommandId };

/** Reading comfort: text size, column width, focus, theme (docs/DESIGN.md §5.3, §5.5). */
export const writingCommands: readonly WritingCommand[] = [
  {
    id: 'increaseTextSize',
    scope: 'global',
    // ⌘+ is ⌘= or ⌘⇧= depending on the keyboard layout.
    keybinding: ['Mod-+', 'Mod-Shift-+', 'Mod-=', 'Mod-Shift-='],
    run: (ctx) => ctx.updatePrefs((p) => stepTextSize(p, 1)),
  },
  {
    id: 'decreaseTextSize',
    scope: 'global',
    keybinding: ['Mod--'],
    run: (ctx) => ctx.updatePrefs((p) => stepTextSize(p, -1)),
  },
  {
    id: 'resetTextSize',
    scope: 'global',
    keybinding: ['Mod-0'],
    run: (ctx) => ctx.updatePrefs((p) => stepTextSize(p, 0)),
  },
  {
    id: 'widenColumn',
    scope: 'global',
    keybinding: ['Mod-Alt-ArrowRight'],
    run: (ctx) => ctx.updatePrefs((p) => stepMeasure(p, 1)),
  },
  {
    id: 'narrowColumn',
    scope: 'global',
    keybinding: ['Mod-Alt-ArrowLeft'],
    run: (ctx) => ctx.updatePrefs((p) => stepMeasure(p, -1)),
  },
  {
    id: 'toggleFocusMode',
    scope: 'global',
    keybinding: ['Mod-Shift-f'],
    run: (ctx) => ctx.updatePrefs((p) => ({ focusMode: !p.focusMode })),
  },
  {
    id: 'toggleTypewriter',
    scope: 'global',
    run: (ctx) => ctx.updatePrefs((p) => ({ typewriter: !p.typewriter })),
  },
  {
    id: 'cycleTheme',
    scope: 'global',
    keybinding: ['Mod-Alt-t'],
    run: (ctx) => {
      const theme = nextTheme(ctx.prefs.theme);
      ctx.updatePrefs({ theme });
      ctx.notify(ctx.t(`status.theme.${theme}`));
    },
  },
  {
    id: 'toggleReducedMotion',
    scope: 'global',
    run: (ctx) => {
      const reducedMotion = !ctx.prefs.reducedMotion;
      ctx.updatePrefs({ reducedMotion });
      ctx.notify(ctx.t(reducedMotion ? 'status.motionReduced' : 'status.motionNormal'));
    },
  },
  {
    id: 'toggleUiSounds',
    scope: 'global',
    run: (ctx) => {
      const uiSounds = !ctx.prefs.uiSounds;
      ctx.updatePrefs({ uiSounds });
      ctx.notify(ctx.t(uiSounds ? 'status.uiSoundsOn' : 'status.uiSoundsOff'));
    },
  },
  {
    id: 'toggleTypingSounds',
    scope: 'global',
    run: (ctx) => {
      const typingSounds = !ctx.prefs.typingSounds;
      ctx.updatePrefs({ typingSounds });
      ctx.notify(ctx.t(typingSounds ? 'status.typingSoundsOn' : 'status.typingSoundsOff'));
    },
  },
];
