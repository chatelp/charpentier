import { listSignals, readWorkRecord, type ChatMessage, type WorkRef } from '@charpentier/schema';
import { useTranslation } from 'react-i18next';
import type * as Y from 'yjs';
import { sceneNumbers } from '../atelier/atelier-data';
import { useDocSnapshot } from '../hooks/use-doc-snapshot';
import type { WorkspaceContext } from '../workspace/workspace-context';
import { workName } from './use-background-work';
import { workLocation, workRail } from './WorkBlock';
import { formatWhen } from './work-format';

/** Signals shown one by one under a bilan; beyond, « et N autres ». */
const SHOWN_SIGNALS = 3;

/**
 * The engraved heading of a background work's bilan in the conversation,
 * which names and dates it (docs/DESIGN.md §4.3, §4.5): it is how the author
 * finds it again, scrolling up.
 */
export function BilanHeading({
  ctx,
  message,
  work,
}: {
  readonly ctx: WorkspaceContext;
  readonly message: ChatMessage;
  readonly work: WorkRef;
}) {
  const { t } = useTranslation();
  return (
    <p className="ch-bilan-head ch-label ch-engraved">
      {t(`work.task.${work.task}.bilan`, { name: workName(ctx.root, work) })}{' '}
      <small>{formatWhen(t, message.at, ctx.language, new Date(), true)}</small>
    </p>
  );
}

/** Under the latest bilan of a work: its proposals and its remarks, one click away. */
export function BilanLinks({
  ctx,
  mentorDoc,
  message,
  work,
}: {
  readonly ctx: WorkspaceContext;
  readonly mentorDoc: Y.Doc;
  readonly message: ChatMessage;
  readonly work: WorkRef;
}) {
  const { t } = useTranslation();
  const record = useDocSnapshot(mentorDoc, (doc) => readWorkRecord(doc, work));
  const open = useDocSnapshot(ctx.root, (doc) => listSignals(doc, { state: 'open' }));
  if (!record || record.reviewId !== message.id) return null;
  const signals = open.filter((s) => record.signalIds.includes(s.id));
  if (record.proposals === 0 && signals.length === 0) return null;
  const numbers = sceneNumbers(ctx.outline);
  const rail = workRail(work);
  return (
    <div className="ch-bilan-links">
      {record.proposals > 0 && (
        <button
          type="button"
          className="ch-btn"
          onClick={() => ctx.openAtelier(workLocation(work))}
        >
          {work.task === 'character'
            ? t('work.proposalsInSheet', { count: record.proposals })
            : t('work.proposalsIn', {
                count: record.proposals,
                module: t(`atelier.modules.${rail}`),
              })}
        </button>
      )}
      {signals.slice(0, SHOWN_SIGNALS).map((signal) => (
        <button
          key={signal.id}
          type="button"
          className="ch-btn"
          onClick={() => {
            ctx.openWriting();
            ctx.openSignalNote(signal.id);
          }}
        >
          {t('work.signalAt', {
            scene: numbers.get(signal.textAnchor?.sceneId ?? '') ?? '',
          })}
        </button>
      ))}
      {signals.length > SHOWN_SIGNALS && (
        <button type="button" className="ch-btn" onClick={() => ctx.toggleMentorPanel('points')}>
          {t('work.others', { count: signals.length - SHOWN_SIGNALS })}
        </button>
      )}
    </div>
  );
}
