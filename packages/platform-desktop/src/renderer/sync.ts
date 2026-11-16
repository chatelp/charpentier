import type { SyncService, SyncStatus } from '@charpentier/platform';
import type { DesktopBridge } from '../shared/ipc';

/** The sync as the renderer sees it: a status, signing in and out, the devices. */
export class IpcSyncService implements SyncService {
  #status: SyncStatus = 'off';
  readonly #listeners = new Set<(status: SyncStatus) => void>();

  constructor(private readonly bridge: DesktopBridge) {
    void bridge.invoke({ type: 'sync.status' }).then((status) => this.#set(status));
    bridge.onMessage((message) => {
      if (message.type === 'sync.status') this.#set(message.status);
    });
  }

  #set(status: SyncStatus) {
    if (status === this.#status) return;
    this.#status = status;
    for (const listener of this.#listeners) listener(status);
  }

  status(): SyncStatus {
    return this.#status;
  }

  onStatusChange(listener: (status: SyncStatus) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  account() {
    return this.bridge.invoke({ type: 'sync.account' });
  }

  signIn(input: { readonly server: string; readonly email: string; readonly password: string }) {
    return this.bridge.invoke({ type: 'sync.signIn', ...input });
  }

  async signOut() {
    await this.bridge.invoke({ type: 'sync.signOut' });
  }

  devices() {
    return this.bridge.invoke({ type: 'sync.devices' });
  }

  openAdmin() {
    return this.bridge.invoke({ type: 'sync.openAdmin' });
  }

  revokeDevice(id: string) {
    return this.bridge.invoke({ type: 'sync.revokeDevice', id });
  }
}
