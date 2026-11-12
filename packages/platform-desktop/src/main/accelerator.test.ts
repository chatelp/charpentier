import { describe, expect, it } from 'vitest';
import { toAccelerator } from './accelerator';

const shortcut = (
  key: string,
  mods: Partial<Record<'meta' | 'ctrl' | 'alt' | 'shift', boolean>>,
) => ({
  key,
  meta: false,
  ctrl: false,
  alt: false,
  shift: false,
  ...mods,
});

describe('menu accelerators', () => {
  it('writes the core shortcuts as Electron accelerators', () => {
    expect(toAccelerator(shortcut('k', { meta: true }))).toBe('Command+K');
    expect(toAccelerator(shortcut('a', { meta: true, shift: true }))).toBe('Command+Shift+A');
    expect(toAccelerator(shortcut('ArrowUp', { meta: true, alt: true, shift: true }))).toBe(
      'Command+Alt+Shift+Up',
    );
    expect(toAccelerator(shortcut('-', { meta: true }))).toBe('Command+-');
    expect(toAccelerator(shortcut("'", { meta: true }))).toBe("Command+'");
    expect(toAccelerator(shortcut('Enter', { alt: true }))).toBe('Alt+Return');
    expect(toAccelerator(shortcut('+', { ctrl: true }))).toBe('Ctrl+Plus');
  });
});
