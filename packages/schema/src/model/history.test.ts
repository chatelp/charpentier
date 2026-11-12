import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { appendParagraph, newProjectDoc, replicaOf, sync } from '../testing/yjs';
import {
  createCheckpoint,
  createVariantFromCheckpoint,
  listCheckpoints,
  restoreCheckpoint,
} from './history';
import { createChapter, createScene, getScene, setActiveVariant, trashVariant } from './manuscript';
import { createVariant, variantFragment } from './scene-content';

function setup() {
  const root = newProjectDoc();
  const chapterId = createChapter(root, { title: 'Un' });
  const { sceneId, variantId } = createScene(root, { chapterId, title: 'A' });
  const sceneDoc = new Y.Doc({ guid: `project:p1/scene:${sceneId}` });
  const historyDoc = new Y.Doc({ guid: `project:p1/scene:${sceneId}/history` });
  return {
    root,
    sceneId,
    variantId,
    sceneDoc,
    historyDoc,
    text: () =>
      variantFragment(sceneDoc, getScene(root, sceneId)?.activeVariantId ?? '').toString(),
  };
}

describe('variants', () => {
  it('copies a variant, keeping italics, and switches the active one', () => {
    const { root, sceneId, variantId, sceneDoc } = setup();
    const original = variantFragment(sceneDoc, variantId);
    appendParagraph(original, 'Il pleuvait.');
    appendParagraph(original, 'Odyssée', true);

    const copy = createVariant(root, sceneDoc, sceneId, {
      name: 'Version sombre',
      copyOf: variantId,
      activate: true,
    });
    expect(getScene(root, sceneId)?.activeVariantId).toBe(copy);
    expect(variantFragment(sceneDoc, copy).toString()).toBe(original.toString());
    expect(variantFragment(sceneDoc, copy).toString()).toContain('<italic>Odyssée</italic>');

    appendParagraph(variantFragment(sceneDoc, copy), 'Puis la nuit.');
    expect(original.toString()).not.toContain('Puis la nuit.');
    expect(getScene(root, sceneId)?.variants.map((v) => v.name)).toEqual(['', 'Version sombre']);
  });

  it('refuses to trash the active variant', () => {
    const { root, sceneId, variantId, sceneDoc } = setup();
    expect(() => trashVariant(root, sceneId, variantId)).toThrow();
    const other = createVariant(root, sceneDoc, sceneId, { name: 'B' });
    setActiveVariant(root, sceneId, other);
    trashVariant(root, sceneId, variantId);
    expect(getScene(root, sceneId)?.variants.map((v) => v.id)).toEqual([other]);
  });

  it('merges concurrent first edits of the same variant on two devices', () => {
    const { variantId, sceneDoc } = setup();
    const other = replicaOf(sceneDoc);
    appendParagraph(variantFragment(sceneDoc, variantId), 'De A.');
    appendParagraph(variantFragment(other, variantId), 'De B.');
    sync(sceneDoc, other);
    const merged = variantFragment(sceneDoc, variantId).toString();
    expect(merged).toBe(variantFragment(other, variantId).toString());
    expect(merged).toContain('De A.');
    expect(merged).toContain('De B.');
  });
});

describe('restore points', () => {
  it('restores an earlier state as a new edit, saving the current state first', () => {
    const { root, sceneId, variantId, sceneDoc, historyDoc } = setup();
    const fragment = variantFragment(sceneDoc, variantId);
    appendParagraph(fragment, 'Premier jet.');
    const before = fragment.toString();
    const checkpoint = createCheckpoint(sceneDoc, historyDoc, {
      variantId,
      reason: 'manual',
      label: 'Avant réécriture',
    });
    appendParagraph(fragment, 'Ajout regretté.');
    const regretted = fragment.toString();

    restoreCheckpoint(sceneDoc, historyDoc, checkpoint);
    expect(fragment.toString()).toBe(before);

    const [latest, original] = listCheckpoints(historyDoc, variantId);
    expect(latest?.reason).toBe('before-restore');
    expect(original).toMatchObject({ id: checkpoint, label: 'Avant réécriture' });

    // The overwritten state is itself recoverable.
    restoreCheckpoint(sceneDoc, historyDoc, latest?.id ?? '');
    expect(fragment.toString()).toBe(regretted);
    expect(getScene(root, sceneId)?.variants).toHaveLength(1);
  });

  it('survives encoding of the history document and can seed a new variant', () => {
    const { root, sceneId, variantId, sceneDoc, historyDoc } = setup();
    appendParagraph(variantFragment(sceneDoc, variantId), 'Version de mardi.', true);
    const checkpoint = createCheckpoint(sceneDoc, historyDoc, { variantId, reason: 'scene-end' });
    appendParagraph(variantFragment(sceneDoc, variantId), 'Mercredi.');

    const reloaded = replicaOf(historyDoc);
    const fromCheckpoint = createVariantFromCheckpoint(root, sceneDoc, reloaded, sceneId, {
      checkpointId: checkpoint,
      name: 'Mardi',
    });
    expect(variantFragment(sceneDoc, fromCheckpoint).toString()).toBe(
      '<paragraph><italic>Version de mardi.</italic></paragraph>',
    );
    expect(variantFragment(sceneDoc, variantId).toString()).toContain('Mercredi.');
    expect(getScene(root, sceneId)?.variants.find((v) => v.id === fromCheckpoint)?.origin).toBe(
      'checkpoint',
    );
  });
});
