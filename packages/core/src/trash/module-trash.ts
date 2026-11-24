import { listTrashedEntities, restoreEntity, type EntityModule } from '@charpentier/schema';
import { RAIL_SOURCES } from '../atelier/atelier-data';
import { moduleDefs, type AtelierModule } from '../atelier/module-defs';
import { formatWhen } from '../work/work-format';
import type { WorkspaceContext } from '../workspace/workspace-context';
import type { TrashLine } from './TrashFoot';

/** An entry in the trash, and where it is once back. */
export interface EntryTrashLine extends TrashLine {
  readonly target: { readonly module: EntityModule; readonly entityId: string };
}

/**
 * The trash of a module's list in the Atelier (docs/DESIGN.md §4.7): its entries, the most
 * recent first. An entry comes back into its module with its statuses.
 */
export function moduleTrash(ctx: WorkspaceContext, rail: AtelierModule): EntryTrashLine[] {
  const { t, root } = ctx;
  return RAIL_SOURCES[rail]
    .flatMap((source) => {
      const def = moduleDefs[source];
      if (def.kind !== 'entity') return [];
      const module = source as EntityModule;
      return listTrashedEntities(root, module).map((entity) => {
        const field = entity.fields[def.titleField];
        const title = field?.value ?? field?.proposal?.value;
        const name = typeof title === 'string' && title ? title : t(`atelier.untitled.${module}`);
        return {
          id: `entity:${module}:${entity.id}`,
          name,
          trashedAt: entity.trashedAt,
          detail: t('trash.detail.entity', {
            module: t(`atelier.modules.${rail}`),
            when: formatWhen(t, entity.trashedAt, ctx.language),
          }),
          target: { module, entityId: entity.id },
          restore: () => {
            restoreEntity(root, module, entity.id);
            ctx.notify(t('trash.restored.entity', { title: name }));
          },
        };
      });
    })
    .sort((a, b) => (a.trashedAt < b.trashedAt ? 1 : a.trashedAt > b.trashedAt ? -1 : 0));
}
