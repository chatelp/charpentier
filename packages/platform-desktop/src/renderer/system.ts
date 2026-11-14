import type { MonitorInfo, SystemMonitor, SystemService } from '@charpentier/platform';
import type { DesktopBridge, SystemAction, SystemSnapshot } from '../shared/ipc';

const EMPTY_INFO: MonitorInfo = { gpu: null, screen: null, link: null, memoryTotal: 0 };

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
  const monitor: SystemMonitor | null = snapshot.monitor
    ? {
        open: async (onSample) => {
          const stop = bridge.onMessage((message) => {
            if (message.type === 'system.sample') onSample(message.sample);
          });
          const opened = await bridge.invoke({ type: 'system.monitorOpen' });
          if (!opened) {
            stop();
            return { info: EMPTY_INFO, history: [], close: () => {} };
          }
          return {
            ...opened,
            close: () => {
              stop();
              void bridge.invoke({ type: 'system.monitorClose' });
            },
          };
        },
      }
    : null;
  return {
    monitor,
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
    copyToUsb: call('copyToUsb'),
    print: call('print'),
    scanBluetooth: call('scanBluetooth'),
    pairBluetooth: call('pairBluetooth'),
    ejectUsb: call('ejectUsb'),
    lock: call('lock'),
    unlock: call('unlock'),
    setLockCode: call('setLockCode'),
    finishFirstStart: call('finishFirstStart'),
    startPhoneSetup: call('startPhoneSetup'),
    stopPhoneSetup: call('stopPhoneSetup'),
    checkUpdate: call('checkUpdate'),
    bootVersion: call('bootVersion'),
    suspend: call('suspend'),
    reboot: call('reboot'),
    powerOff: call('powerOff'),
  };
}
