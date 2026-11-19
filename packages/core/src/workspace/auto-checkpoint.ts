import { createCheckpoint, pruneCheckpoints } from '@charpentier/schema';
import type * as Y from 'yjs';

export const AUTO_CHECKPOINT_INTERVAL_MS = 5 * 60_000;

interface Timers {
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
}

/**
 * Saves restore points of the variant being written (docs/SPEC.md §15.4, D-5):
 * one when the scene is opened, then one every few minutes while it changes,
 * and one when it is left. Identical content is never saved twice, and old
 * automatic points are pruned.
 */
export class AutoCheckpointer {
  #dirty = false;
  readonly #timer: unknown;

  constructor(
    private readonly sceneDoc: Y.Doc,
    private readonly historyDoc: Y.Doc,
    private readonly variantId: string,
    intervalMs = AUTO_CHECKPOINT_INTERVAL_MS,
    // eslint-disable-next-line charpentier/no-host-global-access -- typed as Timers: only setInterval and clearInterval are read
    private readonly timers: Timers = globalThis,
  ) {
    this.#save(); // the state before this writing session
    sceneDoc.on('update', this.#onUpdate);
    this.#timer = timers.setInterval(() => this.flush(), intervalMs);
  }

  #onUpdate = () => {
    this.#dirty = true;
  };

  #save(): void {
    createCheckpoint(this.sceneDoc, this.historyDoc, {
      variantId: this.variantId,
      reason: 'interval',
    });
  }

  /** Saves now if the text changed since the last save. */
  flush(): void {
    if (!this.#dirty) return;
    this.#dirty = false;
    this.#save();
    pruneCheckpoints(this.historyDoc);
  }

  dispose(): void {
    this.flush();
    this.timers.clearInterval(this.#timer);
    this.sceneDoc.off('update', this.#onUpdate);
  }
}
