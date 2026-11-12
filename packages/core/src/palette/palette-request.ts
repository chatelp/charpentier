/** What the palette is asked to show. */
export type PaletteRequest =
  | { readonly kind: 'commands' }
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
      onSubmit(value: string): void;
    };

export interface PickItem {
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
  readonly shortcut?: string;
}
