import { getScene, guids, listChapters, listScenes } from '@charpentier/schema';
import { describe, expect, it } from 'vitest';
import { createTestPlatform } from '../testing/test-platform';
import { openDefaultScene } from './default-scene';

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

describe('openDefaultScene', () => {
  it('creates a project with one chapter and one scene the first time, then reopens it', async () => {
    const platform = withPreferences();
    const first = await openDefaultScene(platform, titles);
    const second = await openDefaultScene(platform, titles);
    expect(second.projectId).toBe(first.projectId);
    expect(second.sceneId).toBe(first.sceneId);

    const root = (await platform.documents.open(guids.project(first.projectId))).doc;
    const chapters = listChapters(root);
    expect(chapters.map((c) => c.title)).toEqual(['Chapitre 1']);
    expect(listScenes(root, chapters[0]?.id ?? '').map((s) => s.title)).toEqual(['Scène 1']);
    expect(getScene(root, first.sceneId)?.variants).toHaveLength(1);
  });

  it('creates a single project when opened twice at once', async () => {
    const platform = withPreferences();
    const [a, b] = await Promise.all([
      openDefaultScene(platform, titles),
      openDefaultScene(platform, titles),
    ]);
    expect(a.projectId).toBe(b.projectId);
    expect(a.sceneId).toBe(b.sceneId);
  });
});
