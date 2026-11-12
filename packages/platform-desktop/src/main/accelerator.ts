import type { MenuShortcut } from '@charpentier/platform';

const KEYS: Record<string, string> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Enter: 'Return',
  Escape: 'Esc',
  ' ': 'Space',
  '+': 'Plus',
};

/** Electron's accelerator for a shortcut of the core (`⌥⇧⌘↑` → `Command+Alt+Shift+Up`). */
export function toAccelerator(shortcut: MenuShortcut): string {
  const key =
    KEYS[shortcut.key] ?? (shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key);
  return [
    shortcut.meta && 'Command',
    shortcut.ctrl && 'Ctrl',
    shortcut.alt && 'Alt',
    shortcut.shift && 'Shift',
    key,
  ]
    .filter(Boolean)
    .join('+');
}
