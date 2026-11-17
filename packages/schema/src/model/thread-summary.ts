import type * as Y from 'yjs';
import { nowIso } from './ids';
import type { Origin } from './origins';

/**
 * The summary of the Compagnon's thread before the messages he is sent
 * (docs/PLAN.md phase 6.5, D-35): when the thread is long, only its last
 * messages go with a call; what came before goes as this summary, rewritten
 * a block at a time. It is his working memory, not the author's: the thread
 * itself stays whole in the mentor document.
 */

/** The top-level map of the mentor document holding it. */
export const THREAD_SUMMARY = 'threadSummary';

export interface ThreadSummary {
  readonly text: string;
  /** The last message it covers (by id: two devices may merge messages in the past). */
  readonly upTo: string;
  /** How many messages of the thread it covers. */
  readonly covered: number;
  readonly at: string;
}

export function readThreadSummary(mentorDoc: Y.Doc): ThreadSummary | undefined {
  const value = mentorDoc.getMap<unknown>(THREAD_SUMMARY).get('current') as
    Partial<ThreadSummary> | undefined;
  if (!value || typeof value.text !== 'string' || typeof value.upTo !== 'string') return undefined;
  return {
    text: value.text,
    upTo: value.upTo,
    covered: typeof value.covered === 'number' ? value.covered : 0,
    at: typeof value.at === 'string' ? value.at : '',
  };
}

/** One value, replaced whole (two devices never mix the text of one with the bounds of another). */
export function writeThreadSummary(
  mentorDoc: Y.Doc,
  summary: Omit<ThreadSummary, 'at'>,
  origin: Origin,
): void {
  mentorDoc.transact(
    () => mentorDoc.getMap<unknown>(THREAD_SUMMARY).set('current', { ...summary, at: nowIso() }),
    origin,
  );
}
