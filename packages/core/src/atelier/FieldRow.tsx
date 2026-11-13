import {
  acceptProposal,
  clearField,
  rejectProposal,
  setField,
  type FieldRef,
  type FieldState,
  type FieldValue,
  type Signal,
} from '@charpentier/schema';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { playSound } from '../sound/sounds';
import type { WorkspaceContext } from '../workspace/workspace-context';
import { shownStatus, shownValue } from './atelier-data';
import type { FieldDef } from './module-defs';

export interface FieldRowProps {
  readonly ctx: WorkspaceContext;
  readonly fieldRef: FieldRef;
  readonly def: FieldDef;
  readonly label: string;
  readonly state: FieldState;
  readonly conflict: Signal | undefined;
  /** `II.3` for a scene id. */
  readonly sceneNumber: (sceneId: string) => string | undefined;
  /** Opens the passage a conflict points at. */
  readonly onShowPassage: (sceneId: string) => void;
}

const asText = (value: unknown): string =>
  typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);

const asSceneIds = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

const fromSceneOf = (value: unknown): string | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const id = (value as Record<string, unknown>)['fromSceneId'];
  return typeof id === 'string' ? id : undefined;
};

/**
 * One field of a sheet, its status carried by relief (docs/DESIGN.md §4.5):
 * raised = proposed, engraved = validated, faded = rejected, engraved with
 * a « ! » = contradicted, dashed = empty. ↵ edits, V validates, X rejects.
 */
export function FieldRow({
  ctx,
  fieldRef,
  def,
  label,
  state,
  conflict,
  sceneNumber,
  onShowPassage,
}: FieldRowProps) {
  const { t, i18n } = useTranslation();
  const labelId = useId();
  const metaId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  // Enter commits, then the textarea goes away and may also blur: commit once.
  const editing = useRef(false);
  const status = shownStatus(state, conflict);
  const value = shownValue(state);

  const write = (next: FieldValue | undefined) => {
    if (next === undefined || next === '' || (Array.isArray(next) && next.length === 0)) {
      if (state.status === 'validated') clearField(ctx.root, fieldRef);
      return;
    }
    const same = (a: unknown) => JSON.stringify(a) === JSON.stringify(next);
    if (state.status === 'validated' && same(state.value)) return;
    // Taking the proposal as is validates it; any change makes it the author's own.
    if (state.status === 'proposed' && same(state.proposal?.value))
      acceptProposal(ctx.root, fieldRef);
    else setField(ctx.root, fieldRef, next);
  };

  const commitDraft = () => {
    if (draft === null || !editing.current) return;
    editing.current = false;
    setDraft(null);
    write(def.kind === 'line' ? draft.replace(/\s*\n\s*/g, ' ').trim() : draft.trim());
  };

  const optionLabel = (option: string) =>
    t(`atelier.options.${def.key}.${option}` as 'atelier.options.kind.clue');

  const startEdit = () => {
    const base = state.status === 'validated' ? state.value : shownValue(state);
    if (def.kind === 'choice') {
      ctx.openPalette({
        kind: 'pick',
        placeholder: label,
        items: [
          ...(def.options ?? []).map((o) => ({
            id: o,
            label: optionLabel(o),
            ...(o === base && { detail: t('atelier.current') }),
          })),
          ...(state.status === 'validated' ? [{ id: '', label: t('atelier.clearChoice') }] : []),
        ],
        onPick: (id) => write(id),
      });
    } else if (def.kind === 'scene') {
      const current = fromSceneOf(base);
      ctx.openPalette({
        kind: 'pick',
        placeholder: t('atelier.pickFromScene', { who: label }),
        items: [
          ...ctx.outline.flatMap((c) =>
            c.scenes.map((s) => ({
              id: s.id,
              label: `${sceneNumber(s.id) ?? ''} ${s.title}`.trim(),
              detail: s.id === current ? t('atelier.current') : c.title,
            })),
          ),
          ...(state.status === 'validated' ? [{ id: '', label: t('atelier.doesNotKnow') }] : []),
        ],
        onPick: (id) => write(id ? { fromSceneId: id } : undefined),
      });
    } else if (def.kind === 'scenes') {
      const chosen = new Set(asSceneIds(base));
      ctx.openPalette({
        kind: 'pick',
        placeholder: t('atelier.pickScenes', { field: label }),
        items: ctx.outline.flatMap((c) =>
          c.scenes.map((s) => ({
            id: s.id,
            label: `${sceneNumber(s.id) ?? ''} ${s.title}`.trim(),
            detail: chosen.has(s.id) ? t('atelier.sceneChosen') : c.title,
          })),
        ),
        // Picking a scene adds it, picking a chosen one takes it away.
        onPick: (id) => {
          if (chosen.has(id)) chosen.delete(id);
          else chosen.add(id);
          const order = ctx.outline.flatMap((c) => c.scenes.map((s) => s.id));
          write(order.filter((sid) => chosen.has(sid)));
        },
      });
    } else {
      editing.current = true;
      setDraft(asText(base));
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      startEdit();
    } else if (key === 'v' && state.status === 'proposed') {
      event.preventDefault();
      playSound('click');
      acceptProposal(ctx.root, fieldRef);
    } else if (key === 'x' && state.status === 'proposed') {
      event.preventDefault();
      playSound('toc');
      rejectProposal(ctx.root, fieldRef);
    }
  };

  const onDraftKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation();
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      commitDraft();
      // Back on the value, so ↑↓ keep moving through the sheet.
      requestFocus(event.currentTarget.parentElement);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      editing.current = false;
      setDraft(null);
      requestFocus(event.currentTarget.parentElement);
    }
  };

  const date = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }).format(
      new Date(iso),
    );

  const shownText = (() => {
    if (def.kind === 'choice') return value ? optionLabel(asText(value)) : '';
    if (def.kind === 'scenes') return '';
    if (def.kind === 'scene') {
      const id = fromSceneOf(value);
      const scene = ctx.outline.flatMap((c) => c.scenes).find((sc) => sc.id === id);
      return id
        ? t('atelier.fromScene', { number: sceneNumber(id) ?? '?', title: scene?.title ?? '' })
        : '';
    }
    return asText(value);
  })();
  const sceneIds = def.kind === 'scenes' ? asSceneIds(value) : [];

  const evidenceScenes = [
    ...new Set((state.proposal?.evidence ?? []).map((e) => sceneNumber(e.sceneId)).filter(Boolean)),
  ];

  return (
    <div className="ch-fld" data-status={status}>
      <div className="ch-fl" id={labelId}>
        {label}
      </div>
      {draft !== null ? (
        <div className="ch-fv-edit">
          <textarea
            className="ch-fv-input"
            aria-labelledby={labelId}
            value={draft}
            rows={def.kind === 'line' ? 1 : 3}
            autoFocus
            spellCheck
            lang={ctx.language}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onDraftKeyDown}
            onBlur={commitDraft}
          />
        </div>
      ) : (
        <div
          className="ch-fv"
          role="button"
          tabIndex={0}
          data-field-value=""
          aria-labelledby={labelId}
          aria-describedby={metaId}
          onKeyDown={onKeyDown}
          onClick={startEdit}
        >
          {status === 'empty'
            ? t('atelier.empty')
            : def.kind === 'scenes'
              ? sceneIds.length
                ? sceneIds.map((id) => (
                    <span key={id} className="ch-chip">
                      {sceneNumber(id) ?? '?'}
                    </span>
                  ))
                : t('atelier.noScene')
              : shownText}
        </div>
      )}
      <div className="ch-fm" id={metaId}>
        <span className="ch-visually-hidden">{t(`atelier.status.${status}`)}</span>
        {status === 'proposed' && (
          <>
            <span>
              {evidenceScenes.length
                ? t('atelier.proposedFrom', { scenes: evidenceScenes.join(', ') })
                : t('atelier.proposed')}
            </span>
            <button
              type="button"
              tabIndex={-1}
              className="ch-btn is-mentor"
              onClick={() => {
                playSound('click');
                acceptProposal(ctx.root, fieldRef);
              }}
            >
              {t('atelier.accept')} <kbd>{t('atelier.acceptKey')}</kbd>
            </button>
            <button
              type="button"
              tabIndex={-1}
              className="ch-btn"
              onClick={() => {
                playSound('toc');
                rejectProposal(ctx.root, fieldRef);
              }}
            >
              {t('atelier.reject')} <kbd>{t('atelier.rejectKey')}</kbd>
            </button>
          </>
        )}
        {status === 'rejected' && state.rejected.length > 0 && (
          <span>
            {t('atelier.rejectedOn', {
              date: date(state.rejected[state.rejected.length - 1]?.at ?? ''),
            })}
          </span>
        )}
        {status === 'contradicted' && conflict && (
          <>
            <span>{t('atelier.contradicted', { message: conflict.message })}</span>
            {conflict.textAnchor && (
              <button
                type="button"
                tabIndex={-1}
                className="ch-link"
                onClick={() => conflict.textAnchor && onShowPassage(conflict.textAnchor.sceneId)}
              >
                {t('atelier.showPassage')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Focuses the value box of a field row after React re-renders it. */
function requestFocus(row: Element | null) {
  const field = row?.closest('.ch-fld');
  setTimeout(() => field?.querySelector<HTMLElement>('[data-field-value]')?.focus(), 0);
}
