/**
 * The X250's monitor (docs/PLAN.md phase 5.5, docs/DESIGN.md §4.12): one
 * sample a second of everything the machine can measure, an hour kept by the
 * service. The interface asks for them only while the monitor's screen is
 * open. Absent (null) where there is no system to watch.
 */
export interface SystemMonitor {
  /**
   * The screen opens: what does not change, the hour kept (oldest first),
   * then every new sample to `onSample` until `close`.
   */
  open(onSample: (sample: MonitorSample) => void): Promise<MonitorSession>;
}

export interface MonitorSession {
  readonly info: MonitorInfo;
  readonly history: readonly MonitorSample[];
  close(): void;
}

/** What the machine is, read when the screen opens. */
export interface MonitorInfo {
  /** « HD 5500 », or null when unknown. */
  readonly gpu: string | null;
  /** « 1920 × 1080 · 125 % », or null. */
  readonly screen: string | null;
  /** The Wi-Fi's negotiated rate, « 72 Mbit/s », or null. */
  readonly link: string | null;
  readonly memoryTotal: number;
}

export type AppProcessKind = 'main' | 'interface' | 'speller' | 'graphics';

/** One second of the machine. Rates are per second, sizes in bytes. */
export interface MonitorSample {
  /** Milliseconds since the epoch. */
  readonly at: number;
  readonly cpu: {
    /** Total load, %. */
    readonly load: number;
    /** Each hardware thread, %. */
    readonly threads: readonly number[];
    /** MHz. */
    readonly frequency: number;
    /** The load averages at 1, 5 and 15 min. */
    readonly average: readonly [number, number, number];
  };
  /** °C and rpm; null when the machine does not say. */
  readonly temperature: {
    readonly cpu: number | null;
    readonly board: number | null;
    readonly fan: number | null;
  };
  readonly memory: { readonly used: number; readonly cache: number; readonly swap: number };
  readonly network: {
    readonly down: number;
    readonly up: number;
    readonly received: number;
    readonly sent: number;
  };
  /** Watts drawn from the batteries (0 on the mains). */
  readonly power: number;
  readonly disk: {
    readonly read: number;
    readonly write: number;
    readonly used: number;
    readonly total: number;
  };
  /** The app's own processes. */
  readonly app: {
    readonly processes: readonly {
      readonly kind: AppProcessKind;
      readonly cpu: number;
      readonly memory: number;
    }[];
    readonly documents: number;
  };
  /** MHz of the graphics, or null. */
  readonly gpuFrequency: number | null;
}

/** An hour of samples. */
export const MONITOR_HISTORY = 3600;
