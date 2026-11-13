/** What the palette is asked to show. */
export type PaletteRequest =
  | {
      readonly kind: 'commands';
      /** Initial text, e.g. `#` to open on the scenes. */
      readonly query?: string;
    }
  | {
      readonly kind: 'pick';
      readonly placeholder: string;
      readonly items: readonly PickItem[];
      readonly empty?: string;
      onPick(id: string): void;
    }
  | {
      readonly kind: 'input';
      readonly placeholder: string;
      readonly initial: string;
      /** Masked input (an API key). */
      readonly secret?: boolean;
      onSubmit(value: string): void;
    };

export interface PickItem {
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
  readonly shortcut?: string;
}

/** What a prefix of the command line searches (`#` scenes, `@` sheets, a feature's `:`). */
export interface PaletteScope {
  readonly label: string;
  readonly items: readonly PickItem[];
  /**
   * Its own search of what follows the prefix (`lum 40`), instead of filtering
   * `items`; such a scope only answers under its prefix.
   */
  search?(query: string): readonly PickItem[];
  /** `query`: the text typed after the prefix. */
  onPick(id: string, query: string): void;
}
