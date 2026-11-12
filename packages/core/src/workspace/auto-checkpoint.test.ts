import { createChapter, createScene, listCheckpoints, variantFragment } from '@charpentier/schema';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { AutoCheckpointer } from './auto-checkpoint';

function setup() {
  const root = new Y.Doc({ guid: 'project:p1' });
  root.getMap('meta').set('id', 'p1');
  const chapterId = createChapter(root, { title: 'Un' });
  const { variantId } = createScene(root, { chapterId, title: 'A' });
  const sceneDoc = new Y.Doc();
  const historyDoc = new Y.Doc();
  let tick: (() => void) | undefined;
  const timers = {
    setInterval: (fn: () => void) => (tick = fn),
    clearInterval: () => (tick = undefined),
  };
  const type = (text: string) => variantFragment(sceneDoc, variantId).push([new Y.XmlText(text)]);
  const count = () => listCheckpoints(historyDoc, variantId).length;
  return { sceneDoc, historyDoc, variantId, timers, type, count, tick: () => tick?.() };
}

describe('AutoCheckpointer', () => {
  it('saves on open, on each tick when the text changed, and when the scene is left', () => {
    const s = setup();
    s.type('Avant la séance.');
    const checkpointer = new AutoCheckpointer(
      s.sceneDoc,
      s.historyDoc,
      s.variantId,
      1000,
      s.timers,
    );
    expect(s.count()).toBe(1); // state before this writing session

    s.tick();
    expect(s.count()).toBe(1); // nothing typed: nothing saved

    s.type(' Une phrase.');
    s.tick();
    expect(s.count()).toBe(2);

    s.type(' Encore.');
    checkpointer.dispose();
    expect(s.count()).toBe(3);
    expect(listCheckpoints(s.historyDoc).every((c) => c.reason === 'interval')).toBe(true);
  });

  it('never saves the same state twice, even across openings', () => {
    const s = setup();
    new AutoCheckpointer(s.sceneDoc, s.historyDoc, s.variantId, 1000, s.timers).dispose();
    expect(s.count()).toBe(1); // an empty fragment is still a state…
    const again = new AutoCheckpointer(s.sceneDoc, s.historyDoc, s.variantId, 1000, s.timers);
    again.dispose();
    expect(s.count()).toBe(1); // …but never saved twice
  });
});
