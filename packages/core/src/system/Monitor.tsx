import type {
  MonitorInfo,
  MonitorSample,
  SystemMonitor,
  SystemService,
} from '@charpentier/platform';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlatform } from '../app/platform-context';
import { featureText, type FeatureViewProps } from '../features/feature';
import { Gauge, Square } from './controls';
import { duration, hours, minutesSince } from './panels';
import { useSystemState } from './system-store';
import './monitor.css';

/** The durations shown, in seconds (docs/DESIGN.md §4.12). */
const DURATIONS = [
  { seconds: 60, label: 'min1' },
  { seconds: 600, label: 'min10' },
  { seconds: 3600, label: 'hour1' },
] as const;

/** Points of a curve at most: a sample a second, averaged beyond. */
const POINTS = 300;

/** The samples, kept while the screen is open: the hour of the service, then every second. */
function useSamples(monitor: SystemMonitor) {
  const [state, setState] = useState<{
    info: MonitorInfo | null;
    samples: readonly MonitorSample[];
  }>({ info: null, samples: [] });
  useEffect(() => {
    let closed = false;
    let close = () => {};
    const kept: MonitorSample[] = [];
    void monitor
      .open((sample) => {
        kept.push(sample);
        if (kept.length > 3600) kept.splice(0, kept.length - 3600);
        if (!closed) setState((s) => ({ ...s, samples: [...kept] }));
      })
      .then((session) => {
        if (closed) return session.close();
        close = session.close;
        kept.unshift(...session.history.filter((h) => !kept.some((k) => k.at === h.at)));
        setState({ info: session.info, samples: [...kept] });
      });
    return () => {
      closed = true;
      close();
    };
  }, [monitor]);
  return state;
}

/** A series over the duration shown, averaged into at most POINTS slots, right-aligned. */
function series(
  samples: readonly MonitorSample[],
  seconds: number,
  value: (s: MonitorSample) => number,
): (number | null)[] {
  const slots = Math.min(seconds, POINTS);
  const per = seconds / slots;
  const end = samples.at(-1)?.at ?? 0;
  const sums = new Array<number>(slots).fill(0);
  const counts = new Array<number>(slots).fill(0);
  for (const s of samples) {
    const age = (end - s.at) / 1000;
    if (age >= seconds) continue;
    const slot = slots - 1 - Math.floor(age / per);
    sums[slot] = (sums[slot] ?? 0) + value(s);
    counts[slot] = (counts[slot] ?? 0) + 1;
  }
  return sums.map((sum, i) => (counts[i] ? sum / (counts[i] ?? 1) : null));
}

/**
 * A curve between two engraved rules (§4.12): a 1.4 px line in ink, its area
 * at 8 %, a second series dotted in muted ink, three dotted reference lines.
 * No colour, no entrance.
 */
function Curve({
  main,
  second,
  max,
}: {
  readonly main: readonly (number | null)[];
  readonly second?: readonly (number | null)[];
  /** The top of the scale; at least the highest value. */
  readonly max: number;
}) {
  const top = Math.max(max, ...main.map((v) => v ?? 0), ...(second ?? []).map((v) => v ?? 0), 1);
  const n = Math.max(main.length - 1, 1);
  const y = (v: number) => 100 - (v / top) * 92 - 4;
  const path = (values: readonly (number | null)[]) => {
    let d = '';
    let pen = false;
    values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${((i / n) * 1000).toFixed(1)},${y(v).toFixed(2)}`;
      pen = true;
    });
    return d;
  };
  const first = main.findIndex((v) => v !== null);
  const line = path(main);
  const area = first >= 0 && line ? `${line}L1000,100L${((first / n) * 1000).toFixed(1)},100Z` : '';
  return (
    <div className="ch-mon-curve">
      <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
        {[25, 50, 75].map((g) => (
          <line key={g} className="ch-mon-guide" x1="0" x2="1000" y1={g} y2={g} />
        ))}
        {area && <path className="ch-mon-area" d={area} />}
        {second && <path className="ch-mon-second" d={path(second)} />}
        <path className="ch-mon-line" d={line} />
      </svg>
    </div>
  );
}

function Dial({
  name,
  value,
  wide,
  children,
}: {
  readonly name: string;
  readonly value: ReactNode;
  readonly wide?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <section className={`ch-mon-dial${wide ? ' is-wide' : ''}`} aria-label={name}>
      <header className="ch-mon-head">
        <h2>{name}</h2>
        <span className="ch-mon-value">{value}</span>
      </header>
      {children}
    </section>
  );
}

function Row({ label, children }: { readonly label: ReactNode; readonly children: ReactNode }) {
  return (
    <div className="ch-mon-row">
      <span className="ch-mon-label">{label}</span>
      <span className="ch-mon-figure">{children}</span>
    </div>
  );
}

/**
 * The monitor (docs/DESIGN.md §4.12, docs/PLAN.md phase 5.5): full frame,
 * all in the system's material, for the pleasure of watching the machine
 * run. It asks for samples only while it is shown. ⊞M, `:moniteur`, or a
 * click on the `cpu` segment; Échap goes back to the text.
 */
export function Monitor({ active, onClose }: FeatureViewProps) {
  const system = usePlatform().system as SystemService;
  const monitor = system.monitor as SystemMonitor;
  const { t, i18n } = useTranslation();
  const text = featureText(t);
  const m = (key: string, options?: Readonly<Record<string, unknown>>) =>
    text(`system.monitor.${key}`, options);
  const state = useSystemState(system);
  const { info, samples } = useSamples(monitor);
  const [seconds, setSeconds] = useState<number>(600);
  const tabs = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (active) tabs.current?.querySelector<HTMLElement>('.is-on')?.focus();
  }, [active]);

  const language = i18n.language;
  const decimal = (value: number, digits = 1) =>
    new Intl.NumberFormat(language, {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    }).format(value);
  const whole = (value: number) =>
    new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(value);
  /** Bytes in French units: o, ko, Mo, Go. */
  const bytes = (value: number) =>
    value < 1e3
      ? `${whole(value)} o`
      : value < 1e6
        ? `${whole(value / 1e3)} ko`
        : value < 1e9
          ? `${whole(value / 1e6)} Mo`
          : `${decimal(value / 1e9)} Go`;
  const perSecond = (value: number) => `${bytes(value)}/s`;
  const percent = (value: number) => text('system.seg.percent', { value: Math.round(value) });

  const now = samples.at(-1);
  const model = state.device.model.split(' · ').slice(1).join(' · ') || state.device.model;
  const curve = (value: (s: MonitorSample) => number) => series(samples, seconds, value);

  const header = (
    <header className="ch-mon-top">
      <Square />
      <h1>{m('name')}</h1>
      <span className="ch-mon-machine">
        {m('machine', {
          name: state.device.name,
          model,
          time: duration(minutesSince(state.device.bootedAt)),
        })}
      </span>
      <div
        className="ch-seg ch-mon-durations"
        role="tablist"
        aria-label={m('durations')}
        ref={tabs}
      >
        {DURATIONS.map((d) => (
          <button
            key={d.seconds}
            type="button"
            role="tab"
            aria-selected={seconds === d.seconds}
            className={seconds === d.seconds ? 'is-on' : undefined}
            onClick={() => setSeconds(d.seconds)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
              event.preventDefault();
              const i = DURATIONS.findIndex((x) => x.seconds === seconds);
              const next =
                DURATIONS[(i + (event.key === 'ArrowRight' ? 1 : -1) + DURATIONS.length) % 3];
              if (next) setSeconds(next.seconds);
              requestAnimationFrame(() =>
                tabs.current?.querySelector<HTMLElement>('.is-on')?.focus(),
              );
            }}
          >
            {m(d.label)}
          </button>
        ))}
      </div>
      <button type="button" className="ch-mon-escape" onClick={onClose}>
        <kbd>{m('escapeKey')}</kbd> {m('escape')}
      </button>
    </header>
  );

  if (!now)
    return (
      <div className="ch-system ch-monitor">
        {header}
        <p className="ch-mon-wait">{m('noData')}</p>
      </div>
    );

  const memoryTotal = info?.memoryTotal || 1;
  const batteryTime = state.power.remaining === null ? null : hours(state.power.remaining);
  const wifi = state.wifi.connected;

  return (
    <div className="ch-system ch-monitor">
      {header}
      <div className="ch-mon-grid">
        <Dial
          wide
          name={m('processor')}
          value={m('processorValue', {
            load: now.cpu.load,
            ghz: decimal(now.cpu.frequency / 1000),
          })}
        >
          <Curve main={curve((s) => s.cpu.load)} max={100} />
          {now.cpu.threads.map((load, i) => (
            <Row key={i} label={m('thread', { n: i })}>
              <Gauge value={load} /> {percent(load)}
            </Row>
          ))}
          <Row label={m('average')}>{now.cpu.average.map((a) => decimal(a, 2)).join(' · ')}</Row>
        </Dial>

        <Dial
          name={m('temperatures')}
          value={now.temperature.cpu === null ? '–' : m('degrees', { value: now.temperature.cpu })}
        >
          <Curve
            main={curve((s) => s.temperature.cpu ?? 0)}
            second={curve((s) => s.temperature.board ?? 0)}
            max={100}
          />
          <Row label={m('processor')}>
            {now.temperature.cpu === null ? '–' : m('degrees', { value: now.temperature.cpu })}
          </Row>
          <Row label={m('board')}>
            {now.temperature.board === null ? '–' : m('degrees', { value: now.temperature.board })}
          </Row>
          <Row label={m('fan')}>
            {now.temperature.fan === null
              ? '–'
              : m(now.temperature.fan === 0 ? 'stopped' : 'rpm', {
                  value: whole(now.temperature.fan),
                })}
          </Row>
        </Dial>

        <Dial
          name={m('memory')}
          value={m('memoryValue', {
            used: bytes(now.memory.used),
            total: whole(memoryTotal / 1e9),
          })}
        >
          <Curve main={curve((s) => (s.memory.used / memoryTotal) * 100)} max={100} />
          <Row label={m('used')}>
            <Gauge value={(now.memory.used / memoryTotal) * 100} /> {bytes(now.memory.used)}
          </Row>
          <Row label={m('cache')}>{bytes(now.memory.cache)}</Row>
          <Row label={m('swap')}>{now.memory.swap ? bytes(now.memory.swap) : '0'}</Row>
        </Dial>

        <Dial
          name={m('network')}
          value={m('networkValue', {
            down: perSecond(now.network.down),
            up: perSecond(now.network.up),
          })}
        >
          <Curve
            main={curve((s) => s.network.down)}
            second={curve((s) => s.network.up)}
            max={10_000}
          />
          <Row label={state.ethernet.connected ? m('ethernet') : m('wifi')}>
            {state.ethernet.connected
              ? m('ethernet')
              : wifi
                ? info?.link
                  ? m('linkValue', { name: wifi, rate: info.link })
                  : wifi
                : m('offline')}
          </Row>
          <Row label={m('totals')}>
            {bytes(now.network.received)} / {bytes(now.network.sent)}
          </Row>
        </Dial>

        <Dial
          name={m('battery')}
          value={
            state.power.charging || batteryTime === null
              ? m('batteryCharging', { watts: decimal(now.power) })
              : m('batteryValue', { watts: decimal(now.power), time: batteryTime })
          }
        >
          <Curve main={curve((s) => s.power)} max={15} />
          {state.power.batteries.map((b) => (
            <Row key={b.name} label={b.name}>
              <Gauge value={b.level} /> {m('batteryLine', { level: b.level, wear: 100 - b.health })}
            </Row>
          ))}
        </Dial>

        <Dial
          name={m('disk')}
          value={m('diskValue', {
            used: whole(now.disk.used / 1e9),
            total: whole(now.disk.total / 1e9),
          })}
        >
          <Curve main={curve((s) => s.disk.write)} max={100_000} />
          <Row label={m('occupied')}>
            <Gauge value={now.disk.total ? (now.disk.used / now.disk.total) * 100 : 0} />{' '}
            {percent(now.disk.total ? Math.round((now.disk.used / now.disk.total) * 100) : 0)}
          </Row>
          <Row label={m('readWrite')}>
            {now.disk.read ? perSecond(now.disk.read) : '0'} / {perSecond(now.disk.write)}
          </Row>
        </Dial>

        <Dial name={m('app')} value={m('processes', { count: now.app.processes.length })}>
          <table className="ch-mon-table">
            <thead>
              <tr>
                <th scope="col">{m('process')}</th>
                <th scope="col">{m('cpu')}</th>
                <th scope="col">{m('mem')}</th>
              </tr>
            </thead>
            <tbody>
              {now.app.processes.map((p, i) => (
                <tr key={`${p.kind}-${i}`}>
                  <th scope="row">{m(`kinds.${p.kind}`)}</th>
                  <td>{percent(p.cpu)}</td>
                  <td>{bytes(p.memory)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Row label={m('documents')}>{now.app.documents}</Row>
        </Dial>

        <Dial name={m('gpu')} value={info?.gpu ?? m('unknown')}>
          <Row label={m('frequency')}>
            {now.gpuFrequency === null ? '–' : m('mhz', { value: now.gpuFrequency })}
          </Row>
          <Row label={m('gpuLoad')}>{m('notMeasured')}</Row>
          <Row label={m('screen')}>{info?.screen ?? '–'}</Row>
        </Dial>
      </div>
    </div>
  );
}
