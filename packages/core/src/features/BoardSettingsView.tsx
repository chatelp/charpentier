import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { WorkspaceContext } from '../workspace/workspace-context';
import { featureText, type SettingsSection } from './feature';
import { useFeatures } from './features-context';
import './board-settings.css';

/**
 * A machine's settings on two levels (docs/DESIGN.md §4.12 « Réglages du
 * système », 1.23, the author's « A + C »): a board of dials, one per
 * section, the whole state of the machine at a glance; ⏎ opens a section,
 * with its rail; Échap goes back to the board, then to the text. Drawn in
 * the feature's look (the X250's system charter, the flat instrument).
 */
export function BoardSettingsView({
  ctx,
  sections,
  section,
  active,
  focusRequest,
  onSection,
  onClose,
  other,
}: {
  readonly ctx: WorkspaceContext;
  readonly sections: readonly SettingsSection[];
  /** The section asked for (a shortcut that aims at one), or none: the board. */
  readonly section: string | undefined;
  readonly active: boolean;
  /** Changes when the view should take the focus (again). */
  readonly focusRequest: number;
  onSection(id: string | undefined): void;
  onClose(): void;
  /** The app's settings, from the board's head and the rail's foot. */
  readonly other: { readonly label: string; readonly shortcut: string | undefined; open(): void };
}) {
  const { t } = useTranslation();
  const text = featureText(t);
  const look = useFeatures().find((f) => f.settingsLook)?.settingsLook;
  const Icon = look?.icon;
  const Subtitle = look?.subtitle;
  const title = look ? text(look.title) : t('settings.title');
  const current = sections.find((s) => s.id === section);
  // The dial chosen on the board: the section left last, else the first.
  const [chosen, setChosen] = useState(section ?? sections[0]?.id);
  const board = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLUListElement>(null);
  const page = useRef<HTMLDivElement>(null);

  const focusBoard = (id: string | undefined) =>
    requestAnimationFrame(() =>
      board.current?.querySelector<HTMLElement>(`[data-dial="${id ?? ''}"]`)?.focus(),
    );
  const focusRail = (id: string) =>
    requestAnimationFrame(() =>
      rail.current?.querySelector<HTMLElement>(`[data-section="${id}"]`)?.focus(),
    );

  useEffect(() => {
    if (!active) return;
    if (current) focusRail(current.id);
    else focusBoard(chosen);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when asked
  }, [focusRequest]);

  const open = (id: string) => {
    setChosen(id);
    onSection(id);
    focusRail(id);
  };
  const toBoard = () => {
    const from = current?.id ?? chosen;
    setChosen(from);
    onSection(undefined);
    focusBoard(from);
  };

  // ─── The board ─────────────────────────────────────────────────────────
  if (!current) {
    const columns = 4;
    const index = Math.max(
      0,
      sections.findIndex((s) => s.id === chosen),
    );
    const onBoardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      const step: Record<string, number> = {
        ArrowRight: 1,
        ArrowLeft: -1,
        ArrowDown: columns,
        ArrowUp: -columns,
      };
      if (event.key in step) {
        event.preventDefault();
        const next =
          sections[Math.min(sections.length - 1, Math.max(0, index + (step[event.key] ?? 0)))];
        if (next) {
          setChosen(next.id);
          focusBoard(next.id);
        }
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const here = sections[index];
        if (here) open(here.id);
      }
    };
    return (
      <section
        className="ch-sysset ch-system is-board"
        aria-label={title}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || event.defaultPrevented) return;
          event.preventDefault();
          onClose();
        }}
      >
        <header className="ch-sysset-head">
          <h2 className="ch-sysset-title">
            {Icon && <Icon />}
            {title}
          </h2>
          {Subtitle && (
            <span className="ch-sysset-sub">
              <Subtitle ctx={ctx} />
            </span>
          )}
          <span className="ch-sysset-actions">
            <button type="button" className="ch-sysset-link" onClick={other.open}>
              {other.shortcut && <kbd>{other.shortcut}</kbd>} {other.label}
            </button>
            {' · '}
            <button type="button" className="ch-sysset-link" onClick={onClose}>
              {t('boardSettings.close')} ×
            </button>
          </span>
        </header>
        <div
          ref={board}
          className="ch-sysset-board"
          role="listbox"
          aria-label={t('settings.sectionsLabel')}
          onKeyDown={onBoardKeyDown}
        >
          {sections.map((s) => {
            const Dial = s.dial;
            const Value = s.value;
            const on = s.id === sections[index]?.id;
            return (
              <div
                key={s.id}
                role="option"
                aria-selected={on}
                tabIndex={on ? 0 : -1}
                data-dial={s.id}
                className="ch-sysset-dial"
                onFocus={() => setChosen(s.id)}
                onClick={() => open(s.id)}
              >
                <p className="ch-sysset-dial-name">
                  {text(s.label)}
                  {on && <span className="ch-sysset-dial-open">⏎ {t('boardSettings.open')}</span>}
                </p>
                {Dial ? (
                  <Dial ctx={ctx} />
                ) : (
                  <p className="ch-sysset-dial-value">{Value ? <Value ctx={ctx} /> : '—'}</p>
                )}
              </div>
            );
          })}
        </div>
        <p className="ch-sysset-hint">{t('boardSettings.boardHint')}</p>
      </section>
    );
  }

  // ─── A section, with its rail ──────────────────────────────────────────
  const index = sections.indexOf(current);
  const go = (to: number) => {
    const next = sections[(to + sections.length) % sections.length];
    if (next) open(next.id);
  };
  const onRailKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'ArrowDown') go(index + 1);
    else if (event.key === 'ArrowUp') go(index - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(sections.length - 1);
    else if (event.key === 'Backspace') toBoard();
    else if (event.key === 'Enter' || event.key === 'ArrowRight')
      page.current
        ?.querySelector<HTMLElement>('button, input, select, textarea, [tabindex="0"]')
        ?.focus();
    else return;
    event.preventDefault();
  };
  const Section = current.component;
  const Intro = current.intro;
  return (
    <section
      className="ch-sysset ch-system is-section"
      aria-label={title}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        toBoard();
      }}
    >
      <nav className="ch-sysset-rail">
        <div className="ch-sysset-rail-head">
          <h2 className="ch-sysset-title">
            {Icon && <Icon />}
            {title}
          </h2>
          <button type="button" className="ch-sysset-link" onClick={toBoard}>
            ⌫ {t('boardSettings.board')}
          </button>
        </div>
        <ul
          ref={rail}
          className="ch-sysset-sections"
          role="listbox"
          aria-label={t('settings.sectionsLabel')}
          onKeyDown={onRailKeyDown}
        >
          {sections.map((s) => {
            const Value = s.value;
            return (
              <li
                key={s.id}
                role="option"
                data-section={s.id}
                aria-selected={s === current}
                tabIndex={s === current ? 0 : -1}
                className="ch-sysset-line"
                onClick={() => open(s.id)}
              >
                <span>{text(s.label)}</span>
                <span className="ch-sysset-leader" aria-hidden="true" />
                {Value && (
                  <span className="ch-sysset-line-value">
                    <Value ctx={ctx} />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <button type="button" className="ch-sysset-line ch-sysset-other" onClick={other.open}>
          <span>{other.label}</span>
          <span className="ch-sysset-leader" aria-hidden="true" />
          {other.shortcut && <kbd>{other.shortcut}</kbd>}
        </button>
      </nav>
      <div ref={page} className="ch-sysset-page" role="region" aria-label={text(current.label)}>
        <button type="button" className="ch-sysset-link ch-sysset-back" onClick={toBoard}>
          {t('boardSettings.toBoard')} ×
        </button>
        <p className="ch-sysset-path">{title} /</p>
        <h3 className="ch-sysset-page-title">{text(current.label)}</h3>
        {Intro && (
          <p className="ch-sysset-intro">
            <Intro ctx={ctx} />
          </p>
        )}
        <div className="ch-sysset-body">
          <Section ctx={ctx} />
        </div>
        <p className="ch-sysset-hint">{t('boardSettings.sectionHint')}</p>
      </div>
    </section>
  );
}
