import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createChapter,
  createScene,
  guids,
  initProject,
  parseSceneMarkdown,
  variantFragment,
  writeSceneDocToFragment,
} from '@charpentier/schema';
import { afterEach, describe, expect, it } from 'vitest';
import { DocStore } from './doc-store';
import { exportTexts } from './export-texts';
import { documentLocator, FolderLibrary } from './projects';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const strings = { externalVariant: () => 'x', externalSignal: () => 'x' };

describe('copying the texts to a USB key (phase 5.7)', () => {
  it('writes every project in Markdown, without the mirror state, and erases nothing', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'charpentier-export-'));
    dirs.push(tmp);
    const library = new FolderLibrary(path.join(tmp, 'Bibliothèque'));
    const store = new DocStore(documentLocator(library));
    for (const title of ['Mon roman', 'Mon roman', 'Nouvelles']) {
      const project = await library.create({ title, kind: 'novel' });
      const root = store.acquire(guids.project(project.id), 'test');
      initProject(root, { id: project.id, title, kind: 'novel' });
      const chapterId = createChapter(root, { title: 'Le départ' });
      const { sceneId, variantId } = createScene(root, { chapterId, title: 'Il pleut' });
      const scene = store.acquire(guids.scene(project.id, sceneId), 'test');
      scene.transact(() =>
        writeSceneDocToFragment(
          parseSceneMarkdown(`Il pleuvait sur ${title}.`),
          variantFragment(scene, variantId),
        ),
      );
    }
    const key = path.join(tmp, 'KINGSTON');
    fs.mkdirSync(path.join(key, 'Charpentier'), { recursive: true });
    fs.writeFileSync(path.join(key, 'à garder.txt'), 'rien n’est effacé');
    const target = path.join(key, 'Charpentier', '2026-11-13');
    await exportTexts(store, library, target, strings);

    expect(fs.readdirSync(target).sort()).toEqual(['Mon roman', 'Mon roman 2', 'Nouvelles']);
    const scene = path.join(target, 'Nouvelles', 'manuscrit', '01-le-depart', '01-il-pleut.md');
    expect(fs.readFileSync(scene, 'utf8')).toContain('Il pleuvait sur Nouvelles.');
    expect(fs.existsSync(path.join(target, 'Nouvelles', '.charpentier'))).toBe(false);
    expect(fs.readFileSync(path.join(key, 'à garder.txt'), 'utf8')).toBe('rien n’est effacé');
  });
});
