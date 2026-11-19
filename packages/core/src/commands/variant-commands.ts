import {
  activeVersionId,
  checkpointText,
  createCheckpoint,
  createVariant,
  createVariantFromCheckpoint,
  getScene,
  listCheckpoints,
  listTrashedVariants,
  MAIN_VERSION,
  renameVariant,
  restoreCheckpoint,
  restoreVariant,
  setActiveVariant,
  trashVariant,
  type CheckpointInfo,
  type SceneInfo,
} from '@charpentier/schema';
import type { WorkspaceContext } from '../workspace/workspace-context';
import type { CommandId } from './command-id';
import type { Command } from './registry';
import { activeVersionLabel } from './version-commands';

type Ctx = WorkspaceContext;

/**
 * Name shown for a variant: its own, or « Variante n » by order of creation.
 * The old default « Version n » reads « Variante n » (DESIGN 1.20: « version »
 * now names the novel's working versions); a name the author chose never
 * changes.
 */
export function variantLabel(t: Ctx['t'], scene: SceneInfo, variantId: string): string {
  const index = scene.variants.findIndex((v) => v.id === variantId);
  const name = scene.variants[index]?.name ?? '';
  const old = /^Version (\d+)$/.exec(name);
  if (old) return t('variants.defaultName', { n: Number(old[1]) });
  return name || t('variants.defaultName', { n: index + 1 });
}

/** « Aujourd’hui, 14:32 », or the date; with the seconds to tell apart two points of the same minute. */
export function formatCheckpointDate(ctx: Ctx, iso: string, seconds = false): string {
  const date = new Date(iso);
  const time = new Intl.DateTimeFormat(ctx.language, {
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds && { second: '2-digit' }),
  }).format(date);
  if (date.toDateString() === new Date().toDateString()) return ctx.t('history.today', { time });
  return new Intl.DateTimeFormat(ctx.language, {
    dateStyle: 'medium',
    timeStyle: seconds ? 'medium' : 'short',
  }).format(date);
}

const scene = (ctx: Ctx) => getScene(ctx.root, ctx.sceneId);
const hasDocs = (ctx: Ctx) => ctx.sceneDocs !== null;

function preview(ctx: Ctx, checkpoint: CheckpointInfo): string {
  if (!ctx.sceneDocs) return '';
  const text = checkpointText(ctx.sceneDocs.historyDoc, checkpoint.id).replace(/\s+/g, ' ').trim();
  return text ? `${text.slice(0, 70)}${text.length > 70 ? '…' : ''}` : ctx.t('history.emptyText');
}

function pickCheckpoint(
  ctx: Ctx,
  placeholder: string,
  onPick: (checkpoint: CheckpointInfo) => void,
): void {
  const current = scene(ctx);
  if (!current || !ctx.sceneDocs) return;
  const checkpoints = listCheckpoints(ctx.sceneDocs.historyDoc, current.activeVariantId);
  ctx.openPalette({
    kind: 'pick',
    placeholder,
    empty: ctx.t('palette.noCheckpoints'),
    items: checkpoints.map((c) => ({
      id: c.id,
      label: [formatCheckpointDate(ctx, c.createdAt), c.label].filter(Boolean).join(' · '),
      detail: `${ctx.t(`history.reason.${c.reason}`)} — ${preview(ctx, c)}`,
    })),
    onPick: (id) => {
      const checkpoint = checkpoints.find((c) => c.id === id);
      if (checkpoint) onPick(checkpoint);
    },
  });
}

function promptRenameVariant(ctx: Ctx, variantId: string): void {
  const current = scene(ctx);
  if (!current) return;
  ctx.openPalette({
    kind: 'input',
    placeholder: ctx.t('palette.variantName'),
    initial: variantLabel(ctx.t, current, variantId),
    onSubmit: (name) => name.trim() && renameVariant(ctx.root, current.id, variantId, name.trim()),
  });
}

function newVariant(ctx: Ctx, copy: boolean): void {
  const current = scene(ctx);
  if (!current || !ctx.sceneDocs) return;
  // In a working version, the variant takes the version's name (DESIGN 1.20).
  const inVersion = activeVersionId(ctx.root) !== MAIN_VERSION;
  const variantId = createVariant(ctx.root, ctx.sceneDocs.sceneDoc, current.id, {
    name: inVersion
      ? activeVersionLabel(ctx)
      : ctx.t('variants.defaultName', { n: current.variants.length + 1 }),
    ...(copy && { copyOf: current.activeVariantId }),
    activate: true,
  });
  promptRenameVariant(ctx, variantId);
}

export const variantCommands: readonly (Command<Ctx> & { readonly id: CommandId })[] = [
  {
    id: 'switchVariant',
    scope: 'global',
    keybinding: 'Mod-Alt-v',
    run: (ctx) => {
      const current = scene(ctx);
      if (!current) return;
      ctx.openPalette({
        kind: 'pick',
        placeholder: ctx.t('palette.pickVariant'),
        items: current.variants.map((v) => ({
          id: v.id,
          label: variantLabel(ctx.t, current, v.id),
          ...(v.id === current.activeVariantId && { detail: ctx.t('palette.activeVariant') }),
        })),
        onPick: (variantId) => setActiveVariant(ctx.root, current.id, variantId),
      });
    },
  },
  {
    id: 'newVariant',
    scope: 'global',
    // ⌘⇧N on the desktop; a browser keeps it for private windows.
    keybinding: ['Mod-Shift-n'],
    isEnabled: hasDocs,
    run: (ctx) => newVariant(ctx, true),
  },
  {
    id: 'newEmptyVariant',
    scope: 'global',
    isEnabled: hasDocs,
    run: (ctx) => newVariant(ctx, false),
  },
  {
    id: 'renameVariant',
    scope: 'global',
    run: (ctx) => {
      const current = scene(ctx);
      if (current) promptRenameVariant(ctx, current.activeVariantId);
    },
  },
  {
    id: 'trashVariant',
    scope: 'global',
    isEnabled: (ctx) => hasDocs(ctx) && (scene(ctx)?.variants.length ?? 0) > 1,
    run: (ctx) => {
      const current = scene(ctx);
      if (!current || !ctx.sceneDocs) return;
      const doomed = current.activeVariantId;
      const next = current.variants.filter((v) => v.id !== doomed).at(-1);
      if (!next) return;
      createCheckpoint(ctx.sceneDocs.sceneDoc, ctx.sceneDocs.historyDoc, {
        variantId: doomed,
        reason: 'before-variant-delete',
      });
      setActiveVariant(ctx.root, current.id, next.id);
      trashVariant(ctx.root, current.id, doomed);
    },
  },
  {
    id: 'createCheckpoint',
    scope: 'global',
    keybinding: 'Mod-s',
    isEnabled: hasDocs,
    run: (ctx) => {
      const current = scene(ctx);
      if (!current || !ctx.sceneDocs) return;
      createCheckpoint(ctx.sceneDocs.sceneDoc, ctx.sceneDocs.historyDoc, {
        variantId: current.activeVariantId,
        reason: 'manual',
      });
      // Told even when the latest point already holds this text (nothing new is stored then).
      ctx.notify(ctx.t('status.checkpointCreated'));
    },
  },
  {
    id: 'createNamedCheckpoint',
    scope: 'global',
    isEnabled: hasDocs,
    run: (ctx) => {
      const current = scene(ctx);
      const docs = ctx.sceneDocs;
      if (!current || !docs) return;
      ctx.openPalette({
        kind: 'input',
        placeholder: ctx.t('palette.checkpointLabel'),
        initial: '',
        onSubmit: (label) => {
          createCheckpoint(docs.sceneDoc, docs.historyDoc, {
            variantId: current.activeVariantId,
            reason: 'manual',
            ...(label.trim() && { label: label.trim() }),
          });
          ctx.notify(ctx.t('status.checkpointCreated'));
        },
      });
    },
  },
  {
    id: 'restoreCheckpoint',
    scope: 'global',
    isEnabled: hasDocs,
    run: (ctx) =>
      pickCheckpoint(ctx, ctx.t('palette.pickCheckpoint'), (checkpoint) => {
        if (!ctx.sceneDocs) return;
        restoreCheckpoint(ctx.sceneDocs.sceneDoc, ctx.sceneDocs.historyDoc, checkpoint.id);
        ctx.notify(
          ctx.t('status.checkpointRestored', {
            date: formatCheckpointDate(ctx, checkpoint.createdAt),
          }),
        );
      }),
  },
  {
    id: 'variantFromCheckpoint',
    scope: 'global',
    isEnabled: hasDocs,
    run: (ctx) =>
      pickCheckpoint(ctx, ctx.t('palette.pickCheckpointForVariant'), (checkpoint) => {
        const current = scene(ctx);
        if (!current || !ctx.sceneDocs) return;
        const name = formatCheckpointDate(ctx, checkpoint.createdAt);
        createVariantFromCheckpoint(
          ctx.root,
          ctx.sceneDocs.sceneDoc,
          ctx.sceneDocs.historyDoc,
          current.id,
          {
            checkpointId: checkpoint.id,
            name,
            activate: true,
          },
        );
        ctx.notify(ctx.t('status.variantCreated', { name }));
      }),
  },
];

/** Trashed variants of the open scene, for the « restore from trash » list. */
export function trashedVariantItems(ctx: Ctx) {
  const current = scene(ctx);
  if (!current) return [];
  return listTrashedVariants(ctx.root, current.id).map((v) => ({
    id: `variant:${v.id}`,
    label: v.name || ctx.t('variants.defaultName', { n: '?' }),
    detail: ctx.t('palette.trashedVariant'),
    restore: () => restoreVariant(ctx.root, current.id, v.id),
  }));
}
