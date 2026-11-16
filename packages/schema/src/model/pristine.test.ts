import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { parseSceneMarkdown } from '../markdown/parse';
import { createChapter, createScene } from './manuscript';
import { addChatMessage } from './mentor-chat';
import { createEntity } from './modules';
import { AUTHOR } from './origins';
import { initProject } from './project';
import { isPristineProject } from './pristine';
import { variantFragment } from './scene-content';
import { writeSceneDocToFragment } from './scene-text-bridge';

/** What a new device makes at its first start: one chapter, one empty scene. */
function starter() {
  const root = new Y.Doc();
  initProject(root, { id: 'p', title: 'Mon roman', kind: 'novel' });
  const chapterId = createChapter(root, { title: 'Chapitre 1' });
  const { sceneId, variantId } = createScene(root, { chapterId, title: 'Scène 1' });
  const scene = new Y.Doc();
  return { root, mentor: new Y.Doc(), scenes: new Map([[sceneId, scene]]), scene, variantId };
}

describe('a project nobody has touched yet', () => {
  it('is the starter of a new device', () => {
    expect(isPristineProject(starter())).toBe(true);
  });

  it('is no longer pristine with a word, a sheet or a message', () => {
    const written = starter();
    writeSceneDocToFragment(
      parseSceneMarkdown('Il pleuvait.'),
      variantFragment(written.scene, written.variantId),
    );
    expect(isPristineProject(written)).toBe(false);

    const sheet = starter();
    createEntity(sheet.root, 'characters', { name: 'Hélène' });
    expect(isPristineProject(sheet)).toBe(false);

    const talked = starter();
    addChatMessage(talked.mentor, { role: 'author', text: 'Bonjour' }, AUTHOR);
    expect(isPristineProject(talked)).toBe(false);

    const chapters = starter();
    createChapter(chapters.root, { title: 'Chapitre 2' });
    expect(isPristineProject(chapters)).toBe(false);
  });
});
