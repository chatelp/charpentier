import * as Y from 'yjs';
import { names, newId, nowIso } from './ids';
import { addVariantMeta } from './manuscript';
import { AUTHOR, type Origin } from './origins';
import { replaceFragmentContent, variantFragment } from './scene-content';

/**
 * Restore points of a scene, in `project:<pid>/scene:<sid>/history`
 * (docs/SPEC.md §15.4, D-5). A restore point stores the encoded content of
 * one variant. Restoring is a new, forward transaction: history is never
 * rewritten, and Yjs garbage collection stays on.
 */

export type CheckpointReason =
  | 'manual'
  | 'interval'
  | 'scene-end'
  | 'before-restore'
  | 'before-external-merge'
  | 'before-variant-delete';

export interface CheckpointInfo {
  readonly id: string;
  readonly variantId: string;
  readonly createdAt: string;
  readonly reason: CheckpointReason;
  readonly label?: string;
}

interface StoredCheckpoint extends CheckpointInfo {
  readonly state: Uint8Array;
}

const CONTENT = 'content';
const checkpoints = (historyDoc: Y.Doc) => historyDoc.getArray<StoredCheckpoint>(names.checkpoints);

function encodeFragment(fragment: Y.XmlFragment): Uint8Array {
  const snapshot = new Y.Doc();
  replaceFragmentContent(snapshot.getXmlFragment(CONTENT), fragment);
  return Y.encodeStateAsUpdate(snapshot);
}

function decodeFragment(state: Uint8Array): Y.XmlFragment {
  const snapshot = new Y.Doc();
  Y.applyUpdate(snapshot, state);
  return snapshot.getXmlFragment(CONTENT);
}

export function createCheckpoint(
  sceneDoc: Y.Doc,
  historyDoc: Y.Doc,
  input: { variantId: string; reason: CheckpointReason; label?: string },
  origin: Origin = AUTHOR,
): string {
  const id = newId();
  const entry: StoredCheckpoint = {
    id,
    variantId: input.variantId,
    createdAt: nowIso(),
    reason: input.reason,
    ...(input.label !== undefined && { label: input.label }),
    state: encodeFragment(variantFragment(sceneDoc, input.variantId)),
  };
  historyDoc.transact(() => checkpoints(historyDoc).push([entry]), origin);
  return id;
}

/** Restore points, newest first, optionally for one variant. */
export function listCheckpoints(historyDoc: Y.Doc, variantId?: string): CheckpointInfo[] {
  return checkpoints(historyDoc)
    .toArray()
    .filter((c) => variantId === undefined || c.variantId === variantId)
    .map(({ id, variantId, createdAt, reason, label }) => ({
      id,
      variantId,
      createdAt,
      reason,
      ...(label !== undefined && { label }),
    }))
    .reverse();
}

function findCheckpoint(historyDoc: Y.Doc, checkpointId: string): StoredCheckpoint {
  const found = checkpoints(historyDoc)
    .toArray()
    .find((c) => c.id === checkpointId);
  if (!found) throw new Error(`Unknown checkpoint: ${checkpointId}`);
  return found;
}

/**
 * Restores a checkpoint into a variant (by default the one it was taken from).
 * The current content is saved first as a `before-restore` checkpoint.
 */
export function restoreCheckpoint(
  sceneDoc: Y.Doc,
  historyDoc: Y.Doc,
  checkpointId: string,
  options: { into?: string } = {},
  origin: Origin = AUTHOR,
): void {
  const checkpoint = findCheckpoint(historyDoc, checkpointId);
  const target = options.into ?? checkpoint.variantId;
  createCheckpoint(sceneDoc, historyDoc, { variantId: target, reason: 'before-restore' }, origin);
  sceneDoc.transact(
    () =>
      replaceFragmentContent(variantFragment(sceneDoc, target), decodeFragment(checkpoint.state)),
    origin,
  );
}

/** Creates a new variant from a checkpoint, leaving existing variants untouched. */
export function createVariantFromCheckpoint(
  rootDoc: Y.Doc,
  sceneDoc: Y.Doc,
  historyDoc: Y.Doc,
  sceneId: string,
  input: { checkpointId: string; name: string; activate?: boolean },
  origin: Origin = AUTHOR,
): string {
  const checkpoint = findCheckpoint(historyDoc, input.checkpointId);
  const variantId = newId();
  sceneDoc.transact(
    () =>
      replaceFragmentContent(
        variantFragment(sceneDoc, variantId),
        decodeFragment(checkpoint.state),
      ),
    origin,
  );
  addVariantMeta(
    rootDoc,
    sceneId,
    {
      variantId,
      name: input.name,
      origin: 'checkpoint',
      ...(input.activate !== undefined && { activate: input.activate }),
    },
    origin,
  );
  return variantId;
}
