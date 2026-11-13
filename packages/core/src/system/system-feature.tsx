import type { SystemService } from '@charpentier/platform';
import type { Command } from '../commands/registry';
import type { Feature } from '../features/feature';
import type { WorkspaceContext } from '../workspace/workspace-context';
import { systemPrefix } from './prefix';
import { systemSettingsSections } from './settings';
import { SystemLine, type SystemModifier } from './SystemLine';
import { systemUi, type Segment } from './system-store';
import { systemTexts } from './texts';

const system = (ctx: WorkspaceContext) => ctx.platform.system as SystemService;
const panel = (segment: Segment) => () => systemUi.open(segment);

/**
 * The X250's system (docs/SPEC.md D-24, docs/PLAN.md phase 5.3): the system
 * line at the top of the window, its panels, the `:` prefix, the keys of
 * the system and the settings view. Active when the host has a System
 * service; nothing of it exists on the Mac or the web.
 *
 * `modifier`: the system's key. Super on the device; on a host where ⌘ is
 * the app's key (the Mac, with a simulated system), Ctrl stands in for it.
 */
export function createSystemFeature({ modifier }: { readonly modifier: SystemModifier }): Feature {
  const key = (k: string) => `${modifier === 'Meta' ? 'Meta' : 'Ctrl'}-${k}`;
  const commands: Command<WorkspaceContext>[] = [
    { id: 'systemFocusLine', scope: 'global', run: () => systemUi.focusLine() },
    { id: 'systemWifi', scope: 'global', keybinding: key('w'), run: panel('wifi') },
    {
      id: 'systemBluetooth',
      scope: 'global',
      keybinding: key('b'),
      run: (ctx) => {
        if (!system(ctx).state().bluetooth.enabled) void system(ctx).setBluetooth(true);
        systemUi.open('bt');
      },
    },
    { id: 'systemJournal', scope: 'global', keybinding: key('j'), run: panel('message') },
    {
      id: 'systemUsb',
      scope: 'global',
      keybinding: key('u'),
      isEnabled: (ctx) => system(ctx).state().usb !== null,
      run: panel('usb'),
    },
    {
      id: 'systemSettings',
      scope: 'global',
      keybinding: key(','),
      run: (ctx) => ctx.openSettings(),
    },
    {
      id: 'systemSleep',
      scope: 'global',
      keybinding: key('Enter'),
      run: (ctx) => void system(ctx).suspend(),
    },
    // A light confirmation, in the system menu: ⏎ arms it for 3 s, a second ⏎ acts.
    { id: 'systemReboot', scope: 'global', run: panel('systeme') },
    { id: 'systemPowerOff', scope: 'global', run: panel('systeme') },
    { id: 'systemBrightness', scope: 'global', run: panel('lum') },
    { id: 'systemVolume', scope: 'global', run: panel('vol') },
    {
      id: 'systemMute',
      scope: 'global',
      run: (ctx) => void system(ctx).setMuted(!system(ctx).state().muted),
    },
    { id: 'systemNight', scope: 'global', run: panel('lum') },
    { id: 'systemBattery', scope: 'global', run: panel('bat') },
    { id: 'systemClock', scope: 'global', run: panel('date') },
  ];
  return {
    id: 'system',
    isActive: (platform) => platform.system !== null,
    texts: { fr: systemTexts },
    commands,
    topZone: {
      height: 30,
      component: ({ ctx }) => <SystemLine ctx={ctx} modifier={modifier} />,
    },
    settings: systemSettingsSections,
    settingsLook: { title: 'system.settings.title', material: 'system' },
    prefixes: [systemPrefix],
  };
}
