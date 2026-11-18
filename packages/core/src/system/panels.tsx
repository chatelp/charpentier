import {
  batteryLevel,
  deviceVersionLabel,
  type SyncAccountInfo,
  type SystemService,
  type WifiNetwork,
} from '@charpentier/platform';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlatform } from '../app/platform-context';
import { featureText } from '../features/feature';
import { CloseButton } from '../icons/CloseButton';
import type { WorkspaceContext } from '../workspace/workspace-context';
import { Gauge, Keys, PanelRow, Signal, Slider } from './controls';
import { beforeRestart } from './restart';
import { systemUi, useJournal, useSystemState, useSystemUi, type Segment } from './system-store';

const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** A message of a gesture, once the gesture settles (not one per step of a slider). */
export function postSoon(system: SystemService, key: string, text: string) {
  clearTimeout(timers.get(key));
  timers.set(
    key,
    setTimeout(() => system.post(text), 600),
  );
}

/** A destructive item (« Redémarrer… »): a first ⏎ arms it for 3 s, a second one acts. */
function useArmed(
  initial: string | null = null,
): [string | null, (id: string, act: () => void) => void, (id: string | null) => void] {
  const [armed, setArmed] = useState<string | null>(initial);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(null), 3000);
    return () => clearTimeout(timer);
  }, [armed]);
  return [
    armed,
    (id, act) => {
      if (armed === id) {
        setArmed(null);
        act();
      } else setArmed(id);
    },
    setArmed,
  ];
}

/** The panel of a segment of the system line (docs/DESIGN.md §4.12). */
export function SystemPanel({
  segment,
  ctx,
  onDone,
}: {
  readonly segment: Segment;
  readonly ctx: WorkspaceContext | null;
  /** Closes the panel and gives the focus back to the text. */
  readonly onDone: () => void;
}) {
  const body = useRef<HTMLDivElement>(null);
  // Another segment's panel in the same place: its first control takes the focus.
  useEffect(() => focusFirstControl(body.current), [segment]);
  return (
    <div ref={body} className="ch-sys-panel-body" onKeyDown={(e) => moveInPanel(e, body.current)}>
      <PanelClose.Provider value={onDone}>{PANELS[segment]({ ctx, onDone })}</PanelClose.Provider>
    </div>
  );
}

/**
 * Opened from the keyboard or a click: the first control takes the focus (never
 * the close cross of the header). Also
 * called once the panel is placed, a hidden element taking no focus.
 */
export function focusFirstControl(root: HTMLElement | null) {
  // An item armed by the command that opened the panel comes first: ⏎ confirms it.
  (
    root?.querySelector<HTMLElement>('.is-armed') ??
    root?.querySelector<HTMLElement>(
      'input:not([type=range]), button.is-item, [role=radio][aria-checked=true], input, button:not(.ch-close)',
    )
  )?.focus();
}

/** ↑ ↓ go from one line to the next in a panel. */
function moveInPanel(event: React.KeyboardEvent, root: HTMLElement | null) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  if (event.target instanceof HTMLInputElement && event.target.type === 'range') return;
  const items = [...(root?.querySelectorAll<HTMLElement>('.is-item') ?? [])];
  const index = items.findIndex((el) => el === document.activeElement);
  if (index < 0 && items.length === 0) return;
  event.preventDefault();
  const next =
    items[Math.max(0, Math.min(items.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))];
  next?.focus();
}

interface PanelProps {
  readonly ctx: WorkspaceContext | null;
  readonly onDone: () => void;
}

/** Closes the panel open around a header (its close cross, docs/DESIGN.md §4.8). */
const PanelClose = createContext<(() => void) | null>(null);

function Head({ name, aside }: { readonly name: string; readonly aside?: ReactNode }) {
  const close = useContext(PanelClose);
  return (
    <p className="ch-sys-head">
      <span>{name}</span>
      <span className="ch-sys-head-end">
        {aside && <span className="ch-sys-head-aside">{aside}</span>}
        {close && <CloseButton purpose="generic" onClose={close} system />}
      </span>
    </p>
  );
}

function useSys() {
  const platform = usePlatform();
  const system = platform.system as SystemService;
  const state = useSystemState(system);
  const { t, i18n } = useTranslation();
  return { platform, system, state, text: featureText(t), language: i18n.language };
}

/** `13 nov.` */
export const shortDate = (iso: string, language: string) =>
  new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short' }).format(new Date(iso));

/** `5 h 40` */
export const hours = (minutes: number) =>
  `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;

export const minutesSince = (iso: string) =>
  Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
export const duration = (minutes: number) =>
  minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;

function MenuPanel({ ctx, onDone }: PanelProps) {
  const { platform, system, state, text } = useSys();
  const ready = state.update?.ready;
  // Opened by « Redémarrer… » or « Éteindre… »: that line already armed, and focused.
  const asked = useSystemUi().armed;
  const [armed, arm, setArmed] = useArmed(asked);
  useEffect(() => {
    if (!asked) return;
    setArmed(asked);
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('.ch-sys-panel-body .is-armed')?.focus(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when a command asks
  }, [asked]);
  const key = (id: string) => ctx?.shortcutLabel(id);
  const item = (
    id: string,
    label: string,
    act: () => void,
    disabled = false,
    keyLabel = key(id),
  ) => (
    <button
      key={id}
      type="button"
      className={`ch-sys-item is-item${keyLabel === '⏎' ? ' is-armed' : ''}`}
      disabled={disabled}
      onClick={act}
    >
      <span>{label}</span>
      {keyLabel && <kbd>{keyLabel}</kbd>}
    </button>
  );
  return (
    <>
      <Head
        name={text('system.panel.menu')}
        aside={text('system.panel.version', {
          app: deviceVersionLabel(state),
          os: state.device.osVersion,
          name: state.device.name,
        })}
      />
      {item('systemSettings', text('system.panel.settings'), () => {
        onDone();
        ctx?.openSystemSettings();
      })}
      {item(
        'systemPrint',
        text('system.panel.print'),
        () => {
          onDone();
          systemUi.print('scene');
        },
        !ctx || state.printers.length === 0,
      )}
      {item(
        'systemUsb',
        text('system.panel.usbCopy'),
        () => {
          onDone();
          void system.copyToUsb();
        },
        !state.usb,
      )}
      {item(
        'systemLock',
        text('system.panel.lock'),
        () => {
          onDone();
          void system.lock();
        },
        !state.lock.hasCode,
      )}
      {item('systemSleep', text('system.panel.sleep'), () => void system.suspend())}
      {item(
        'systemReboot',
        armed === 'reboot' ? text('system.panel.confirmReboot') : text('system.panel.reboot'),
        () => arm('reboot', () => void beforeRestart(platform).then(() => system.reboot())),
        false,
        armed === 'reboot' ? '⏎' : undefined,
      )}
      {item(
        'systemPowerOff',
        armed === 'off' ? text('system.panel.confirmPowerOff') : text('system.panel.powerOff'),
        () => arm('off', () => void beforeRestart(platform).then(() => system.powerOff())),
        false,
        armed === 'off' ? '⏎' : undefined,
      )}
      {/* Any start installs the version ready: said here, never hidden. */}
      {ready && (
        <p className="ch-sys-note">
          {text('system.panel.updateAnyStart', { version: ready.version })}
        </p>
      )}
      <p className="ch-sys-foot">
        {text('system.panel.menuFoot', {
          time: duration(minutesSince(state.device.bootedAt)),
          key: ctx?.platform.keybindings.primaryModifier === 'Meta' ? '⌃' : '⊞',
        })}
      </p>
    </>
  );
}

/** The update ready (⊞R): its notes, « Redémarrer maintenant », « Plus tard ». */
function UpdatePanel({ ctx, onDone }: PanelProps) {
  const { platform, system, state, text, language } = useSys();
  const [armed, arm] = useArmed();
  const ready = state.update?.ready;
  if (!ready)
    return (
      <>
        <Head name={text('system.panel.update')} />
        <p className="ch-sys-note">
          {text('system.panel.updateNone', { version: deviceVersionLabel(state) })}
        </p>
      </>
    );
  return (
    <>
      <Head name={text('system.panel.update')} aside={ctx?.shortcutLabel('systemUpdate')} />
      <p className="ch-sys-update-head">
        <span>{text('system.panel.updateReady', { version: ready.version })}</span>
        {ready.publishedAt && (
          <span className="ch-sys-faint">
            {text('system.panel.updatePublished', {
              date: shortDate(ready.publishedAt, language),
            })}
          </span>
        )}
      </p>
      {ready.notes.length > 0 && (
        <ul className="ch-sys-notes">
          {ready.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      <div className="ch-sys-list">
        <button
          type="button"
          className="ch-sys-item is-item"
          onClick={() =>
            arm('restart', () => void beforeRestart(platform).then(() => system.reboot()))
          }
        >
          <span>{text(armed ? 'system.panel.confirmReboot' : 'system.panel.updateRestart')}</span>
          <kbd>⏎</kbd>
        </button>
        <button type="button" className="ch-sys-item is-item" onClick={onDone}>
          <span>{text('system.panel.updateLater')}</span>
          <kbd>{text('system.panel.escapeKey')}</kbd>
        </button>
      </div>
      <p className="ch-sys-foot">{text('system.panel.updateFoot')}</p>
    </>
  );
}

function JournalPanel() {
  const { system, text, language } = useSys();
  const journal = useJournal(system);
  const time = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' });
  return (
    <>
      <Head name={text('system.panel.journal')} aside={text('system.panel.journalSince')} />
      {journal.length === 0 && <p className="ch-sys-note">{text('system.panel.journalNone')}</p>}
      <ol className="ch-sys-journal">
        {[...journal].reverse().map((m) => (
          <li key={m.id} className="is-item" tabIndex={-1}>
            <span className="ch-sys-time">{time.format(new Date(m.at))}</span>
            <span>{m.text}</span>
          </li>
        ))}
      </ol>
    </>
  );
}

/** « Copier mes textes »: every project in Markdown to the key; the message says how it went. */
function CopyButton({ system }: { readonly system: SystemService }) {
  const { text } = useSys();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="ch-sys-item is-item"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void system.copyToUsb().finally(() => setBusy(false));
      }}
    >
      <span>{text(busy ? 'system.panel.copying' : 'system.panel.copy')}</span>
    </button>
  );
}

function UsbPanel() {
  const { system, state, text } = useSys();
  if (!state.usb) return <Head name={text('system.panel.usb')} />;
  return (
    <>
      <Head name={text('system.panel.usb')} aside={state.usb.name} />
      <CopyButton system={system} />
      <p className="ch-sys-note">{text('system.panel.copyHelp')}</p>
      <button type="button" className="ch-sys-item is-item" onClick={() => void system.ejectUsb()}>
        <span>{text('system.panel.eject')}</span>
      </button>
    </>
  );
}

function CpuPanel() {
  const { state, text } = useSys();
  return (
    <>
      <Head name={text('system.seg.cpu')} aside={state.device.model} />
      <p className="ch-sys-note">{text('system.panel.cpuFromProject')}</p>
      <PanelRow label={text('system.seg.cpu')}>
        <span className="ch-sys-value">
          {text('system.seg.cpuValue', {
            load: Math.round(state.cpu.load),
            temp: Math.round(state.cpu.temperature),
          })}
        </span>
      </PanelRow>
    </>
  );
}

function WifiPanel({ ctx }: PanelProps) {
  const { system, state, text } = useSys();
  const [chosen, setChosen] = useState<WifiNetwork | null>(null);
  const [password, setPassword] = useState('');
  const [refused, setRefused] = useState(false);
  const connect = async (network: WifiNetwork, secret?: string) => {
    const result = await system.connectWifi(network.ssid, secret);
    setRefused(result === 'wrong-password');
    if (result === 'connected') {
      setChosen(null);
      setPassword('');
    }
  };
  const choose = (network: WifiNetwork) => {
    if (network.ssid === state.wifi.connected) return;
    if (network.secure && !network.known) {
      setChosen(network);
      setRefused(false);
    } else void connect(network);
  };
  const yesNo = [
    { value: true, label: text('system.panel.yes') },
    { value: false, label: text('system.panel.no') },
  ];
  return (
    <>
      <Head
        name={text('system.panel.wifi')}
        aside={<kbd>{ctx?.shortcutLabel('systemWifi')}</kbd>}
      />
      <PanelRow label={text('system.panel.wifiSwitch')}>
        <Keys
          options={yesNo}
          value={state.wifi.enabled}
          label={text('system.panel.wifiSwitch')}
          onChange={(on) => void system.setWifi(on)}
        />
      </PanelRow>
      {state.wifi.enabled && (
        <div className="ch-sys-list" role="listbox">
          {state.wifi.networks.map((n) => (
            <button
              key={n.ssid}
              type="button"
              role="option"
              aria-selected={n.ssid === state.wifi.connected}
              className={`ch-sys-item is-item${n.ssid === state.wifi.connected ? ' is-chosen' : ''}`}
              onClick={() => choose(n)}
              onKeyDown={(e) => {
                if (e.key.toLowerCase() === 'o' && n.known) {
                  e.preventDefault();
                  void system.forgetWifi(n.ssid);
                }
              }}
            >
              <span>{n.ssid}</span>
              <span className="ch-sys-item-aside">
                {n.ssid === state.wifi.connected && text('system.panel.connected')}
                <Signal bars={n.signal} />
                {n.portal ? (
                  text('system.panel.portal')
                ) : n.secure ? (
                  <span className="ch-sys-faint">{text('system.panel.protected')}</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      )}
      {chosen && (
        <input
          className="ch-field ch-sys-field"
          type="password"
          autoFocus
          value={password}
          placeholder={text('system.panel.password', { ssid: chosen.ssid })}
          aria-label={text('system.panel.password', { ssid: chosen.ssid })}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void connect(chosen, password);
            }
          }}
        />
      )}
      {refused && <p className="ch-sys-note">{text('system.panel.wrongPassword')}</p>}
      {state.wifi.networks.some((n) => n.portal) && (
        <p className="ch-sys-note">{text('system.panel.portalHelp')}</p>
      )}
      <p className="ch-sys-foot">
        {text('system.panel.wifiKeys')}
        {state.wifi.address && ` · ${state.wifi.address}`}
      </p>
    </>
  );
}

function BluetoothPanel({ ctx }: PanelProps) {
  const { system, state, text } = useSys();
  return (
    <>
      <Head
        name={text('system.panel.bluetooth')}
        aside={<kbd>{ctx?.shortcutLabel('systemBluetooth')}</kbd>}
      />
      <PanelRow label={text('system.panel.btSwitch')}>
        <Keys
          options={[
            { value: true, label: text('system.panel.yes') },
            { value: false, label: text('system.panel.no') },
          ]}
          value={state.bluetooth.enabled}
          label={text('system.panel.btSwitch')}
          onChange={(on) => void system.setBluetooth(on)}
        />
      </PanelRow>
      <p className="ch-sys-sub">{text('system.panel.btKnown')}</p>
      {state.bluetooth.devices.length === 0 && (
        <p className="ch-sys-note">{text('system.panel.btNone')}</p>
      )}
      {state.bluetooth.devices.map((d) => (
        <PanelRow key={d.id} label={d.name}>
          {d.connected && <span className="ch-sys-value">{text('system.panel.btConnected')}</span>}
          <button
            type="button"
            className="ch-btn is-item"
            onClick={() => void system.forgetBluetooth(d.id)}
          >
            {text('system.panel.forget')}
          </button>
        </PanelRow>
      ))}
    </>
  );
}

function LumPanel() {
  const { system, state, text } = useSys();
  return (
    <>
      <Head name={text('system.panel.lum')} aside={`${state.brightness}`} />
      <Slider
        value={state.brightness}
        min={5}
        label={text('system.panel.lum')}
        onChange={(v) => {
          void system.setBrightness(v);
          postSoon(system, 'lum', text('system.messages.brightness', { value: v }));
        }}
      />
      <PanelRow label={text('system.panel.night')}>
        <Keys
          options={[
            { value: 'auto', label: text('system.panel.nightAuto') },
            { value: 'on', label: text('system.panel.yes') },
            { value: 'off', label: text('system.panel.no') },
          ]}
          value={state.night.mode}
          label={text('system.panel.night')}
          onChange={(mode) => void system.setNightMode(mode)}
        />
      </PanelRow>
      <PanelRow label={text('system.panel.external')}>
        <span className="ch-sys-value">
          {state.externalScreen ?? text('system.panel.externalNone')}
        </span>
      </PanelRow>
    </>
  );
}

function VolPanel({ ctx }: PanelProps) {
  const { system, state, text } = useSys();
  const yesNo = [
    { value: true, label: text('system.panel.yes') },
    { value: false, label: text('system.panel.no') },
  ];
  return (
    <>
      <Head
        name={text('system.panel.vol')}
        aside={state.muted ? text('system.seg.muted') : `${state.volume}`}
      />
      <Slider
        value={state.volume}
        label={text('system.panel.vol')}
        onChange={(v) => {
          void system.setVolume(v);
          postSoon(system, 'vol', text('system.messages.volume', { value: v }));
        }}
      />
      <PanelRow label={text('system.panel.mute')}>
        <Keys
          options={yesNo}
          value={state.muted}
          label={text('system.panel.mute')}
          onChange={(m) => void system.setMuted(m)}
        />
      </PanelRow>
      {ctx && (
        <>
          <PanelRow label={text('system.panel.uiSounds')}>
            <Keys
              options={yesNo}
              value={ctx.prefs.uiSounds}
              label={text('system.panel.uiSounds')}
              onChange={(on) => ctx.updatePrefs({ uiSounds: on })}
            />
          </PanelRow>
          <PanelRow label={text('system.panel.typingSounds')}>
            <Keys
              options={yesNo}
              value={ctx.prefs.typingSounds}
              label={text('system.panel.typingSounds')}
              onChange={(on) => ctx.updatePrefs({ typingSounds: on })}
            />
          </PanelRow>
        </>
      )}
    </>
  );
}

function BatPanel() {
  const { system, state, text, language } = useSys();
  const level = batteryLevel(state);
  return (
    <>
      <Head
        name={text('system.panel.bat')}
        aside={
          state.power.charging
            ? text('system.panel.charging')
            : state.power.remaining !== null
              ? text('system.panel.batHead', { level, time: hours(state.power.remaining) })
              : text('system.seg.percent', { value: level })
        }
      />
      {state.power.batteries.map((b) => (
        <PanelRow key={b.name} label={text('system.panel.battery', { name: b.name })}>
          <Gauge value={b.level} />
          <span className="ch-sys-value">
            {text('system.panel.batteryLine', { level: b.level, wear: 100 - b.health })}
          </span>
        </PanelRow>
      ))}
      <PanelRow label={text('system.panel.power')}>
        <span className="ch-sys-value">
          {text('system.panel.watts', {
            value: new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(
              state.power.watts,
            ),
          })}
        </span>
      </PanelRow>
      <PanelRow label={text('system.panel.screenOff')}>
        <Keys
          options={[
            { value: 5, label: text('system.panel.minutes', { value: 5 }) },
            { value: 15, label: text('system.panel.minutes', { value: 15 }) },
            { value: null, label: text('system.panel.never') },
          ]}
          value={state.settings.screenOffAfter}
          label={text('system.panel.screenOff')}
          onChange={(v) => void system.setSetting('screenOffAfter', v)}
        />
      </PanelRow>
      <PanelRow label={text('system.panel.sleepAfter')}>
        <Keys
          options={[
            { value: 15, label: text('system.panel.minutes', { value: 15 }) },
            { value: 30, label: text('system.panel.minutes', { value: 30 }) },
            { value: null, label: text('system.panel.never') },
          ]}
          value={state.settings.sleepAfter}
          label={text('system.panel.sleepAfter')}
          onChange={(v) => void system.setSetting('sleepAfter', v)}
        />
      </PanelRow>
    </>
  );
}

function SyncPanel() {
  const platform = usePlatform();
  const { text } = useSys();
  const [account, setAccount] = useState<SyncAccountInfo | null>(null);
  useEffect(() => {
    let cancelled = false;
    void platform.sync?.account().then((a) => !cancelled && setAccount(a));
    return () => {
      cancelled = true;
    };
  }, [platform]);
  return (
    <>
      <Head name={text('system.panel.sync')} />
      <PanelRow label={text('system.panel.server')}>
        <span className="ch-sys-value">{account?.server ?? text('system.panel.noServer')}</span>
      </PanelRow>
    </>
  );
}

/** ISO week number. */
const weekOf = (date: Date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - year.getTime()) / 86_400_000 + 1) / 7);
};

function DatePanel({ ctx }: PanelProps) {
  const { state, text, language } = useSys();
  const now = new Date();
  const zone = state.timeZone;
  return (
    <>
      <Head name={text('system.panel.date')} aside={text('system.panel.zone', { zone })} />
      <p className="ch-sys-big">
        {new Intl.DateTimeFormat(language, {
          hour: '2-digit',
          minute: '2-digit',
          hour12: !state.settings.clock24,
          timeZone: zone,
        }).format(now)}
      </p>
      <p className="ch-sys-note">
        {new Intl.DateTimeFormat(language, { dateStyle: 'full', timeZone: zone }).format(now)}
        {' · '}
        {text('system.panel.week', { week: weekOf(now) })}
      </p>
      {ctx && (
        <p className="ch-sys-foot">{text('system.panel.today', { count: ctx.wordsToday })}</p>
      )}
    </>
  );
}

const PANELS: Record<Segment, (props: PanelProps) => ReactNode> = {
  systeme: (p) => <MenuPanel {...p} />,
  message: () => <JournalPanel />,
  maj: (p) => <UpdatePanel {...p} />,
  usb: () => <UsbPanel />,
  cpu: () => <CpuPanel />,
  wifi: (p) => <WifiPanel {...p} />,
  bt: (p) => <BluetoothPanel {...p} />,
  lum: () => <LumPanel />,
  vol: (p) => <VolPanel {...p} />,
  bat: () => <BatPanel />,
  sync: () => <SyncPanel />,
  date: (p) => <DatePanel {...p} />,
};
