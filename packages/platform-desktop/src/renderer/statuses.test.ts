import type { LlmStatus } from '@charpentier/platform';
import { describe, expect, it } from 'vitest';
import type { DesktopBridge } from '../shared/ipc';
import { connectStatuses, createDesktopPlatform } from './index';

/** A main process that knows a key and a signed-in account, and answers after a moment. */
function bridge(): DesktopBridge {
  return {
    platform: 'darwin',
    invoke: (async (request: { type: string }) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (request.type === 'agents.status') return 'available';
      if (request.type === 'sync.status') return 'synced';
      return undefined;
    }) as DesktopBridge['invoke'],
    send: () => {},
    onMessage: () => () => {},
  };
}

// DESIGN §5.0, rule 7: the app says only what it knows. Seen by the author on 23 November
// 2026: « Compagnon : saisir la clé » in the footer at startup, to an author who has one.
describe('what the interface knows when it starts', () => {
  it('has the Compagnon and the sync as the main process knows them, from its first render', async () => {
    const main = bridge();
    const platform = createDesktopPlatform(main, { statuses: await connectStatuses(main) });
    const seen: LlmStatus[] = [platform.agents.status()];
    platform.agents.onStatusChange((status) => seen.push(status));
    expect(platform.sync?.status()).toBe('synced');
    await new Promise((resolve) => setTimeout(resolve, 30));
    // Never « no key », not even for an instant.
    expect(seen).toEqual(['available']);
  });
});
