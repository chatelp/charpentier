import fs from 'node:fs';
import path from 'node:path';
import type { DocStore } from './doc-store';
import { ProjectMirror, type MirrorStrings } from './project-mirror';
import { folderName, STATE_DIR, type FolderLibrary } from './projects';

/**
 * Every project of the library in Markdown, into `folder` (the USB key's
 * copy, docs/PLAN.md phase 5.7): the same files as the mirror, without its
 * own state. A folder per project; two of the same title get a number.
 */
export async function exportTexts(
  store: DocStore,
  library: FolderLibrary,
  folder: string,
  strings: MirrorStrings,
): Promise<void> {
  const used = new Set<string>();
  for (const project of await library.list()) {
    let name = folderName(project.title);
    for (let n = 2; used.has(name); n++) name = `${folderName(project.title)} ${n}`;
    used.add(name);
    const target = path.join(folder, name);
    const mirror = new ProjectMirror(store, project.id, target, { strings, watch: false });
    mirror.start();
    mirror.stop();
    fs.rmSync(path.join(target, STATE_DIR), { recursive: true, force: true });
  }
}
