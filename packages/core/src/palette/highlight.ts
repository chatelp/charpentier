const fold = (c: string) =>
  c
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * Ranges of `label` matched by the words of `query`, accent- and
 * case-insensitive (same rule as `filterByQuery`), merged and sorted.
 */
export function matchRanges(label: string, query: string): [number, number][] {
  // Fold character by character so that indexes stay those of `label`.
  const chars = [...label];
  const starts: number[] = [];
  let folded = '';
  let offset = 0;
  for (const c of chars) {
    const f = fold(c);
    for (let i = 0; i < f.length; i++) starts.push(offset);
    folded += f;
    offset += c.length;
  }
  starts.push(offset);
  const ranges: [number, number][] = [];
  for (const word of fold(query).split(/\s+/).filter(Boolean)) {
    const at = folded.indexOf(word);
    if (at >= 0) ranges.push([starts[at] ?? 0, starts[at + word.length] ?? offset]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}
