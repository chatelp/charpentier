/**
 * The interface's sounds (docs/DESIGN.md §3.4, recipes in docs/design/sons.html):
 * synthesized with Web Audio, offline, off by default. A sound only ever
 * follows a gesture of the author, never a remark appearing by itself.
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

function audio(): AudioContext | undefined {
  if (typeof AudioContext === 'undefined') return undefined;
  context ??= new AudioContext();
  return context;
}

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
  oscillator.connect(gain).connect(a.destination);
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
  source.connect(filter).connect(gain).connect(a.destination);
  source.start(t);
}

const jitter = (value: number, range: number) => value * (1 + (Math.random() * 2 - 1) * range);

function toc(a: AudioContext, scale = 1) {
  tone(a, 'triangle', [220, 150, 0.09], [0.12 * scale, 0.004, 0.12]);
  noise(a, 15, 900, 1.2, 0.04 * scale);
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
    tone(a, 'sine', [1320, 990, 0.04], [0.09, 0.003, 0.06]);
    tone(a, 'sine', [1980, 1980, 0], [0.05, 0.002, 0.045], 0.028);
  } else if (sound === 'toc') toc(a);
  else tone(a, 'sine', [2600, 2600, 0], [0.035, 0.001, 0.025]);
}

let lastKey = 0;

/** The typing sound (its own option): at most one every 30 ms. */
export function playKeySound(kind: KeySound, now = performance.now()): void {
  if (!enabled.typing || now - lastKey < 30) return;
  lastKey = now;
  const a = audio();
  if (!a) return;
  if (kind === 'enter') return toc(a, 0.5);
  if (kind === 'back') return noise(a, 10, 3000, 0.8, 0.015);
  const space = kind === 'space';
  noise(a, space ? 18 : 12, jitter(space ? 1400 : 2200, 0.15), 0.8, jitter(0.025, 0.2));
  tone(a, 'sine', [180, 180, 0], [0.02, 0.001, 0.02]);
}

/** The key sound of a keydown in the text, if it writes or erases (not a repeat, not a composition). */
export function keySoundOf(event: KeyboardEvent): KeySound | null {
  if (event.repeat || event.isComposing || event.metaKey || event.ctrlKey) return null;
  if (event.key === 'Enter') return 'enter';
  if (event.key === 'Backspace') return 'back';
  if (event.key === ' ') return 'space';
  return event.key.length === 1 ? 'char' : null;
}
