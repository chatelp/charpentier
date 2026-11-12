import { setMentorLevel, type MentorLevel } from '@charpentier/schema';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type * as Y from 'yjs';

const LEVELS: readonly MentorLevel[] = [1, 2, 3, 4];

/**
 * The intervention slider (D-19, docs/DESIGN.md §4.3): four steps, one
 * setting per project. ←→ when it has the focus.
 */
export function InterventionSlider({
  root,
  level,
}: {
  readonly root: Y.Doc;
  readonly level: MentorLevel;
}) {
  const { t } = useTranslation();
  const set = (next: number) => {
    const clamped = Math.min(4, Math.max(1, next)) as MentorLevel;
    if (clamped !== level) setMentorLevel(root, clamped);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      set(level + 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      set(level - 1);
    }
  };
  return (
    <div className="ch-slider-block">
      <div
        className="ch-slider"
        role="slider"
        tabIndex={0}
        aria-label={t('mentor.level.label')}
        aria-valuemin={1}
        aria-valuemax={4}
        aria-valuenow={level}
        aria-valuetext={t(`mentor.level.name.${level}`)}
        onKeyDown={onKeyDown}
      >
        {LEVELS.map((step) => (
          <button
            key={step}
            type="button"
            tabIndex={-1}
            className={`ch-slider-step${step === level ? ' is-on' : ''}`}
            aria-hidden="true"
            onClick={() => set(step)}
          />
        ))}
      </div>
      <p className="ch-slider-name ch-label">{t(`mentor.level.name.${level}`)}</p>
      <p className="ch-slider-what">{t(`mentor.level.what.${level}`)}</p>
    </div>
  );
}
