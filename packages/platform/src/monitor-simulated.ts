import { MONITOR_HISTORY, type MonitorSample, type SystemMonitor } from './monitor';

/** A smooth, repeatable wobble between 0 and 1. */
const wave = (t: number, seed: number) =>
  0.5 +
  0.25 * Math.sin(t / (37 + seed)) +
  0.15 * Math.sin(t / (7 + seed * 3)) +
  0.1 * Math.sin(t * (1.7 + seed));

const GB = 1e9;

/** The simulated X250's second number `t` (a burst of work around a quarter of the hour). */
export function simulatedSample(t: number, at: number): MonitorSample {
  const burst = t % 600 > 380 && t % 600 < 420 ? 55 : 0;
  const load = Math.round(4 + 14 * wave(t, 1) + burst);
  const threads = [0, 1, 2, 3].map((i) => Math.min(100, Math.round(load * (0.4 + wave(t, i + 2)))));
  const down = Math.round(2_000 * wave(t, 5) + (burst ? 600_000 : 0));
  return {
    at,
    cpu: {
      load,
      threads,
      frequency: Math.round(1_000 + 1_500 * (load / 100) + 200 * wave(t, 6)),
      average: [0.42, 0.38, 0.31],
    },
    temperature: {
      cpu: Math.round(44 + 8 * wave(t, 7) + burst / 6),
      board: Math.round(38 + 2 * wave(t, 8)),
      fan: burst ? 2_400 : 0,
    },
    memory: { used: 2.9 * GB + 0.1 * GB * wave(t, 9), cache: 1.8 * GB, swap: 0 },
    network: {
      down,
      up: Math.round(down / 3),
      received: 18e6 + t * 2_000,
      sent: 4e6 + t * 700,
    },
    power: Math.round((6 + 3 * wave(t, 10) + burst / 10) * 10) / 10,
    disk: {
      read: 0,
      write: Math.round(12_000 * wave(t, 11) + (burst ? 900_000 : 0)),
      used: 41 * GB,
      total: 232 * GB,
    },
    app: {
      processes: [
        { kind: 'main', cpu: 1, memory: 142e6 },
        { kind: 'interface', cpu: Math.round(2 + 4 * wave(t, 12)), memory: 318e6 },
        { kind: 'speller', cpu: 0, memory: 61e6 },
      ],
      documents: 3,
    },
    gpuFrequency: 300,
  };
}

/** The monitor of the simulated X250: an hour already kept, then a sample a second while open. */
export function simulatedMonitor(now: () => Date = () => new Date()): SystemMonitor {
  const start = now().getTime();
  const history: MonitorSample[] = Array.from({ length: MONITOR_HISTORY }, (_, i) =>
    simulatedSample(i, start - (MONITOR_HISTORY - i) * 1000),
  );
  let t = MONITOR_HISTORY;
  return {
    open: async (onSample) => {
      const timer = setInterval(() => {
        const sample = simulatedSample(t++, now().getTime());
        history.push(sample);
        history.splice(0, history.length - MONITOR_HISTORY);
        onSample(sample);
      }, 1000);
      return {
        info: {
          gpu: 'HD 5500',
          screen: '1920 × 1080 · 125 %',
          link: '72 Mbit/s',
          memoryTotal: 8 * GB,
        },
        history: [...history],
        close: () => clearInterval(timer),
      };
    },
  };
}
