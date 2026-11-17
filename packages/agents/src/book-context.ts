import type * as Y from 'yjs';
import { atelierContext, EMPTY_NOTEBOOK, notebookBody, type MemoryStore } from './memory';

/**
 * The Atelier and the notebook in the cached part of a call (the prompt
 * cache, phase 6.5): before the thread, as they stood when the thread's
 * window began, so that the thread after them is read from the cache as
 * long as they stay the same; what changed since goes with the author's
 * last words, at full price. Taking them again rewrites the thread after
 * them in the cache (twice the input price), so it happens only when the
 * window moves (the thread is written again then anyway) or when what
 * changed outgrows half of them.
 */
export interface BookContext {
  /** Sent before the thread, marked stable. */
  readonly stable: string;
  /** Sent with the author's last words: what changed since, and the first reading's notice. */
  readonly now: string;
}

interface Snapshot {
  readonly start: number;
  readonly entries: ReadonlyMap<string, string>;
  readonly text: string;
}

/** By mentor document, then by kind of call (each has its own system prompt, its own cache). */
const snapshots = new WeakMap<Y.Doc, Map<string, Snapshot>>();

/** Below this, what changed goes with the last words rather than rewriting the cache. */
const MIN_CHANGES = 4000;

export function bookContext(input: {
  readonly mentorDoc: Y.Doc;
  readonly store: MemoryStore;
  /** The kind of call: `chat`, `interview`. */
  readonly key: string;
  /** Where the thread's window starts (windowStart). */
  readonly start: number;
}): BookContext {
  const { store } = input;
  const byKey = snapshots.get(input.mentorDoc) ?? new Map<string, Snapshot>();
  snapshots.set(input.mentorDoc, byKey);
  const entries = store.entries();
  const notice = store.isEmpty() ? EMPTY_NOTEBOOK : '';
  const taken = byKey.get(input.key);
  if (taken?.start === input.start) {
    const changes = changesSince(taken.entries, entries);
    if (changes.length <= Math.max(MIN_CHANGES, taken.text.length / 2))
      return { stable: taken.text, now: [changes, notice].filter(Boolean).join('\n\n') };
  }
  const text = `The author's Atelier and your notebook as they stood when the thread below began (what changed since comes with the author's last words).\n\n${atelierContext(store)}\n\n${notebookBody(store)}`;
  byKey.set(input.key, { start: input.start, entries, text });
  return { stable: text, now: notice };
}

function changesSince(
  before: ReadonlyMap<string, string>,
  now: ReadonlyMap<string, string>,
): string {
  const changed = [...now].filter(([path, entry]) => before.get(path) !== entry);
  const removed = [...before.keys()].filter((path) => !now.has(path));
  if (changed.length === 0 && removed.length === 0) return '';
  return [
    'WHAT CHANGED in the Atelier and your notebook since the thread sent began (this wins over what came before it):',
    ...(changed.length
      ? [`<changed>\n${changed.map(([, entry]) => entry).join('\n\n')}\n</changed>`]
      : []),
    ...(removed.length ? [`Removed since: ${removed.join(', ')}`] : []),
  ].join('\n');
}
