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
