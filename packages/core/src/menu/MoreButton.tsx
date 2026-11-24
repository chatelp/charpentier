import { useTranslation } from 'react-i18next';
import { withShortcut } from '../workspace/EntryPoints';
import './menu.css';

/**
 * The « ⋯ » at the right end of a thing's line (docs/DESIGN.md §4.7): opens
 * the thing's menu under it (a click anywhere closes it again). Its place is
 * always kept; it shows on the line's hover or focus and while its menu is
 * open. Not a tab stop: in a list, `M` opens the menu of the line that has
 * the focus.
 */
export function MoreButton({
  label,
  shortcut,
  open,
  onOpen,
}: {
  /** « Actions de la scène Le quai de la Fosse »: the kind and the name of the thing. */
  readonly label: string;
  /** The key that opens the menu from the line (`M`), where the line can have the focus. */
  readonly shortcut?: string | undefined;
  readonly open: boolean;
  onOpen(button: HTMLElement): void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      tabIndex={-1}
      className="ch-more"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={label}
      title={withShortcut(t('thingMenu.actions'), shortcut)}
      // Neither a click on the line (it would open the scene) nor the start of its drag.
      onClick={(event) => {
        event.stopPropagation();
        onOpen(event.currentTarget);
      }}
      draggable={false}
    >
      <span aria-hidden="true">⋯</span>
    </button>
  );
}
