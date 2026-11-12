import {
  createEntity,
  listTrashedEntities,
  restoreEntity,
  trashEntity,
  type EntityModule,
} from '@charpentier/schema';
import type { WorkspaceContext } from '../workspace/workspace-context';
import { moduleDefs } from './module-defs';

/** Asks for the new entry's name (or title), creates it and hands back its id. */
export function createEntityPrompt(
  ctx: WorkspaceContext,
  module: EntityModule,
  onCreated: (entityId: string) => void,
): void {
  const def = moduleDefs[module];
  if (def.kind !== 'entity') return;
  ctx.openPalette({
    kind: 'input',
    placeholder: ctx.t(`atelier.newPrompt.${module}`),
    initial: '',
    onSubmit: (value) => {
      const title = value.trim();
      const id = createEntity(ctx.root, module, title ? { [def.titleField]: title } : {});
      onCreated(id);
    },
  });
}

export function trashEntityAndNotify(
  ctx: WorkspaceContext,
  module: EntityModule,
  entityId: string,
  title: string,
): void {
  trashEntity(ctx.root, module, entityId);
  ctx.notify(ctx.t('status.entityTrashed', { title }));
}

/** Items of the « Restaurer depuis la corbeille… » list for the Atelier's entries. */
export function trashedEntityItems(ctx: WorkspaceContext) {
  return (['characters', 'acts', 'arcs', 'worldRules', 'clues'] as const).flatMap((module) => {
    const def = moduleDefs[module];
    const titleField = def.kind === 'entity' ? def.titleField : 'title';
    return listTrashedEntities(ctx.root, module).map((entity) => {
      const field = entity.fields[titleField];
      const title = field?.value ?? field?.proposal?.value;
      return {
        id: `entity:${module}:${entity.id}`,
        label: typeof title === 'string' && title ? title : ctx.t(`atelier.untitled.${module}`),
        detail: ctx.t(`atelier.trashed.${module}`),
        restore: () => restoreEntity(ctx.root, module, entity.id),
      };
    });
  });
}
