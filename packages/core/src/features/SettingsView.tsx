import { useEffect, useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { WorkspaceContext } from '../workspace/workspace-context';
import { featureText, type SettingsSection } from './feature';
import { useFeatures } from './features-context';
import { CloseButton } from '../icons/CloseButton';

/**
 * The settings view (docs/DESIGN.md §4.12): full frame, like the Atelier. On
 * the left a rail with one line per section and its current value; on the
 * right the section. Its sections come from the features; without any, there
 * is no settings view.
 */
export function SettingsView({
  ctx,
  sections,
  section,
  active,
  focusRequest,
  onSection,
  onClose,
}: {
  readonly ctx: WorkspaceContext;
  readonly sections: readonly SettingsSection[];
  /** The section shown (the first one when unknown). */
  readonly section: string | undefined;
  readonly active: boolean;
  /** Changes when the rail should take the focus. */
  readonly focusRequest: number;
  onSection(id: string): void;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const text = featureText(t);
  const railRef = useRef<HTMLUListElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const look = useFeatures().find((f) => f.settingsLook)?.settingsLook;
  const current = sections.find((s) => s.id === section) ?? sections[0];
  const index = current ? sections.indexOf(current) : -1;

  useEffect(() => {
    if (active) railRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when asked
  }, [focusRequest]);

  const go = (to: number) => {
    const next = sections[(to + sections.length) % sections.length];
    if (!next) return;
    onSection(next.id);
    requestAnimationFrame(() =>
      railRef.current?.querySelector<HTMLElement>(`[data-section="${next.id}"]`)?.focus(),
    );
  };

  const onRailKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'ArrowDown') go(index + 1);
    else if (event.key === 'ArrowUp') go(index - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(sections.length - 1);
    else if (event.key === 'Enter' || event.key === 'ArrowRight')
      pageRef.current
        ?.querySelector<HTMLElement>('button, input, select, textarea, [tabindex="0"]')
        ?.focus();
    else return;
    event.preventDefault();
  };

  if (!current) return null;
  const Section = current.component;
  const Intro = current.intro;
  return (
    <section
      className="ch-settings"
      aria-label={t('settings.label')}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        onClose();
      }}
    >
      <nav className={`ch-settings-rail ${look?.material === 'system' ? 'ch-system' : 'ch-tool'}`}>
        <h2 className={`ch-settings-title${look ? ' is-feature' : ''}`}>
          {look?.icon && <look.icon />}
          {look ? text(look.title) : t('settings.title')}
        </h2>
        <ul
          ref={railRef}
          className="ch-settings-sections"
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
                className="ch-settings-section"
                onClick={() => onSection(s.id)}
              >
                <span className="ch-settings-section-name">{text(s.label)}</span>
                {Value && (
                  <span className="ch-settings-section-value">
                    <Value ctx={ctx} />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {look?.hint && <p className="ch-settings-hint">{text(look.hint)}</p>}
      </nav>
      <div
        ref={pageRef}
        className="ch-settings-page"
        role="region"
        aria-label={text(current.label)}
      >
        <h3 className="ch-settings-page-title">{text(current.label)}</h3>
        {Intro && (
          <p className="ch-settings-intro">
            <Intro ctx={ctx} />
          </p>
        )}
        <Section ctx={ctx} />
      </div>
      <CloseButton purpose="toText" onClose={onClose} corner />
    </section>
  );
}
