import {
  acceptProposal,
  addInterviewMessage,
  AUTHOR,
  guids,
  interviewMessages,
  interviewSections,
  listEntities,
  listNotes,
  listTrashedEntities,
  listTrashedNotes,
  noteParts,
  readFieldRef,
  rejectProposal,
  sectionProgress,
  sectionStates,
  validateEntity,
  type EntityModule,
  type FieldRef,
  type FieldValue,
  type InterviewMessage,
  type InterviewPlacement,
  type InterviewReference,
  type InterviewSection,
  bornIn,
  bornInName,
} from '@charpentier/schema';
import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import * as Y from 'yjs';
import { useHostWords } from '../app/host-words';
import { useDocSnapshot } from '../hooks/use-doc-snapshot';
import { Medallion } from '../icons/Pictogram';
import { playSound } from '../sound/sounds';
import type { WorkspaceContext } from '../workspace/workspace-context';
import type { AtelierLocation } from './Atelier';
import { acceptAndKeep, hasKeptField, rejectSheet } from './atelier-actions';
import { readAtelier } from './atelier-data';
import { askInterview, interviewState, subscribeInterview } from './interview-requests';
import { moduleDefs, type AtelierModule } from './module-defs';
import { sameWork } from '../work/use-background-work';
import { WorkCard } from '../work/WorkBlock';
import { formatWhen } from '../work/work-format';
import { NotedLine, SLOT, withSlot } from './NotedLine';
import './interview.css';
import '../work/work.css';

/** The reading of a reference text (phase 6.4), as a work. */
const STYLE_WORK = { task: 'style' } as const;

const PICTOS = {
  meta: 'meta',
  characters: 'personnages',
  structure: 'structure',
  worldRules: 'regles',
  clues: 'indices',
  style: 'diapason',
} as const satisfies Record<AtelierModule, string>;

const railOf = (module: string): AtelierModule =>
  module === 'acts' || module === 'arcs' ? 'structure' : (module as AtelierModule);

const empty = new Y.Doc();

/** One proposal under an answer: a field, or a new sheet (with its name). */
interface Line {
  readonly key: string;
  readonly module: string;
  readonly entityId?: string;
  /** Absent: the whole new sheet. */
  readonly field?: string;
}

/** What an answer filed, as lines: a new sheet, then its fields, each decided on its own. */
const linesOf = (message: InterviewMessage): Line[] =>
  (message.placed ?? []).map((p: InterviewPlacement) => ({
    key: `${message.id}|${p.module}|${p.entityId ?? ''}|${p.field ?? ''}`,
    ...p,
  }));

const refOf = (line: Line): FieldRef | undefined =>
  !line.field
    ? undefined
    : line.entityId
      ? ({ module: line.module, entityId: line.entityId, field: line.field } as FieldRef)
      : ({ module: line.module, field: line.field } as FieldRef);

const titleFieldOf = (module: string) => {
  const def = moduleDefs[railOf(module)];
  return def.kind === 'entity' ? def.titleField : 'title';
};

type LineState = 'pending' | 'validated' | 'rejected' | 'gone';

/** Where a proposal stands now (validating here is validating in the sheet: one field). */
function stateOf(root: Y.Doc, line: Line): LineState {
  if (!line.field && line.entityId) {
    const module = line.module as EntityModule;
    const entity = listEntities(root, module).find((e) => e.id === line.entityId);
    if (!entity) return 'gone';
    return entity.status === 'proposed' ? 'pending' : entity.status;
  }
  const ref = refOf(line);
  if (!ref) return 'gone';
  try {
    const status = readFieldRef(root, ref).status;
    return status === 'proposed' ? 'pending' : (status ?? 'gone');
  } catch {
    return 'gone';
  }
}

/**
 * The interview with the Compagnon (D-26, docs/DESIGN.md §4.5): the first
 * page of the Atelier's rail. The author talks about their novel; the
 * Compagnon answers and files what he hears in the Atelier, in proposals
 * the author validates or rejects right here. Free or guided.
 */
export function Interview({
  ctx,
  active,
  focusRequest,
  fromNote,
  onOpen,
}: {
  readonly ctx: WorkspaceContext;
  readonly active: boolean;
  readonly focusRequest: number;
  /** Opened from the Carnet (« O »): the note (by id) whose message to show. */
  readonly fromNote?: string;
  readonly onOpen: (location: AtelierLocation) => void;
}) {
  const { t } = useTranslation();
  const text = t as unknown as (key: string, options?: Record<string, unknown>) => string;
  const { platform, projectId, root } = ctx;
  const guided = ctx.prefs.interviewGuided;
  const [mentorDoc, setMentorDoc] = useState<Y.Doc | null>(null);
  const [draft, setDraft] = useState('');
  const [later, setLater] = useState<readonly InterviewSection[]>([]);
  const field = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const available = platform.agents.status() !== 'disabled';

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

  const messages = useDocSnapshot(mentorDoc ?? empty, interviewMessages);
  // Re-read on every change of the Atelier (a proposal validated in its sheet shows here).
  useDocSnapshot(root, readAtelier);
  const request = useSyncExternalStore(subscribeInterview, () => interviewState(projectId));
  const waiting = request.waiting > 0;

  useEffect(() => {
    if (active) field.current?.focus();
  }, [active, focusRequest]);

  useEffect(() => {
    transcript.current?.scrollTo({ top: transcript.current.scrollHeight });
  }, [messages.length, waiting]);

  // Back to a note's message (DESIGN §4.5, « Retour au message »): washed blue, a band on top,
  // until the author goes back to the Carnet or starts writing.
  const [originSeen, setOriginSeen] = useState<string | undefined>(undefined);
  const originNote =
    fromNote && fromNote !== originSeen && mentorDoc
      ? [...listNotes(mentorDoc), ...listTrashedNotes(mentorDoc)].find((n) => n.id === fromNote)
      : undefined;
  const originMessage = originNote && messages.find((m) => originNote.sources.includes(m.id));
  const backToNotebook = () => fromNote && onOpen({ rail: 'notebook', note: fromNote });
  const backButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!originMessage) return;
    transcript.current
      ?.querySelector(`[data-message="${CSS.escape(originMessage.id)}"]`)
      ?.scrollIntoView({ block: 'center' });
    // Without a Compagnon the field is inert: the way back has the focus.
    if (!available) backButton.current?.focus();
  }, [originMessage?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- once per message

  const last = messages.at(-1);
  const question = guided && last?.role === 'compagnon' && last.question ? last : undefined;
  const section = question?.section;

  const ask = (input: Omit<Parameters<typeof askInterview>[1], 'mode'> = {}) =>
    void askInterview(ctx, { mode: guided ? 'guided' : 'free', skip: later, ...input });

  // Going to guided mode: the Compagnon asks his first question.
  const wasGuided = useRef(guided);
  useEffect(() => {
    const switched = guided && !wasGuided.current;
    wasGuided.current = guided;
    if (switched && mentorDoc && available && !waiting && !question)
      void askInterview(ctx, { mode: 'guided', skip: later });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on the switch
  }, [guided, mentorDoc]);

  const send = () => {
    const said = draft.trim();
    if (!said || !mentorDoc || waiting || !available) return;
    addInterviewMessage(
      mentorDoc,
      { role: 'author', text: said, mode: guided ? 'guided' : 'free', ...bornIn(ctx.root) },
      AUTHOR,
    );
    setDraft('');
    ask(guided && section ? { section } : {});
  };

  const lines = messages.flatMap(linesOf);
  const pending = lines.filter((l) => stateOf(root, l) === 'pending');

  const decide = (line: Line, accept: boolean) => {
    const ref = refOf(line);
    const module = line.module as EntityModule;
    if (!accept && !ref && line.entityId && hasKeptField(root, module, line.entityId)) return;
    playSound(accept ? 'click' : 'toc');
    if (ref) {
      // Keeping a field of a proposed sheet keeps the sheet (« garder batelière, c'est garder Hélène »).
      if (accept) acceptAndKeep(root, ref);
      else rejectProposal(root, ref);
      return;
    }
    if (!line.entityId) return;
    if (!accept) {
      rejectSheet(root, module, line.entityId);
      return;
    }
    validateEntity(root, module, line.entityId);
    // A style choice is one proposal: V keeps the sheet and all its fields (DESIGN §4.5).
    if (module === 'style') {
      for (const field of ['category', 'choice', 'measure', 'source', 'sourceAuthor']) {
        const ref: FieldRef = { module, entityId: line.entityId, field };
        if (readFieldRef(root, ref).status === 'proposed') acceptProposal(root, ref);
      }
      return;
    }
    // A new sheet is taken with its name; its other fields wait for the author, one by one.
    const titleRef: FieldRef = { module, entityId: line.entityId, field: titleFieldOf(module) };
    if (readFieldRef(root, titleRef).status === 'proposed') acceptProposal(root, titleRef);
  };

  const focusedLine = (target: EventTarget) =>
    target instanceof HTMLElement
      ? lines.find((l) => l.key === target.closest<HTMLElement>('[data-line]')?.dataset['line'])
      : undefined;

  const moveLine = (from: Line | undefined, step: 1 | -1) => {
    const all = [...(transcript.current?.querySelectorAll<HTMLElement>('[data-line]') ?? [])];
    const index = from ? all.findIndex((el) => el.dataset['line'] === from.key) : all.length;
    all[Math.max(0, Math.min(all.length - 1, index + step))]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && originMessage) {
      event.preventDefault();
      backToNotebook();
      return;
    }
    const inField = event.target === field.current;
    const line = focusedLine(event.target);
    // ⌘↑ ⌘↓ move among the proposals when the field is empty or a proposal has the focus.
    const free = (inField && draft === '') || line !== undefined;
    const mod = event.metaKey || event.ctrlKey;
    // V and X decide on the proposal that has the focus. In the field they are
    // letters (« voilà »): there, ⌥V and ⌥X decide on the last proposal waiting.
    // With ⌥ the letter comes from the physical key (⌥V types « ◊ » on a Mac).
    const alt = event.altKey && !mod && !event.shiftKey;
    const plain = !mod && !event.altKey && !event.shiftKey;
    const letter = alt
      ? /^Key([VX])$/.exec(event.code)?.[1]?.toLowerCase()
      : plain && /^[vx]$/i.test(event.key)
        ? event.key.toLowerCase()
        : undefined;
    if (letter && (line !== undefined || (inField && alt))) {
      const target = line ?? pending.at(-1);
      if (!target || stateOf(root, target) !== 'pending') return;
      event.preventDefault();
      decide(target, letter === 'v');
    } else if (free && mod && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      moveLine(line, event.key === 'ArrowDown' ? 1 : -1);
    } else if (inField && draft === '' && event.key === 'Tab' && question && !waiting) {
      // ⇥ passes the question, ⇧⇥ leaves its section for later.
      event.preventDefault();
      if (event.shiftKey) leaveForLater();
      else ask({ pass: true, ...(section && { section }) });
    } else if (inField && event.key === 'Enter' && !event.shiftKey && !mod) {
      event.preventDefault();
      send();
    }
  };

  const leaveForLater = () => {
    if (!section) return;
    const next = [...later, section];
    setLater(next);
    void askInterview(ctx, { mode: 'guided', skip: next });
  };

  const modeKey = ctx.shortcutLabel('toggleInterviewMode') ?? '';
  const host = useHostWords();
  const importButton = useRef<HTMLButtonElement>(null);
  const { confirm, running } = ctx.work;
  const styleWork = sameWork(confirm?.ref, STYLE_WORK) || sameWork(running?.ref, STYLE_WORK);
  const chosen = sameWork(confirm?.ref, STYLE_WORK) ? confirm?.reference : undefined;
  const confirmingReference: InterviewReference | undefined = chosen && {
    title: chosen.title,
    ...(chosen.author && { author: chosen.author }),
    format: chosen.format,
    words: chosen.words,
  };
  // One work at a time: the import waits while one runs.
  const importInert = !!running || !available;
  const states = sectionStates(root);
  const progress = sectionProgress(root);

  return (
    <div className="ch-interview" onKeyDown={onKeyDown}>
      <header className="ch-interview-head">
        <Medallion name="entretien" size={46} mentor />
        <div className="ch-interview-title">
          <h2>{t('interview.label')}</h2>
          <p>{guided ? t('interview.guidedLine') : t('interview.freeLine')}</p>
        </div>
        <div
          className="ch-seg ch-interview-modes"
          role="group"
          aria-label={t('interview.modesLabel')}
        >
          {([false, true] as const).map((g) => (
            <button
              key={String(g)}
              type="button"
              tabIndex={-1}
              disabled={!available}
              aria-pressed={guided === g}
              className={guided === g ? 'is-on' : undefined}
              onClick={() => g !== guided && ctx.updatePrefs({ interviewGuided: g })}
            >
              {g ? t('interview.guided') : t('interview.free')}
            </button>
          ))}
          <kbd>{modeKey}</kbd>
        </div>
      </header>

      {originNote && originMessage && (
        <div className="ch-nb-back">
          <span>
            {withSlot(
              t('notebook.origin', {
                title: SLOT,
                when: formatWhen(t, originMessage.at, ctx.language),
              }),
              <b>{noteParts(originNote).title}</b>,
            )}
          </span>
          <button ref={backButton} type="button" className="ch-btn" onClick={backToNotebook}>
            {t('notebook.backToNotebook')} <kbd>{t('notebook.cancelKey')}</kbd>
          </button>
        </div>
      )}

      <div ref={transcript} className="ch-interview-log" role="log" aria-live="polite">
        {messages.length === 0 && (
          <div className="ch-interview-turn is-compagnon">
            <p className="ch-label ch-interview-who">{t('mentor.name')}</p>
            <p className="ch-interview-say">
              {available ? t('interview.welcome') : t('interview.unavailable')}
            </p>
            {available && !guided && (
              <button
                type="button"
                className="ch-btn is-mentor"
                onClick={() => ctx.updatePrefs({ interviewGuided: true })}
              >
                {t('interview.startGuided')}
              </button>
            )}
          </div>
        )}
        {messages.map((message) =>
          message.role === 'author' ? (
            message.reference ? (
              <ReferenceFrame key={message.id} reference={message.reference} />
            ) : (
              <p
                key={message.id}
                data-message={message.id}
                className={`ch-interview-author${message === originMessage ? ' is-origin' : ''}`}
              >
                {message.text}
              </p>
            )
          ) : (
            (message.text || !message.question || message !== question) && (
              <div
                key={message.id}
                data-message={message.id}
                className={`ch-interview-turn is-compagnon${message === originMessage ? ' is-origin' : ''}`}
              >
                {message.reference && (
                  <p className="ch-bilan-head ch-label ch-engraved">
                    {t('work.task.style.bilan', { name: message.reference.title })}{' '}
                    <small>{formatWhen(t, message.at, ctx.language, new Date(), true)}</small>
                  </p>
                )}
                <p className="ch-label ch-interview-who">
                  {t('mentor.name')}
                  {/* Born in a working version: its line of origin names it (DESIGN 1.20). */}
                  {bornInName(ctx.root, message.version) && (
                    <span className="ch-born-in"> · {bornInName(ctx.root, message.version)}</span>
                  )}
                </p>
                {message.text && <p className="ch-interview-say">{message.text}</p>}
                {message.question && message !== question && (
                  <p className="ch-interview-say is-question">{message.question}</p>
                )}
                {mentorDoc && (
                  <NotedLine
                    doc={mentorDoc}
                    noted={message.noted}
                    onOpen={(note) => onOpen({ rail: 'notebook', note })}
                  />
                )}
                <Proposals
                  ctx={ctx}
                  lines={linesOf(message)}
                  text={text}
                  onDecide={decide}
                  onOpen={onOpen}
                />
              </div>
            )
          ),
        )}
        {/* A reference text being confirmed or read: the Compagnon's answer, in the conversation. */}
        {confirmingReference && <ReferenceFrame reference={confirmingReference} />}
        {styleWork && (
          <div className="ch-interview-turn is-compagnon">
            <p className="ch-label ch-interview-who">{t('mentor.name')}</p>
            <WorkCard
              ctx={ctx}
              work={STYLE_WORK}
              wide
              onCancelled={() => importButton.current?.focus()}
            />
          </div>
        )}
        {waiting && <p className="ch-transcript-waiting">{t('mentor.thinking')}</p>}
        {request.problem && (
          <p className="ch-transcript-problem">{text(`mentor.ask.${request.problem}`)}</p>
        )}
      </div>

      {guided && (
        <ol className="ch-interview-progress" aria-label={t('interview.progressLabel')}>
          {interviewSections.map((s) => (
            <li key={s} className={s === section ? 'is-current' : undefined}>
              {t(`interview.short.${s}`)}{' '}
              <span aria-hidden="true">
                {progress[s].map((done) => (done ? '●' : '○')).join('')}
              </span>
            </li>
          ))}
        </ol>
      )}

      {question && section && (
        <div className="ch-interview-question">
          <p className="ch-interview-question-head">
            <Medallion name={PICTOS[section]} size={30} mentor />
            <span className="ch-label">{t(`atelier.modules.${section}`)}</span>
            <span className="ch-interview-question-state">
              {t(`interview.state.${states[section]}`)}
            </span>
          </p>
          <p className="ch-interview-question-text">{question.question}</p>
          {question.why && <p className="ch-interview-question-why">{question.why}</p>}
          <div className="ch-interview-question-actions">
            <button
              type="button"
              className="ch-btn"
              disabled={waiting}
              onClick={() => ask({ pass: true, section })}
            >
              {t('interview.pass')} <kbd>⇥</kbd>
            </button>
            <button type="button" className="ch-btn" disabled={waiting} onClick={leaveForLater}>
              {t('interview.later')} <kbd>⇧⇥</kbd>
            </button>
            <button
              type="button"
              className="ch-btn ch-interview-other"
              onClick={() => void ctx.runCommand('interviewOtherSection')}
            >
              {t('interview.otherSection')} <kbd>{ctx.shortcutLabel('interviewOtherSection')}</kbd>
            </button>
          </div>
        </div>
      )}

      <div className="ch-interview-entry">
        {available && (
          <button
            ref={importButton}
            type="button"
            className="ch-btn ch-interview-import"
            title={t('reference.import')}
            aria-disabled={importInert || undefined}
            onClick={() => {
              if (!importInert) ctx.askWork(STYLE_WORK);
            }}
          >
            {t('reference.button')}
          </button>
        )}
        <textarea
          ref={field}
          className="ch-field ch-interview-field"
          rows={1}
          value={draft}
          disabled={!available}
          placeholder={guided ? t('interview.guidedPlaceholder') : t('interview.freePlaceholder')}
          aria-label={guided ? t('interview.guidedPlaceholder') : t('interview.freePlaceholder')}
          onChange={(e) => {
            setDraft(e.target.value);
            // The way back to the Carnet goes once the author writes.
            if (fromNote) setOriginSeen(fromNote);
          }}
        />
      </div>
      {available && (
        <p className="ch-interview-hint">{t('interview.hint', { mode: modeKey, alt: host.alt })}</p>
      )}
    </div>
  );
}

/** The file the author gave, as their own words in the conversation (DESIGN §4.5, 1.16). */
function ReferenceFrame({ reference }: { readonly reference: InterviewReference }) {
  const { t, i18n } = useTranslation();
  const format = reference.format
    ? t(`reference.format.${reference.format}` as 'reference.format.epub', {
        defaultValue: reference.format.toUpperCase(),
      })
    : '';
  const words = (reference.words ?? 0).toLocaleString(i18n.language);
  const meta = reference.author
    ? t('reference.meta', { author: reference.author, format, words })
    : t('reference.metaNoAuthor', { format, words });
  return (
    <div
      className="ch-interview-author ch-interview-reference"
      role="group"
      aria-label={t('reference.frameLabel', { title: reference.title, meta })}
    >
      <p className="ch-label" aria-hidden="true">
        {t('reference.frame')}
      </p>
      <p className="ch-interview-reference-title" aria-hidden="true">
        {reference.title}
      </p>
      <p className="ch-interview-reference-meta" aria-hidden="true">
        {meta}
      </p>
    </div>
  );
}

/** The proposals an answer filed, each to validate or reject on the spot. */
function Proposals({
  ctx,
  lines,
  text,
  onDecide,
  onOpen,
}: {
  readonly ctx: WorkspaceContext;
  readonly lines: readonly Line[];
  readonly text: (key: string, options?: Record<string, unknown>) => string;
  readonly onDecide: (line: Line, accept: boolean) => void;
  readonly onOpen: (location: AtelierLocation) => void;
}) {
  const { t } = useTranslation();
  const { root } = ctx;
  const shown = lines
    .map((line) => ({ line, state: stateOf(root, line) }))
    .filter((l) => l.state !== 'gone');
  if (shown.length === 0) return null;

  /** The other proposals of a new sheet still waiting: rejecting the sheet rejects them too. */
  const sheetFieldsWaiting = (sheet: Line) =>
    shown.filter(
      ({ line, state }) =>
        line.field &&
        line.entityId === sheet.entityId &&
        line.module === sheet.module &&
        state === 'pending',
    ).length;

  const nameOf = (module: string, entityId: string): string => {
    const entity = [
      ...listEntities(root, module as EntityModule),
      ...listTrashedEntities(root, module as EntityModule),
    ].find((e) => e.id === entityId);
    const state = entity?.fields[titleFieldOf(module)];
    const value = state?.value ?? state?.proposal?.value ?? state?.rejected.at(-1)?.value;
    return typeof value === 'string' ? value : text(`atelier.untitled.${module}`);
  };
  const valueOf = (line: Line, value: FieldValue | undefined): string => {
    if (typeof value !== 'string') return value === undefined ? '' : JSON.stringify(value);
    if (line.field && (line.field === 'kind' || line.field === 'narrativeModel'))
      return text(`atelier.options.${line.field}.${value}`, { defaultValue: value });
    return value;
  };

  return (
    <div className="ch-interview-proposals">
      <p className="ch-label ch-interview-proposals-title">
        {t('interview.proposals', { count: shown.length })}
      </p>
      {shown.map(({ line, state }) => {
        const rail = railOf(line.module);
        const ref = refOf(line);
        const field = ref ? readFieldRef(root, ref) : undefined;
        const value = line.field
          ? valueOf(line, field?.value ?? field?.proposal?.value ?? field?.rejected.at(-1)?.value)
          : nameOf(line.module, line.entityId ?? '');
        const sheet = line.entityId
          ? { rail, target: { module: line.module, entityId: line.entityId } }
          : { rail, target: { module: line.module } };
        if (line.module === 'style' && line.entityId && !line.field)
          return (
            <StyleProposal
              key={line.key}
              ctx={ctx}
              line={line}
              state={state}
              text={text}
              onDecide={onDecide}
              onOpen={() => onOpen(sheet as AtelierLocation)}
            />
          );
        return (
          <div
            key={line.key}
            className={`ch-interview-proposal is-${state}`}
            data-line={line.key}
            tabIndex={-1}
          >
            <Medallion name={PICTOS[rail]} size={30} />
            <div className="ch-interview-proposal-body">
              <p className="ch-interview-path">
                <button type="button" tabIndex={-1} onClick={() => onOpen({ rail })}>
                  {t(`atelier.modules.${rail}`)}
                </button>
                {line.entityId && (
                  <>
                    {' › '}
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => onOpen(sheet as AtelierLocation)}
                    >
                      {line.field ? nameOf(line.module, line.entityId) : t('interview.newSheet')}
                    </button>
                  </>
                )}
                {line.field && (
                  <>
                    {' › '}
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => onOpen(sheet as AtelierLocation)}
                    >
                      {text(`atelier.fields.${line.module}.${line.field}`, {
                        defaultValue: line.field,
                      })}
                    </button>
                  </>
                )}
              </p>
              <p className="ch-interview-value">{value}</p>
            </div>
            {state === 'pending' ? (
              <span className="ch-interview-proposal-actions">
                <button
                  type="button"
                  tabIndex={-1}
                  className="ch-btn is-mentor"
                  onClick={() => onDecide(line, true)}
                >
                  {line.field ? t('atelier.accept') : t('interview.keepSheet')}{' '}
                  <kbd>{t('atelier.acceptKey')}</kbd>
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  className="ch-btn"
                  onClick={() => onDecide(line, false)}
                >
                  {/* A new sheet goes with the fields proposed with it: said on the button. */}
                  {line.field
                    ? t('atelier.reject')
                    : sheetFieldsWaiting(line) > 0
                      ? t('interview.rejectSheetWith', { count: sheetFieldsWaiting(line) })
                      : t('interview.rejectSheet')}{' '}
                  <kbd>{t('atelier.rejectKey')}</kbd>
                </button>
              </span>
            ) : (
              <span className="ch-interview-proposal-state">
                {state === 'validated' ? t('interview.validated') : t('interview.rejected')}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** A style choice drawn from a reference text: one whole sheet, validated or rejected at once. */
function StyleProposal({
  ctx,
  line,
  state,
  text,
  onDecide,
  onOpen,
}: {
  readonly ctx: WorkspaceContext;
  readonly line: Line;
  readonly state: LineState;
  readonly text: (key: string, options?: Record<string, unknown>) => string;
  readonly onDecide: (line: Line, accept: boolean) => void;
  readonly onOpen: () => void;
}) {
  const { t } = useTranslation();
  const entity = [
    ...listEntities(ctx.root, 'style'),
    ...listTrashedEntities(ctx.root, 'style'),
  ].find((e) => e.id === line.entityId);
  const read = (field: string) => {
    const f = entity?.fields[field];
    const v = f?.value ?? f?.proposal?.value ?? f?.rejected.at(-1)?.value;
    return typeof v === 'string' ? v : '';
  };
  const category = read('category');
  const measure = read('measure');
  // The author's validated choice in the same category, if any.
  const before = listEntities(ctx.root, 'style').find(
    (e) =>
      e.id !== line.entityId &&
      e.status === 'validated' &&
      e.fields['category']?.value === category &&
      typeof e.fields['choice']?.value === 'string',
  );
  return (
    <div className={`ch-interview-proposal is-${state}`} data-line={line.key} tabIndex={-1}>
      <Medallion name="diapason" size={30} />
      <div className="ch-interview-proposal-body">
        <p className="ch-interview-path">
          <button type="button" tabIndex={-1} onClick={onOpen}>
            {t('atelier.modules.style')}
          </button>
          {category && (
            <>
              {' › '}
              <button type="button" tabIndex={-1} onClick={onOpen}>
                {text(`atelier.options.category.${category}`, { defaultValue: category })}
              </button>
            </>
          )}
        </p>
        <p className="ch-interview-value">{read('choice')}</p>
        {measure && <p className="ch-interview-measure">{measure}</p>}
        {state === 'pending' && before && (
          <p className="ch-interview-measure">
            {t('reference.chose', { choice: String(before.fields['choice']?.value) })}
          </p>
        )}
      </div>
      {state === 'pending' ? (
        <span className="ch-interview-proposal-actions">
          <button
            type="button"
            tabIndex={-1}
            className="ch-btn is-mentor"
            onClick={() => onDecide(line, true)}
          >
            {t('atelier.accept')} <kbd>{t('atelier.acceptKey')}</kbd>
          </button>
          <button
            type="button"
            tabIndex={-1}
            className="ch-btn"
            onClick={() => onDecide(line, false)}
          >
            {t('atelier.reject')} <kbd>{t('atelier.rejectKey')}</kbd>
          </button>
        </span>
      ) : (
        <span className="ch-interview-proposal-state">
          {state === 'validated' ? t('interview.validated') : t('interview.rejected')}
        </span>
      )}
    </div>
  );
}
