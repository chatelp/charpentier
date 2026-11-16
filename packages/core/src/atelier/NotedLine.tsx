import { listNotes, listTrashedNotes, noteParts, type NotedChange } from '@charpentier/schema';
import { Fragment, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type * as Y from 'yjs';
import { Pictogram } from '../icons/Pictogram';
import './notebook.css';

/** A marker for an element inside a translated sentence (`withSlot`). */
export const SLOT = '\u0001';

/** The translated `text` (made with `SLOT` in place of a value), with `node` at that place. */
export function withSlot(text: string, node: ReactNode): ReactNode {
  const [before, after = ''] = text.split(SLOT);
  return (
    <>
      {before}
      {node}
      {after}
    </>
  );
}

const CHANGES = ['created', 'updated', 'removed'] as const;

/**
 * What an answer of the Compagnon wrote in his notebook (DESIGN §4.5,
 * « Les nouveautés »): a quiet line under its text, « Noté au carnet : »
 * then the titles, each opening the Carnet on its note. Two titles at most.
 */
export function NotedLine({
  doc,
  noted,
  onOpen,
  compact = false,
}: {
  readonly doc: Y.Doc;
  readonly noted: readonly NotedChange[] | undefined;
  /** Opens the Carnet on a note (absent: titles without links). */
  readonly onOpen?: (noteId: string) => void;
  /** In the conversation panel, a size smaller. */
  readonly compact?: boolean;
}) {
  const { t } = useTranslation();
  if (!noted?.length) return null;
  const live = listNotes(doc);
  const trashed = listTrashedNotes(doc);
  const lines = CHANGES.map((change) => {
    const paths = [...new Set(noted.filter((n) => n.change === change).map((n) => n.path))];
    const items = paths.map((path) => {
      const note =
        change === 'removed'
          ? (trashed.find((n) => n.path === path) ?? live.find((n) => n.path === path))
          : live.find((n) => n.path === path);
      return {
        path,
        title: noteParts(note ?? { path, text: '' }).title,
        // A removed note is no longer on the page: its title, without a link.
        id: change === 'removed' || note?.trashedAt ? undefined : note?.id,
      };
    });
    return { change, items };
  }).filter((line) => line.items.length > 0);

  return (
    <>
      {lines.map(({ change, items }) => {
        const shown = items.slice(0, 2);
        const extra = items.length - shown.length;
        return (
          <p key={change} className={`ch-noted${compact ? ' is-compact' : ''}`}>
            <Pictogram name="carnet" size={13} />
            <span>
              {t(`notebook.noted.${change}`)}{' '}
              {shown.map((item, i) => (
                <Fragment key={item.path}>
                  {i > 0 && (shown.length === 2 && extra === 0 ? ` ${t('notebook.and')} ` : ', ')}
                  {item.id && onOpen ? (
                    <button
                      type="button"
                      className="ch-link"
                      onClick={() => item.id && onOpen(item.id)}
                    >
                      {item.title}
                    </button>
                  ) : (
                    <span className="ch-noted-title">{item.title}</span>
                  )}
                </Fragment>
              ))}
              {extra > 0 && ` ${t('notebook.others', { count: extra })}`}
            </span>
          </p>
        );
      })}
    </>
  );
}
