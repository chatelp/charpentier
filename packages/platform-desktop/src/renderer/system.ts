import type { SystemService } from '@charpentier/platform';
import type { DesktopBridge, SystemAction, SystemSnapshot } from '../shared/ipc';

/**
 * The device's system seen from the interface (docs/PLAN.md phase 5.4): the
 * main process holds the service; the interface keeps its last snapshot,
 * read synchronously, and asks the main process for every action.
 * Null when the main process has none (the Mac, an ordinary Linux desktop).
 */
export async function connectSystem(bridge: DesktopBridge): Promise<SystemService | null> {
  let snapshot: SystemSnapshot | null = await bridge.invoke({ type: 'system.snapshot' });
  if (!snapshot) return null;
  const listeners = new Set<() => void>();
  bridge.onMessage((message) => {
    if (message.type !== 'system.changed') return;
    snapshot = message.snapshot;
    for (const listener of listeners) listener();
  });
  const call =
    <M extends SystemAction>(method: M) =>
    (...args: Parameters<SystemService[M]>) =>
      bridge.invoke({ type: 'system.call', method, args }) as ReturnType<SystemService[M]>;
  const current = () => snapshot as SystemSnapshot;
  return {
    state: () => current().state,
    journal: () => current().journal,
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    post: (text) => void bridge.invoke({ type: 'system.post', text }),
    setWifi: call('setWifi'),
    connectWifi: call('connectWifi'),
    forgetWifi: call('forgetWifi'),
    setBluetooth: call('setBluetooth'),
    forgetBluetooth: call('forgetBluetooth'),
    setBrightness: call('setBrightness'),
    setNightMode: call('setNightMode'),
    setVolume: call('setVolume'),
    setMuted: call('setMuted'),
    setSetting: call('setSetting') as SystemService['setSetting'],
    ejectUsb: call('ejectUsb'),
    suspend: call('suspend'),
    reboot: call('reboot'),
    powerOff: call('powerOff'),
  };
}
