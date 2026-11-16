import {
  createChapter,
  createScene,
  getScene,
  guids,
  initProject,
  listChapters,
  readProjectMeta,
  listScenes,
  trashScene,
  variantFragment,
} from '@charpentier/schema';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createTestPlatform } from '../testing/test-platform';
import {
  ensureScene,
  initialProjectId,
  lastScenePref,
  LEGACY_PROJECT_PREF,
  openProject,
  projectFromSync,
  renameProjectEverywhere,
} from './default-scene';

const titles = { project: 'Mon roman', chapter: 'Chapitre 1', scene: 'Scène 1' };

function withPreferences() {
  const store = new Map<string, unknown>();
  return createTestPlatform({
    preferences: {
      get: async <T>(key: string) => store.get(key) as T | undefined,
      set: async (key, value) => void store.set(key, value),
    },
  });
}

/** What the app does at start. */
const openDefaultProject = async (platform: ReturnType<typeof withPreferences>, t: typeof titles) =>
  openProject(platform, await initialProjectId(platform, t), t);

describe('opening at start', () => {
  it('creates a project with one chapter and one scene the first time, then reopens it', async () => {
    const platform = withPreferences();
    const first = await openDefaultProject(platform, titles);
    const second = await openDefaultProject(platform, titles);
    expect(second.projectId).toBe(first.projectId);
    expect(second.initialSceneId).toBe(first.initialSceneId);

    const root = (await platform.documents.open(guids.project(first.projectId))).doc;
    const chapters = listChapters(root);
    expect(chapters.map((c) => c.title)).toEqual(['Chapitre 1']);
    expect(listScenes(root, chapters[0]?.id ?? '').map((s) => s.title)).toEqual(['Scène 1']);
    expect(getScene(root, first.initialSceneId)?.variants).toHaveLength(1);
  });

  it('creates a single project when opened twice at once', async () => {
    const platform = withPreferences();
    const [a, b] = await Promise.all([
      openDefaultProject(platform, titles),
      openDefaultProject(platform, titles),
    ]);
    expect(a.projectId).toBe(b.projectId);
    expect(a.initialSceneId).toBe(b.initialSceneId);
  });

  it('reopens the last scene, unless it went to the trash', async () => {
    const platform = withPreferences();
    const { projectId, root } = await openDefaultProject(platform, titles);
    const chapterId = listChapters(root)[0]?.id ?? '';
    const other = createScene(root, { chapterId, title: 'Deux' }).sceneId;
    await platform.preferences.set(lastScenePref(projectId), other);
    expect((await openDefaultProject(platform, titles)).initialSceneId).toBe(other);
    trashScene(root, other);
    expect((await openDefaultProject(platform, titles)).initialSceneId).not.toBe(other);
  });
});

describe('library of projects', () => {
  it('reopens the last project opened, and the most recent one when it went to the trash', async () => {
    const platform = withPreferences();
    const first = await openDefaultProject(platform, titles);
    const story = await platform.library.create({ title: 'La serre', kind: 'short-story' });
    const opened = await openProject(platform, story.id, titles);
    expect(readProjectMeta(opened.root)).toMatchObject({ title: 'La serre', kind: 'short-story' });
    expect((await openDefaultProject(platform, titles)).projectId).toBe(story.id);

    await platform.library.trash(story.id);
    expect((await openDefaultProject(platform, titles)).projectId).toBe(first.projectId);
    expect((await platform.library.list()).map((p) => p.title)).toEqual(['Mon roman']);
    await platform.library.restore(story.id);
    expect((await platform.library.list()).map((p) => p.title).sort()).toEqual([
      'La serre',
      'Mon roman',
    ]);
  });

  it('adopts the project written before the library existed, with its title', async () => {
    const platform = withPreferences();
    await platform.preferences.set(LEGACY_PROJECT_PREF, 'old');
    const root = (await platform.documents.open(guids.project('old'))).doc;
    initProject(root, { id: 'old', title: 'Les serres de Titan', kind: 'novel' });
    const session = await openDefaultProject(platform, titles);
    expect(session.projectId).toBe('old');
    expect((await platform.library.list()).map((p) => p.title)).toEqual(['Les serres de Titan']);
  });

  it('renames a project in its document and in the library', async () => {
    const platform = withPreferences();
    const { projectId, root } = await openDefaultProject(platform, titles);
    await renameProjectEverywhere(platform, projectId, 'Titan', root);
    expect(readProjectMeta(root)?.title).toBe('Titan');
    expect((await platform.library.list())[0]?.title).toBe('Titan');
  });
});

describe('ensureScene', () => {
  it('creates a scene in an existing empty chapter', async () => {
    const platform = withPreferences();
    const { root } = await openDefaultProject(platform, titles);
    const scenes = listScenes(root, listChapters(root)[0]?.id ?? '');
    scenes.forEach((s) => trashScene(root, s.id));
    const chapterId = createChapter(root, { title: 'Vide' });
    const id = ensureScene(root, titles);
    expect(getScene(root, id)?.chapterId).not.toBe(chapterId); // first chapter is used
  });
});

describe('a new device signed in (phase 5.6)', () => {
  /** Writes a sentence in the project's first scene, as the author would. */
  async function write(
    platform: ReturnType<typeof withPreferences>,
    projectId: string,
    root: Y.Doc,
  ) {
    const sceneId = ensureScene(root, titles);
    const scene = getScene(root, sceneId);
    const handle = await platform.documents.open(guids.scene(projectId, sceneId));
    const paragraph = new Y.XmlElement('paragraph');
    paragraph.insert(0, [new Y.XmlText('Il pleuvait sur Nantes.')]);
    variantFragment(handle.doc, scene?.activeVariantId ?? '').insert(0, [paragraph]);
  }

  it('opens the novel that came, not another blank start, and trashes its own', async () => {
    const platform = withPreferences();
    const novel = await openProject(
      platform,
      (await platform.library.create({ title: titles.project, kind: 'novel' })).id,
      titles,
    );
    await write(platform, novel.projectId, novel.root);
    // Another device's blank start reached the account, more recent than the novel.
    const stray = (await platform.library.create({ title: titles.project, kind: 'novel' })).id;
    await openProject(platform, stray, titles);
    // This device's own blank start, open now.
    const own = await openProject(
      platform,
      (await platform.library.create({ title: titles.project, kind: 'novel' })).id,
      titles,
    );

    expect(await projectFromSync(platform, own, titles)).toBe(novel.projectId);
    expect((await platform.library.listTrashed()).map((p) => p.id)).toEqual([own.projectId]);
    expect((await platform.library.list()).map((p) => p.id)).toContain(stray);
  });

  it('opens the account’s blank start too, rather than doubling it with its own', async () => {
    const platform = withPreferences();
    // An account where only blank starts arrived (16 November 2026: three « Mon roman »).
    const theirs = (await platform.library.create({ title: titles.project, kind: 'novel' })).id;
    await openProject(platform, theirs, titles);
    const own = await openProject(
      platform,
      (await platform.library.create({ title: titles.project, kind: 'novel' })).id,
      titles,
    );
    expect(await projectFromSync(platform, own, titles)).toBe(theirs);
    expect((await platform.library.list()).map((p) => p.id)).toEqual([theirs]);
  });

  it('keeps a project already written in, and one alone', async () => {
    const platform = withPreferences();
    const written = await openProject(
      platform,
      (await platform.library.create({ title: titles.project, kind: 'novel' })).id,
      titles,
    );
    await write(platform, written.projectId, written.root);
    expect(await projectFromSync(platform, written, titles)).toBeNull();
    // A blank start with nothing else in the account stays open.
    const alone = withPreferences();
    const blank = await openProject(alone, await initialProjectId(alone, titles), titles);
    expect(await projectFromSync(alone, blank, titles)).toBeNull();
    expect(await alone.library.listTrashed()).toEqual([]);
  });
});
