import {
  activeVersionId,
  listScenesOutOfVersion,
  listVersions,
  listVersionScenes,
  readFullOutline,
  renameVersion,
  setSceneInVersion,
  switchVersion,
  type VersionInfo,
} from '@charpentier/schema';
import type { WorkspaceContext } from '../workspace/workspace-context';
import type { CommandId } from './command-id';
import type { Command } from './registry';

type Ctx = WorkspaceContext;

/** « ⇧⌘N » after a word, or nothing where the host keeps the shortcut (a browser). */
export const spaced = (shortcut: string | undefined): string => (shortcut ? ` ${shortcut}` : '');

/** A version's name: the author's, or « Principale ». */
export function versionLabel(t: Ctx['t'], version: VersionInfo): string {
  return version.name || (version.isMain ? t('versions.main') : '');
}

/** The active version's name. */
export function activeVersionLabel(ctx: Pick<Ctx, 't' | 'root'>): string {
  const active = activeVersionId(ctx.root);
  const version = listVersions(ctx.root).find((v) => v.id === active);
  return version ? versionLabel(ctx.t, version) : '';
}

const several = (ctx: Ctx) => listVersions(ctx.root).length > 1;

/**
 * After the version changed, or the scene left it: the open scene stays when
 * the version has it, else the nearest one before it (DESIGN 1.20), else the
 * first.
 */
export function sceneInActiveVersion(ctx: Pick<Ctx, 'root'>, sceneId: string): string | undefined {
  const shown = listVersionScenes(ctx.root);
  if (shown.some((s) => s.id === sceneId)) return sceneId;
  const all = readFullOutline(ctx.root).flatMap((c) => c.scenes);
  const at = all.findIndex((s) => s.id === sceneId);
  const ids = new Set(shown.map((s) => s.id));
  const before = all
    .slice(0, Math.max(at, 0))
    .reverse()
    .find((s) => ids.has(s.id));
  return (before ?? shown[0])?.id;
}

/** Passes to another version and keeps the author where they were, or as near as can be. */
export function goToVersion(ctx: Ctx, versionId: string): void {
  if (versionId === activeVersionId(ctx.root)) return;
  switchVersion(ctx.root, versionId);
  const version = listVersions(ctx.root).find((v) => v.id === versionId);
  const target = sceneInActiveVersion(ctx, ctx.sceneId);
  if (target && target !== ctx.sceneId) ctx.openScene(target);
  if (version) ctx.notify(ctx.t('versions.switched', { version: versionLabel(ctx.t, version) }));
}

export const versionCommands: readonly (Command<Ctx> & { readonly id: CommandId })[] = [
  {
    id: 'newVersion',
    scope: 'global',
    run: (ctx) => ctx.toggleNovel('version'),
  },
  {
    id: 'switchVersion',
    scope: 'global',
    isEnabled: several,
    run: (ctx) => {
      const active = activeVersionId(ctx.root);
      ctx.openPalette({
        kind: 'pick',
        placeholder: ctx.t('palette.pickVersion'),
        items: listVersions(ctx.root).map((v) => ({
          id: v.id,
          label: versionLabel(ctx.t, v),
          ...(v.id === active && { detail: ctx.t('palette.activeVersion') }),
        })),
        onPick: (id) => goToVersion(ctx, id),
      });
    },
  },
  {
    id: 'renameVersion',
    scope: 'global',
    isEnabled: several,
    run: (ctx) => {
      const id = activeVersionId(ctx.root);
      ctx.openPalette({
        kind: 'input',
        placeholder: ctx.t('versions.nameField'),
        initial: activeVersionLabel(ctx),
        onSubmit: (name) => name.trim() && renameVersion(ctx.root, id, name.trim()),
      });
    },
  },
  {
    id: 'removeSceneFromVersion',
    scope: 'global',
    // The last scene of a version stays: there is always one to write in.
    isEnabled: (ctx) => several(ctx) && listVersionScenes(ctx.root).length > 1,
    run: (ctx) => {
      const sceneId = ctx.sceneId;
      setSceneInVersion(ctx.root, sceneId, false);
      const target = sceneInActiveVersion(ctx, sceneId);
      if (target) ctx.openScene(target);
      ctx.notify(ctx.t('versions.removed', { version: activeVersionLabel(ctx) }));
    },
  },
  {
    id: 'addSceneToVersion',
    scope: 'global',
    isEnabled: (ctx) => several(ctx) && listScenesOutOfVersion(ctx.root).length > 0,
    run: (ctx) =>
      ctx.openPalette({
        kind: 'pick',
        placeholder: ctx.t('palette.pickSceneToAdd'),
        empty: ctx.t('palette.noSceneOut'),
        items: listScenesOutOfVersion(ctx.root).map((s) => ({ id: s.id, label: s.title })),
        onPick: (sceneId) => {
          setSceneInVersion(ctx.root, sceneId, true);
          ctx.openScene(sceneId);
        },
      }),
  },
];
