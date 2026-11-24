import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TYPING_PAUSE_MS } from '../workspace/use-writing-surface';
import { waitClock, type AnswerWait } from './answer-wait';
import './wait.css';

/** The time shows after this: a quick answer is not timed (1.34). */
export const WAIT_TIME_AFTER_MS = 3000;
/** After this, « C'est plus long que d'habitude. » and « Arrêter » in plain sight. */
export const WAIT_LONG_AFTER_MS = 30_000;
/** The guardrails' reading shows only when it lasts longer than this. */
export const WAIT_REVIEW_AFTER_MS = 500;
/** How often the block looks at the clock. */
const TICK_MS = 250;

/** « 0:07 », « 1:12 ». */
const elapsedLabel = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/**
 * True while the author types in a field, until they pause (docs/DESIGN.md
 * §3.4: nothing moves while they type); `onKeyDown` goes on the field.
 */
type TypingEvent = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'metaKey' | 'ctrlKey'>;

export function useTypingPause(): readonly [boolean, (event: TypingEvent) => void] {
  const [typing, setTyping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onKeyDown = useCallback((event: TypingEvent) => {
    // Sending is the end of typing: the pastille breathes from the start.
    if (event.key === 'Enter' && !event.shiftKey) {
      clearTimeout(timer.current);
      setTyping(false);
      return;
    }
    // ⌘K and the like write nothing (⌥ types characters on a Mac).
    if (event.metaKey || event.ctrlKey) return;
    if (event.key.length !== 1 && !['Backspace', 'Delete', 'Enter'].includes(event.key)) return;
    setTyping(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setTyping(false), TYPING_PAUSE_MS);
  }, []);
  return [typing, onKeyDown] as const;
}

/**
 * The Compagnon prepares his answer (docs/DESIGN.md §4.5, « Pendant qu'il
 * réfléchit », 1.34), at the exact place where it will come: his name, his
 * pastille breathing, the phase the engine tells, the time after 3 s, and
 * after 30 s a line that says it is longer than usual, with « Arrêter ».
 * `page`: the interview's typography; `panel`: the conversation's.
 */
export function WaitBlock({
  wait,
  variant,
  typing,
  onStop,
  stopKey,
}: {
  readonly wait: AnswerWait;
  readonly variant: 'page' | 'panel';
  /** The author types: the pastille holds still at 70 %. */
  readonly typing: boolean;
  /** Absent where the host cannot stop an answer. */
  readonly onStop?: (() => void) | undefined;
  readonly stopKey?: string | undefined;
}) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => waitClock.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(waitClock.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  const elapsed = Math.max(0, now - wait.since);
  // The guardrails' reading is said only once it lasts (a quick one would only flicker).
  const phase =
    wait.phase === 'reviewing' && now - wait.phaseSince < WAIT_REVIEW_AFTER_MS
      ? wait.before
      : wait.phase;
  const long = elapsed >= WAIT_LONG_AFTER_MS;
  // The line it adds comes into view with the block (the thread is at its end).
  const block = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (long) block.current?.scrollIntoView({ block: 'nearest' });
  }, [long]);
  const stop = onStop && (
    <button
      type="button"
      className={`ch-btn ch-wait-stop${long ? '' : ' is-quiet'}`}
      onClick={onStop}
    >
      {t('mentor.wait.stop')}
      {stopKey && <kbd>{stopKey}</kbd>}
    </button>
  );
  return (
    // The thread is a live log: the block is left out of it, its status says the phase by itself.
    <div
      ref={block}
      className={`ch-wait is-${variant}${typing ? ' is-typing' : ''}`}
      aria-live="off"
    >
      <p className="ch-label ch-wait-who" aria-hidden="true">
        {t('mentor.name')}
      </p>
      <div className="ch-wait-line">
        {/* Read once per phase, never the time (1.34). */}
        <p className="ch-wait-status" role="status" aria-label={t('mentor.thinking')}>
          <span className="ch-wait-dot" aria-hidden="true" />
          <span className="ch-wait-phase">{t(`mentor.wait.${phase}`)}</span>
        </p>
        {elapsed >= WAIT_TIME_AFTER_MS && (
          <span className="ch-wait-time" aria-hidden="true">
            {elapsedLabel(elapsed)}
          </span>
        )}
        {!long && stop}
      </div>
      {long && (
        <p className="ch-wait-long">
          {t('mentor.wait.long')} {stop}
        </p>
      )}
    </div>
  );
}
