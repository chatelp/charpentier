import { batteryLevel, type SystemService, type SystemState } from '@charpentier/platform';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { usePlatform } from '../app/platform-context';
import { featureText } from '../features/feature';
import type { WorkspaceContext } from '../workspace/workspace-context';
import { Gauge, Signal, sparkline, Square } from './controls';
import { useBatteryGuard, useDeviceKeys } from './device-keys';
import { SystemPanel } from './panels';
import { PrintSheet } from './PrintSheet';
import {
  MONITOR_VIEW,
  SEGMENTS,
  systemUi,
  useJournal,
  useSystemState,
  useSystemUi,
  type Segment,
} from './system-store';
import './system.css';

/** The key of the system: Super on the device, Ctrl where ⌘ is the app's (the Mac). */
export type SystemModifier = 'Meta' | 'Control';

/** The cpu values shown when the author started typing (one line per window). */
const frozen: { cpu: SystemState['cpu'] | null } = { cpu: null };

const pad = (n: number) => String(n).padStart(2, '0');

/** `5h40` */
export const remainingLabel = (minutes: number) =>
  `${Math.floor(minutes / 60)}h${pad(minutes % 60)}`;

function useMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * The system line (docs/DESIGN.md §4.12): 30 px at the top of the window, in
 * the system's material, always shown. Segments left to right; a click or
 * the segment's key unfolds its panel, one at a time. ⊞ alone puts the focus
 * on the line: ← → go through it, ⏎ or ↓ unfolds, Échap goes back to the text.
 */
export function SystemLine({
  ctx,
  modifier,
}: {
  readonly ctx: WorkspaceContext | null;
  readonly modifier: SystemModifier;
}) {
  const platform = usePlatform();
  const system = platform.system as SystemService;
  const { t, i18n } = useTranslation();
  const text = featureText(t);
  const state = useSystemState(system);
  const journal = useJournal(system);
  const { open, focus, lit, print } = useSystemUi();
  useDeviceKeys(system);
  useBatteryGuard(system, ctx);
  const line = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState<Segment>('systeme');
  const now = useMinute();
  const sync = platform.sync;
  const subscribeSync = useCallback(
    (onChange: () => void) => sync?.onStatusChange(onChange) ?? (() => {}),
    [sync],
  );
  const syncStatus = useSyncExternalStore(subscribeSync, () => sync?.status() ?? 'off');

  // The cpu curve stands still while the author types, and catches up at the first pause.
  const typing = ctx?.typing ?? false;
  const cpu = typing ? (frozen.cpu ?? state.cpu) : state.cpu;
  useEffect(() => {
    if (!typing) frozen.cpu = state.cpu;
  }, [typing, state.cpu]);

  // ⊞ alone: the focus goes to the line.
  useEffect(() => {
    let alone = false;
    const down = (event: globalThis.KeyboardEvent) => {
      alone = event.key === modifier && !event.repeat;
    };
    const up = (event: globalThis.KeyboardEvent) => {
      if (event.key === modifier && alone) systemUi.focusLine();
      alone = false;
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
    };
  }, [modifier]);

  useEffect(() => {
    if (focus === 0) return;
    const target =
      line.current?.querySelector<HTMLElement>(`[data-seg="${open ?? current}"]`) ??
      line.current?.querySelector<HTMLElement>('[data-seg]');
    target?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when asked
  }, [focus]);

  const backToText = () => {
    systemUi.open(null);
    if (ctx?.editor && !ctx.editor.isDestroyed) ctx.editor.view.focus();
  };

  // The `cpu` segment opens the monitor, full frame, where there is one.
  const openSegment = (id: Segment) => {
    if (id === 'cpu' && ctx && system.monitor) {
      systemUi.open(null);
      ctx.openView(MONITOR_VIEW);
    } else systemUi.toggle(id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const segments = [...(line.current?.querySelectorAll<HTMLElement>('[data-seg]') ?? [])];
    const index = segments.findIndex((s) => s === document.activeElement);
    if (index < 0) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const next =
        segments[
          (index + (event.key === 'ArrowRight' ? 1 : -1) + segments.length) % segments.length
        ];
      next?.focus();
    } else if (event.key === 'Enter' || event.key === 'ArrowDown') {
      event.preventDefault();
      const segment = segments[index]?.dataset['seg'] as Segment | undefined;
      if (segment) openSegment(segment);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      backToText();
    }
  };

  // Locked (phase 5.6): only `charpentier`, `verrouillé`, the battery and the time.
  const locked = state.lock.locked;
  const level = batteryLevel(state);
  const low = !state.power.charging && level <= state.settings.lowBattery;
  const lastMessage = journal.at(-1);
  const time = new Intl.DateTimeFormat(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: !state.settings.clock24,
    timeZone: state.timeZone,
  }).format(now);
  const day = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'short',
    day: 'numeric',
    timeZone: state.timeZone,
  }).format(now);
  const syncLabel = {
    off: undefined,
    connecting: 'syncBusy',
    syncing: 'syncBusy',
    synced: 'syncOk',
    offline: 'syncOffline',
    unauthorized: 'syncPaused',
  }[syncStatus];

  const segment = (id: Segment, content: ReactNode, extra?: string) => (
    <button
      key={id}
      type="button"
      data-seg={id}
      tabIndex={current === id ? 0 : -1}
      aria-expanded={open === id}
      className={`ch-sys-seg is-${id}${open === id ? ' is-open' : ''}${lit === id ? ' is-lit' : ''}${extra ? ` ${extra}` : ''}`}
      onFocus={() => setCurrent(id)}
      onClick={() => openSegment(id)}
    >
      {content}
    </button>
  );
  const label = (key: string) => <span className="ch-sys-label">{text(`system.seg.${key}`)}</span>;

  const shown: Record<Segment, ReactNode> = {
    systeme: segment(
      'systeme',
      <>
        <Square />
        <span className="ch-sys-word">{text('system.word')}</span>
        <kbd>⊞</kbd>
      </>,
    ),
    message: segment(
      'message',
      lastMessage ? (
        <span className="ch-sys-message">{lastMessage.text}</span>
      ) : (
        <span className="ch-sys-message is-empty">
          {text('system.journalEmpty', { count: journal.length })}
        </span>
      ),
    ),
    usb:
      state.usb &&
      segment(
        'usb',
        <>
          {label('usb')}
          <span className="ch-sys-value">{state.usb.name}</span>
        </>,
      ),
    cpu:
      state.settings.showCpu &&
      segment(
        'cpu',
        <>
          {label('cpu')}
          <span className="ch-sys-spark" aria-hidden="true">
            {sparkline(cpu.history)}
          </span>
          <span className="ch-sys-value">
            {text('system.seg.cpuValue', {
              load: Math.round(cpu.load),
              temp: Math.round(cpu.temperature),
            })}
          </span>
        </>,
      ),
    wifi: segment(
      'wifi',
      !state.wifi.enabled ? (
        <span className="ch-sys-label">{text('system.seg.wifiOff')}</span>
      ) : (
        <>
          {label('wifi')}
          <span className="ch-sys-value">
            {state.wifi.connected ?? text('system.seg.wifiNone')}
          </span>
          {state.wifi.connected && (
            <Signal
              bars={state.wifi.networks.find((n) => n.ssid === state.wifi.connected)?.signal ?? 0}
            />
          )}
        </>
      ),
    ),
    // Absent while Bluetooth is off (⊞B, the settings or :bt oui turn it back on).
    bt:
      state.bluetooth.enabled &&
      segment(
        'bt',
        <>
          {label('bt')}
          <span className="ch-sys-value">
            {state.bluetooth.devices.filter((d) => d.connected).length}
          </span>
        </>,
      ),
    lum: segment(
      'lum',
      <>
        {label('lum')}
        <Gauge value={state.brightness} />
        <span className="ch-sys-value">{state.brightness}</span>
      </>,
    ),
    vol: segment(
      'vol',
      state.muted ? (
        <>
          {label('vol')}
          <span className="ch-sys-value">{text('system.seg.muted')}</span>
        </>
      ) : (
        <>
          {label('vol')}
          <Gauge value={state.volume} />
          <span className="ch-sys-value">{state.volume}</span>
        </>
      ),
    ),
    bat: segment(
      'bat',
      <>
        {label('bat')}
        <Gauge value={level} />
        <span className="ch-sys-value">{text('system.seg.percent', { value: level })}</span>
        {state.power.charging ? (
          <span className="ch-sys-value">⚡</span>
        ) : (
          state.power.remaining !== null && (
            <span className="ch-sys-remaining">{remainingLabel(state.power.remaining)}</span>
          )
        )}
      </>,
      low ? 'is-alert' : undefined,
    ),
    sync:
      syncLabel &&
      segment(
        'sync',
        <>
          {label('sync')}
          <span className="ch-sys-value">{text(`system.seg.${syncLabel}`)}</span>
        </>,
      ),
    date: segment(
      'date',
      <>
        <span className="ch-sys-day">{day}</span>
        <span className="ch-sys-value">{time}</span>
      </>,
    ),
  };

  return (
    <div
      ref={line}
      className="ch-system ch-sysline"
      role="toolbar"
      aria-label={text('system.line')}
      onKeyDown={onKeyDown}
    >
      {locked ? (
        <>
          {segment(
            'systeme',
            <>
              <Square />
              <span className="ch-sys-word">{text('system.panel.menu')}</span>
            </>,
          )}
          {segment('message', <span className="ch-sys-message">{text('system.lock.label')}</span>)}
          {shown.bat}
          {shown.date}
        </>
      ) : (
        SEGMENTS.map((id) => shown[id])
      )}
      {print && ctx && !locked && <PrintSheet ctx={ctx} system={system} scope={print} />}
      {open && !locked && (
        <PanelPortal line={line} segment={open} onClose={() => systemUi.open(null)}>
          <SystemPanel segment={open} ctx={ctx} onDone={backToText} />
        </PanelPortal>
      )}
    </div>
  );
}

/** The panel under its segment, aligned on it; Échap or a click elsewhere closes it. */
function PanelPortal({
  line,
  segment,
  onClose,
  children,
}: {
  readonly line: React.RefObject<HTMLDivElement | null>;
  readonly segment: Segment;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState<number | null>(null);
  useLayoutEffect(() => {
    const seg = line.current?.querySelector<HTMLElement>(`[data-seg="${segment}"]`);
    const width = panel.current?.offsetWidth ?? 336;
    const x = seg?.getBoundingClientRect().left ?? 0;
    setLeft(Math.max(8, Math.min(x, window.innerWidth - width - 8)));
  }, [line, segment]);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target)) return;
      if (line.current?.querySelector(`[data-seg="${segment}"]`)?.contains(target)) return;
      onClose();
    };
    // Échap closes it wherever the focus is (the text, after a click on the segment).
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || panel.current?.contains(event.target as Node)) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [line, segment, onClose]);

  return createPortal(
    <div
      ref={panel}
      className="ch-system ch-sys-panel"
      role="dialog"
      style={{ left: left ?? 0, visibility: left === null ? 'hidden' : 'visible' }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        onClose();
        line.current?.querySelector<HTMLElement>(`[data-seg="${segment}"]`)?.focus();
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
