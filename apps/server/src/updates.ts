import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Database } from './database';
import { readJson, send } from './http-api';
import { accessFor, credential, hasStorePath, STORE_PATH } from './nix-cache';

/**
 * The X250's version pointer (D-31, phase 5.11):
 *
 *   PUT /api/updates/latest   the CI publishes a version, once its systems are in the cache
 *   GET /api/updates/latest   the last version published (a device of an account, or the CI)
 *
 * A version: `{ version: "0.6.0" | "0.6.0-2", notes, systems: { azerty: "/nix/store/…", … } }`,
 * to which the server adds `publishedAt`. Every version is kept.
 */

export const UPDATES_PATH = '/api/updates/latest';

/** The app's version, with a suffix when only the system changed (`0.6.0-2`). */
const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-\d{1,4})?$/;
/** A keyboard layout naming a system. */
const LAYOUT = /^[a-z]{2,12}$/;
const MAX_NOTES = 20_000;

export interface Version {
  readonly version: string;
  readonly notes: string;
  readonly systems: Readonly<Record<string, string>>;
  readonly publishedAt: string;
}

/** The last version published, or null. */
export async function latestVersion(db: Database): Promise<Version | null> {
  const { rows } = await db.query<{
    version: string;
    notes: string;
    systems: Record<string, string>;
    published_at: Date;
  }>('select version, notes, systems, published_at from updates order by id desc limit 1');
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
): { version: string; notes: string; systems: Record<string, string> } | { error: string } {
  const version = body?.['version'];
  const notes = body?.['notes'] ?? '';
  const systems = body?.['systems'];
  if (typeof version !== 'string' || !VERSION.test(version)) return { error: 'version' };
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
  if (url.pathname !== UPDATES_PATH) return false;
  const access = await accessFor(db, credential(request));
  if (!access) {
    send(response, 401, { error: 'not-signed-in' });
    return true;
  }
  if (request.method === 'GET') {
    const latest = await latestVersion(db);
    send(response, latest ? 200 : 404, latest ?? { error: 'no-version' });
    return true;
  }
  if (request.method === 'PUT') {
    if (access !== 'ci') {
      send(response, 403, { error: 'ci-only' });
      return true;
    }
    const parsed = parseVersion(await readJson(request, MAX_NOTES + 10_000));
    if ('error' in parsed) {
      send(response, 400, { error: parsed.error });
      return true;
    }
    // A version only points at what the devices can download.
    for (const path of Object.values(parsed.systems)) {
      if (!cacheDir || !(await hasStorePath(cacheDir, path))) {
        send(response, 409, { error: 'not-in-cache', path });
        return true;
      }
    }
    await db.query('insert into updates (version, notes, systems) values ($1, $2, $3)', [
      parsed.version,
      parsed.notes,
      JSON.stringify(parsed.systems),
    ]);
    send(response, 201, await latestVersion(db));
    return true;
  }
  send(response, 405, { error: 'method' });
  return true;
}
