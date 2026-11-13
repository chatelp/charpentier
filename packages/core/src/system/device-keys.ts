import { batteryLevel, CRITICAL_BATTERY, type SystemService } from '@charpentier/platform';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { featureText } from '../features/feature';
import type { WorkspaceContext } from '../workspace/workspace-context';
import { postSoon } from './panels';
import { systemUi } from './system-store';

const STEP = 5;

/**
 * The ThinkPad's keys of light and sound (docs/DESIGN.md §4.12): the gauge of
 * the segment moves, the segment lights up for a second, the message says
 * « luminosité 70 % ». No window over the text. (The key values are the ones
 * Chromium gives to the XF86 keys.)
 */
export function useDeviceKeys(system: SystemService): void {
  const { t } = useTranslation();
  useEffect(() => {
    const text = featureText(t);
    const onKey = (event: KeyboardEvent) => {
      const state = system.state();
      const step = (value: number, up: boolean) =>
        Math.max(0, Math.min(100, Math.round(value / STEP) * STEP + (up ? STEP : -STEP)));
      switch (event.key) {
        case 'BrightnessUp':
        case 'BrightnessDown': {
          const value = Math.max(STEP, step(state.brightness, event.key === 'BrightnessUp'));
          void system.setBrightness(value);
          systemUi.light('lum');
          postSoon(system, 'lum', text('system.messages.brightness', { value }));
          break;
        }
        case 'AudioVolumeUp':
        case 'AudioVolumeDown': {
          const value = step(state.volume, event.key === 'AudioVolumeUp');
          void system.setVolume(value);
          systemUi.light('vol');
          postSoon(system, 'vol', text('system.messages.volume', { value }));
          break;
        }
        case 'AudioVolumeMute': {
          void system.setMuted(!state.muted);
          systemUi.light('vol');
          postSoon(
            system,
            'vol',
            text(state.muted ? 'system.messages.unmuted' : 'system.messages.muted'),
          );
          break;
        }
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [system, t]);
}

/**
 * The battery on its last legs (§4.12): under the threshold, one message
 * (« batterie faible · branchez l'appareil »); at 3 %, a restore point of the
 * scene, a message, then sleep. Nothing interrupts the typing before that;
 * plugging the device in starts over.
 */
export function useBatteryGuard(system: SystemService, ctx: WorkspaceContext | null): void {
  const { t } = useTranslation();
  const latest = useRef(ctx);
  useEffect(() => {
    latest.current = ctx;
  }, [ctx]);
  useEffect(() => {
    const text = featureText(t);
    let low = false;
    let critical = false;
    const check = () => {
      const state = system.state();
      if (state.power.charging || state.power.batteries.length === 0) {
        low = critical = false;
        return;
      }
      const level = batteryLevel(state);
      if (level <= state.settings.lowBattery && !low) {
        low = true;
        system.post(text('system.messages.lowBattery'));
      }
      if (level <= CRITICAL_BATTERY && !critical) {
        critical = true;
        void (async () => {
          await latest.current?.runCommand('createCheckpoint');
          system.post(text('system.messages.critical'));
          await system.suspend();
        })();
      }
    };
    check();
    return system.onChange(check);
  }, [system, t]);
}
