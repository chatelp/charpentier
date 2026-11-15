import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { PrefsUpdate, WritingPrefs } from './writing-prefs';
import { stepMeasure, stepTextSize } from './writing-prefs';
import './entry-points.css';
import { CloseButton } from '../icons/CloseButton';

/** « Label (shortcut) »: the native tooltip of every entry point (docs/DESIGN.md §4.8). */
export const withShortcut = (label: string, shortcut: string | undefined) =>
  shortcut ? `${label} (${shortcut})` : label;

/**
 * A handle on the edge of the window, where its panel comes from
 * (docs/DESIGN.md §4.8): vertical label in small caps, its shortcut, and for
 * the Compagnon the number of open points.
 */
export function EdgeHandle({
  side,
  label,
  title,
  shortcut,
  count,
  tour,
  onOpen,
}: {
  readonly side: 'left' | 'right';
  readonly label: string;
  readonly title: string;
  readonly shortcut: string | undefined;
  readonly count?: number;
  /** Step of the guided tour that points at it. */
  readonly tour: number;
  readonly onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className={`ch-edge ch-chrome ch-tool is-${side}`}
      title={withShortcut(title, shortcut)}
      data-tour={tour}
      onClick={onOpen}
    >
      {count !== undefined && count > 0 && <span className="ch-edge-count">{count}</span>}
      <span className="ch-edge-label">{label}</span>
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  );
}

/** « Écrire | Atelier », top right of the writing surface and in the Atelier's rail. */
export function ModeSwitch({
  view,
  shortcut,
  onWrite,
  onAtelier,
  className = '',
}: {
  readonly view: 'write' | 'atelier';
  readonly shortcut: string | undefined;
  readonly onWrite: () => void;
  readonly onAtelier: () => void;
  readonly className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={`ch-seg ch-modes ch-chrome ${className}`}
      role="group"
      aria-label={t('entry.modes')}
      title={withShortcut(t('entry.modes'), shortcut)}
    >
      <button
        type="button"
        className={view === 'write' ? 'is-on' : ''}
        aria-pressed={view === 'write'}
        onClick={onWrite}
      >
        {t('entry.write')}
      </button>
      <button
        type="button"
        className={view === 'atelier' ? 'is-on' : ''}
        aria-pressed={view === 'atelier'}
        onClick={onAtelier}
      >
        {t('entry.atelier')}
      </button>
    </div>
  );
}

/** The command zone, always visible: a click opens the command line (docs/DESIGN.md §4.6). */
export function CommandZone({
  shortcut,
  onOpen,
  inline = false,
}: {
  readonly shortcut: string | undefined;
  readonly onOpen: () => void;
  /** In a column (the Atelier's rail) rather than centred in the footer. */
  readonly inline?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={`ch-cmdzone ch-chrome${inline ? ' is-inline' : ''}`}
      title={withShortcut(t('entry.commandZoneTitle'), shortcut)}
      data-tour={inline ? undefined : 3}
      onClick={onOpen}
    >
      <span className="ch-cmdzone-prompt" aria-hidden="true">
        ›
      </span>
      <span className="ch-cmdzone-text">{t('entry.commandZone')}</span>
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  );
}

function Choice<T extends string | boolean>({
  value,
  options,
  onChange,
}: {
  readonly value: T;
  readonly options: readonly (readonly [T, string])[];
  readonly onChange: (value: T) => void;
}) {
  return (
    <>
      {options.map(([option, label]) => (
        <button
          key={String(option)}
          type="button"
          className={`ch-btn ch-display-choice${option === value ? ' is-on' : ''}`}
          aria-pressed={option === value}
          onClick={() => onChange(option)}
        >
          {label}
        </button>
      ))}
    </>
  );
}

function Row({
  label,
  shortcut,
  children,
}: {
  readonly label: string;
  readonly shortcut?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <div className="ch-display-row">
      <span className="ch-display-label">{label}</span>
      {children}
      {shortcut && <kbd>{shortcut}</kbd>}
    </div>
  );
}

/**
 * The display sheet behind « Aa » (docs/DESIGN.md §4.8): text size, column,
 * focus mode, theme, reduced motion, each with its shortcut. Échap or a click
 * elsewhere closes it.
 */
export function DisplaySheet({
  prefs,
  updatePrefs,
  shortcut,
  onClose,
}: {
  readonly prefs: WritingPrefs;
  readonly updatePrefs: (update: PrefsUpdate) => void;
  readonly shortcut: (id: string) => string | undefined;
  readonly onClose: (backToText: boolean) => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button:not(.ch-close)')?.focus();
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target)) return;
      // The « Aa » button toggles the sheet itself.
      if ((target as Element).closest?.('.ch-display-toggle')) return;
      close.current(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, []);
  const pair = (a: string | undefined, b: string | undefined) => (a && b ? `${a} ${b}` : (a ?? b));
  return (
    <div
      ref={ref}
      className="ch-display ch-raised ch-tool"
      role="dialog"
      aria-label={t('display.title')}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onClose(true);
      }}
    >
      <p className="ch-display-title ch-label">{t('display.title')}</p>
      <CloseButton purpose="generic" onClose={() => onClose(true)} corner />
      <Row
        label={t('display.textSize')}
        shortcut={pair(shortcut('decreaseTextSize'), shortcut('increaseTextSize'))}
      >
        <button
          type="button"
          className="ch-btn"
          aria-label={t('commands.decreaseTextSize')}
          onClick={() => updatePrefs((p) => stepTextSize(p, -1))}
        >
          {t('display.less')}
        </button>
        <button
          type="button"
          className="ch-btn"
          aria-label={t('commands.increaseTextSize')}
          onClick={() => updatePrefs((p) => stepTextSize(p, 1))}
        >
          {t('display.more')}
        </button>
      </Row>
      <Row
        label={t('display.column')}
        shortcut={pair(shortcut('narrowColumn'), shortcut('widenColumn'))}
      >
        <button
          type="button"
          className="ch-btn"
          aria-label={t('commands.narrowColumn')}
          onClick={() => updatePrefs((p) => stepMeasure(p, -1))}
        >
          {t('display.narrower')}
        </button>
        <button
          type="button"
          className="ch-btn"
          aria-label={t('commands.widenColumn')}
          onClick={() => updatePrefs((p) => stepMeasure(p, 1))}
        >
          {t('display.wider')}
        </button>
      </Row>
      <Row label={t('display.focus')} shortcut={shortcut('toggleFocusMode')}>
        <Choice
          value={prefs.focusMode}
          options={[
            [true, t('display.yes')],
            [false, t('display.no')],
          ]}
          onChange={(focusMode) => updatePrefs({ focusMode })}
        />
      </Row>
      <Row label={t('display.theme')} shortcut={shortcut('cycleTheme')}>
        <Choice
          value={prefs.theme}
          options={[
            ['system', t('display.system')],
            ['light', t('display.light')],
            ['dark', t('display.dark')],
          ]}
          onChange={(theme) => updatePrefs({ theme })}
        />
      </Row>
      <Row label={t('display.motion')} shortcut={shortcut('toggleReducedMotion')}>
        <Choice
          value={prefs.reducedMotion}
          options={[
            [true, t('display.yes')],
            [false, t('display.no')],
          ]}
          onChange={(reducedMotion) => updatePrefs({ reducedMotion })}
        />
      </Row>
      <Row label={t('display.uiSounds')}>
        <Choice
          value={prefs.uiSounds}
          options={[
            [true, t('display.yes')],
            [false, t('display.no')],
          ]}
          onChange={(uiSounds) => updatePrefs({ uiSounds })}
        />
      </Row>
      <Row label={t('display.typingSounds')}>
        <Choice
          value={prefs.typingSounds}
          options={[
            [true, t('display.yes')],
            [false, t('display.no')],
          ]}
          onChange={(typingSounds) => updatePrefs({ typingSounds })}
        />
      </Row>
    </div>
  );
}
