import {
  dismissSignal,
  resolveSignal,
  type FieldRef,
  type OutlineChapter,
  type Signal,
} from '@charpentier/schema';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type * as Y from 'yjs';
import { sceneNumbers } from '../atelier/atelier-data';
import type { AtelierModule } from '../atelier/module-defs';
import { signalLevel } from './signal-decorations';

export interface MentorPanelProps {
  readonly root: Y.Doc;
  readonly outline: readonly OutlineChapter[];
  readonly sceneId: string;
  readonly signals: readonly Signal[];
  /** Order of this scene's signals in its text. */
  readonly sceneOrder: readonly string[];
  readonly tab: 'points' | 'conversation';
  readonly onTab: (tab: 'points' | 'conversation') => void;
  /** Goes to the passage (opening its scene) and unfolds the note. */
  readonly onGoTo: (signal: Signal) => void;
  readonly onClose: () => void;
  /** Conversation (phase 3.4) and the intervention slider (phase 3.7) plug in here. */
  readonly conversation?: ReactNode;
  readonly header?: ReactNode;
  readonly active: boolean;
}

interface Group {
  readonly key: string;
  readonly label: string;
  readonly signals: readonly Signal[];
}

/**
 * The right panel (docs/DESIGN.md §4.3): points to deal with, grouped (this
 * scene, other scenes, the sheets, the project), and the conversation.
 * J/K or ↑↓ to move, ↵ to the passage, R resolved, I ignore, Échap closes.
 */
export function MentorPanel(props: MentorPanelProps) {
  const { t } = useTranslation();
  const { signals, sceneId, outline, sceneOrder } = props;
  const numbers = useMemo(() => sceneNumbers(outline), [outline]);
  const [selectedId, setSelectedId] = useState<string>();
  const list = useRef<HTMLUListElement>(null);

  const groups: Group[] = useMemo(() => {
    const here = signals
      .filter((s) => s.textAnchor?.sceneId === sceneId)
      .sort((a, b) => sceneOrder.indexOf(a.id) - sceneOrder.indexOf(b.id));
    const elsewhere = signals.filter((s) => s.textAnchor && s.textAnchor.sceneId !== sceneId);
    const sheets = signals.filter((s) => !s.textAnchor && s.fieldRef);
    const project = signals.filter((s) => !s.textAnchor && !s.fieldRef);
    return [
      { key: 'scene', label: t('mentor.groups.scene'), signals: here },
      { key: 'elsewhere', label: t('mentor.groups.elsewhere'), signals: elsewhere },
      { key: 'sheets', label: t('mentor.groups.sheets'), signals: sheets },
      { key: 'project', label: t('mentor.groups.project'), signals: project },
    ].filter((g) => g.signals.length > 0);
  }, [signals, sceneId, sceneOrder, t]);

  const flat = groups.flatMap((g) => g.signals);
  const selected = flat.find((s) => s.id === selectedId) ?? flat[0];

  useEffect(() => {
    if (!props.active || props.tab !== 'points') return;
    const item = list.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    (item ?? list.current)?.focus();
  }, [props.active, props.tab, selected?.id]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key;
    const index = selected ? flat.indexOf(selected) : -1;
    const move = (step: number) => {
      const next = flat[Math.max(0, Math.min(flat.length - 1, index + step))];
      if (next) setSelectedId(next.id);
    };
    if (key === 'Escape') {
      event.preventDefault();
      props.onClose();
    } else if (key === 'ArrowDown' || key === 'j') {
      event.preventDefault();
      move(1);
    } else if (key === 'ArrowUp' || key === 'k') {
      event.preventDefault();
      move(-1);
    } else if (key === 'Enter' && selected) {
      event.preventDefault();
      props.onGoTo(selected);
    } else if ((key === 'r' || key === 'i') && selected) {
      event.preventDefault();
      const next = flat[index + 1] ?? flat[index - 1];
      if (key === 'r') resolveSignal(props.root, selected.id);
      else dismissSignal(props.root, selected.id);
      setSelectedId(next?.id);
    }
  };

  const sceneLabel = (s: Signal): string | undefined =>
    s.textAnchor
      ? numbers.get(s.textAnchor.sceneId)
      : s.fieldRef
        ? t(`atelier.modules.${railOfModule(s.fieldRef.module)}`)
        : undefined;

  return (
    <aside className="ch-mentor-panel ch-raised" aria-label={t('mentor.panel')}>
      <div className="ch-seg" role="tablist" aria-label={t('mentor.panel')}>
        {(['points', 'conversation'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            tabIndex={-1}
            aria-selected={props.tab === tab}
            className={props.tab === tab ? 'is-on' : undefined}
            onClick={() => props.onTab(tab)}
          >
            {t(`mentor.tabs.${tab}`)}
            {tab === 'points' && flat.length > 0 && (
              <span className="ch-seg-count">{flat.length}</span>
            )}
          </button>
        ))}
      </div>
      {props.header}
      {props.tab === 'conversation' ? (
        props.conversation
      ) : (
        <>
          <ul
            ref={list}
            className="ch-points"
            role="listbox"
            tabIndex={flat.length ? -1 : 0}
            aria-label={t('mentor.tabs.points')}
            onKeyDown={onKeyDown}
          >
            {groups.map((group) => (
              <li key={group.key} role="presentation">
                <p className="ch-points-group ch-label">{group.label}</p>
                <ul role="presentation" className="ch-points-items">
                  {group.signals.map((s) => (
                    <li
                      key={s.id}
                      role="option"
                      aria-selected={s.id === selected?.id}
                      tabIndex={s.id === selected?.id ? 0 : -1}
                      className="ch-point"
                      onClick={() => setSelectedId(s.id)}
                      onFocus={() => setSelectedId(s.id)}
                      onDoubleClick={() => props.onGoTo(s)}
                    >
                      <span className="ch-point-pastille" data-level={signalLevel(s.kind)} />
                      <span className="ch-point-kind ch-label">
                        {t(`mentor.kind.${s.kind}`)}
                        {sceneLabel(s) && <em> · {sceneLabel(s)}</em>}
                      </span>
                      <span className="ch-point-message">{s.message}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {flat.length === 0 && <p className="ch-points-empty">{t('mentor.noPoints')}</p>}
          <p className="ch-panel-hint">{t('mentor.pointsHint')}</p>
        </>
      )}
    </aside>
  );
}

function railOfModule(module: FieldRef['module']): AtelierModule {
  return module === 'acts' || module === 'arcs' ? 'structure' : module;
}
