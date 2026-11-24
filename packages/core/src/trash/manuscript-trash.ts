import {
  listChapters,
  listScenes,
  listTrash,
  listTrashedVariants,
  restoreChapter,
  restoreSceneWithChapter,
  restoreVariant,
  trashedVersionIds,
} from '@charpentier/schema';
import { formatWhen } from '../work/work-format';
import type { WorkspaceContext } from '../workspace/workspace-context';
import type { TrashLine } from './TrashFoot';

/** A trash line and when its thing left, to sort the whole list. */
type Dated = ManuscriptTrashLine & { readonly trashedAt: string };

/** `back`: the line of the drawer that shows the thing once it is back. */
export interface ManuscriptTrashLine extends TrashLine {
  readonly back: string;
}

/**
 * The manuscript's trash, at the foot of the drawer (docs/DESIGN.md §4.7 « La corbeille au pied
 * de la liste »): chapters, scenes and variants, the most recent first. A chapter that left with
 * its scenes is one line: it comes back with them. A variant comes back into its scene without
 * becoming the one read.
 */
export function manuscriptTrash(ctx: WorkspaceContext): ManuscriptTrashLine[] {
  const { t, root } = ctx;
  const when = (iso: string) => formatWhen(t, iso, ctx.language);
  const trash = listTrash(root);
  const chapterTitle = new Map(
    [...listChapters(root), ...trash.chapters].map((c) => [c.id, c.title]),
  );
  const trashedChapters = new Set(trash.chapters.map((c) => c.id));

  const chapters: Dated[] = trash.chapters.map((c) => {
    const scenes = listScenes(root, c.id).length;
    return {
      id: `chapter:${c.id}`,
      back: c.id,
      name: c.title,
      trashedAt: c.trashedAt,
      detail:
        scenes > 0
          ? t('trash.detail.chapterWithScenes', { count: scenes, when: when(c.trashedAt) })
          : t('trash.detail.chapter', { when: when(c.trashedAt) }),
      restore: () => {
        restoreChapter(root, c.id);
        ctx.notify(t('trash.restored.chapter', { title: c.title }));
      },
    };
  });

  // (A scene of a version in the trash comes back with its version.)
  const goneVersions = trashedVersionIds(root);
  const trashedScenes = trash.scenes.filter((s) => !s.version || !goneVersions.has(s.version));
  const scenes: Dated[] = trashedScenes.map((s) => {
    const chapter = chapterTitle.get(s.chapterId) ?? '';
    return {
      id: `scene:${s.id}`,
      back: s.id,
      name: s.title,
      trashedAt: s.trashedAt,
      detail: t('trash.detail.scene', { chapter, when: when(s.trashedAt) }),
      restore: () => {
        const withChapter = trashedChapters.has(s.chapterId);
        restoreSceneWithChapter(root, s.id);
        ctx.notify(
          withChapter
            ? t('trash.restored.sceneWithChapter', { title: s.title, chapter })
            : t('trash.restored.scene', { title: s.title }),
        );
      },
    };
  });

  // Every scene's, whatever the version read.
  const variants: Dated[] = listChapters(root)
    .flatMap((c) => listScenes(root, c.id))
    .flatMap((scene) =>
      listTrashedVariants(root, scene.id).map((v) => {
        const name = v.name || t('variants.defaultName', { n: '?' });
        return {
          id: `variant:${v.id}`,
          back: scene.id,
          name,
          trashedAt: v.trashedAt,
          detail: t('trash.detail.variant', { scene: scene.title, when: when(v.trashedAt) }),
          restore: () => {
            restoreVariant(root, scene.id, v.id);
            ctx.notify(t('trash.restored.variant', { name }));
          },
        };
      }),
    );

  return [...chapters, ...scenes, ...variants].sort((a, b) =>
    a.trashedAt < b.trashedAt ? 1 : a.trashedAt > b.trashedAt ? -1 : 0,
  );
}
