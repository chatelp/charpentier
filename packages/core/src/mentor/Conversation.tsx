import {
  addChatMessage,
  AUTHOR,
  chatMessages,
  guids,
  type ChatMessage,
  bornIn,
  bornInName,
} from '@charpentier/schema';
import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import * as Y from 'yjs';
import { usePlatform } from '../app/platform-context';
import { useDocSnapshot } from '../hooks/use-doc-snapshot';
import { NotedLine } from '../atelier/NotedLine';
import { BilanHeading, BilanLinks } from '../work/Bilan';
import { StyleCitation } from './StyleCitation';
import type { WorkspaceContext } from '../workspace/workspace-context';

export interface ConversationProps {
  readonly projectId: string;
  readonly sceneId: string;
  /** Inserts the example sentence where the cursor is in the text (D-11). */
  readonly onInsertExample: (text: string) => void;
  readonly active: boolean;
  readonly onClose: () => void;
  /** For the bilans of the background works (their heading, their links). */
  readonly ctx?: WorkspaceContext;
}

const empty = new Y.Doc();

/**
 * The free conversation with the Compagnon (docs/DESIGN.md §4.3): no
 * bubbles, a sober transcript; the field at the bottom. ↵ sends, ⇧↵ new
 * line, ⌘⏎ inserts the last example sentence, Échap closes.
 */
export function Conversation({
  projectId,
  sceneId,
  onInsertExample,
  active,
  onClose,
  ctx,
}: ConversationProps) {
  const { t } = useTranslation();
  const platform = usePlatform();
  const [mentorDoc, setMentorDoc] = useState<Y.Doc | null>(null);
  const [draft, setDraft] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let close: (() => Promise<void>) | undefined;
    void platform.documents.open(guids.mentor(projectId)).then(async (handle) => {
      close = handle.close;
      await handle.whenLoaded;
      if (cancelled) void handle.close();
      else setMentorDoc(handle.doc);
    });
    return () => {
      cancelled = true;
      void close?.();
    };
  }, [platform, projectId]);

  const messages = useDocSnapshot(mentorDoc ?? empty, chatMessages);

  useEffect(() => {
    if (active) field.current?.focus();
  }, [active]);

  useEffect(() => {
    transcript.current?.scrollTo({ top: transcript.current.scrollHeight });
  }, [messages.length, waiting]);

  const lastExample = [...messages].reverse().find((m) => m.role === 'compagnon')?.example;

  const send = async () => {
    const text = draft.trim();
    if (!text || !mentorDoc || waiting) return;
    addChatMessage(
      mentorDoc,
      { role: 'author', text, sceneId, ...(ctx && bornIn(ctx.root)) },
      AUTHOR,
    );
    setDraft('');
    setProblem(null);
    setWaiting(true);
    const result = await platform.agents.ask({ projectId, sceneId });
    setWaiting(false);
    if (result !== 'answered') setProblem(t(`mentor.ask.${result}`));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      void send();
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && lastExample) {
      event.preventDefault();
      onInsertExample(lastExample);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  const available = platform.agents.status() !== 'disabled';

  return (
    <div className="ch-conversation">
      <div ref={transcript} className="ch-transcript" role="log" aria-live="polite">
        {messages.length === 0 && <p className="ch-transcript-empty">{t('mentor.chatEmpty')}</p>}
        {messages.map((message) => (
          <Fragment key={message.id}>
            {ctx && message.work && (
              <BilanHeading ctx={ctx} message={message} work={message.work} />
            )}
            <Turn
              message={message}
              bornIn={ctx && bornInName(ctx.root, message.version)}
              onInsert={onInsertExample}
              noted={
                mentorDoc && (
                  <NotedLine
                    doc={mentorDoc}
                    noted={message.noted}
                    compact
                    {...(ctx && {
                      onOpen: (note: string) => ctx.openAtelier({ rail: 'notebook', note }),
                    })}
                  />
                )
              }
              citation={
                ctx && (
                  <StyleCitation
                    root={ctx.root}
                    choiceId={message.styleChoiceId}
                    onOpen={(entityId) => ctx.openSheet({ module: 'style', entityId })}
                  />
                )
              }
            >
              {ctx && message.work && mentorDoc && (
                <BilanLinks ctx={ctx} mentorDoc={mentorDoc} message={message} work={message.work} />
              )}
            </Turn>
          </Fragment>
        ))}
        {waiting && <p className="ch-transcript-waiting">{t('mentor.thinking')}</p>}
        {problem && <p className="ch-transcript-problem">{problem}</p>}
      </div>
      <textarea
        ref={field}
        className="ch-field ch-chat-field"
        rows={2}
        value={draft}
        disabled={!available}
        placeholder={t('mentor.chatPlaceholder')}
        aria-label={t('mentor.chatPlaceholder')}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <p className="ch-panel-hint">{t('mentor.chatHint')}</p>
    </div>
  );
}

function Turn({
  message,
  bornIn: version,
  onInsert,
  noted,
  citation,
  children,
}: {
  readonly message: ChatMessage;
  /** The working version it was born in, outside Principale (DESIGN 1.20). */
  readonly bornIn?: string | undefined;
  readonly onInsert: (text: string) => void;
  /** What the answer wrote in the Compagnon's notebook (« Noté au carnet »). */
  readonly noted?: ReactNode;
  /** The style choice the answer relies on (phase 6.4). */
  readonly citation?: ReactNode;
  readonly children?: ReactNode;
}) {
  const { t } = useTranslation();
  const compagnon = message.role === 'compagnon';
  return (
    <div className={`ch-turn${compagnon ? ' is-compagnon' : ''}`}>
      <p className="ch-turn-who ch-label">
        {compagnon ? t('mentor.name') : t('mentor.you')}
        {version && <span className="ch-born-in"> · {version}</span>}
      </p>
      <p className="ch-turn-text">{message.text}</p>
      {noted}
      {citation}
      {message.example && (
        <div className="ch-example">
          <p className="ch-example-label ch-label">{t('mentor.exampleLabel')}</p>
          <p className="ch-example-text">{message.example}</p>
          <button
            type="button"
            tabIndex={-1}
            className="ch-btn is-mentor"
            onClick={() => message.example && onInsert(message.example)}
          >
            {t('mentor.insertExample')} <kbd>{t('mentor.insertExampleKey')}</kbd>
          </button>
        </div>
      )}
      {children}
    </div>
  );
}
