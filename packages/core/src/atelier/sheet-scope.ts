import type { PaletteScope } from '../palette/palette-request';
import type { WorkspaceContext } from '../workspace/workspace-context';
import { readAtelier, shownValue } from './atelier-data';
import { moduleDefs, type AtelierModule } from './module-defs';

/** `@` in the command line: every sheet of the project, opened in the Atelier. */
export function sheetScope(ctx: WorkspaceContext): PaletteScope {
  const data = readAtelier(ctx.root);
  const railOf: Record<string, AtelierModule> = {
    characters: 'characters',
    acts: 'structure',
    arcs: 'structure',
    worldRules: 'worldRules',
    clues: 'clues',
  };
  const items = [
    {
      id: 'meta:',
      label: data.project?.title ?? ctx.t('atelier.modules.meta'),
      detail: ctx.t('atelier.modules.meta'),
    },
    ...(['characters', 'acts', 'arcs', 'worldRules', 'clues'] as const).flatMap((module) => {
      const def = moduleDefs[module];
      if (def.kind !== 'entity') return [];
      return data.entities[module].map((entity) => {
        const title = shownValue(
          entity.fields[def.titleField] ?? { status: undefined, rejected: [] },
        );
        return {
          id: `${module}:${entity.id}`,
          label: typeof title === 'string' && title ? title : ctx.t(`atelier.untitled.${module}`),
          detail: `${ctx.t(`atelier.kind.${module}`)} · ${ctx.t(`atelier.entityStatus.${entity.status}`)}`,
        };
      });
    }),
  ];
  return {
    label: ctx.t('palette.sheetsGroup'),
    items,
    onPick: (key) => {
      const [module = '', entityId = ''] = key.split(':');
      if (module === 'meta') ctx.openAtelier({ rail: 'meta', target: { module: 'meta' } });
      else {
        const rail = railOf[module];
        if (rail)
          ctx.openAtelier({
            rail,
            target: { module: module as keyof typeof moduleDefs, entityId },
          });
      }
    },
  };
}
