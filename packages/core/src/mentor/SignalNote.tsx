import { dismissSignal, resolveSignal, type Signal } from '@charpentier/schema';
import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type * as Y from 'yjs';

export interface SignalNoteProps {
  readonly root: Y.Doc;
  readonly signal: Signal;
  /** Position in the page (px), next to the paragraph. */
  readonly style: CSSProperties;
  /** Take the focus (opened from the keyboard) so that R, I and Échap act on it. */
  readonly focus: boolean;
  readonly onClose: (backToText: boolean) => void;
}

/**
 * A note of the Compagnon unfolded in the margin (docs/DESIGN.md §4.2): kind
 * and signature, message, the « why » under a rule, and actions with their
 * key. Nothing is applied without a gesture of the author.
 */
export function SignalNote({ root, signal, style, focus, onClose }: SignalNoteProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus, signal.id]);

  const act = (action: 'resolve' | 'dismiss') => {
    if (action === 'resolve') resolveSignal(root, signal.id);
    else dismissSignal(root, signal.id);
    onClose(true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
    } else if (key === 'r') {
      event.preventDefault();
      act('resolve');
    } else if (key === 'i') {
      event.preventDefault();
      act('dismiss');
    }
  };

  return (
    <aside
      ref={ref}
      className="ch-note ch-raised"
      style={style}
      tabIndex={-1}
      aria-label={t(`mentor.kind.${signal.kind}`)}
      onKeyDown={onKeyDown}
    >
      <p className="ch-note-head">
        <span className="ch-label">{t(`mentor.kind.${signal.kind}`)}</span>
        <span className="ch-note-signature">{t('mentor.name')}</span>
      </p>
      <p className="ch-note-message">{signal.message}</p>
      {signal.principle && <p className="ch-note-why">{signal.principle}</p>}
      <p className="ch-note-actions">
        <button type="button" tabIndex={-1} className="ch-btn" onClick={() => act('resolve')}>
          {t('mentor.resolve')} <kbd>{t('mentor.resolveKey')}</kbd>
        </button>
        <button type="button" tabIndex={-1} className="ch-btn" onClick={() => act('dismiss')}>
          {t('mentor.dismiss')} <kbd>{t('mentor.dismissKey')}</kbd>
        </button>
        <button type="button" tabIndex={-1} className="ch-btn" onClick={() => onClose(true)}>
          {t('mentor.close')} <kbd>{t('mentor.closeKey')}</kbd>
        </button>
      </p>
    </aside>
  );
}
