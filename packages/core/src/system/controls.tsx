import type { ReactNode } from 'react';

/** Ten cells, full up to the value (docs/DESIGN.md §4.12): no icon. */
export function Gauge({ value }: { readonly value: number }) {
  const full = Math.round(Math.max(0, Math.min(100, value)) / 10);
  return (
    <span className="ch-sys-gauge" aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={i < full ? 'is-full' : undefined} />
      ))}
    </span>
  );
}

const BARS = '▂▄▆█';

/** The Wi-Fi signal, missing bars faint. */
export function Signal({ bars }: { readonly bars: number }) {
  return (
    <span className="ch-sys-signal" aria-hidden="true">
      <span>{BARS.slice(0, bars)}</span>
      <span className="is-missing">{BARS.slice(bars)}</span>
    </span>
  );
}

const BLOCKS = '▁▂▃▄▅▆▇█';

/** The last minute of the processor, twelve columns of block characters. */
export const sparkline = (history: readonly number[]): string =>
  history
    .slice(-12)
    .map((load) => BLOCKS[Math.min(7, Math.floor((Math.max(0, load) / 100) * 8))])
    .join('');

/** Setting keys (§4.7): raised keys side by side, the chosen one stays sunk. */
export function Keys<T extends string | number | boolean | null>({
  options,
  value,
  label,
  onChange,
}: {
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly value: T;
  readonly label: string;
  onChange(value: T): void;
}) {
  return (
    <span className="ch-keys ch-sys-keys" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'is-on' : undefined}
          onClick={() => o.value !== value && onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

/** A slider: a sunk rail, the filled part muted, a raised knob. */
export function Slider({
  value,
  label,
  min = 0,
  onChange,
}: {
  readonly value: number;
  readonly label: string;
  readonly min?: number;
  onChange(value: number): void;
}) {
  return (
    <input
      type="range"
      className="ch-sys-slider"
      min={min}
      max={100}
      step={5}
      value={value}
      aria-label={label}
      style={{ '--fill': `${value}%` } as Record<string, string>}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

/** A line of a panel: label on the left, control or value on the right. */
export function PanelRow({
  label,
  children,
  className,
}: {
  readonly label: ReactNode;
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={`ch-sys-row${className ? ` ${className}` : ''}`}>
      <span className="ch-sys-row-label">{label}</span>
      {children}
    </div>
  );
}

/** The carpenter's square with its blue dot, the app's icon (docs/design/pictos/equerre.svg): the system's emblem. */
export function Square({ size = 13 }: { readonly size?: 13 | 14 }) {
  return (
    <svg
      className="ch-sys-square"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <path d="M3 2h6v13h13v6H3z" fill="currentColor" />
      <circle cx="17" cy="8" r="3" fill="#86aedb" />
    </svg>
  );
}
