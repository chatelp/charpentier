import type { Platform } from '@charpentier/platform';

/** How long a restart waits for the sync (docs/DESIGN.md §4.12 « Mises à jour »). */
export const SYNC_WAIT = 10_000;

/**
 * Before the device restarts or powers off: the texts are already on disk
 * (every change is written at once); the sync, when it is still sending, gets
 * up to ten seconds to finish, never more.
 */
export async function beforeRestart(platform: Platform, wait = SYNC_WAIT): Promise<void> {
  const sync = platform.sync;
  const busy = (status: string) => status === 'syncing' || status === 'connecting';
  if (!sync || !busy(sync.status())) return;
  await new Promise<void>((resolve) => {
    let stop: (() => void) | null = null;
    const done = () => {
      clearTimeout(timer);
      stop?.();
      resolve();
    };
    const timer = setTimeout(done, wait);
    stop = sync.onStatusChange((status) => {
      if (!busy(status)) done();
    });
  });
}
