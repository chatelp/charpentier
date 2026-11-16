import {
  guids,
  listEntities,
  listSignals,
  readWorkRecord,
  workKey,
  type EntityModule,
  type WorkRef,
} from '@charpentier/schema';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import * as Y from 'yjs';
import { usePlatform } from '../app/platform-context';
import type { AtelierLocation } from '../atelier/Atelier';
import { useDocSnapshot } from '../hooks/use-doc-snapshot';
import { Medallion } from '../icons/Pictogram';
import type { WorkspaceContext } from '../workspace/workspace-context';
import { sameWork, workName } from './use-background-work';
import { formatAmount, formatDuration, formatElapsed, formatWhen } from './work-format';
import './work.css';

/** The Atelier's module where a work's results arrive. */
export const workRail = (ref: WorkRef) =>
  ref.task === 'character'
    ? 'characters'
    : ref.task === 'clues' || ref.task === 'style'
      ? ref.task
      : 'structure';

/** Where a work's results are read: a reference text's choices arrive in the interview. */
export const workLocation = (ref: WorkRef): AtelierLocation =>
  ref.task === 'character' && ref.characterId
    ? { rail: 'characters', target: { module: 'characters', entityId: ref.characterId } }
    : ref.task === 'style'
      ? { rail: 'interview' }
      : { rail: workRail(ref) };

/** The entries a work proposes, by task (« 2 propositions » selects the first). */
const PROPOSED_IN: Record<'structure' | 'clues' | 'style', readonly EntityModule[]> = {
  structure: ['acts', 'arcs'],
  clues: ['clues'],
  style: ['style'],
};

const empty = new Y.Doc();

/** The project's mentor document, open for as long as the component is. */
export function useMentorDoc(projectId: string): Y.Doc {
  const platform = usePlatform();
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  useEffect(() => {
    let cancelled = false;
    let close: (() => Promise<void>) | undefined;
    void platform.documents.open(guids.mentor(projectId)).then(async (handle) => {
      close = handle.close;
      await handle.whenLoaded;
      if (cancelled) void handle.close();
      else setDoc(handle.doc);
    });
    return () => {
      cancelled = true;
      void close?.();
    };
  }, [platform, projectId]);
  return doc ?? empty;
}

/** Seconds since `since`, ticking while `on`. */
export function useElapsed(since: number | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === undefined) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  return since === undefined ? 0 : Math.max(0, now - since);
}

/**
 * The card of a background work (docs/DESIGN.md §4.5): its confirmation with
 * the cost, or the work while it runs. In the block at the foot of a list,
 * or in the interview's conversation for a reference text (`wide`). Nothing
 * when this work is neither asked nor running.
 */
export function WorkCard({
  ctx,
  work,
  wide = false,
  onCancelled,
}: {
  readonly ctx: WorkspaceContext;
  readonly work: WorkRef;
  readonly wide?: boolean;
  /** The card closed: where the focus goes back. */
  readonly onCancelled?: () => void;
}) {
  const { t } = useTranslation();
  const launchButton = useRef<HTMLButtonElement>(null);
  const otherButton = useRef<HTMLButtonElement>(null);
  const { confirm, running } = ctx.work;
  const elapsed = useElapsed(running?.startedAt);
  const task = work.task;
  const confirming = confirm && sameWork(confirm.ref, work) ? confirm : undefined;
  const mine = running && sameWork(running.ref, work) ? running : undefined;
  const name = mine?.reference?.title ?? confirming?.reference?.title ?? workName(ctx.root, work);

  useEffect(() => {
    if (confirming?.estimate) launchButton.current?.focus();
    else if (confirming?.refused) otherButton.current?.focus();
  }, [confirming?.estimate, confirming?.refused]);

  const cancel = () => {
    ctx.cancelWork(work);
    if (onCancelled) setTimeout(onCancelled);
  };
  const onCardKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    cancel();
  };
  const cardClass = `ch-work-card${wide ? ' is-wide' : ''}`;

  if (confirming) {
    const { estimate, refused } = confirming;
    const passages = confirming.reference?.passages ?? 0;
    return (
      <div
        className={cardClass}
        role="group"
        aria-label={t(`work.task.${task}.title`, { name })}
        onKeyDown={onCardKey}
      >
        <div className="ch-work-head">
          <Medallion name="compagnon" size={30} mentor />
          <b>{t(`work.task.${task}.title`, { name })}</b>
        </div>
        {estimate === undefined && (
          <p className="ch-work-what">
            {task === 'style' ? t('work.task.style.reading') : t('work.estimating')}
          </p>
        )}
        {estimate === null && !refused && <p className="ch-work-what">{t('work.empty')}</p>}
        {refused && (
          <>
            <p className="ch-work-what">
              {t(`reference.refused.${refused.refused}`, {
                words: (refused.words ?? 0).toLocaleString(ctx.language),
              })}
            </p>
            {refused.refused === 'image-pdf' && (
              <p className="ch-work-what">{t('reference.refused.image-pdfHint')}</p>
            )}
          </>
        )}
        {estimate && (
          <>
            <p className="ch-work-what">
              {t(`work.task.${task}.what`, {
                name,
                scenes: estimate.scenes,
                passages,
                words: estimate.words.toLocaleString(ctx.language),
              })}
            </p>
            {task === 'style' && (
              <p className="ch-work-what">{t('work.task.style.leaves', { passages })}</p>
            )}
            <div className="ch-work-cost">
              {estimate.unchangedSince && (
                <p className="ch-work-unchanged">
                  {t('work.unchanged', {
                    when: formatWhen(t, estimate.unchangedSince, ctx.language),
                  })}
                </p>
              )}
              <p className="ch-label">{t('work.cost')}</p>
              <strong>{t('work.about', { amount: formatAmount(t, estimate.usd) })}</strong>
              <span>
                {t('work.atMost', {
                  amount: formatAmount(t, estimate.usdMax, true),
                  duration: formatDuration(t, estimate.seconds),
                })}
              </span>
            </div>
          </>
        )}
        <div className="ch-work-actions">
          {estimate && (
            <button
              ref={launchButton}
              type="button"
              className="ch-btn is-mentor"
              onClick={() => ctx.launchWork()}
            >
              {t('work.launch')} <kbd>{t('work.launchKey')}</kbd>
            </button>
          )}
          {refused && (
            <button
              ref={otherButton}
              type="button"
              className="ch-btn is-mentor"
              onClick={() => ctx.askWork(work)}
            >
              {t('reference.otherFile')} <kbd>{t('reference.otherFileKey')}</kbd>
            </button>
          )}
          <button type="button" className="ch-btn" onClick={cancel}>
            {refused ? t('reference.close') : t('work.cancel')}{' '}
            <kbd>{refused ? t('reference.closeKey') : t('work.cancelKey')}</kbd>
          </button>
        </div>
      </div>
    );
  }

  if (mine) {
    return (
      <div className={`${cardClass} is-flat`}>
        {/* Announced at its start only: the elapsed time below is not read every second. */}
        <p className="ch-work-doing" role="status">
          {t(`work.task.${task}.doing`, { name })}
        </p>
        <div className="ch-work-count">
          <span>
            {mine.reference && t('work.task.style.measured', { passages: mine.reference.passages })}
          </span>
          <span aria-hidden="true">{formatElapsed(elapsed)}</span>
        </div>
        <div className="ch-work-actions">
          <button type="button" className="ch-btn" onClick={() => ctx.stopWork()}>
            {t('work.stop')}
          </button>
        </div>
      </div>
    );
  }
  return null;
}

/**
 * « Le Compagnon » at the foot of a module's list (docs/DESIGN.md §4.5
 * « Travaux de fond du Compagnon »): the button of its background work, the
 * confirmation with its cost in place, the work while it runs, and what it
 * left the last time.
 */
export function WorkBlock({
  ctx,
  work,
}: {
  readonly ctx: WorkspaceContext;
  readonly work: WorkRef;
}) {
  const { t } = useTranslation();
  const mentorDoc = useMentorDoc(ctx.projectId);
  const record = useDocSnapshot(mentorDoc, (doc) => readWorkRecord(doc, work));
  const openSignals = useDocSnapshot(ctx.root, (doc) =>
    listSignals(doc, { state: 'open' }).map((s) => s.id),
  );
  const button = useRef<HTMLButtonElement>(null);
  const { confirm, running } = ctx.work;
  const elapsed = useElapsed(running?.startedAt);
  const name = record?.title ?? workName(ctx.root, work);
  const task = work.task;
  const status = ctx.platform.agents.status();

  const confirming = confirm && sameWork(confirm.ref, work) ? confirm : undefined;
  const mine = running && sameWork(running.ref, work);

  if (status === 'disabled') return null;

  const label = <p className="ch-work-label ch-label ch-engraved">{t('work.heading')}</p>;

  // The keys typed in the block are its own: the list around it does not move.
  const own = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' && event.key !== 'Escape') event.stopPropagation();
  };

  if (confirming || mine)
    return (
      <div className="ch-work" onKeyDown={own}>
        {label}
        <WorkCard ctx={ctx} work={work} onCancelled={() => button.current?.focus()} />
      </div>
    );

  const ended = ctx.work.ended.get(workKey(work));
  const inert = !!running || status === 'unconfigured';
  const note = () => {
    if (running)
      return t(`work.task.${running.ref.task}.busy`, {
        name: running.reference?.title ?? workName(ctx.root, running.ref),
        elapsed: formatElapsed(elapsed),
      });
    if (status === 'unconfigured' || ended?.outcome === 'unavailable')
      return (
        <>
          {t('work.noKey')}{' '}
          <button
            type="button"
            className="ch-link"
            onClick={() => void ctx.runCommand('setApiKey')}
          >
            {t('work.enterKey')}
          </button>
        </>
      );
    if (ended?.outcome === 'stopped')
      return t(`work.task.${task}.stopped`, { elapsed: formatElapsed(ended.ms) });
    if (ended?.outcome === 'offline') return t('work.offline');
    if (ended?.outcome === 'empty') return t('work.empty');
    if (ended?.outcome === 'failed' || ended?.outcome === 'refused')
      return (
        <>
          {t(`work.task.${task}.failed`, { name })}{' '}
          <button type="button" className="ch-link" onClick={() => ctx.askWork(work)}>
            {t('work.retry')}
          </button>
        </>
      );
    if (!record) return task === 'style' ? t('work.task.style.never') : t('work.never');
    const signals = record.signalIds.filter((id) => openSignals.includes(id)).length;
    const openPanel = (tab: 'points' | 'conversation') => {
      if (ctx.mentorPanel !== tab) ctx.toggleMentorPanel(tab);
    };
    const firstProposal = () => {
      if (work.task === 'character') return ctx.openAtelier(workLocation(work));
      for (const module of PROPOSED_IN[work.task]) {
        const entity = listEntities(ctx.root, module).find((e) => e.status === 'proposed');
        if (entity)
          return ctx.openAtelier({ rail: workRail(work), target: { module, entityId: entity.id } });
      }
    };
    return (
      <>
        {t(`work.task.${task}.done`, { when: formatWhen(t, record.at, ctx.language), name })}
        <br />
        {record.proposals > 0 && (
          <>
            <button type="button" className="ch-link" onClick={firstProposal}>
              {t('work.proposals', { count: record.proposals })}
            </button>
            {' · '}
          </>
        )}
        {signals > 0 && (
          <>
            <button type="button" className="ch-link" onClick={() => openPanel('points')}>
              {t('work.signals', { count: signals })}
            </button>
            {' · '}
          </>
        )}
        {record.proposals === 0 && signals === 0 && <>{t('work.nothing')} · </>}
        {task === 'style' && (
          <>
            <button
              type="button"
              className="ch-link"
              onClick={() => ctx.openAtelier({ rail: 'interview' })}
            >
              {t('work.task.style.inInterview')}
            </button>{' '}
            <kbd>{ctx.shortcutLabel('atelierInterview')}</kbd>
          </>
        )}
        {task !== 'style' && record.reviewId && (
          <>
            <button type="button" className="ch-link" onClick={() => openPanel('conversation')}>
              {t('work.review')}
            </button>{' '}
            <kbd>{ctx.shortcutLabel('talkToMentor')}</kbd>
          </>
        )}
      </>
    );
  };

  return (
    <div className="ch-work" onKeyDown={own}>
      {label}
      <button
        ref={button}
        type="button"
        className="ch-btn ch-work-btn"
        aria-disabled={inert || undefined}
        onClick={() => {
          if (!inert) ctx.askWork(work);
        }}
      >
        <Medallion name="compagnon" size={30} mentor={!inert} />
        <span>
          <b>{t(`work.task.${task}.name`)}</b>
          <small>{t(`work.task.${task}.sub`, { name })}</small>
        </span>
      </button>
      <p className="ch-work-note">{note()}</p>
    </div>
  );
}
