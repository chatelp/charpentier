import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useHostWords } from '../app/host-words';
import { Pictogram } from '../icons/Pictogram';
import './trash.css';

/** One thing in a list's trash: its name, what it was and when it left, and the way back. */
export interface TrashLine {
  readonly id: string;
  readonly name: string;
  /** « scène de Nantes · aujourd’hui à 14:32 » */
  readonly detail: string;
  restore(): void;
}

/**
 * The trash at the foot of a list (docs/DESIGN.md §4.7 « La corbeille au pied de la liste »,
 * rules 3 and 4 of §5.0 [D-46]): under an engraved rule, « Corbeille (3) », folded; unfolded in
 * place, the most recent first, one line per thing with « Remettre ⏎ ». Nothing when it is
 * empty: never « Corbeille (0) ».
 */
export function TrashFoot<Line extends TrashLine>({
  lines,
  listName,
  link,
  onRestored,
  onLeave,
  onEscape,
}: {
  readonly lines: readonly Line[];
  /** « Corbeille du manuscrit »: the unfolded list's name. */
  readonly listName: string;
  /** The folded link, when not « Corbeille (n) » (« Versions de travail à la corbeille (1) »). */
  readonly link?: string | undefined;
  /** The thing is back: its line takes the focus. */
  readonly onRestored: (line: Line) => void;
  /**
   * The list above takes the focus back at ↑ from the link: the foot then walks itself with ↑ ↓.
   * Without it, the surface around walks its own rows (`data-trash-row`).
   */
  readonly onLeave?: (() => void) | undefined;
  /** Échap, where the surface hears it on its list only. */
  readonly onEscape?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const host = useHostWords();
  const [open, setOpen] = useState(false);
  if (lines.length === 0) return null;
  const count = lines.length;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const spend = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    if (event.key === 'Escape' && onEscape) return (spend(), onEscape());
    if (!onLeave || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
    spend();
    const rows = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-trash-row]')];
    const at = rows.indexOf(document.activeElement as HTMLElement);
    const next = rows[at + (event.key === 'ArrowDown' ? 1 : -1)];
    if (next) next.focus();
    else if (event.key === 'ArrowUp') onLeave();
  };
  return (
    <div className="ch-trash-foot" onKeyDown={onKeyDown}>
      <p>
        <button
          type="button"
          className="ch-link ch-trash-link"
          data-trash-row
          aria-expanded={open}
          aria-label={link ?? t('trash.linkLabel', { count })}
          onClick={() => setOpen(!open)}
        >
          <Pictogram name="corbeille" size={13} />
          {link ?? t('trash.link', { count })}
        </button>
        {open && (
          <>
            <span aria-hidden="true">{'·'}</span>
            <button type="button" className="ch-link" onClick={() => setOpen(false)}>
              {t('trash.hide')}
            </button>
          </>
        )}
      </p>
      {open && (
        <ul className="ch-trash-list" aria-label={listName}>
          {lines.map((line) => (
            <li key={line.id} className="ch-trash-line">
              <span className="ch-trash-what">
                <span className="ch-trash-name">{line.name}</span>
                <span className="ch-trash-detail">{line.detail}</span>
              </span>
              <button
                type="button"
                className="ch-btn ch-trash-restore"
                data-trash-row
                aria-label={t('trash.restoreLabel', { name: line.name })}
                onClick={() => {
                  line.restore();
                  onRestored(line);
                }}
              >
                {t('trash.restore')} <kbd>{host.key('Enter')}</kbd>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
