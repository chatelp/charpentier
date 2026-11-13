import type { EntityModule } from '@charpentier/schema';
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
};

const NEW_COMMANDS: Record<EntityModule, CommandId> = {
  characters: 'newCharacter',
  acts: 'newAct',
  arcs: 'newArc',
  worldRules: 'newWorldRule',
  clues: 'newClue',
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
