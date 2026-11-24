import {
  acceptProposal,
  createEntity,
  listEntities,
  listTrashedEntities,
  readFieldRef,
  rejectEntity,
  rejectProposal,
  restoreEntity,
  trashEntity,
  validateEntity,
  type EntityModule,
  type FieldRef,
} from '@charpentier/schema';
import type * as Y from 'yjs';
import type { WorkspaceContext } from '../workspace/workspace-context';
import { moduleDefs } from './module-defs';

const titleFieldOf = (module: EntityModule) => {
  const def = moduleDefs[module === 'acts' || module === 'arcs' ? 'structure' : module];
  return def.kind === 'entity' ? def.titleField : 'title';
};

/**
 * Keeping a field of a proposed sheet keeps the sheet (docs/DESIGN.md §4.5,
 * the author's choice: « garder batelière, c'est garder Hélène »): the sheet
 * is validated with its name; its other fields still wait, one by one.
 */
export function keepSheetOf(root: Y.Doc, ref: FieldRef): void {
  if (!('entityId' in ref)) return;
  const entity = listEntities(root, ref.module).find((e) => e.id === ref.entityId);
  if (entity?.status !== 'proposed') return;
  validateEntity(root, ref.module, ref.entityId);
  const titleRef: FieldRef = {
    module: ref.module,
    entityId: ref.entityId,
    field: titleFieldOf(ref.module),
  };
  if (readFieldRef(root, titleRef).status === 'proposed') acceptProposal(root, titleRef);
}

/** Validates a proposal, and its sheet with it when the sheet was only proposed. */
export function acceptAndKeep(root: Y.Doc, ref: FieldRef): void {
  acceptProposal(root, ref);
  keepSheetOf(root, ref);
}

/** A sheet with a field the author kept is no longer rejected from a proposal list. */
export const hasKeptField = (root: Y.Doc, module: EntityModule, entityId: string): boolean =>
  Object.values(listEntities(root, module).find((e) => e.id === entityId)?.fields ?? {}).some(
    (state) => state.status === 'validated',
  );

/** Rejects a sheet still entirely proposed, and its fields waiting with it. */
export function rejectSheet(root: Y.Doc, module: EntityModule, entityId: string): void {
  const entity = listEntities(root, module).find((e) => e.id === entityId);
  if (!entity || hasKeptField(root, module, entityId)) return;
  for (const [field, state] of Object.entries(entity.fields))
    if (state.status === 'proposed') rejectProposal(root, { module, entityId, field });
  rejectEntity(root, module, entityId);
}

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
  ctx.offerUndo({
    message: ctx.t('status.entityTrashed', { title }),
    label: ctx.t('status.undoTrash.entity', { name: title }),
    undo: () => restoreEntity(ctx.root, module, entityId),
  });
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
