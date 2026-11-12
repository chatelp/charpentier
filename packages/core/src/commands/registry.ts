import {
  formatChord,
  matches,
  parseKeybinding,
  sameChord,
  type Chord,
  type PrimaryModifier,
} from './keybinding';

/**
 * Central registry of commands and their shortcuts (docs/SPEC.md §19: every
 * action reachable from the keyboard, palette included).
 *
 * - `global` commands are dispatched by the workspace's key listener.
 * - `editor` commands are bound by TipTap itself; they are registered here so
 *   that the palette lists them and conflicts are detected in one place.
 */
export interface Command<Ctx> {
  readonly id: string;
  readonly scope: 'global' | 'editor';
  /**
   * One shortcut (refused if the host reserves it), or a list of alternatives:
   * every one the host does not reserve is bound and the first bound one is
   * shown; if all are reserved, the command is left to the command line.
   * Lets a command prefer `Mod-n` on the desktop and fall back to `Mod-Alt-n`
   * in a browser, which keeps ⌘N.
   */
  readonly keybinding?: string | readonly string[];
  /** Hidden from the palette and its shortcut ignored when false. */
  isEnabled?(ctx: Ctx): boolean;
  run(ctx: Ctx): void | Promise<void>;
}

interface Entry<Ctx> {
  readonly command: Command<Ctx>;
  readonly chords: readonly Chord[];
}

export class CommandRegistry<Ctx> {
  readonly #entries: Entry<Ctx>[] = [];

  constructor(
    private readonly primary: PrimaryModifier,
    reserved: readonly string[] = [],
  ) {
    this.#reserved = reserved.map((r) => parseKeybinding(r, primary));
  }

  readonly #reserved: Chord[];

  register(command: Command<Ctx>): this {
    if (this.#entries.some((e) => e.command.id === command.id))
      throw new Error(`Duplicate command: ${command.id}`);
    const bindings =
      command.keybinding === undefined
        ? []
        : typeof command.keybinding === 'string'
          ? [command.keybinding]
          : command.keybinding;
    const parsed = bindings.map((binding) => ({
      binding,
      chord: parseKeybinding(binding, this.primary),
    }));
    const bound = parsed.filter(({ chord }) => !this.#reserved.some((r) => sameChord(r, chord)));
    // A single shortcut must be usable everywhere; alternatives may all be taken.
    if (typeof command.keybinding === 'string' && bound.length === 0) {
      throw new Error(`Shortcut ${bindings[0]} of ${command.id} is reserved by the host`);
    }
    for (const { binding, chord } of bound) {
      const clash = this.#entries.find((e) => e.chords.some((c) => sameChord(c, chord)));
      if (clash)
        throw new Error(
          `Shortcut ${binding} of ${command.id} is already used by ${clash.command.id}`,
        );
    }
    this.#entries.push({ command, chords: bound.map(({ chord }) => chord) });
    return this;
  }

  get(id: string): Command<Ctx> | undefined {
    return this.#entries.find((e) => e.command.id === id)?.command;
  }

  /** Enabled commands, in registration order. */
  available(ctx: Ctx): Command<Ctx>[] {
    return this.#entries.map((e) => e.command).filter((c) => c.isEnabled?.(ctx) ?? true);
  }

  shortcutLabel(id: string): string | undefined {
    const chord = this.#entries.find((e) => e.command.id === id)?.chords[0];
    return chord && formatChord(chord, this.primary);
  }

  /** The global command a key event triggers, if any. */
  forEvent(event: KeyboardEvent, ctx: Ctx): Command<Ctx> | undefined {
    const entry = this.#entries.find(
      (e) =>
        e.command.scope === 'global' &&
        e.chords.some((chord) => matches(chord, event)) &&
        (e.command.isEnabled?.(ctx) ?? true),
    );
    return entry?.command;
  }

  async execute(id: string, ctx: Ctx): Promise<boolean> {
    const command = this.get(id);
    if (!command || !(command.isEnabled?.(ctx) ?? true)) return false;
    await command.run(ctx);
    return true;
  }
}

/** Accent- and case-insensitive filter: every word of the query must appear; prefix matches first. */
export function filterByQuery<T>(
  items: readonly T[],
  query: string,
  label: (item: T) => string,
): T[] {
  const fold = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...items];
  return items
    .map((item, index) => ({ item, index, text: fold(label(item)) }))
    .filter(({ text }) => words.every((w) => text.includes(w)))
    .sort(
      (a, b) =>
        Number(!a.text.startsWith(words[0] ?? '')) - Number(!b.text.startsWith(words[0] ?? '')) ||
        a.index - b.index,
    )
    .map(({ item }) => item);
}
