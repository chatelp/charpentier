import {
  fragmentToSceneDoc,
  getScene,
  guids,
  readOutline,
  readProjectMeta,
  sceneSchema,
  variantFragment,
} from '@charpentier/schema';
import { DOMSerializer } from '@tiptap/pm/model';
import type { WorkspaceContext } from '../workspace/workspace-context';
import './print.css';

export type PrintScope = 'scene' | 'chapter' | 'manuscript';

/**
 * The page to print (docs/DESIGN.md §4.12): the manuscript's layout,
 * Literata 12 pt, double spacing, chapters on a new page, a `#` between
 * scenes. Built from the scenes' documents, outside React, shown only to the
 * printer (`@media print`); the margins, running title and folio are the
 * host's (its PDF). Returns the element, to remove once printed.
 */
export async function buildPrintPage(
  ctx: WorkspaceContext,
  scope: PrintScope,
): Promise<{ readonly page: HTMLElement; readonly title: string }> {
  const outline = readOutline(ctx.root);
  const current = getScene(ctx.root, ctx.sceneId);
  const chapters =
    scope === 'manuscript'
      ? outline
      : outline
          .filter((c) => c.id === current?.chapterId)
          .map((c) => ({
            ...c,
            scenes: scope === 'scene' ? c.scenes.filter((s) => s.id === ctx.sceneId) : c.scenes,
          }));
  const serializer = DOMSerializer.fromSchema(sceneSchema);
  const page = document.createElement('div');
  page.className = 'ch-print';
  page.setAttribute('aria-hidden', 'true');
  for (const chapter of chapters) {
    if (scope !== 'scene') {
      const heading = document.createElement('h2');
      heading.textContent = chapter.title;
      page.append(heading);
    }
    for (const [i, scene] of chapter.scenes.entries()) {
      if (i > 0) {
        const mark = document.createElement('p');
        mark.className = 'ch-print-break';
        mark.textContent = '#';
        page.append(mark);
      }
      const handle = await ctx.platform.documents.open(guids.scene(ctx.projectId, scene.id));
      try {
        await handle.whenLoaded;
        const content = fragmentToSceneDoc(variantFragment(handle.doc, scene.activeVariantId));
        page.append(serializer.serializeFragment(content.content, { document }));
      } finally {
        await handle.close();
      }
    }
  }
  // The running title: the manuscript's, followed by the chapter's or the scene's.
  const projectTitle = readProjectMeta(ctx.root)?.title ?? '';
  const part =
    scope === 'scene' ? current?.title : scope === 'chapter' ? chapters[0]?.title : undefined;
  const title = part ? `${projectTitle} · ${part}` : projectTitle;
  document.body.append(page);
  // The page's fonts are those of the app: wait until they are there.
  await document.fonts.ready;
  return { page, title };
}
