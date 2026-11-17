/**
 * The interface's sounds (docs/DESIGN.md §3.4, recipes in docs/design/sons.html):
 * synthesized with Web Audio, offline, off by default. A sound only ever
 * follows a gesture of the author, never a remark appearing by itself.
 * Calibrated for a laptop's small speakers (17 November 2026): nothing under
 * 300 Hz, which they do not render, and gains about 10 dB higher than at
 * first; a sound's peak stays under 0.5, so that two at once do not clip.
 */

/** click: validate, resolve; toc: reject, ignore, close; tic: open a note or a panel. */
export type Sound = 'click' | 'toc' | 'tic';
export type KeySound = 'char' | 'space' | 'enter' | 'back';

let context: AudioContext | undefined;
let enabled = { ui: false, typing: false };

/** The author's settings (both off by default; a device preference). */
export function setSoundSettings(settings: { readonly ui: boolean; readonly typing: boolean }) {
  enabled = { ...settings };
}

let output: AudioNode | undefined;

/**
 * Every sound goes through one bus: a gain of 2 (+6 dB, the X250's speakers
 * at half volume still found them faint, 17 November 2026), then a limiter,
 * so that two sounds at once never clip.
 */
function audio(): AudioContext | undefined {
  if (typeof AudioContext === 'undefined') return undefined;
  context ??= new AudioContext();
  // A context made before any gesture waits to be resumed.
  if (context.state === 'suspended') void context.resume?.();
  return context;
}

function out(a: AudioContext): AudioNode {
  if (output) return output;
  const bus = a.createGain();
  bus.gain.value = MASTER;
  const limiter = a.createDynamicsCompressor?.();
  if (limiter) {
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.05;
    bus.connect(limiter).connect(a.destination);
  } else bus.connect(a.destination);
  output = bus;
  return bus;
}

/** The bus's gain: +6 dB over the design's recipes. */
export const MASTER = 2;

function envelope(gain: GainNode, t: number, peak: number, attack: number, end: number) {
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + end);
}

function tone(
  a: AudioContext,
  type: OscillatorType,
  [f0, f1, ramp]: readonly [number, number, number],
  [peak, attack, end]: readonly [number, number, number],
  delay = 0,
) {
  const t = a.currentTime + delay;
  const oscillator = a.createOscillator();
  const gain = a.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) oscillator.frequency.exponentialRampToValueAtTime(f1, t + ramp);
  envelope(gain, t, peak, attack, end);
  oscillator.connect(gain).connect(out(a));
  oscillator.start(t);
  oscillator.stop(t + end + 0.01);
}

function noise(a: AudioContext, ms: number, frequency: number, q: number, peak: number) {
  const t = a.currentTime;
  const length = Math.ceil((a.sampleRate * ms) / 1000);
  const buffer = a.createBuffer(1, length, a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const source = a.createBufferSource();
  source.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = frequency;
  filter.Q.value = q;
  const gain = a.createGain();
  envelope(gain, t, peak, 0.001, ms / 1000);
  source.connect(filter).connect(gain).connect(out(a));
  source.start(t);
}

const jitter = (value: number, range: number) => value * (1 + (Math.random() * 2 - 1) * range);

function toc(a: AudioContext, scale = 1) {
  tone(a, 'triangle', [440, 300, 0.09], [0.38 * scale, 0.004, 0.12]);
  noise(a, 15, 900, 1.2, 0.13 * scale);
}

/**
 * Déclic (validate, resolve), toc (reject, ignore, close a panel or a sheet),
 * tic (the author unfolds a note or opens a panel).
 */
export function playSound(sound: Sound): void {
  if (!enabled.ui) return;
  const a = audio();
  if (!a) return;
  if (sound === 'click') {
    tone(a, 'sine', [1320, 990, 0.04], [0.28, 0.003, 0.06]);
    tone(a, 'sine', [1980, 1980, 0], [0.16, 0.002, 0.045], 0.028);
  } else if (sound === 'toc') toc(a);
  else tone(a, 'sine', [2600, 2600, 0], [0.11, 0.001, 0.025]);
}

/** « Écouter » in the settings: the sound itself, whether its option is on or not. */
export function previewSound(sound: Sound | 'typing'): void {
  const saved = enabled;
  enabled = { ui: true, typing: true };
  try {
    if (sound !== 'typing') playSound(sound);
    else
      (['char', 'char', 'space', 'char', 'char', 'char'] as const).forEach((kind, i) =>
        setTimeout(() => {
          const before = enabled;
          enabled = { ui: true, typing: true };
          playKeySound(kind, performance.now() + i);
          enabled = before;
        }, i * 140),
      );
  } finally {
    enabled = saved;
  }
}

let lastKey = 0;

/** The typing sound (its own option): at most one every 30 ms. */
export function playKeySound(kind: KeySound, now = performance.now()): void {
  if (!enabled.typing || now - lastKey < 30) return;
  lastKey = now;
  const a = audio();
  if (!a) return;
  if (kind === 'enter') return toc(a, 0.5);
  if (kind === 'back') return noise(a, 10, 3000, 0.8, 0.05);
  const space = kind === 'space';
  noise(a, space ? 18 : 12, jitter(space ? 1400 : 2200, 0.15), 0.8, jitter(0.11, 0.2));
  tone(a, 'sine', [360, 360, 0], [0.06, 0.001, 0.02]);
}

/** The key sound of a keydown in the text, if it writes or erases (not a repeat, not a composition). */
export function keySoundOf(event: KeyboardEvent): KeySound | null {
  if (event.repeat || event.isComposing || event.metaKey || event.ctrlKey) return null;
  if (event.key === 'Enter') return 'enter';
  if (event.key === 'Backspace') return 'back';
  if (event.key === ' ') return 'space';
  return event.key.length === 1 ? 'char' : null;
}
