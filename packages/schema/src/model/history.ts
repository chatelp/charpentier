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
  /** Fingerprint of the content, to skip a checkpoint that changes nothing. */
  readonly digest?: string;
}

/** FNV-1a of the fragment's XML: equal content gives an equal digest. */
function digestOf(fragment: Y.XmlFragment): string {
  const text = fragment.toString();
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${text.length}:${(hash >>> 0).toString(16)}`;
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

/**
 * Saves the variant's current content. Nothing is saved (and undefined
 * returned) when the content equals the variant's latest checkpoint, whatever
 * the reason of either: that point already restores this very text, and a
 * second full copy would only make the history heavier (the author saving
 * twice, a safety point right after a manual one). A point the author names
 * is always saved: the name is theirs.
 */
export function createCheckpoint(
  sceneDoc: Y.Doc,
  historyDoc: Y.Doc,
  input: { variantId: string; reason: CheckpointReason; label?: string },
  origin: Origin = AUTHOR,
): string | undefined {
  const fragment = variantFragment(sceneDoc, input.variantId);
  const digest = digestOf(fragment);
  if (input.label === undefined) {
    const latest = checkpoints(historyDoc)
      .toArray()
      .findLast((c) => c.variantId === input.variantId);
    if (latest?.digest === digest) return undefined;
  }
  const id = newId();
  const entry: StoredCheckpoint = {
    id,
    variantId: input.variantId,
    createdAt: nowIso(),
    reason: input.reason,
    ...(input.label !== undefined && { label: input.label }),
    state: encodeFragment(fragment),
    digest,
  };
  historyDoc.transact(() => checkpoints(historyDoc).push([entry]), origin);
  return id;
}

/** Plain text of a checkpoint (paragraphs joined by line breaks), for previews. */
export function checkpointText(historyDoc: Y.Doc, checkpointId: string): string {
  const fragment = decodeFragment(findCheckpoint(historyDoc, checkpointId).state);
  return fragmentPlainText(fragment);
}

/** Plain text of a fragment: one line per block. */
export function fragmentPlainText(fragment: Y.XmlFragment): string {
  const lines: string[] = [];
  const walk = (node: unknown): string => {
    if (node instanceof Y.XmlText) return node.toString().replace(/<[^>]*>/g, '');
    if (node instanceof Y.XmlElement) return node.toArray().map(walk).join('');
    return '';
  };
  for (const block of fragment.toArray()) lines.push(walk(block));
  return lines.join('\n');
}

/** Automatic checkpoints kept per variant, besides the first one of each day. */
export const KEEP_RECENT_AUTOMATIC = 50;
const AUTOMATIC: readonly CheckpointReason[] = ['interval'];

/**
 * Keeps history from growing without bound. Only automatic checkpoints are
 * pruned: per variant, the most recent `keepRecent` are kept, and of older
 * ones the first of each day. Manual and safety checkpoints (before a
 * restore, a merge, a deletion) are never removed.
 */
export function pruneCheckpoints(
  historyDoc: Y.Doc,
  keepRecent = KEEP_RECENT_AUTOMATIC,
  origin: Origin = AUTHOR,
): number {
  const all = checkpoints(historyDoc).toArray();
  const doomed = new Set<string>();
  const byVariant = new Map<string, StoredCheckpoint[]>();
  for (const c of all) {
    if (!AUTOMATIC.includes(c.reason)) continue;
    byVariant.set(c.variantId, [...(byVariant.get(c.variantId) ?? []), c]);
  }
  for (const list of byVariant.values()) {
    const older = list.slice(0, Math.max(0, list.length - keepRecent));
    const seenDays = new Set<string>();
    for (const c of older) {
      const day = c.createdAt.slice(0, 10);
      if (seenDays.has(day)) doomed.add(c.id);
      else seenDays.add(day);
    }
  }
  if (doomed.size === 0) return 0;
  historyDoc.transact(() => {
    const array = checkpoints(historyDoc);
    for (let i = array.length - 1; i >= 0; i--) if (doomed.has(array.get(i).id)) array.delete(i, 1);
  }, origin);
  return doomed.size;
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
