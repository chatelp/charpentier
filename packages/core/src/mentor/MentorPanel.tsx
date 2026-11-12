import {
  acceptProposal,
  dismissSignal,
  rejectEntity,
  readFieldRef,
  rejectProposal,
  resolveSignal,
  validateEntity,
  type EntityModule,
  type FieldRef,
  type OutlineChapter,
  type Signal,
} from '@charpentier/schema';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type * as Y from 'yjs';
import { readAtelier, sceneNumbers, shownValue, type SheetTarget } from '../atelier/atelier-data';
import { moduleDefs, type AtelierModule } from '../atelier/module-defs';
import { useDocSnapshot } from '../hooks/use-doc-snapshot';
import { toRoman } from '../workspace/roman';
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
  /** Opens a sheet in the Atelier. */
  readonly onOpenSheet: (rail: AtelierModule, target: SheetTarget) => void;
  readonly onClose: () => void;
  readonly conversation?: ReactNode;
  readonly header?: ReactNode;
  readonly active: boolean;
}

/** A sheet proposal of the Compagnon waiting for the author (a whole entry, or one field). */
interface Proposal {
  readonly id: string;
  readonly module: EntityModule;
  readonly entityId: string;
  /** The field proposed, or undefined for a whole new entry. */
  readonly field?: string;
  readonly title: string;
  readonly detail: string;
  readonly sceneId?: string;
}

type Point =
  | { readonly kind: 'signal'; readonly id: string; readonly signal: Signal }
  | { readonly kind: 'proposal'; readonly id: string; readonly proposal: Proposal };

interface Group {
  readonly key: string;
  readonly label: string;
  readonly points: readonly Point[];
}

const railOf = (module: FieldRef['module']): AtelierModule =>
  module === 'acts' || module === 'arcs' ? 'structure' : module;

/**
 * The right panel (docs/DESIGN.md §4.3): points to deal with — this scene,
 * the other chapters, the sheets proposed — and the conversation.
 * J/K or ↑↓ to move, ↵ to the passage or the sheet, R resolved, I ignore,
 * V validate and X reject a proposal, Échap closes.
 */
export function MentorPanel(props: MentorPanelProps) {
  const { t } = useTranslation();
  const { signals, sceneId, outline, sceneOrder, root } = props;
  const numbers = useMemo(() => sceneNumbers(outline), [outline]);
  const atelier = useDocSnapshot(root, readAtelier);
  const [selectedId, setSelectedId] = useState<string>();
  const list = useRef<HTMLUListElement>(null);

  const proposals = useMemo((): Proposal[] => {
    const found: Proposal[] = [];
    for (const module of ['characters', 'worldRules', 'clues', 'acts', 'arcs'] as const) {
      const def = moduleDefs[module];
      if (def.kind !== 'entity') continue;
      for (const entity of atelier.entities[module]) {
        const name = String(
          shownValue(entity.fields[def.titleField] ?? { status: undefined, rejected: [] }) ?? '',
        );
        const evidenceOf = (field: string) => entity.fields[field]?.proposal?.evidence[0]?.sceneId;
        if (entity.status === 'proposed') {
          found.push({
            id: `entity:${entity.id}`,
            module,
            entityId: entity.id,
            title: name || t(`atelier.untitled.${module}`),
            detail: t(`mentor.proposal.new.${module}`),
            ...(evidenceOf(def.titleField) && { sceneId: evidenceOf(def.titleField) }),
          });
          continue;
        }
        for (const [field, state] of Object.entries(entity.fields)) {
          if (state.status !== 'proposed') continue;
          const label = t(`atelier.fields.${module}.${field}` as 'atelier.fields.meta.pitch', {
            defaultValue: field,
          });
          const value = state.proposal?.value;
          found.push({
            id: `field:${entity.id}:${field}`,
            module,
            entityId: entity.id,
            field,
            title: `${name} · ${label}`,
            detail: typeof value === 'string' ? value : t('mentor.proposal.value'),
            ...(evidenceOf(field) && { sceneId: evidenceOf(field) }),
          });
        }
      }
    }
    return found;
  }, [atelier, t]);

  const groups: Group[] = useMemo(() => {
    const sig = (s: Signal): Point => ({ kind: 'signal', id: s.id, signal: s });
    const here = signals
      .filter((s) => s.textAnchor?.sceneId === sceneId)
      .sort((a, b) => sceneOrder.indexOf(a.id) - sceneOrder.indexOf(b.id))
      .map(sig);
    const byChapter = outline.map((chapter, ci) => ({
      key: `chapter:${chapter.id}`,
      label: t('mentor.groups.chapter', { numeral: toRoman(ci + 1) }),
      points: signals
        .filter(
          (s) =>
            s.textAnchor &&
            s.textAnchor.sceneId !== sceneId &&
            chapter.scenes.some((sc) => sc.id === s.textAnchor?.sceneId),
        )
        .map(sig),
    }));
    return [
      { key: 'scene', label: t('mentor.groups.scene'), points: here },
      ...byChapter,
      {
        key: 'sheets',
        label: t('mentor.groups.sheets'),
        points: signals.filter((s) => !s.textAnchor && s.fieldRef).map(sig),
      },
      {
        key: 'proposals',
        label: t('mentor.groups.proposals'),
        points: proposals.map((p): Point => ({ kind: 'proposal', id: p.id, proposal: p })),
      },
      {
        key: 'project',
        label: t('mentor.groups.project'),
        points: signals.filter((s) => !s.textAnchor && !s.fieldRef).map(sig),
      },
    ].filter((g) => g.points.length > 0);
  }, [signals, sceneId, sceneOrder, outline, proposals, t]);

  const flat = groups.flatMap((g) => g.points);
  const selected = flat.find((p) => p.id === selectedId) ?? flat[0];

  useEffect(() => {
    if (!props.active || props.tab !== 'points') return;
    const item = list.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    (item ?? list.current)?.focus();
  }, [props.active, props.tab, selected?.id]);

  const decide = (proposal: Proposal, accept: boolean) => {
    if (proposal.field) {
      const ref: FieldRef = {
        module: proposal.module,
        entityId: proposal.entityId,
        field: proposal.field,
      };
      if (accept) acceptProposal(root, ref);
      else rejectProposal(root, ref);
    } else if (accept) {
      // A new entry is taken with its name; its other fields wait for the author, one by one.
      validateEntity(root, proposal.module, proposal.entityId);
      const def = moduleDefs[proposal.module];
      const titleRef: FieldRef = {
        module: proposal.module,
        entityId: proposal.entityId,
        field: def.kind === 'entity' ? def.titleField : 'title',
      };
      if (readFieldRef(root, titleRef).status === 'proposed') acceptProposal(root, titleRef);
    } else rejectEntity(root, proposal.module, proposal.entityId);
  };

  const open = (point: Point) => {
    if (point.kind === 'signal') props.onGoTo(point.signal);
    else
      props.onOpenSheet(railOf(point.proposal.module), {
        module: point.proposal.module,
        entityId: point.proposal.entityId,
      });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();
    const index = selected ? flat.indexOf(selected) : -1;
    const next = flat[index + 1] ?? flat[index - 1];
    const move = (step: number) => {
      const target = flat[Math.max(0, Math.min(flat.length - 1, index + step))];
      if (target) setSelectedId(target.id);
    };
    if (event.key === 'Escape') {
      event.preventDefault();
      props.onClose();
    } else if (event.key === 'ArrowDown' || key === 'j') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp' || key === 'k') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Enter' && selected) {
      event.preventDefault();
      open(selected);
    } else if ((key === 'r' || key === 'i') && selected?.kind === 'signal') {
      event.preventDefault();
      if (key === 'r') resolveSignal(root, selected.id);
      else dismissSignal(root, selected.id);
      setSelectedId(next?.id);
    } else if ((key === 'v' || key === 'x') && selected?.kind === 'proposal') {
      event.preventDefault();
      decide(selected.proposal, key === 'v');
      setSelectedId(next?.id);
    }
  };

  const sceneLabel = (s: Signal): string | undefined =>
    s.textAnchor
      ? numbers.get(s.textAnchor.sceneId)
      : s.fieldRef
        ? t(`atelier.modules.${railOf(s.fieldRef.module)}`)
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
                  {group.points.map((point) => (
                    <li
                      key={point.id}
                      role="option"
                      aria-selected={point.id === selected?.id}
                      tabIndex={point.id === selected?.id ? 0 : -1}
                      className="ch-point"
                      onClick={() => setSelectedId(point.id)}
                      onFocus={() => setSelectedId(point.id)}
                      onDoubleClick={() => open(point)}
                    >
                      {point.kind === 'signal' ? (
                        <>
                          <span
                            className="ch-point-pastille"
                            data-level={signalLevel(point.signal.kind)}
                          />
                          <span className="ch-point-kind ch-label">
                            {t(`mentor.kind.${point.signal.kind}`)}
                            {sceneLabel(point.signal) && <em> · {sceneLabel(point.signal)}</em>}
                          </span>
                          {point.signal.title && (
                            <span className="ch-point-title">{point.signal.title}</span>
                          )}
                          <span className="ch-point-message">{point.signal.message}</span>
                        </>
                      ) : (
                        <>
                          <span className="ch-point-pastille" data-level={2} />
                          <span className="ch-point-kind ch-label">
                            {t(`atelier.kind.${point.proposal.module}`)}
                            {point.proposal.sceneId && numbers.get(point.proposal.sceneId) && (
                              <em> · {numbers.get(point.proposal.sceneId)}</em>
                            )}
                          </span>
                          <span className="ch-point-title">{point.proposal.title}</span>
                          <span className="ch-point-message">{point.proposal.detail}</span>
                          <span className="ch-point-actions">
                            <button
                              type="button"
                              tabIndex={-1}
                              className="ch-btn is-mentor"
                              onClick={() => decide(point.proposal, true)}
                            >
                              {t('atelier.accept')} <kbd>{t('atelier.acceptKey')}</kbd>
                            </button>
                            <button
                              type="button"
                              tabIndex={-1}
                              className="ch-btn"
                              onClick={() => decide(point.proposal, false)}
                            >
                              {t('atelier.reject')} <kbd>{t('atelier.rejectKey')}</kbd>
                            </button>
                          </span>
                        </>
                      )}
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
