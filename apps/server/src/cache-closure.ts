import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { STORE_PATH } from './nix-cache';

/**
 * Closures in the X250's binary cache (D-42, phase 5.12 bis): what a system
 * needs, read from the `References` of the `.narinfo` files, to refuse a
 * version whose closure is incomplete and to forget, after a development
 * version, the files only the previous one used.
 */

/** A store path's hash part, as `.narinfo` files are named. */
const HASH = /^[0-9a-z]{32}$/;
/** A nar file, under `nar/`. */
const NAR_URL = /^nar\/[A-Za-z0-9_+=:!-][A-Za-z0-9._+=:!-]{0,250}$/;

interface NarInfo {
  readonly url: string | null;
  readonly references: readonly string[];
}

async function readNarInfo(cacheDir: string, hash: string): Promise<NarInfo | null> {
  let text: string;
  try {
    text = await readFile(join(cacheDir, `${hash}.narinfo`), 'utf8');
  } catch {
    return null;
  }
  const field = (name: string) => new RegExp(`^${name}: *(.*)$`, 'm').exec(text)?.[1]?.trim() ?? '';
  const url = field('URL');
  const references = field('References')
    .split(/\s+/)
    .map((name) => name.slice(0, 32))
    .filter((h) => HASH.test(h));
  return { url: NAR_URL.test(url) ? url : null, references };
}

/** The hash part of a system's store path. */
export const hashOf = (path: string): string | null => STORE_PATH.exec(path)?.[1] ?? null;

/**
 * The closure of some store paths in the cache: every path reached through
 * `References`, with its `.narinfo`, and the paths missing from the cache.
 */
export async function closure(
  cacheDir: string,
  roots: readonly string[],
): Promise<{ found: Map<string, NarInfo>; missing: Set<string> }> {
  const found = new Map<string, NarInfo>();
  const missing = new Set<string>();
  const todo = roots.map(hashOf).filter((h): h is string => h !== null);
  for (let hash = todo.pop(); hash !== undefined; hash = todo.pop()) {
    if (found.has(hash) || missing.has(hash)) continue;
    const info = await readNarInfo(cacheDir, hash);
    if (!info) {
      missing.add(hash);
      continue;
    }
    found.set(hash, info);
    todo.push(...info.references);
  }
  return { found, missing };
}

/**
 * Deletes from the cache what `forgotten` (the systems of a development
 * version no longer kept) used and `kept` (every system still published) does
 * not: the `.narinfo` first, so a device never reads a path whose nar is gone,
 * then the `.ls` and the nar. Nothing else: a path that no pointer ever named
 * (an upload not yet published) stays. Returns how many paths went.
 */
export async function forget(
  cacheDir: string,
  forgotten: readonly string[],
  kept: readonly string[],
): Promise<number> {
  const keep = await closure(cacheDir, kept);
  const keptNars = new Set([...keep.found.values()].map((info) => info.url));
  const gone = await closure(cacheDir, forgotten);
  let count = 0;
  for (const [hash, info] of gone.found) {
    if (keep.found.has(hash)) continue;
    await unlink(join(cacheDir, `${hash}.narinfo`)).catch(() => {});
    await unlink(join(cacheDir, `${hash}.ls`)).catch(() => {});
    if (info.url && !keptNars.has(info.url)) await unlink(join(cacheDir, info.url)).catch(() => {});
    count++;
  }
  return count;
}
