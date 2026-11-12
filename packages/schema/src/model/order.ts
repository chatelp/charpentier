import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

/**
 * Ordering of chapters and scenes by fractional keys (docs/SPEC.md §15.2).
 * Items are sorted by `(order, id)`: two replicas inserting at the same spot
 * concurrently may produce the same key, and the id breaks the tie the same
 * way everywhere.
 */
export interface Ordered {
  readonly id: string;
  readonly order: string;
}

export const compareOrdered = (a: Ordered, b: Ordered): number =>
  a.order < b.order ? -1 : a.order > b.order ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export const sortOrdered = <T extends Ordered>(items: readonly T[]): T[] =>
  [...items].sort(compareOrdered);

/**
 * Key that places an item at `index` among `siblings` (already sorted, the
 * moving item excluded). When neighbours share a key (after concurrent
 * inserts), siblings are re-keyed first; `rekey` is called with their new keys.
 */
export function keyAt(
  siblings: readonly Ordered[],
  index: number,
  rekey: (id: string, order: string) => void,
): string {
  const clamped = Math.max(0, Math.min(index, siblings.length));
  const before = siblings[clamped - 1];
  const after = siblings[clamped];
  if (!before || !after || before.order < after.order) {
    return generateKeyBetween(before?.order ?? null, after?.order ?? null);
  }
  const fresh = generateNKeysBetween(null, null, siblings.length + 1);
  let k = 0;
  siblings.forEach((sibling, i) => {
    if (i === clamped) k++; // leave room for the inserted item
    rekey(sibling.id, fresh[k++] as string);
  });
  return fresh[clamped] as string;
}
