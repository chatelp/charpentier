import { interviewSections, type EntityModule } from '@charpentier/schema';
import { askInterview } from '../atelier/interview-requests';
import { createEntityPrompt } from '../atelier/atelier-actions';
import { ATELIER_MODULES, type AtelierModule } from '../atelier/module-defs';
import type { WorkspaceContext } from '../workspace/workspace-context';
import type { CommandId } from './command-id';
import type { Command } from './registry';

type AtelierCommand = Command<WorkspaceContext> & { readonly id: CommandId };

const RAIL_COMMANDS: Record<AtelierModule, CommandId> = {
  meta: 'atelierMeta',
  characters: 'atelierCharacters',
  structure: 'atelierStructure',
  worldRules: 'atelierWorldRules',
  clues: 'atelierClues',
  style: 'atelierStyle',
};

const NEW_COMMANDS: Record<EntityModule, CommandId> = {
  characters: 'newCharacter',
  acts: 'newAct',
  arcs: 'newArc',
  worldRules: 'newWorldRule',
  clues: 'newClue',
  style: 'newStyleChoice',
};

const railOf = (module: EntityModule): AtelierModule =>
  module === 'acts' || module === 'arcs' ? 'structure' : module;

/** Writing ↔ Atelier, its modules (⌘1…5, ⌥⌘1…5 where a browser keeps ⌘1…9), new entries. */
export const atelierCommands: readonly AtelierCommand[] = [
  {
    id: 'toggleAtelier',
    scope: 'global',
    keybinding: 'Mod-e',
    run: (ctx) => (ctx.view === 'atelier' ? ctx.openWriting() : ctx.openAtelier()),
  },
  {
    // ⇧X in the Atelier and the sheet beside the text (handled there: a capital X is text elsewhere).
    id: 'toggleRejected',
    scope: 'global',
    run: (ctx) => ctx.updatePrefs((p) => ({ showRejected: !p.showRejected })),
  },
  {
    // The interview with the Compagnon heads the rail (D-26).
    id: 'atelierInterview',
    scope: 'global',
    keybinding: 'Mod-0',
    run: (ctx) => ctx.openAtelier({ rail: 'interview' }),
  },
  {
    // The Compagnon's notebook, under the interview; numbered after the modules so ⌘1…6 stay (phase 6.5).
    id: 'atelierNotebook',
    scope: 'global',
    keybinding: ['Mod-7', 'Mod-Alt-7'],
    run: (ctx) => ctx.openAtelier({ rail: 'notebook' }),
  },
  {
    id: 'toggleInterviewMode',
    scope: 'global',
    keybinding: 'Mod-Shift-m',
    run: (ctx) => {
      ctx.updatePrefs((p) => ({ interviewGuided: !p.interviewGuided }));
      ctx.openAtelier({ rail: 'interview' });
    },
  },
  {
    // « Autre section… »: the guided interview goes on with the section chosen.
    id: 'interviewOtherSection',
    scope: 'global',
    keybinding: 'Mod-Shift-s',
    isEnabled: (ctx) => ctx.platform.agents.status() !== 'disabled',
    run: (ctx) =>
      ctx.openPalette({
        kind: 'pick',
        placeholder: ctx.t('interview.pickSection'),
        items: interviewSections.map((section) => ({
          id: section,
          label: ctx.t(`atelier.modules.${section}`),
        })),
        onPick: (section) => {
          ctx.updatePrefs({ interviewGuided: true });
          ctx.openAtelier({ rail: 'interview' });
          void askInterview(ctx, {
            mode: 'guided',
            section: section as (typeof interviewSections)[number],
          });
        },
      }),
  },
  ...ATELIER_MODULES.map((rail, i): AtelierCommand => ({
    id: RAIL_COMMANDS[rail],
    scope: 'global',
    keybinding: [`Mod-${i + 1}`, `Mod-Alt-${i + 1}`],
    run: (ctx) => ctx.openAtelier({ rail }),
  })),
  ...(Object.keys(NEW_COMMANDS) as EntityModule[]).map((module): AtelierCommand => ({
    id: NEW_COMMANDS[module],
    scope: 'global',
    run: (ctx) =>
      createEntityPrompt(ctx, module, (entityId) =>
        ctx.openAtelier({ rail: railOf(module), target: { module, entityId } }),
      ),
  })),
];
