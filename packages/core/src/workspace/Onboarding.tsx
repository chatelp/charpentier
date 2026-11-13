import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

/** Kept on the device once the author has seen the welcome (docs/DESIGN.md §4.8). */
export const WELCOMED_PREF = 'welcomed';

const PLACES = ['left', 'right', 'bottom'] as const;

/**
 * The Compagnon's welcome on the first launch (docs/DESIGN.md §4.8), unfolded
 * in the margin like a note: what it does and does not do, and the three
 * places to know. It leaves the cursor in the text: there ⏎ starts the tour,
 * Échap puts it off, and the first letter typed puts it off too.
 */
export function WelcomeNote({
  style,
  onTour,
  onLater,
}: {
  readonly style: CSSProperties;
  readonly onTour: () => void;
  readonly onLater: () => void;
}) {
  const { t } = useTranslation();
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      onTour();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onLater();
    }
  };
  return (
    <aside
      className="ch-note ch-raised ch-welcome"
      style={style}
      tabIndex={-1}
      aria-label={t('welcome.kind')}
      onKeyDown={onKeyDown}
    >
      <p className="ch-note-head">
        <span className="ch-label">{t('welcome.kind')}</span>
        <span className="ch-note-signature">{t('mentor.name')}</span>
      </p>
      <p className="ch-note-title">{t('welcome.title')}</p>
      <p className="ch-note-message">{t('welcome.body')}</p>
      <ul className="ch-welcome-places">
        {PLACES.map((place) => (
          <li key={place}>
            <b>{t(`welcome.places.${place}.where`)}</b>
            {t(`welcome.places.${place}.what`)}
          </li>
        ))}
      </ul>
      <p className="ch-note-actions">
        <button type="button" tabIndex={-1} className="ch-btn is-mentor" onClick={onTour}>
          {t('welcome.tour')} <kbd>{t('welcome.tourKey')}</kbd>
        </button>
        <button type="button" tabIndex={-1} className="ch-btn" onClick={() => onLater()}>
          {t('welcome.later')} <kbd>{t('welcome.laterKey')}</kbd>
        </button>
      </p>
    </aside>
  );
}

const STEPS = [1, 2, 3] as const;

/**
 * The guided tour (docs/DESIGN.md §4.8): three bubbles beside the entry
 * points (manuscript, Compagnon, command zone), each circled in blue. ⏎ goes
 * on, Échap stops. Never started by itself after the first launch.
 */
export function GuidedTour({
  shortcuts,
  onDone,
}: {
  /** Shortcut of each step's tool. */
  readonly shortcuts: Readonly<Record<1 | 2 | 3, string | undefined>>;
  readonly onDone: () => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  // Off screen until measured (still focusable, unlike a hidden element).
  const [position, setPosition] = useState<CSSProperties>({ left: -9999, top: 0 });
  const tip = useRef<HTMLDivElement>(null);

  // Circle the entry point and put the bubble beside it, inside the window.
  useLayoutEffect(() => {
    const target = document.querySelector<HTMLElement>(`[data-tour="${step}"]`);
    const bubble = tip.current;
    if (!target || !bubble) return;
    target.classList.add('ch-tour-on');
    const r = target.getBoundingClientRect();
    const w = bubble.offsetWidth;
    const h = bubble.offsetHeight;
    const gap = 16;
    let x = r.left + r.width / 2 - w / 2;
    let y = r.top - h - gap;
    if (r.left < 40) {
      x = r.right + gap;
      y = r.top + r.height / 2 - h / 2;
    } else if (window.innerWidth - r.right < 40) {
      x = r.left - w - gap;
      y = r.top + r.height / 2 - h / 2;
    }
    setPosition({
      left: Math.max(10, Math.min(x, window.innerWidth - w - 10)),
      top: Math.max(10, Math.min(y, window.innerHeight - h - 10)),
    });
    bubble.focus();
    return () => target.classList.remove('ch-tour-on');
  }, [step]);

  const next = () => (step < 3 ? setStep((step + 1) as 2 | 3) : onDone());
  const key = (['manuscript', 'compagnon', 'commands'] as const)[step - 1] ?? 'manuscript';
  return (
    <div
      ref={tip}
      className="ch-tip ch-raised ch-tool"
      role="dialog"
      aria-label={t(`tour.${key}.title`)}
      tabIndex={-1}
      style={position}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          next();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onDone();
        }
      }}
    >
      <p className="ch-tip-title">
        {t(`tour.${key}.title`)} {shortcuts[step] && <kbd>{shortcuts[step]}</kbd>}
      </p>
      <p className="ch-tip-text">{t(`tour.${key}.text`)}</p>
      <p className="ch-note-actions">
        <button type="button" tabIndex={-1} className="ch-btn is-mentor" onClick={next}>
          {t(step < 3 ? 'tour.next' : 'tour.done')} <kbd>{t('welcome.tourKey')}</kbd>
        </button>
        <span className="ch-tip-step">{t('tour.step', { step, count: STEPS.length })}</span>
      </p>
    </div>
  );
}
