import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createChapter,
  createScene,
  createVariant,
  createVersion,
  MAIN_VERSION,
  switchVersion,
  fragmentPlainText,
  getScene,
  guids,
  initProject,
  listSignals,
  parseSceneMarkdown,
  renameScene,
  variantFragment,
  writeSceneDocToFragment,
} from '@charpentier/schema';
import { afterEach, describe, expect, it } from 'vitest';
import { DocStore } from './doc-store';
import { documentLocator, FolderLibrary } from './projects';
import { ProjectMirror, parseSceneFile } from './project-mirror';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const strings = {
  externalVariant: () => 'Modif. externe du 12 nov.',
  externalSignal: (name: string) => `Modification externe conservée dans « ${name} ».`,
};

async function setup() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'charpentier-mirror-'));
  dirs.push(tmp);
  const library = new FolderLibrary(tmp);
  const project = await library.create({ title: 'Mon roman', kind: 'novel' });
  const folder = library.folderOf(project.id) ?? '';
  const store = new DocStore(documentLocator(library));
  const root = store.acquire(guids.project(project.id), 'app');
  initProject(root, { id: project.id, title: 'Mon roman', kind: 'novel' });
  const chapterId = createChapter(root, { title: 'Le départ' });
  const { sceneId, variantId } = createScene(root, { chapterId, title: 'Il pleut' });
  const sceneDoc = store.acquire(guids.scene(project.id, sceneId), 'app');
  const write = (markdown: string) =>
    sceneDoc.transact(() =>
      writeSceneDocToFragment(parseSceneMarkdown(markdown), variantFragment(sceneDoc, variantId)),
    );
  write('Il pleuvait sur Nantes.\n\nHélène regardait la *Loire*.\n\nPaul arrivait.');
  const mirror = new ProjectMirror(store, project.id, folder, { strings, debounceMs: 10 });
  mirror.start();
  const file = () => path.join(folder, 'manuscrit', '01-le-depart', '01-il-pleut.md');
  const text = () =>
    fragmentPlainText(variantFragment(sceneDoc, getScene(root, sceneId)?.activeVariantId ?? ''));
  return { store, root, folder, sceneId, variantId, sceneDoc, write, mirror, file, text };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

describe('Markdown mirror', () => {
  it('follows the active working version, and loses nothing going back (DESIGN 1.20)', async () => {
    const { root, folder, sceneDoc, sceneId, file, mirror } = await setup();
    const principal = fs.readFileSync(file(), 'utf8');
    // A version, the scene's own variant there, and a scene of its own.
    createVersion(root, 'Fin à Nantes');
    const own = createVariant(root, sceneDoc, sceneId, { name: 'Fin à Nantes', activate: true });
    sceneDoc.transact(() =>
      writeSceneDocToFragment(
        parseSceneMarkdown('Hélène reste à Nantes.'),
        variantFragment(sceneDoc, own),
      ),
    );
    const chapterId = getScene(root, sceneId)?.chapterId ?? '';
    createScene(root, { chapterId, title: 'La lettre' });
    await settle();
    const chapter = path.join(folder, 'manuscrit', '01-le-depart');
    expect(parseSceneFile(fs.readFileSync(file(), 'utf8'))?.body).toBe('Hélène reste à Nantes.\n');
    expect(fs.readdirSync(chapter).sort()).toEqual(['01-il-pleut.md', '02-la-lettre.md']);

    // Back to Principale: its text, and none of the version's own scene.
    switchVersion(root, MAIN_VERSION);
    await settle();
    expect(fs.readFileSync(file(), 'utf8')).toBe(principal);
    expect(fs.readdirSync(chapter)).toEqual(['01-il-pleut.md']);
    mirror.stop();
  });

  it('writes a readable file per scene and the modules in YAML', async () => {
    const { folder, file, sceneId, variantId, mirror } = await setup();
    const content = fs.readFileSync(file(), 'utf8');
    expect(parseSceneFile(content)).toEqual({
      sceneId,
      body: 'Il pleuvait sur Nantes.\n\nHélène regardait la *Loire*.\n\nPaul arrivait.\n',
    });
    expect(content).toContain(`variant: ${variantId}`);
    expect(fs.readFileSync(path.join(folder, 'modules', 'meta.yaml'), 'utf8')).toContain('meta:');
    mirror.stop();
  });

  it('follows renames and moves, after a short delay', async () => {
    const { root, folder, sceneId, mirror } = await setup();
    renameScene(root, sceneId, 'La pluie');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fs.readdirSync(path.join(folder, 'manuscrit', '01-le-depart'))).toEqual([
      '01-la-pluie.md',
    ]);
    mirror.stop();
  });

  it('takes in a paragraph corrected in another editor, even while the app changed another one', async () => {
    const { file, write, text, mirror, store, sceneId } = await setup();
    // In the app: the last paragraph changes.
    write('Il pleuvait sur Nantes.\n\nHélène regardait la *Loire*.\n\nPaul arriva enfin.');
    // Outside, before the mirror rewrote the file: the first paragraph is corrected.
    const outside = fs
      .readFileSync(file(), 'utf8')
      .replace('Il pleuvait sur Nantes.', 'Il pleuvait sur Nantes, encore.');
    fs.writeFileSync(file(), outside);
    expect(mirror.importFile(file())).toBe('merged');
    expect(text()).toBe(
      'Il pleuvait sur Nantes, encore.\nHélène regardait la Loire.\nPaul arriva enfin.',
    );
    // A restore point was taken before.
    const history = store.acquire(guids.sceneHistory(mirror.projectId, sceneId), 'test');
    expect(history.getArray('checkpoints').toArray()).toHaveLength(1);
    expect(fs.readFileSync(file(), 'utf8')).toContain('Paul arriva enfin.');
    mirror.stop();
  });

  it('keeps an overlapping outside edit as a variant « Modif. externe », with a signal', async () => {
    const { root, file, write, text, mirror, sceneId } = await setup();
    write('Il pleuvait à verse sur Nantes.\n\nHélène regardait la *Loire*.\n\nPaul arrivait.');
    const outside = fs
      .readFileSync(file(), 'utf8')
      .replace('Il pleuvait sur Nantes.', 'Il neigeait sur Nantes.');
    fs.writeFileSync(file(), outside);
    expect(mirror.importFile(file())).toBe('variant');
    expect(text()).toContain('Il pleuvait à verse sur Nantes.');
    const variants = getScene(root, sceneId)?.variants ?? [];
    expect(variants.map((v) => `${v.name} (${v.origin})`)).toEqual([
      ' (author)',
      'Modif. externe du 12 nov. (external-edit)',
    ]);
    expect(listSignals(root, { state: 'open' }).map((s) => s.kind)).toEqual(['external-edit']);
    // The file is back to the app's text.
    expect(fs.readFileSync(file(), 'utf8')).toContain('Il pleuvait à verse sur Nantes.');
    mirror.stop();
  });

  it('ignores its own writes and files it does not know', async () => {
    const { folder, file, mirror } = await setup();
    expect(mirror.importFile(file())).toBe('unchanged');
    const stray = path.join(folder, 'manuscrit', 'notes.md');
    fs.writeFileSync(stray, 'Des notes.');
    expect(mirror.importFile(stray)).toBe('ignored');
    mirror.stop();
  });
});
