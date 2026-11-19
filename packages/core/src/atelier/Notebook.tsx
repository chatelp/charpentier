import type { PreferencesService } from '@charpentier/platform';
import {
  AUTHOR,
  authorEditNote,
  authorKeepNote,
  authorMoveNote,
  authorRestoreNote,
  authorTrashNote,
  authorWriteNote,
  noteNatures,
  noteParts,
  readProjectMeta,
  type Note,
  type NoteBook,
  type NoteNature,
  bornInName,
} from '@charpentier/schema';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import * as Y from 'yjs';
import { filterByQuery } from '../commands/registry';
import { useDocSnapshot } from '../hooks/use-doc-snapshot';
import { Medallion } from '../icons/Pictogram';
import { playSound } from '../sound/sounds';
import { workName } from '../work/use-background-work';
import { useLoadedMentorDoc } from '../work/WorkBlock';
import { formatWhen } from '../work/work-format';
import type { WorkspaceContext } from '../workspace/workspace-context';
import type { AtelierLocation } from './Atelier';
import {
  freeNotePath,
  freshness,
  notebookVisitPref,
  readNotebook,
  sourceOf,
} from './notebook-data';
import { SLOT, withSlot } from './NotedLine';
import './interview.css';
import './notebook.css';
import { useHostWords } from '../app/host-words';

const BOOKS: readonly NoteBook[] = ['projet', 'auteur'];

/** A new note's nature, by notebook (DESIGN §4.5). */
const NEW_NATURE: Record<NoteBook, NoteNature> = { projet: 'decisions', auteur: 'accompagnement' };

const empty = new Y.Doc();
const readMeta = (root: Y.Doc) => readProjectMeta(root)?.title ?? '';

/** A note as the page shows it. */
interface Shown {
  readonly note: Note;
  readonly book: NoteBook;
  readonly nature: NoteNature;
  readonly title: string;
  readonly body: string;
  readonly fresh: 'created' | 'updated' | undefined;
}

/** The small form, correcting a note (`id`) or writing a new one. */
interface Draft {
  readonly id?: string;
  readonly book: NoteBook;
  readonly nature: NoteNature;
  readonly title: string;
  readonly text: string;
}

/** Leaving the page is when its new notes become seen (deferred: a remount at once is no leaving). */
const leaving = new Map<string, ReturnType<typeof setTimeout>>();

/** The time of the author's last visit (null: never; undefined: not read yet); saved on leaving. */
function useLastVisit(preferences: PreferencesService, projectId: string) {
  const [last, setLast] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const key = notebookVisitPref(projectId);
    clearTimeout(leaving.get(key));
    leaving.delete(key);
    let cancelled = false;
    void preferences.get<unknown>(key).then((stored) => {
      if (!cancelled) setLast(typeof stored === 'string' ? stored : null);
    });
    return () => {
      cancelled = true;
      leaving.set(
        key,
        setTimeout(() => {
          leaving.delete(key);
          void preferences.set(key, new Date().toISOString());
        }),
      );
    };
  }, [preferences, projectId]);
  return last;
}

const byRecent = (a: Shown, b: Shown) => (a.note.updatedAt < b.note.updatedAt ? 1 : -1);

/**
 * The Compagnon's notebook (D-35, docs/DESIGN.md §4.5 « Carnet du
 * Compagnon »): what he keeps of the exchanges, in short notes, read before
 * every answer. Both notebooks on one page (« Ce roman », then « Vous »),
 * grouped by nature; the author corrects a note on the spot, keeps it as it
 * is, or puts it in the trash. A note the author touched is theirs: the
 * Compagnon reads it and never rewrites it.
 */
export function Notebook({
  ctx,
  active,
  focusRequest,
  focusNote,
  onOpen,
}: {
  readonly ctx: WorkspaceContext;
  readonly active: boolean;
  readonly focusRequest: number;
  /** The note to give the focus to when the page opens (from « Noté au carnet »). */
  readonly focusNote?: string;
  readonly onOpen: (location: AtelierLocation) => void;
}) {
  const { t } = useTranslation();
  const host = useHostWords();
  const { platform, projectId, root } = ctx;
  const doc = useLoadedMentorDoc(projectId);
  const data = useDocSnapshot(doc ?? empty, readNotebook);
  const projectTitle = useDocSnapshot(root, readMeta);
  const lastVisit = useLastVisit(platform.preferences, projectId);
  const available = platform.agents.status() !== 'disabled';
  const [query, setQuery] = useState('');
  const [focusId, setFocusId] = useState<string | undefined>(focusNote);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const page = useRef<HTMLDivElement>(null);
  const filter = useRef<HTMLInputElement>(null);
  const firstButton = useRef<HTMLButtonElement>(null);
  /** The element to focus after the next render: a note (by id), or the form. */
  const pendingFocus = useRef<string | null>(null);

  const all: Shown[] = data.notes.map((note) => ({
    note,
    ...noteParts(note),
    fresh: freshness(note, lastVisit),
  }));
  const matching = filterByQuery(all, query, (s) => `${s.title} ${s.body}`);
  const books = BOOKS.map((book) => ({
    book,
    total: all.filter((s) => s.book === book).length,
    groups: noteNatures
      .map((nature) => ({
        nature,
        notes: matching.filter((s) => s.book === book && s.nature === nature).sort(byRecent),
      }))
      .filter((g) => g.notes.length > 0),
  }));
  const order = books.flatMap((b) => b.groups.flatMap((g) => g.notes));
  const focused = order.find((s) => s.note.id === focusId);

  const focusSoon = (target: string) => {
    pendingFocus.current = target;
  };

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    const el =
      target === 'form'
        ? page.current?.querySelector<HTMLElement>('.ch-nb-edit input')
        : page.current?.querySelector<HTMLElement>(`[data-note="${CSS.escape(target)}"]`);
    el?.focus();
  });

  // The focus on the page when asked: the note asked for, else the one before, else the first.
  useEffect(() => {
    if (!active || !doc) return;
    const target =
      order.find((s) => s.note.id === focusNote) ??
      order.find((s) => s.note.id === focusId) ??
      order[0];
    // (The note's own focus handler makes it the focused one.)
    if (target)
      page.current
        ?.querySelector<HTMLElement>(`[data-note="${CSS.escape(target.note.id)}"]`)
        ?.focus();
    else firstButton.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when asked, or once loaded
  }, [active, focusRequest, focusNote, doc]);

  const move = (step: 1 | -1) => {
    const index = focused ? order.indexOf(focused) : -1;
    const next = order[Math.max(0, Math.min(order.length - 1, index + step))];
    if (!next) return;
    setFocusId(next.note.id);
    focusSoon(next.note.id);
  };

  const startEdit = (s: Shown) => {
    setDraft({ id: s.note.id, book: s.book, nature: s.nature, title: s.title, text: s.body });
    focusSoon('form');
  };

  const startNew = () => {
    const book = focused?.book ?? 'projet';
    setDraft({ book, nature: NEW_NATURE[book], title: '', text: '' });
    focusSoon('form');
  };

  const closeForm = (noteId?: string) => {
    setDraft(null);
    const back = noteId ?? focusId;
    if (back) {
      setFocusId(back);
      focusSoon(back);
    } else page.current?.focus();
  };

  const save = () => {
    if (!doc || !draft) return;
    const title = draft.title.trim();
    if (!title) return;
    const text = `# ${title}\n${draft.text.trim()}`;
    if (draft.id === undefined) {
      playSound('click');
      // The new note shows whatever the filter says.
      setQuery('');
      const id = authorWriteNote(doc, {
        path: freeNotePath(doc, draft.book, draft.nature, title),
        text,
      });
      closeForm(id);
      return;
    }
    const id = draft.id;
    const before = all.find((s) => s.note.id === id);
    if (!before) return closeForm();
    const moved = draft.book !== before.book || draft.nature !== before.nature;
    // Saving without a change does nothing: « Garder » makes a note the author's as it is.
    if (moved || title !== before.title || draft.text.trim() !== before.body) {
      playSound('click');
      doc.transact(() => {
        if (moved)
          authorMoveNote(doc, id, freeNotePath(doc, draft.book, draft.nature, title, id), AUTHOR);
        authorEditNote(doc, id, text, AUTHOR);
      }, AUTHOR);
    }
    closeForm(id);
  };

  const keep = (s: Shown) => {
    if (!doc || s.note.by !== 'compagnon') return;
    playSound('click');
    authorKeepNote(doc, s.note.id);
  };

  const trash = (s: Shown) => {
    if (!doc) return;
    const index = order.indexOf(s);
    const next = order[index + 1] ?? order[index - 1];
    playSound('toc');
    authorTrashNote(doc, s.note.id);
    ctx.notify(t('notebook.trashed', { title: s.title }));
    setFocusId(next?.note.id);
    if (next) focusSoon(next.note.id);
    else page.current?.focus();
  };

  const restore = (note: Note) => {
    if (!doc) return;
    playSound('click');
    authorRestoreNote(doc, note.id);
    setFocusId(note.id);
    focusSoon(note.id);
  };

  /** « O », or the link « d'après l'entretien »: the exchange the note comes from. */
  const openOrigin = (s: Shown) => {
    const source = sourceOf(s.note, data);
    if (!source) return;
    if (source.mode === 'interview') onOpen({ rail: 'interview', fromNote: s.note.id });
    else if (ctx.mentorPanel !== 'conversation') ctx.toggleMentorPanel('conversation');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target.closest('.ch-nb-edit')
    )
      return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const onButton = target instanceof HTMLButtonElement;
    if (key === 'j' || key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (key === 'k' || key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (key === 'Enter' && !onButton && focused) {
      event.preventDefault();
      startEdit(focused);
    } else if (key === 'v' && focused) {
      event.preventDefault();
      keep(focused);
    } else if ((key === 'Backspace' || key === 'Delete') && focused) {
      event.preventDefault();
      trash(focused);
    } else if (key === 'o' && focused) {
      event.preventDefault();
      openOrigin(focused);
    } else if (key === 'n') {
      event.preventDefault();
      startNew();
    } else if (key === '/') {
      event.preventDefault();
      filter.current?.focus();
    }
  };

  const meta = (s: Shown): ReactNode => {
    const when = formatWhen(t, s.note.updatedAt, ctx.language);
    const who =
      s.note.by === 'compagnon'
        ? t('notebook.by.compagnon', { when })
        : t(`notebook.by.${s.note.authorship ?? 'corrected'}`, { when });
    const source = sourceOf(s.note, data);
    const label = !source
      ? undefined
      : source.work
        ? t(`work.task.${source.work.task}.bilan`, { name: workName(root, source.work) })
        : source.count > 1
          ? t(`notebook.source.${source.mode}Many`, { count: source.count })
          : t(`notebook.source.${source.mode}`);
    return (
      <>
        {who}
        {label && (
          <>
            {' · '}
            {withSlot(
              t('notebook.from', { source: SLOT }),
              <button type="button" tabIndex={-1} className="ch-link" onClick={() => openOrigin(s)}>
                {label}
              </button>,
            )}
            {/* Born in a working version: « d'après la conversation · Fin à Nantes » (DESIGN 1.20). */}
            {bornInName(root, source?.version) && (
              <span className="ch-born-in"> · {bornInName(root, source?.version)}</span>
            )}
          </>
        )}
        {s.fresh && (
          <>
            {' · '}
            <span className="ch-nb-fresh">{t(`notebook.fresh.${s.fresh}`)}</span>
          </>
        )}
      </>
    );
  };

  const form = draft && doc && (
    <NoteForm
      draft={draft}
      onChange={(change) => setDraft((d) => d && { ...d, ...change })}
      onSave={save}
      onCancel={() => closeForm(draft.id)}
    />
  );

  const isEmpty = all.length === 0;
  const noMatch = !isEmpty && query.trim() !== '' && order.length === 0;

  return (
    <div ref={page} className="ch-interview ch-notebook" tabIndex={-1} onKeyDown={onKeyDown}>
      <header className="ch-interview-head">
        <Medallion name="carnet" size={46} mentor />
        <div className="ch-interview-title">
          <h2>{t('notebook.label')}</h2>
          <p>{available ? t('notebook.line') : t('notebook.lineUnavailable')}</p>
        </div>
        <button type="button" className="ch-btn ch-nb-new" tabIndex={-1} onClick={startNew}>
          {t('notebook.new')} <kbd>{t('notebook.newKey')}</kbd>
        </button>
      </header>

      <div className="ch-nb-log">
        {isEmpty && !draft ? (
          <div className="ch-nb-empty">
            <p>{t('notebook.emptyIntro')}</p>
            <p className="ch-nb-quiet">{t('notebook.emptyQuiet')}</p>
            <div className="ch-nb-empty-actions">
              <button
                ref={firstButton}
                type="button"
                className="ch-btn is-mentor is-lit"
                onClick={() => onOpen({ rail: 'interview' })}
              >
                {t('notebook.openInterview')} <kbd>{ctx.shortcutLabel('atelierInterview')}</kbd>
              </button>
              <button type="button" className="ch-btn" onClick={startNew}>
                {t('notebook.new')} <kbd>{t('notebook.newKey')}</kbd>
              </button>
            </div>
          </div>
        ) : (
          <>
            {!isEmpty && (
              <div className="ch-filter ch-nb-filter">
                <input
                  ref={filter}
                  className="ch-field"
                  value={query}
                  placeholder={t('notebook.filter')}
                  aria-label={t('notebook.filter')}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' || e.key === 'Enter') {
                      e.preventDefault();
                      const first = order[0];
                      if (first) {
                        setFocusId(first.note.id);
                        focusSoon(first.note.id);
                      }
                    } else if (e.key === 'Escape' && query) {
                      e.preventDefault();
                      setQuery('');
                    }
                  }}
                />
                <kbd className="ch-filter-key">{t('notebook.filterKey')}</kbd>
              </div>
            )}
            {noMatch && <p className="ch-nb-book-empty">{t('notebook.noMatch', { query })}</p>}
            {books.map(({ book, total, groups }) => (
              <section key={book} className="ch-nb-book" aria-labelledby={`ch-nb-${book}`}>
                <div className="ch-nb-book-head">
                  <h3 id={`ch-nb-${book}`}>{t(`notebook.books.${book}`)}</h3>
                  <span>
                    {t('notebook.count', { count: total })}
                    {' · '}
                    {book === 'auteur'
                      ? t('notebook.readEverywhere')
                      : projectTitle
                        ? withSlot(
                            t('notebook.readIn', { title: SLOT }),
                            <cite>{projectTitle}</cite>,
                          )
                        : t('notebook.readEverywhere')}
                  </span>
                </div>
                {draft && draft.id === undefined && draft.book === book && form}
                {total === 0 && (
                  <p className="ch-nb-book-empty">{t(`notebook.emptyBook.${book}`)}</p>
                )}
                {groups.map(({ nature, notes }) => (
                  <div
                    key={nature}
                    role="group"
                    aria-label={t(`notebook.natures.${nature}`)}
                    className="ch-nb-group"
                  >
                    <p className="ch-label ch-nb-nature" aria-hidden="true">
                      {t(`notebook.natures.${nature}`)}
                    </p>
                    {notes.map((s) =>
                      draft?.id === s.note.id ? (
                        <div key={s.note.id}>{form}</div>
                      ) : (
                        <NoteItem
                          key={s.note.id}
                          shown={s}
                          focused={s.note.id === focusId}
                          meta={meta(s)}
                          onFocus={() => setFocusId(s.note.id)}
                          onCorrect={() => startEdit(s)}
                          onKeep={() => keep(s)}
                          onTrash={() => trash(s)}
                        />
                      ),
                    )}
                  </div>
                ))}
              </section>
            ))}
          </>
        )}
        {data.trashed.length > 0 && (
          <div className="ch-nb-trash">
            <p>
              <button
                type="button"
                className="ch-link"
                aria-expanded={trashOpen}
                onClick={() => setTrashOpen((open) => !open)}
              >
                {t('notebook.trashLink', { count: data.trashed.length })}
              </button>
              {' · '}
              {t('notebook.trashLine')}
            </p>
            {trashOpen &&
              data.trashed.map((note) => {
                const parts = noteParts(note);
                const when = formatWhen(t, note.trashedAt ?? '', ctx.language);
                return (
                  <article key={note.id} className="ch-nb-note is-trashed" aria-label={parts.title}>
                    <h4>{parts.title}</h4>
                    <p className="ch-nb-text">{parts.body}</p>
                    <p className="ch-nb-meta">
                      {note.trashedBy === 'author'
                        ? t('notebook.trashedByAuthor', { when })
                        : t('notebook.trashedByCompagnon', { when })}
                    </p>
                    <span className="ch-nb-actions">
                      <button type="button" className="ch-btn" onClick={() => restore(note)}>
                        {t('notebook.restore')}
                      </button>
                    </span>
                  </article>
                );
              })}
          </div>
        )}
      </div>
      {!(isEmpty && !draft) && (
        <p className="ch-interview-hint">
          {draft ? t('notebook.editHint', { save: host.key('Mod-Enter') }) : t('notebook.hint')}
        </p>
      )}
    </div>
  );
}

/** A note, flat on the page; the focused one is lightly raised, with its actions. */
function NoteItem({
  shown,
  focused,
  meta,
  onFocus,
  onCorrect,
  onKeep,
  onTrash,
}: {
  readonly shown: Shown;
  readonly focused: boolean;
  readonly meta: ReactNode;
  readonly onFocus: () => void;
  readonly onCorrect: () => void;
  readonly onKeep: () => void;
  readonly onTrash: () => void;
}) {
  const { t } = useTranslation();
  const { note, title, body, nature, fresh } = shown;
  const mine = note.by === 'author';
  const label =
    t(`notebook.noteLabel.${mine ? 'author' : 'compagnon'}`, {
      nature: t(`notebook.natures.${nature}`),
      title,
    }) + (fresh ? `, ${t(`notebook.fresh.${fresh}`)}` : '');
  return (
    <article
      className={`ch-nb-note${mine ? ' is-mine' : ''}${fresh ? ' is-new' : ''}${focused ? ' is-focus' : ''}`}
      data-note={note.id}
      tabIndex={focused ? 0 : -1}
      aria-label={label}
      onFocus={onFocus}
    >
      <h4>{title}</h4>
      <span className="ch-nb-actions">
        <button type="button" tabIndex={-1} className="ch-btn" onClick={onCorrect}>
          {t('notebook.correct')} <kbd>{t('notebook.correctKey')}</kbd>
        </button>
        {!mine && (
          <button type="button" tabIndex={-1} className="ch-btn" onClick={onKeep}>
            {t('notebook.keep')} <kbd>{t('notebook.keepKey')}</kbd>
          </button>
        )}
        <button type="button" tabIndex={-1} className="ch-btn" onClick={onTrash}>
          {t('notebook.trash')} <kbd>{t('notebook.trashKey')}</kbd>
        </button>
      </span>
      {body && <p className="ch-nb-text">{body}</p>}
      <p className="ch-nb-meta">{meta}</p>
    </article>
  );
}

/** Correcting a note in place, or writing a new one: the author writes, in their ink. */
function NoteForm({
  draft,
  onChange,
  onSave,
  onCancel,
}: {
  readonly draft: Draft;
  readonly onChange: (change: Partial<Draft>) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation();
  const host = useHostWords();
  const text = useRef<HTMLTextAreaElement>(null);
  const inert = draft.title.trim() === '';
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onSave();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  };
  return (
    <div
      className="ch-nb-edit"
      role="group"
      aria-label={draft.id === undefined ? t('notebook.newLabel') : t('notebook.correctLabel')}
      onKeyDown={onKeyDown}
    >
      <input
        value={draft.title}
        aria-label={t('notebook.titleField')}
        onChange={(e) => onChange({ title: e.target.value })}
        onKeyDown={(e) => {
          // ⏎ in the title goes to the text.
          if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            text.current?.focus();
          }
        }}
      />
      <textarea
        ref={text}
        rows={2}
        value={draft.text}
        aria-label={t('notebook.textField')}
        onChange={(e) => onChange({ text: e.target.value })}
      />
      <div className="ch-nb-edit-row">
        <span className="ch-label">{t('notebook.natureLabel')}</span>
        <div className="ch-seg" role="group" aria-label={t('notebook.natureLabel')}>
          {noteNatures.map((nature) => (
            <button
              key={nature}
              type="button"
              aria-pressed={draft.nature === nature}
              className={draft.nature === nature ? 'is-on' : undefined}
              onClick={() => onChange({ nature })}
            >
              {t(`notebook.nature.${nature}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="ch-nb-edit-row">
        <span className="ch-label">{t('notebook.bookLabel')}</span>
        <div className="ch-seg" role="group" aria-label={t('notebook.bookLabel')}>
          {BOOKS.map((book) => (
            <button
              key={book}
              type="button"
              aria-pressed={draft.book === book}
              className={draft.book === book ? 'is-on' : undefined}
              onClick={() => onChange({ book })}
            >
              {t(`notebook.books.${book}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="ch-nb-edit-foot">
        <small>{t('notebook.becomesYours')}</small>
        <span className="ch-nb-edit-actions">
          <button
            type="button"
            className={`ch-btn is-author${inert ? '' : ' is-lit'}`}
            aria-disabled={inert || undefined}
            onClick={() => !inert && onSave()}
          >
            {t('notebook.save')} <kbd>{host.key('Mod-Enter')}</kbd>
          </button>
          <button type="button" className="ch-btn" onClick={onCancel}>
            {t('notebook.cancel')} <kbd>{t('notebook.cancelKey')}</kbd>
          </button>
        </span>
      </div>
    </div>
  );
}
