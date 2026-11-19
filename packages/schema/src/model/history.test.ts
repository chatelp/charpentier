import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { appendParagraph, newProjectDoc, replicaOf, sync } from '../testing/yjs';
import {
  checkpointText,
  createCheckpoint,
  createVariantFromCheckpoint,
  listCheckpoints,
  pruneCheckpoints,
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
    const checkpoint =
      createCheckpoint(sceneDoc, historyDoc, {
        variantId,
        reason: 'manual',
        label: 'Avant réécriture',
      }) ?? '';
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
    const checkpoint =
      createCheckpoint(sceneDoc, historyDoc, { variantId, reason: 'scene-end' }) ?? '';
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

describe('automatic checkpoints', () => {
  it('skip saving when nothing changed since the variant’s last checkpoint', () => {
    const { variantId, sceneDoc, historyDoc } = setup();
    appendParagraph(variantFragment(sceneDoc, variantId), 'Un.');
    expect(createCheckpoint(sceneDoc, historyDoc, { variantId, reason: 'interval' })).toBeDefined();
    expect(
      createCheckpoint(sceneDoc, historyDoc, { variantId, reason: 'interval' }),
    ).toBeUndefined();
    appendParagraph(variantFragment(sceneDoc, variantId), 'Deux.');
    expect(createCheckpoint(sceneDoc, historyDoc, { variantId, reason: 'interval' })).toBeDefined();
  });

  it('stores no second copy of an unchanged text, whatever the reasons (the author saving again)', () => {
    const { root, sceneId, variantId, sceneDoc, historyDoc } = setup();
    appendParagraph(variantFragment(sceneDoc, variantId), 'Il pleuvait sur Nantes.');
    expect(createCheckpoint(sceneDoc, historyDoc, { variantId, reason: 'interval' })).toBeDefined();
    const size = Y.encodeStateAsUpdate(historyDoc).length;
    // The author saves, again and again, a text the last point already holds.
    for (let i = 0; i < 50; i++)
      expect(
        createCheckpoint(sceneDoc, historyDoc, { variantId, reason: 'manual' }),
      ).toBeUndefined();
    expect(
      createCheckpoint(sceneDoc, historyDoc, { variantId, reason: 'before-external-merge' }),
    ).toBeUndefined();
    expect(listCheckpoints(historyDoc).map((c) => c.reason)).toEqual(['interval']);
    expect(Y.encodeStateAsUpdate(historyDoc).length).toBe(size);

    // A changed text is saved; then the same manual point is not saved twice.
    appendParagraph(variantFragment(sceneDoc, variantId), 'Hélène attendait.');
    const saved = createCheckpoint(sceneDoc, historyDoc, { variantId, reason: 'manual' });
    expect(saved).toBeDefined();
    expect(createCheckpoint(sceneDoc, historyDoc, { variantId, reason: 'manual' })).toBeUndefined();
    expect(listCheckpoints(historyDoc).map((c) => c.reason)).toEqual(['manual', 'interval']);

    // A point the author names is theirs: always saved.
    expect(
      createCheckpoint(sceneDoc, historyDoc, { variantId, reason: 'manual', label: 'Avant coupe' }),
    ).toBeDefined();

    // Only the same variant counts: another one with the same text gets its own point.
    const copy = createVariant(root, sceneDoc, sceneId, { name: 'Copie', copyOf: variantId });
    expect(
      createCheckpoint(sceneDoc, historyDoc, { variantId: copy, reason: 'manual' }),
    ).toBeDefined();

    // Restoring a text the latest point already holds adds no « before restore » copy, and still restores.
    const before = listCheckpoints(historyDoc).length;
    restoreCheckpoint(sceneDoc, historyDoc, saved ?? '');
    expect(listCheckpoints(historyDoc)).toHaveLength(before);
    expect(variantFragment(sceneDoc, variantId).toString()).toContain('Hélène attendait.');
  });

  it('gives a plain-text preview of a checkpoint', () => {
    const { variantId, sceneDoc, historyDoc } = setup();
    appendParagraph(variantFragment(sceneDoc, variantId), 'Il pleuvait.');
    appendParagraph(variantFragment(sceneDoc, variantId), 'Odyssée', true);
    const id = createCheckpoint(sceneDoc, historyDoc, { variantId, reason: 'manual' }) ?? '';
    expect(checkpointText(historyDoc, id)).toBe('Il pleuvait.\nOdyssée');
  });

  it('prunes old automatic checkpoints but keeps one per day and every manual or safety one', () => {
    const { variantId, sceneDoc, historyDoc } = setup();
    const days = ['2026-11-01', '2026-11-01', '2026-11-01', '2026-11-02', '2026-11-02'];
    const original = Date.prototype.toISOString;
    try {
      days.forEach((day, i) => {
        Date.prototype.toISOString = () => `${day}T10:0${i}:00.000Z`;
        appendParagraph(variantFragment(sceneDoc, variantId), `v${i}`);
        createCheckpoint(sceneDoc, historyDoc, {
          variantId,
          reason: i === 1 ? 'manual' : 'interval',
        });
      });
    } finally {
      Date.prototype.toISOString = original;
    }
    // Keep the 1 most recent automatic one; older ones: first of each day.
    expect(pruneCheckpoints(historyDoc, 1)).toBe(1);
    const kept = listCheckpoints(historyDoc, variantId).map(
      (c) => `${c.createdAt.slice(0, 16)} ${c.reason}`,
    );
    expect(kept).toEqual([
      '2026-11-02T10:04 interval', // most recent
      '2026-11-02T10:03 interval', // first of its day
      '2026-11-01T10:01 manual', // never pruned
      '2026-11-01T10:00 interval', // first of its day
    ]);
  });
});
