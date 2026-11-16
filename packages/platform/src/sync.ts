/**
 * Sync with the author's own server (step 4, D-21): signing a device in and
 * out, the devices of the account, and where the sync stands. Writing never
 * depends on it. `null` on a host without sync (the web app outside its server).
 */

/**
 * `off` (not signed in), `connecting`, `synced`, `syncing` (changes on their
 * way), `offline` (writing goes on), `unauthorized` (signed out from
 * elsewhere, or the password changed: sign in again).
 */
export type SyncStatus = 'off' | 'connecting' | 'synced' | 'syncing' | 'offline' | 'unauthorized';

/** `no-keychain`: signed in, but this system has nowhere to keep the connection safely. */
export type SignInResult = 'ok' | 'invalid' | 'too-many-attempts' | 'unreachable' | 'no-keychain';

export interface SyncAccountInfo {
  readonly server: string;
  readonly email: string;
}

export interface SyncDevice {
  readonly id: string;
  readonly device: string;
  readonly lastSeenAt: string;
  /** This device. */
  readonly current: boolean;
}

export interface SyncService {
  /** The one server this host syncs with (the app in a browser: the server that served it); not asked. */
  readonly server?: string;
  status(): SyncStatus;
  onStatusChange(listener: (status: SyncStatus) => void): () => void;
  account(): Promise<SyncAccountInfo | null>;
  signIn(input: {
    readonly server: string;
    readonly email: string;
    readonly password: string;
  }): Promise<SignInResult>;
  /** The sync stops; the projects stay on the device. */
  signOut(): Promise<void>;
  /** The devices signed in to the account, or null when the server cannot be reached. */
  devices(): Promise<readonly SyncDevice[] | null>;
  /** Signs another device out. */
  revokeDevice(id: string): Promise<boolean>;
  /**
   * The address of the server's administration page (`…/admin`, phase 4.6)
   * when the account administers the server; null otherwise, or unreachable.
   */
  adminPage(): Promise<string | null>;
}
