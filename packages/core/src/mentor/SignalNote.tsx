import { dismissSignal, resolveSignal, type FieldRef, type Signal } from '@charpentier/schema';
import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { playSound } from '../sound/sounds';
import type * as Y from 'yjs';

export interface SignalNoteActions {
  /** Back to the text, the passage selected, for the author to rework it. */
  readonly onFixText: () => void;
  /** Opens the sheet field the remark is about, in the Atelier. */
  readonly onUpdateSheet: (ref: FieldRef) => void;
  /** Replaces the passage with the language correction (D-11, accepted by the author). */
  readonly onApplyCorrection: (text: string) => void;
  /** Inserts the example sentence at the cursor (D-11, on the author's gesture). */
  readonly onInsertExample: (text: string) => void;
}

export interface SignalNoteProps extends SignalNoteActions {
  readonly root: Y.Doc;
  readonly signal: Signal;
  /** Position in the page (px), next to the paragraph. */
  readonly style: CSSProperties;
  /** Take the focus (opened from the keyboard) so that its keys act on it. */
  readonly focus: boolean;
  readonly onClose: (backToText: boolean) => void;
}

interface Action {
  readonly key: string;
  readonly label: string;
  readonly mentor?: boolean;
  readonly run: () => void;
}

/**
 * A note of the Compagnon unfolded in the margin (docs/DESIGN.md §4.2): kind
 * and signature, message, the « why » under a rule, and actions with their
 * key. Nothing is applied without a gesture of the author.
 */
export function SignalNote(props: SignalNoteProps) {
  const { root, signal, style, focus, onClose } = props;
  const { t } = useTranslation();
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!focus) return;
    if (ref.current?.isConnected) return void ref.current.focus();
    // Under its paragraph (narrow window), the note's place joins the page just after.
    const frame = requestAnimationFrame(() => ref.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [focus, signal.id]);

  const done = (state: 'resolved' | 'dismissed') => {
    playSound(state === 'resolved' ? 'click' : 'toc');
    if (state === 'resolved') resolveSignal(root, signal.id);
    else dismissSignal(root, signal.id);
  };

  const actions: Action[] = [];
  const { suggestion, fieldRef } = signal;
  if (suggestion?.kind === 'correction')
    actions.push({
      key: '1',
      label: t('mentor.applyCorrection'),
      mentor: true,
      run: () => {
        props.onApplyCorrection(suggestion.text);
        done('resolved');
        onClose(false);
      },
    });
  if (signal.kind === 'conflict') {
    actions.push({
      key: '1',
      label: t('mentor.fixText'),
      run: () => {
        done('resolved');
        onClose(false);
        props.onFixText();
      },
    });
    if (fieldRef)
      actions.push({
        key: '2',
        label: t('mentor.updateSheet'),
        run: () => {
          done('resolved');
          onClose(false);
          props.onUpdateSheet(fieldRef);
        },
      });
  }
  if (suggestion?.kind === 'example')
    actions.push({
      key: '2',
      label: t('mentor.insertExample'),
      mentor: true,
      run: () => {
        props.onInsertExample(suggestion.text);
        onClose(false);
      },
    });
  if (signal.kind !== 'conflict')
    actions.push({
      key: 'r',
      label: t('mentor.resolve'),
      run: () => (done('resolved'), onClose(true)),
    });
  actions.push({
    key: 'i',
    label: t('mentor.dismiss'),
    run: () => (done('dismissed'), onClose(true)),
  });

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
      return;
    }
    const action = actions.find((a) => a.key === event.key.toLowerCase());
    if (action) {
      event.preventDefault();
      action.run();
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
      {signal.title && <p className="ch-note-title">{signal.title}</p>}
      <p className="ch-note-message">{signal.message}</p>
      {suggestion && (
        <div className="ch-example">
          <p className="ch-example-label ch-label">
            {t(suggestion.kind === 'correction' ? 'mentor.correctionLabel' : 'mentor.exampleLabel')}
          </p>
          <p className="ch-example-text">{suggestion.text}</p>
        </div>
      )}
      {signal.principle && <p className="ch-note-why">{signal.principle}</p>}
      <p className="ch-note-actions">
        {actions.map((action) => (
          <button
            key={action.key + action.label}
            type="button"
            tabIndex={-1}
            className={`ch-btn${action.mentor ? ' is-mentor' : ''}`}
            onClick={action.run}
          >
            {action.label} <kbd>{action.key.toUpperCase()}</kbd>
          </button>
        ))}
        <button type="button" tabIndex={-1} className="ch-btn" onClick={() => onClose(true)}>
          {t('mentor.close')} <kbd>{t('mentor.closeKey')}</kbd>
        </button>
      </p>
    </aside>
  );
}
