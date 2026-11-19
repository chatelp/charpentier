import fs from 'node:fs';
import path from 'node:path';
import { writeJsonAtomic } from './projects';

/**
 * What the X250's update service needs to read the author's cache (docs/x250-update-contract.md,
 * phase 5.12): the sync server and this device's token. The service runs as
 * root and reads the file where it is; the app writes it at each sign-in and
 * removes it at sign-out. Owner only (0600), like the secrets.
 */
export function shareUpdateAccess(
  file: string,
  account: { readonly server: string; readonly token: string } | null,
): void {
  if (!account) {
    fs.rmSync(file, { force: true });
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeJsonAtomic(
    file,
    { server: account.server.replace(/\/+$/, ''), token: account.token },
    0o600,
  );
}

/**
 * The same, written only when it changes (a sign-in, a sign-out, another
 * server): the file is fsynced, and the app is asked far more often than the
 * account changes. The first call compares with what the disk holds.
 */
export function createUpdateAccessSharer(
  file: string,
): (account: { readonly server: string; readonly token: string } | null) => boolean {
  const read = () => {
    try {
      const stored = JSON.parse(fs.readFileSync(file, 'utf8')) as {
        server?: unknown;
        token?: unknown;
      };
      // Readable by the owner alone, or it is written again.
      if ((fs.statSync(file).mode & 0o777) !== 0o600) return undefined;
      return JSON.stringify([stored.server, stored.token]);
    } catch {
      return fs.existsSync(file) ? undefined : null;
    }
  };
  /** What the file holds: null when absent, undefined when unknown. */
  let shared: string | null | undefined;
  let known = false;
  return (account) => {
    if (!known) shared = read();
    known = true;
    const wanted = account
      ? JSON.stringify([account.server.replace(/\/+$/, ''), account.token])
      : null;
    if (wanted === shared) return false;
    // Unknown again should the write fail.
    shared = undefined;
    shareUpdateAccess(file, account);
    shared = wanted;
    return true;
  };
}
