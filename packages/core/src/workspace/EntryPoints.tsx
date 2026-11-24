import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { PrefsUpdate, WritingPrefs } from './writing-prefs';
import { stepMeasure, stepTextSize } from './writing-prefs';
import './entry-points.css';
import { CloseButton } from '../icons/CloseButton';
import { Pictogram, type PictogramName } from '../icons/Pictogram';
import { usePlatform } from '../app/platform-context';
import { useAnswerWaiting } from '../mentor/answer-wait';
import '../mentor/wait.css';

/** « Label (shortcut) »: the native tooltip of every entry point (docs/DESIGN.md §4.8). */
export const withShortcut = (label: string, shortcut: string | undefined) =>
  shortcut ? `${label} (${shortcut})` : label;

/**
 * A key of the console (docs/DESIGN.md §4.8, 1.25): a disc in relief with the
 * panel's pictogram, its name and shortcut above it when the mouse comes near.
 * A toggle: it stays pressed while its panel is open, a second click closes it.
 */
export function ConsoleKey({
  picto,
  name,
  title,
  shortcut,
  count,
  pressed,
  tour,
  mentor = false,
  band = false,
  projectId,
  onToggle,
}: {
  readonly picto: PictogramName;
  readonly name: string;
  readonly title: string;
  readonly shortcut: string | undefined;
  readonly count?: number;
  readonly pressed: boolean;
  /** Step of the guided tour that points at it. */
  readonly tour?: number;
  readonly mentor?: boolean;
  /** In the overview's strip (DESIGN 1.25): 30 px, in the strip's slate. */
  readonly band?: boolean;
  /** The project open: the Compagnon's wait is for it. */
  readonly projectId: string;
  onToggle(): void;
}) {
  // The Compagnon prepares an answer, his panel closed: his pastille breathes here,
  // in place of the count, until it comes (docs/DESIGN.md §4.5, 1.34).
  const waiting = useAnswerWaiting(usePlatform().agents, projectId) && mentor && !pressed;
  return (
    <button
      type="button"
      className={`ch-console-key${mentor ? ' is-mentor' : ''}${pressed ? ' is-down' : ''}${band ? ' is-band' : ''}`}
      title={withShortcut(title, shortcut)}
      aria-label={name}
      aria-pressed={pressed}
      data-tour={tour}
      onClick={onToggle}
    >
      <span className="ch-console-name" aria-hidden="true">
        {name} {shortcut && <kbd>{shortcut}</kbd>}
      </span>
      <Pictogram name={picto} size={17} />
      {waiting ? (
        <span className="ch-console-breath" aria-hidden="true" />
      ) : (
        count !== undefined &&
        count > 0 && (
          <span className="ch-console-count" aria-hidden="true">
            {count}
          </span>
        )
      )}
    </button>
  );
}

/**
 * The console (docs/DESIGN.md §4.8, 1.25, the author's choice): a plate in
 * relief at the foot of the page, the manuscript's key, the command zone, the
 * Compagnon's key. It gives way to the command line once that is open.
 */
export function Console({
  commandZone,
  manuscript,
  compagnon,
  away,
  projectId,
}: {
  readonly commandZone: ReactNode;
  readonly manuscript: {
    readonly shortcut: string | undefined;
    readonly open: boolean;
    toggle(): void;
  };
  readonly compagnon: {
    readonly shortcut: string | undefined;
    readonly open: boolean;
    readonly count: number;
    toggle(): void;
  };
  /** The command line is open: the plate fades out. */
  readonly away: boolean;
  readonly projectId: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={`ch-console ch-chrome${away ? ' is-away' : ''}`}>
      <ConsoleKey
        picto="manuscrit"
        name={t('entry.manuscript')}
        title={t('entry.manuscriptTitle')}
        shortcut={manuscript.shortcut}
        pressed={manuscript.open}
        tour={1}
        projectId={projectId}
        onToggle={manuscript.toggle}
      />
      {commandZone}
      <ConsoleKey
        picto="compagnon"
        name={t('entry.compagnon')}
        title={t('entry.compagnonTitle')}
        shortcut={compagnon.shortcut}
        count={compagnon.count}
        pressed={compagnon.open}
        tour={2}
        projectId={projectId}
        mentor
        onToggle={compagnon.toggle}
      />
    </div>
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
 * focus mode, theme, reduced motion, each with its shortcut; under an engraved
 * rule, the way to the app's settings (rule 1 of §5.0: visible everywhere).
 * Échap or a click elsewhere closes it.
 */
export function DisplaySheet({
  prefs,
  updatePrefs,
  shortcut,
  onSettings,
  onClose,
}: {
  readonly prefs: WritingPrefs;
  readonly updatePrefs: (update: PrefsUpdate) => void;
  readonly shortcut: (id: string) => string | undefined;
  /** « Réglages de l'app… »: the sheet closes, the settings open (the command's own gesture). */
  readonly onSettings: () => void;
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
      <button
        type="button"
        className="ch-display-settings"
        data-command="openSettings"
        onClick={onSettings}
      >
        <span>{t('commands.openSettings')}</span>
        {shortcut('openSettings') && <kbd>{shortcut('openSettings')}</kbd>}
      </button>
    </div>
  );
}
