import { projectFiles, readOutline, readProjectMeta, slug } from '@charpentier/schema';
import * as Y from 'yjs';
import { loadDocument, type Database } from '../database';
import { zip } from './zip';

/**
 * A project in Markdown, as an archive (docs/PLAN.md phase 4.6): the same
 * files as the desktop's mirror (`projectFiles` of the schema), read from the
 * server's documents, in a folder named after the project.
 */
export async function exportProject(
  db: Database,
  projectId: string,
  date = new Date(),
): Promise<{ readonly title: string; readonly fileName: string; readonly zip: Buffer } | null> {
  const state = await loadDocument(db, `project:${projectId}`);
  if (!state) return null;
  const root = new Y.Doc();
  Y.applyUpdate(root, state);
  const sceneDocs = new Map<string, Y.Doc>();
  for (const chapter of readOutline(root))
    for (const scene of chapter.scenes) {
      const sceneState = await loadDocument(db, `project:${projectId}/scene:${scene.id}`);
      if (!sceneState) continue;
      const doc = new Y.Doc();
      Y.applyUpdate(doc, sceneState);
      sceneDocs.set(scene.id, doc);
    }
  const title = readProjectMeta(root)?.title ?? '';
  const folder = slug(title || projectId);
  const archive = zip(
    projectFiles(root, sceneDocs).map((f) => ({ path: `${folder}/${f.path}`, content: f.content })),
    date,
  );
  for (const doc of [root, ...sceneDocs.values()]) doc.destroy();
  return { title, fileName: `${folder}-${date.toISOString().slice(0, 10)}.zip`, zip: archive };
}
