/**
 * Three-way merge of a scene's paragraphs (docs/SPEC.md §17, D-8): `base` is
 * what the app last wrote to the file, `theirs` the file as edited outside,
 * `ours` the scene as it is now in the app. Changes on different paragraphs
 * combine; changes to the same stretch conflict.
 */
export type Merge3Result =
  { readonly ok: true; readonly merged: readonly string[] } | { readonly ok: false };

interface Hunk {
  /** Range replaced in base: [start, end). */
  readonly start: number;
  readonly end: number;
  readonly lines: readonly string[];
}

/** Changes from `base` to `other`, as hunks over base (LCS diff). */
export function diffHunks(base: readonly string[], other: readonly string[]): Hunk[] {
  const n = base.length;
  const m = other.length;
  // lcs[i * (m + 1) + j]: length of the longest common subsequence of base[i..] and other[j..].
  const width = m + 1;
  const lcs = new Int32Array((n + 1) * width);
  const at = (i: number, j: number) => lcs[i * width + j] ?? 0;
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i * width + j] =
        base[i] === other[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
  const hunks: Hunk[] = [];
  let i = 0;
  let j = 0;
  let open: { start: number; lines: string[] } | undefined;
  const close = () => {
    if (open) hunks.push({ start: open.start, end: i, lines: open.lines });
    open = undefined;
  };
  while (i < n || j < m) {
    if (i < n && j < m && base[i] === other[j]) {
      close();
      i++;
      j++;
    } else if (j < m && (i === n || at(i, j + 1) >= at(i + 1, j))) {
      open ??= { start: i, lines: [] };
      open.lines.push(other[j] ?? '');
      j++;
    } else {
      open ??= { start: i, lines: [] };
      i++;
    }
  }
  close();
  return hunks;
}

const sameHunk = (a: Hunk, b: Hunk) =>
  a.start === b.start && a.end === b.end && a.lines.join('\n') === b.lines.join('\n');

/** Hunks touch when their base ranges overlap, or both insert at the same place. */
const touch = (a: Hunk, b: Hunk) =>
  a.start < b.end || b.start < a.end
    ? a.start < b.end && b.start < a.end
    : a.start === b.start ||
      (a.start === a.end && a.start === b.end) ||
      (b.start === b.end && b.start === a.end);

export function merge3(
  base: readonly string[],
  ours: readonly string[],
  theirs: readonly string[],
): Merge3Result {
  const mine = diffHunks(base, ours);
  const yours = diffHunks(base, theirs);
  for (const a of mine)
    for (const b of yours) if (touch(a, b) && !sameHunk(a, b)) return { ok: false };
  const all = [...mine, ...yours.filter((b) => !mine.some((a) => sameHunk(a, b)))].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  );
  const merged: string[] = [];
  let at = 0;
  for (const hunk of all) {
    merged.push(...base.slice(at, hunk.start), ...hunk.lines);
    at = hunk.end;
  }
  merged.push(...base.slice(at));
  return { ok: true, merged };
}

/** Paragraphs of a scene's Markdown (blocks separated by blank lines). */
export const blocksOf = (markdown: string): string[] =>
  markdown
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
