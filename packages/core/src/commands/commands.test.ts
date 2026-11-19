import { describe, expect, it } from 'vitest';
import {
  altLabel,
  eventKey,
  formatBinding,
  formatChord,
  matches,
  parseKeybinding,
} from './keybinding';
import { CommandRegistry, filterByQuery } from './registry';

const event = (init: Partial<KeyboardEvent>) =>
  ({
    key: '',
    code: '',
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    ...init,
  }) as KeyboardEvent;

describe('keybindings', () => {
  it('maps Mod to ⌘ on macOS and Ctrl elsewhere', () => {
    expect(matches(parseKeybinding('Mod-k', 'Meta'), event({ key: 'k', metaKey: true }))).toBe(
      true,
    );
    expect(matches(parseKeybinding('Mod-k', 'Control'), event({ key: 'k', ctrlKey: true }))).toBe(
      true,
    );
    expect(matches(parseKeybinding('Mod-k', 'Meta'), event({ key: 'k', ctrlKey: true }))).toBe(
      false,
    );
  });

  it('requires the exact modifiers', () => {
    const chord = parseKeybinding('Mod-Alt-ArrowUp', 'Meta');
    expect(matches(chord, event({ key: 'ArrowUp', metaKey: true, altKey: true }))).toBe(true);
    expect(
      matches(chord, event({ key: 'ArrowUp', metaKey: true, altKey: true, shiftKey: true })),
    ).toBe(false);
  });

  it('uses the physical key for letters typed with Alt (⌥N gives ˜ on a Mac)', () => {
    expect(eventKey(event({ key: '˜', code: 'KeyN', altKey: true }))).toBe('n');
    expect(
      matches(
        parseKeybinding('Mod-Alt-n', 'Meta'),
        event({ key: '˜', code: 'KeyN', altKey: true, metaKey: true }),
      ),
    ).toBe(true);
    // Without Alt, the layout's character wins (AZERTY "a" is on the QWERTY "q" key).
    expect(eventKey(event({ key: 'a', code: 'KeyQ' }))).toBe('a');
  });

  it('formats shortcuts for each platform, in French', () => {
    expect(formatChord(parseKeybinding('Mod-Alt-Shift-ArrowUp', 'Meta'), 'Meta')).toBe('⌥⇧⌘↑');
    expect(formatChord(parseKeybinding('Mod-Shift-Enter', 'Control'), 'Control')).toBe(
      'Ctrl+Maj+⏎',
    );
  });

  it('names a panel’s own keys as the host’s keyboard does', () => {
    expect(formatBinding('Mod-Enter', 'Meta')).toBe('⌘⏎');
    expect(formatBinding('Mod-Enter', 'Control')).toBe('Ctrl+⏎');
    expect(formatBinding('Alt-ArrowUp', 'Control')).toBe('Alt+↑');
    expect(altLabel('Meta')).toBe('⌥');
    expect(altLabel('Control')).toBe('Alt');
  });
});

describe('CommandRegistry', () => {
  const noop = { run: () => {} };

  it('refuses duplicate shortcuts and host-reserved ones', () => {
    const registry = new CommandRegistry<null>('Meta', ['Mod-w']);
    registry.register({ id: 'a', scope: 'global', keybinding: 'Mod-k', ...noop });
    expect(() =>
      registry.register({ id: 'b', scope: 'editor', keybinding: 'Mod-k', ...noop }),
    ).toThrow(/already used by a/);
    expect(() =>
      registry.register({ id: 'c', scope: 'global', keybinding: 'Mod-w', ...noop }),
    ).toThrow(/reserved/);
    expect(() => registry.register({ id: 'a', scope: 'global', ...noop })).toThrow(/Duplicate/);
  });

  it('binds every non-reserved alternative and shows the first one', () => {
    const registry = new CommandRegistry<null>('Meta', ['Meta-n']).register({
      id: 'newScene',
      scope: 'global',
      keybinding: ['Mod-n', 'Mod-Alt-n'],
      ...noop,
    });
    expect(registry.shortcutLabel('newScene')).toBe('⌥⌘N');
    expect(registry.forEvent(event({ key: 'n', metaKey: true }), null)).toBeUndefined();
    expect(
      registry.forEvent(event({ key: '˜', code: 'KeyN', metaKey: true, altKey: true }), null)?.id,
    ).toBe('newScene');
    // Without the reservation, both are bound and ⌘N is shown.
    const desktop = new CommandRegistry<null>('Meta').register({
      id: 'newScene',
      scope: 'global',
      keybinding: ['Mod-n', 'Mod-Alt-n'],
      ...noop,
    });
    expect(desktop.shortcutLabel('newScene')).toBe('⌘N');
    expect(desktop.forEvent(event({ key: 'n', metaKey: true }), null)?.id).toBe('newScene');
  });

  it('keeps a command whose every alternative is reserved, without shortcut', () => {
    const registry = new CommandRegistry<null>('Meta', ['Meta-Alt-ArrowLeft']).register({
      id: 'narrow',
      scope: 'global',
      keybinding: ['Mod-Alt-ArrowLeft'],
      ...noop,
    });
    expect(registry.shortcutLabel('narrow')).toBeUndefined();
  });

  it('parses the minus key and rejects malformed shortcuts', () => {
    expect(parseKeybinding('Mod--', 'Meta')).toMatchObject({ key: '-', meta: true });
    expect(formatChord(parseKeybinding('Mod--', 'Meta'), 'Meta')).toBe('⌘−');
    expect(() => parseKeybinding('Meta+W', 'Meta')).toThrow(/Invalid/);
  });

  it('dispatches only enabled global commands', () => {
    let enabled = false;
    const registry = new CommandRegistry<null>('Meta')
      .register({
        id: 'g',
        scope: 'global',
        keybinding: 'Mod-k',
        isEnabled: () => enabled,
        ...noop,
      })
      .register({ id: 'e', scope: 'editor', keybinding: 'Mod-i', ...noop });
    expect(registry.forEvent(event({ key: 'k', metaKey: true }), null)).toBeUndefined();
    enabled = true;
    expect(registry.forEvent(event({ key: 'k', metaKey: true }), null)?.id).toBe('g');
    expect(registry.forEvent(event({ key: 'i', metaKey: true }), null)).toBeUndefined();
  });
});

describe('filterByQuery', () => {
  const items = ['Nouvelle scène', 'Renommer la scène', 'Nouveau chapitre', 'Aller à la scène…'];
  it('ignores accents and case, and puts prefix matches first', () => {
    expect(filterByQuery(items, 'scene', (s) => s)).toEqual([
      'Nouvelle scène',
      'Renommer la scène',
      'Aller à la scène…',
    ]);
    expect(filterByQuery(items, 'NOUV chap', (s) => s)).toEqual(['Nouveau chapitre']);
    expect(filterByQuery(items, 'a', (s) => s)[0]).toBe('Aller à la scène…');
  });
});

describe('workspace commands', () => {
  it('register without shortcut clashes, with the web host reserved keys, on every platform', async () => {
    const { createWorkspaceRegistry } = await import('./workspace-commands');
    // Same lists as platform-web's webReservedShortcuts (core cannot import it).
    const reserved = (mod: 'Meta' | 'Control', apple: boolean) => [
      `${mod}-w`,
      `${mod}-t`,
      `${mod}-n`,
      `${mod}-Shift-n`,
      `${mod}-Shift-t`,
      `${mod}-l`,
      ...Array.from({ length: 9 }, (_, i) => `${mod}-${i + 1}`),
      ...(apple
        ? ['Meta-q', 'Meta-Shift-a', 'Meta-Alt-ArrowLeft', 'Meta-Alt-ArrowRight']
        : ['Control-Tab']),
    ];
    expect(() => createWorkspaceRegistry('Meta', reserved('Meta', true))).not.toThrow();
    expect(() => createWorkspaceRegistry('Control', reserved('Control', false))).not.toThrow();
    const linux = createWorkspaceRegistry('Control', reserved('Control', false));
    expect(linux.shortcutLabel('newScene')).toBe('Ctrl+Alt+N');
  });
});
