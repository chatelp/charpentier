import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Database } from './database';
import { readJson, send } from './http-api';
import { closure, forget } from './cache-closure';
import { accessFor, credential, STORE_PATH } from './nix-cache';

/**
 * The X250's version pointer (D-31, phase 5.11):
 *
 *   PUT /api/updates/latest   the CI publishes a version, once its systems are in the cache
 *   GET /api/updates/latest   the last version published (a device of an account, or the CI)
 *
 * A version: `{ version: "0.6.0" | "0.6.0-2", notes, systems: { azerty: "/nix/store/…", … } }`,
 * to which the server adds `publishedAt`. Every version is kept.
 *
 * The development channel (D-42, phase 5.12 bis), read only by the X250's
 * development system, the same way:
 *
 *   PUT /api/updates/dev      a development version, `0.6.0-dev.3`, from the CI or the Yoga L13
 *   GET /api/updates/dev      the last one
 *
 * Only the last development version is kept: publishing one forgets the
 * previous, and deletes from the cache what only it used, never a file of a
 * release. A version, of either channel, is refused until its whole closure
 * is in the cache.
 */

export const UPDATES_PATH = '/api/updates/latest';
export const DEV_UPDATES_PATH = '/api/updates/dev';

/** The app's version, with a suffix when only the system changed (`0.6.0-2`). */
export const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-\d{1,4})?$/;
/** A development version: the last release's number, then `-dev.N`. */
export const DEV_VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}-dev\.\d{1,4}$/;

export type Channel = 'release' | 'dev';
const CHANNELS: Readonly<Record<string, Channel>> = {
  [UPDATES_PATH]: 'release',
  [DEV_UPDATES_PATH]: 'dev',
};
/** A keyboard layout naming a system. */
const LAYOUT = /^[a-z]{2,12}$/;
const MAX_NOTES = 20_000;

export interface Version {
  readonly version: string;
  readonly notes: string;
  readonly systems: Readonly<Record<string, string>>;
  readonly publishedAt: string;
}

/** The last version published on a channel (the releases by default), or null. */
export async function latestVersion(
  db: Database,
  channel: Channel = 'release',
): Promise<Version | null> {
  const { rows } = await db.query<{
    version: string;
    notes: string;
    systems: Record<string, string>;
    published_at: Date;
  }>(
    'select version, notes, systems, published_at from updates where channel = $1 order by id desc limit 1',
    [channel],
  );
  const row = rows[0];
  return row
    ? {
        version: row.version,
        notes: row.notes,
        systems: row.systems,
        publishedAt: new Date(row.published_at).toISOString(),
      }
    : null;
}

/** A version as the CI sends it, or why it is refused. */
export function parseVersion(
  body: Record<string, unknown> | null,
  channel: Channel = 'release',
): { version: string; notes: string; systems: Record<string, string> } | { error: string } {
  const version = body?.['version'];
  const notes = body?.['notes'] ?? '';
  const systems = body?.['systems'];
  const pattern = channel === 'dev' ? DEV_VERSION : VERSION;
  if (typeof version !== 'string' || !pattern.test(version)) return { error: 'version' };
  if (typeof notes !== 'string' || notes.length > MAX_NOTES) return { error: 'notes' };
  if (typeof systems !== 'object' || systems === null || Array.isArray(systems))
    return { error: 'systems' };
  const entries = Object.entries(systems as Record<string, unknown>);
  if (entries.length === 0 || entries.length > 8) return { error: 'systems' };
  const checked: Record<string, string> = {};
  for (const [layout, path] of entries) {
    if (!LAYOUT.test(layout) || typeof path !== 'string' || !STORE_PATH.test(path))
      return { error: 'systems' };
    checked[layout] = path;
  }
  return { version, notes, systems: checked };
}

/** Answers the version pointer. Returns false for any other path. */
export async function handleUpdates(
  db: Database,
  cacheDir: string | null,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const channel = CHANNELS[url.pathname];
  if (!channel) return false;
  const access = await accessFor(db, credential(request));
  if (!access) {
    send(response, 401, { error: 'not-signed-in' });
    return true;
  }
  if (request.method === 'GET') {
    const latest = await latestVersion(db, channel);
    send(response, latest ? 200 : 404, latest ?? { error: 'no-version' });
    return true;
  }
  if (request.method === 'PUT') {
    if (access !== 'ci') {
      send(response, 403, { error: 'ci-only' });
      return true;
    }
    const parsed = parseVersion(await readJson(request, MAX_NOTES + 10_000), channel);
    if ('error' in parsed) {
      send(response, 400, { error: parsed.error });
      return true;
    }
    // A version only points at what the devices can download: its systems
    // and everything they need.
    const systems = Object.values(parsed.systems);
    if (!cacheDir) {
      send(response, 409, { error: 'not-in-cache', path: systems[0] });
      return true;
    }
    const { missing } = await closure(cacheDir, systems);
    if (missing.size) {
      send(response, 409, { error: 'not-in-cache', path: [...missing][0] });
      return true;
    }
    const before =
      channel === 'dev'
        ? (
            await db.query<{ systems: Record<string, string> }>(
              "select systems from updates where channel = 'dev'",
            )
          ).rows.flatMap((row) => Object.values(row.systems))
        : [];
    const { rows } = await db.query<{ id: string }>(
      'insert into updates (version, notes, systems, channel) values ($1, $2, $3, $4) returning id',
      [parsed.version, parsed.notes, JSON.stringify(parsed.systems), channel],
    );
    if (channel === 'dev') {
      await db.query("delete from updates where channel = 'dev' and id <> $1", [rows[0]?.id]);
      const kept = (
        await db.query<{ systems: Record<string, string> }>('select systems from updates')
      ).rows.flatMap((row) => Object.values(row.systems));
      await forget(cacheDir, before, kept);
    }
    send(response, 201, await latestVersion(db, channel));
    return true;
  }
  send(response, 405, { error: 'method' });
  return true;
}
