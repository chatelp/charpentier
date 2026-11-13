import { afterEach, describe, expect, it, vi } from 'vitest';
import { keySoundOf, playKeySound, playSound, setSoundSettings } from './sounds';

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
});
