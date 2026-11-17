import { afterEach, describe, expect, it, vi } from 'vitest';
import { keySoundOf, MASTER, playKeySound, playSound, setSoundSettings } from './sounds';

const key = (key: string, extra: Partial<KeyboardEvent> = {}) =>
  ({
    key,
    repeat: false,
    isComposing: false,
    metaKey: false,
    ctrlKey: false,
    ...extra,
  }) as KeyboardEvent;

afterEach(() => {
  setSoundSettings({ ui: false, typing: false });
  vi.unstubAllGlobals();
});

describe('sounds (docs/DESIGN.md §3.4)', () => {
  it('stays silent by default', () => {
    const created = vi.fn();
    vi.stubGlobal('AudioContext', created);
    playSound('click');
    playKeySound('char', 1000);
    expect(created).not.toHaveBeenCalled();
  });

  it('knows which key sound a keystroke makes', () => {
    expect(keySoundOf(key('a'))).toBe('char');
    expect(keySoundOf(key(' '))).toBe('space');
    expect(keySoundOf(key('Enter'))).toBe('enter');
    expect(keySoundOf(key('Backspace'))).toBe('back');
    expect(keySoundOf(key('ArrowLeft'))).toBeNull();
    expect(keySoundOf(key('a', { repeat: true }))).toBeNull();
    expect(keySoundOf(key('a', { isComposing: true }))).toBeNull();
    expect(keySoundOf(key('s', { metaKey: true }))).toBeNull();
  });

  it('is heard on a laptop: nothing under 300 Hz, peaks loud enough and under 0.5', () => {
    const frequencies: number[] = [];
    const gains: number[] = [];
    const param = (into: number[]) => ({
      setValueAtTime: (v: number) => into.push(v),
      exponentialRampToValueAtTime: (v: number) => into.push(v),
      set value(v: number) {
        into.push(v);
      },
    });
    const node = <T extends object>(extra: T) => ({ ...extra, connect: (n: unknown) => n });
    class FakeContext {
      currentTime = 0;
      sampleRate = 48000;
      destination = {};
      createOscillator = () =>
        node({ type: '', frequency: param(frequencies), start() {}, stop() {} });
      createGain = () => node({ gain: param(gains) });
      createBiquadFilter = () => node({ type: '', frequency: param([]), Q: param([]) });
      createBuffer = (_: number, length: number) => ({
        getChannelData: () => new Float32Array(length),
      });
      createBufferSource = () => node({ buffer: null, start() {} });
      createDynamicsCompressor = () =>
        node({
          threshold: param([]),
          knee: param([]),
          ratio: param([]),
          attack: param([]),
          release: param([]),
        });
    }
    vi.stubGlobal('AudioContext', FakeContext);
    setSoundSettings({ ui: true, typing: true });
    playSound('click');
    playSound('toc');
    playSound('tic');
    (['char', 'space', 'enter', 'back'] as const).forEach((kind, i) =>
      playKeySound(kind, 10_000 + i * 100),
    );
    expect(Math.min(...frequencies)).toBeGreaterThanOrEqual(300);
    // Each sound under 0.5 before the bus (its gain, MASTER, is recorded too; a limiter follows).
    expect(Math.max(...gains.filter((g) => g !== MASTER))).toBeLessThan(0.5);
    // Every sound reaches a gain a laptop's speakers render (the first ones peaked at 0.02).
    expect(Math.max(...gains)).toBeGreaterThan(0.2);
  });
});
