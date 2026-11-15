import { useTranslation } from 'react-i18next';
import './close-button.css';

/** What a close cross says (docs/DESIGN.md §4.8 « Sortie à la souris »). */
export type CloseLabel = 'panel' | 'toText' | 'commandLine' | 'generic';

/**
 * The close cross (docs/DESIGN.md §4.8 « Sortie à la souris », 1.13): wherever
 * Échap leaves, a click does it too, with exactly Échap's effect. Faint and
 * flat at rest; on hover or keyboard focus it darkens, rises, and its key
 * slides out on its left. In the system's material (`system`), the key is
 * written in fixed pitch and the cross is smaller.
 */
export function CloseButton({
  purpose,
  onClose,
  system = false,
  corner = false,
}: {
  readonly purpose: CloseLabel;
  onClose(): void;
  readonly system?: boolean;
  /** In the top-right corner of a full-frame view. */
  readonly corner?: boolean;
}) {
  const { t } = useTranslation();
  const name = t(`close.${purpose}`);
  const key = t(system ? 'close.keySystem' : 'close.key');
  const size = system ? 9 : 10;
  return (
    <button
      type="button"
      className={`ch-close${system ? ' is-system' : ''}${corner ? ' is-corner' : ''}`}
      aria-label={name}
      aria-keyshortcuts="Escape"
      title={t('close.title', { label: name, key: t('close.key') })}
      onClick={onClose}
    >
      <kbd aria-hidden="true">{key}</kbd>
      <span className="ch-close-x">
        <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden="true">
          <path
            d="M1.5 1.5l7 7M8.5 1.5l-7 7"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </span>
    </button>
  );
}
