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
  trashScene,
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
  keptAside: (file: string) => `Fichier conservé sous « ${file} ».`,
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
  const open = () => {
    const opened = new ProjectMirror(store, project.id, folder, {
      strings,
      debounceMs: 10,
      settleMs: 20,
    });
    opened.start();
    return opened;
  };
  const mirror = open();
  const file = () => path.join(folder, 'manuscrit', '01-le-depart', '01-il-pleut.md');
  const text = () =>
    fragmentPlainText(variantFragment(sceneDoc, getScene(root, sceneId)?.activeVariantId ?? ''));
  /** The file as another editor would save it. */
  const outside = (edit: (content: string) => string) =>
    fs.writeFileSync(file(), edit(fs.readFileSync(file(), 'utf8')));
  const signals = () => listSignals(root, { state: 'open' });
  return {
    ...{ store, root, folder, sceneId, variantId, sceneDoc },
    ...{ write, mirror, open, file, text, outside, signals },
  };
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
      variantId,
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

  describe('never overwrites an outside edit it has not taken in', () => {
    const history = (t: Awaited<ReturnType<typeof setup>>) =>
      t.store
        .acquire(guids.sceneHistory(t.mirror.projectId, t.sceneId), 'test')
        .getArray('checkpoints')
        .toArray();

    it('merges a file edited while the app was closed, when the project opens again', async () => {
      const t = await setup();
      t.mirror.stop();
      // Closed: the author corrects the first paragraph in another editor…
      t.outside((c) => c.replace('Il pleuvait sur Nantes.', 'Il pleuvait sur Nantes, encore.'));
      // …and the last one changed in the project meanwhile (another device, say).
      t.write('Il pleuvait sur Nantes.\n\nHélène regardait la *Loire*.\n\nPaul arriva enfin.');
      const mirror = t.open();
      expect(t.text()).toBe(
        'Il pleuvait sur Nantes, encore.\nHélène regardait la Loire.\nPaul arriva enfin.',
      );
      expect(history(t)).toHaveLength(1);
      const content = fs.readFileSync(t.file(), 'utf8');
      expect(content).toContain('Il pleuvait sur Nantes, encore.');
      expect(content).toContain('Paul arriva enfin.');
      expect(t.signals()).toEqual([]);
      mirror.stop();
      // Nothing is taken in twice.
      const again = t.open();
      expect(history(t)).toHaveLength(1);
      expect(getScene(t.root, t.sceneId)?.variants).toHaveLength(1);
      again.stop();
    });

    it('keeps an overlapping edit made while the app was closed as a variant, with a signal', async () => {
      const t = await setup();
      t.mirror.stop();
      t.outside((c) => c.replace('Il pleuvait sur Nantes.', 'Il neigeait sur Nantes.'));
      t.write('Il pleuvait à verse sur Nantes.\n\nHélène regardait la *Loire*.\n\nPaul arrivait.');
      const mirror = t.open();
      expect(t.text()).toContain('Il pleuvait à verse sur Nantes.');
      const variants = getScene(t.root, t.sceneId)?.variants ?? [];
      expect(variants.map((v) => v.origin)).toEqual(['author', 'external-edit']);
      expect(fragmentPlainText(variantFragment(t.sceneDoc, variants[1]?.id ?? ''))).toContain(
        'Il neigeait sur Nantes.',
      );
      expect(t.signals().map((s) => s.kind)).toEqual(['external-edit']);
      expect(fs.readFileSync(t.file(), 'utf8')).toContain('Il pleuvait à verse sur Nantes.');
      mirror.stop();
    });

    it('leaves the file alone when the app closes before an outside edit was read', async () => {
      const t = await setup();
      t.outside((c) => c.replace('Paul arrivait.', 'Paul arrivait, trempé.'));
      t.write('Il pleuvait.\n\nHélène regardait la *Loire*.\n\nPaul arrivait.');
      t.mirror.stop();
      expect(fs.readFileSync(t.file(), 'utf8')).toContain('Paul arrivait, trempé.');
      const mirror = t.open();
      expect(t.text()).toBe('Il pleuvait.\nHélène regardait la Loire.\nPaul arrivait, trempé.');
      mirror.stop();
    });

    it('waits for an outside edit to settle when a write comes at the same moment', async () => {
      const t = await setup();
      t.outside((c) => c.replace('Il pleuvait sur Nantes.', 'Il pleuvait sur Nantes, encore.'));
      t.write('Il pleuvait sur Nantes.\n\nHélène regardait la *Loire*.\n\nPaul arriva enfin.');
      // The write of the app's change lands before the outside edit was read.
      t.mirror.flush();
      expect(fs.readFileSync(t.file(), 'utf8')).toContain('Il pleuvait sur Nantes, encore.');
      expect(t.text()).toContain('Il pleuvait sur Nantes.\n');
      await settle();
      expect(t.text()).toBe(
        'Il pleuvait sur Nantes, encore.\nHélène regardait la Loire.\nPaul arriva enfin.',
      );
      const content = fs.readFileSync(t.file(), 'utf8');
      expect(content).toContain('Il pleuvait sur Nantes, encore.');
      expect(content).toContain('Paul arriva enfin.');
      t.mirror.stop();
    });

    it('reads a file saved with a byte order mark and Windows line ends', async () => {
      const t = await setup();
      t.outside(
        (c) =>
          '\uFEFF' + c.replace('Paul arrivait.', 'Paul arrivait, trempé.').replace(/\n/g, '\r\n'),
      );
      expect(parseSceneFile(fs.readFileSync(t.file(), 'utf8')).sceneId).toBe(t.sceneId);
      t.mirror.flush();
      expect(fs.readFileSync(t.file(), 'utf8')).toContain('Paul arrivait, trempé.');
      expect(t.mirror.importFile(t.file())).toBe('merged');
      expect(t.text()).toContain('Paul arrivait, trempé.');
      expect(fs.readFileSync(t.file(), 'utf8').startsWith('---\n')).toBe(true);
      t.mirror.stop();
    });

    it('keeps a file that lost its header as a variant, with a signal, never merged', async () => {
      const t = await setup();
      const original = fs.readFileSync(t.file(), 'utf8');
      // The header alone is gone: nothing to take in, it is written again.
      fs.writeFileSync(t.file(), parseSceneFile(original).body);
      expect(t.mirror.importFile(t.file())).toBe('unchanged');
      expect(fs.readFileSync(t.file(), 'utf8')).toBe(original);
      // The header is gone and the text changed, where nothing changed in the app.
      fs.writeFileSync(
        t.file(),
        parseSceneFile(original).body.replace('Paul arrivait.', 'Paul arrivait, trempé.'),
      );
      t.mirror.flush();
      expect(fs.readFileSync(t.file(), 'utf8')).toContain('Paul arrivait, trempé.');
      expect(t.mirror.importFile(t.file())).toBe('variant');
      expect(t.text()).toContain('Paul arrivait.');
      const variants = getScene(t.root, t.sceneId)?.variants ?? [];
      expect(variants.map((v) => v.origin)).toEqual(['author', 'external-edit']);
      expect(fragmentPlainText(variantFragment(t.sceneDoc, variants[1]?.id ?? ''))).toContain(
        'Paul arrivait, trempé.',
      );
      expect(t.signals().map((s) => s.kind)).toEqual(['external-edit']);
      expect(fs.readFileSync(t.file(), 'utf8')).toBe(original);
      t.mirror.stop();
    });

    it('takes the edit of a file still showing the previous variant into that variant', async () => {
      const t = await setup();
      const other = createVariant(t.root, t.sceneDoc, t.sceneId, { name: 'Autre', activate: true });
      t.sceneDoc.transact(() =>
        writeSceneDocToFragment(
          parseSceneMarkdown('Tout autre chose.'),
          variantFragment(t.sceneDoc, other),
        ),
      );
      // The file still shows the first variant when it is edited outside.
      t.outside((c) => c.replace('Paul arrivait.', 'Paul arrivait, trempé.'));
      expect(t.mirror.importFile(t.file())).toBe('merged');
      expect(fragmentPlainText(variantFragment(t.sceneDoc, t.variantId))).toBe(
        'Il pleuvait sur Nantes.\nHélène regardait la Loire.\nPaul arrivait, trempé.',
      );
      expect(t.text()).toBe('Tout autre chose.');
      expect(getScene(t.root, t.sceneId)?.variants).toHaveLength(2);
      // The file now shows the active variant.
      const content = fs.readFileSync(t.file(), 'utf8');
      expect(parseSceneFile(content)).toMatchObject({
        variantId: other,
        body: 'Tout autre chose.\n',
      });
      t.mirror.stop();
    });

    it('keeps aside the edited file of a scene gone to the trash, and a file in its way', async () => {
      const t = await setup();
      const chapter = path.dirname(t.file());
      // A file of the author's where the next scene's file goes.
      fs.writeFileSync(path.join(chapter, '02-la-lettre.md'), 'Mes notes.');
      createScene(t.root, {
        chapterId: getScene(t.root, t.sceneId)?.chapterId ?? '',
        title: 'La lettre',
      });
      t.mirror.flush();
      expect(fs.readFileSync(path.join(chapter, '02-la-lettre.externe.md'), 'utf8')).toBe(
        'Mes notes.',
      );
      expect(fs.readFileSync(path.join(chapter, '02-la-lettre.md'), 'utf8')).toContain('scene: ');

      t.mirror.stop();
      t.outside((c) => c.replace('Paul arrivait.', 'Paul arrivait, trempé.'));
      trashScene(t.root, t.sceneId);
      const mirror = t.open();
      expect(fs.readdirSync(chapter).sort()).toEqual([
        '01-il-pleut.externe.md',
        '01-la-lettre.md',
        '02-la-lettre.externe.md',
      ]);
      expect(fs.readFileSync(path.join(chapter, '01-il-pleut.externe.md'), 'utf8')).toContain(
        'Paul arrivait, trempé.',
      );
      expect(t.signals().map((s) => s.message)).toEqual([
        'Fichier conservé sous « manuscrit/01-le-depart/02-la-lettre.externe.md ».',
        'Fichier conservé sous « manuscrit/01-le-depart/01-il-pleut.externe.md ».',
      ]);
      mirror.stop();
    });
  });
});
