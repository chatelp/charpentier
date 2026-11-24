import {
  addChatMessage,
  AUTHOR,
  chatMessages,
  exampleSentence,
  guids,
  type ChatMessage,
  bornIn,
  bornInName,
} from '@charpentier/schema';
import {
  Fragment,
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { blockedPlaceholderKey, blockedStatus, useCompagnonStatus } from './Blocked';
import * as Y from 'yjs';
import { usePlatform } from '../app/platform-context';
import { useDocSnapshot } from '../hooks/use-doc-snapshot';
import { NotedLine } from '../atelier/NotedLine';
import { BilanHeading, BilanLinks } from '../work/Bilan';
import { StyleCitation } from './StyleCitation';
import type { WorkspaceContext } from '../workspace/workspace-context';
import {
  forgetProblem,
  requestAnswer,
  sendAgain,
  showsWait,
  stopAnswer,
  useAnswerState,
} from './answer-wait';
import { useTypingPause, WaitBlock } from './WaitBlock';
import { PanelEntryContext, usePanelEntry } from '../workspace/panel-entry';
import { useHostWords } from '../app/host-words';

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
  const host = useHostWords();
  const platform = usePlatform();
  const [mentorDoc, setMentorDoc] = useState<Y.Doc | null>(null);
  const [draft, setDraft] = useState('');
  // The wait outlives the panel: closed and opened again, it is still there (DESIGN 1.34).
  const { wait, ended } = useAnswerState(platform.agents, projectId, 'chat');
  const waiting = wait !== null;
  const [typing, onTyping] = useTypingPause();
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

  // A problem said here is not said again when the panel comes back (a key set meanwhile…).
  useEffect(() => () => forgetProblem(platform.agents, projectId, 'chat'), [platform, projectId]);

  const messages = useDocSnapshot(mentorDoc ?? empty, chatMessages);

  // The field takes the focus when the author enters the panel, never by itself.
  usePanelEntry(useContext(PanelEntryContext), active, () => field.current?.focus());

  useEffect(() => {
    transcript.current?.scrollTo({ top: transcript.current.scrollHeight });
  }, [messages.length, waiting]);

  // D-11: one bounded sentence, checked again at the gesture that inserts it.
  const lastExample = exampleSentence(
    [...messages].reverse().find((m) => m.role === 'compagnon')?.example,
  );

  const send = () => {
    const text = draft.trim();
    if (!text || !mentorDoc || waiting) return;
    addChatMessage(
      mentorDoc,
      { role: 'author', text, sceneId, ...(ctx && bornIn(ctx.root)) },
      AUTHOR,
    );
    setDraft('');
    void requestAnswer(
      platform.agents,
      projectId,
      'chat',
      () => platform.agents.ask({ projectId, sceneId }),
      chatMessages(mentorDoc).at(-1)?.id,
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    onTyping(event);
    if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      send();
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && lastExample) {
      event.preventDefault();
      onInsertExample(lastExample);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  const status = useCompagnonStatus(platform.agents);
  const available = status !== 'disabled';
  const blocked = blockedStatus(status);
  // Stopped by the author: their message waits to be sent again.
  const stopped = ended === 'stopped' && messages.at(-1)?.role === 'author';
  /** Why the last question went unanswered (`mentor.ask.<problem>`). */
  const problem = ended === 'stopped' ? null : ended;

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
        {showsWait(wait, messages.at(-1)) && (
          <WaitBlock
            wait={wait}
            variant="panel"
            typing={typing}
            onStop={
              platform.agents.stopAnswer &&
              (() => {
                stopAnswer(platform.agents, projectId);
                // The button goes with the block: back to the field.
                field.current?.focus();
              })
            }
            stopKey={ctx?.shortcutLabel('stopAnswer')}
          />
        )}
        {stopped && (
          <p className="ch-wait-again is-panel">
            <button
              type="button"
              className="ch-link"
              onClick={() => {
                sendAgain(platform.agents, projectId, 'chat');
                field.current?.focus();
              }}
            >
              {t('mentor.wait.again')}
            </button>
          </p>
        )}
        {problem === 'unavailable' && ctx ? (
          // No key: where the author sets it, one click away (DESIGN 1.24).
          <p className="ch-transcript-problem">
            {t('mentor.ask.unavailableLead')}{' '}
            <button
              type="button"
              tabIndex={-1}
              className="ch-link"
              onClick={() => ctx.openSettings('compagnon')}
            >
              {t('mentor.ask.toSettings')}
            </button>
            {((key) => (key ? ` (${key})` : ''))(ctx.shortcutLabel('openSettings'))}.
          </p>
        ) : (
          problem && <p className="ch-transcript-problem">{t(`mentor.ask.${problem}`)}</p>
        )}
      </div>
      <textarea
        ref={field}
        className="ch-field ch-chat-field"
        rows={2}
        value={draft}
        disabled={!available || !!blocked}
        placeholder={t(blocked ? blockedPlaceholderKey(blocked) : 'mentor.chatPlaceholder')}
        aria-label={t('mentor.chatPlaceholder')}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <p className="ch-panel-hint">
        {t(waiting ? 'mentor.wait.chatHint' : 'mentor.chatHint', {
          newline: host.key('Shift-Enter'),
          insert: host.key('Mod-Enter'),
        })}
      </p>
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
  const host = useHostWords();
  const compagnon = message.role === 'compagnon';
  // D-11: what is shown and inserted is one bounded sentence, or nothing.
  const example = exampleSentence(message.example);
  return (
    <div className={`ch-turn${compagnon ? ' is-compagnon' : ''}`}>
      <p className="ch-turn-who ch-label">
        {compagnon ? t('mentor.name') : t('mentor.you')}
        {version && <span className="ch-born-in"> · {version}</span>}
      </p>
      <p className="ch-turn-text">{message.text}</p>
      {noted}
      {citation}
      {example && (
        <div className="ch-example">
          <p className="ch-example-label ch-label">{t('mentor.exampleLabel')}</p>
          <p className="ch-example-text">{example}</p>
          <button
            type="button"
            tabIndex={-1}
            className="ch-btn is-mentor"
            onClick={() => onInsert(example)}
          >
            {t('mentor.insertExample')} <kbd>{host.key('Mod-Enter')}</kbd>
          </button>
        </div>
      )}
      {children}
    </div>
  );
}
