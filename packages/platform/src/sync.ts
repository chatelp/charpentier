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

/** `out-of-reach`: the page does not answer from here (away from home, without Tailscale). */
export type AdminOpening = 'opened' | 'not-admin' | 'out-of-reach' | 'unreachable';

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
  /**
   * Nothing opens before signing in (the app the server serves, phase 4.7 a):
   * the author's novels are on the account, the core shows a sign-in screen.
   */
  readonly accountRequired?: boolean;
  status(): SyncStatus;
  /**
   * Waits until the server's copy of a document has been received (a
   * project of the account opened on a device where it is still empty),
   * or until it cannot be: offline, signed out, too long. True once heard.
   */
  whenDocumentSynced?(guid: string, timeoutMs?: number): Promise<boolean>;
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
   * Opens the server's administration page (`…/admin`, phase 4.6): in a
   * window of the app (desktop, X250), a new tab (web). Only for an account
   * that administers the server, and where the page answers (the home
   * network, Tailscale); otherwise, why not.
   */
  openAdmin(): Promise<AdminOpening>;
}
