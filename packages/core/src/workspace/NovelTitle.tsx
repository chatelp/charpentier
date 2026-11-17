import type { ProjectSummary } from '@charpentier/platform';
import { readProjectMeta } from '@charpentier/schema';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useDocSnapshot } from '../hooks/use-doc-snapshot';
import { CloseButton } from '../icons/CloseButton';
import { renameProjectEverywhere } from './default-scene';
import type { WorkspaceContext } from './workspace-context';
import './novel.css';

/** How many of the other novels the sheet shows (the library holds them all). */
const OTHERS = 3;

/**
 * The novel's title, top left of the page (docs/DESIGN.md §4.8 « Le titre du
 * roman », 1.19): a flat button that opens the novel's sheet. The same on the
 * Mac, the web and the X250; on the Mac in a window it sits in the title bar,
 * in place of the centred title.
 */
export function NovelButton({
  ctx,
  className = '',
}: {
  readonly ctx: WorkspaceContext;
  readonly className?: string;
}) {
  const { t } = useTranslation();
  const title = useDocSnapshot(ctx.root, readProjectMeta)?.title ?? '';
  return (
    <button
      type="button"
      className={`ch-novel ch-chrome${ctx.novelOpen ? ' is-open' : ''} ${className}`}
      title={t('novel.button')}
      aria-label={t('novel.buttonLabel', { title })}
      aria-haspopup="dialog"
      aria-expanded={ctx.novelOpen}
      onClick={() => ctx.toggleNovel()}
    >
      <span className="ch-novel-title">{title}</span>
      <i aria-hidden="true">⌄</i>
    </button>
  );
}

/** « hier », « le 2 nov. »: when the author last opened a novel. */
export function openedWhen(
  t: WorkspaceContext['t'],
  language: string,
  iso: string,
  now = new Date(),
): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const date = new Date(iso);
  const days = Math.round((day(now) - day(date)) / 86_400_000);
  if (days <= 0) return t('novel.today');
  if (days === 1) return t('novel.yesterday');
  const format = new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() !== now.getFullYear() && { year: 'numeric' }),
  });
  return t('novel.on', { date: format.format(date) });
}

/**
 * The novel's sheet (docs/DESIGN.md §4.8): its title and figures, « Renommer »,
 * the three novels opened last, the library and a new novel. A non-modal
 * dialog: Échap or a click elsewhere closes it, and the focus goes back to
 * the text.
 */
export function NovelSheet({
  ctx,
  renaming: renamingAtStart = false,
  onClose,
}: {
  readonly ctx: WorkspaceContext;
  readonly renaming?: boolean;
  readonly onClose: (backToText: boolean) => void;
}) {
  const { t } = useTranslation();
  const meta = useDocSnapshot(ctx.root, readProjectMeta);
  const title = meta?.title ?? '';
  const [renaming, setRenaming] = useState(renamingAtStart);
  const [others, setOthers] = useState<readonly ProjectSummary[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    let live = true;
    ctx.platform.library.list().then(
      (all) => {
        if (live)
          setOthers(
            all
              .filter((p) => p.id !== ctx.projectId)
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .slice(0, OTHERS),
          );
      },
      () => live && setOthers([]),
    );
    return () => {
      live = false;
    };
  }, [ctx.platform, ctx.projectId]);

  // A click elsewhere closes the sheet (the button toggles it itself).
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      const target = event.target as Element;
      if (ref.current?.contains(target) || target.closest?.('.ch-novel')) return;
      close.current(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, []);

  // The first focus: the first novel of the list (else the library), or the field.
  useEffect(() => {
    if (renaming || others === null) return;
    ref.current?.querySelector<HTMLElement>('.ch-novel-other, .ch-novel-actions .ch-btn')?.focus();
  }, [others, renaming]);

  const chapters = ctx.outline.length;
  const scenes = ctx.outline.reduce((n, c) => n + c.scenes.length, 0);
  const words = [...ctx.sceneWords.values()].reduce((a, b) => a + b, 0);
  const number = new Intl.NumberFormat(ctx.language);
  const stats = [
    t(meta?.kind === 'short-story' ? 'novel.shortStory' : 'novel.novel'),
    t('overview.chapters', { count: chapters }),
    t('overview.scenes', { count: scenes }),
    t('overview.words', { count: words, formatted: number.format(words) }),
  ].join(' · ');

  const rows = () => [...(ref.current?.querySelectorAll<HTMLElement>('[data-novel-row]') ?? [])];
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    if (event.key === 'Escape') {
      handled();
      if (renaming) setRenaming(false);
      else onClose(true);
      return;
    }
    if (renaming) return;
    const key = event.key.toLowerCase();
    if (key === 'r' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      handled();
      setRenaming(true);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      handled();
      const all = rows();
      const at = all.indexOf(document.activeElement as HTMLElement);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      all[at < 0 ? 0 : (at + step + all.length) % all.length]?.focus();
    }
  };

  return (
    <div
      ref={ref}
      className="ch-novel-sheet ch-raised"
      role="dialog"
      aria-label={t('novel.sheet')}
      onKeyDown={onKeyDown}
    >
      {renaming ? (
        <RenameField
          title={title}
          onDone={(next) => {
            setRenaming(false);
            if (next) void renameProjectEverywhere(ctx.platform, ctx.projectId, next, ctx.root);
            requestAnimationFrame(() =>
              ref.current?.querySelector<HTMLElement>('.ch-novel-rename-button')?.focus(),
            );
          }}
        />
      ) : (
        <>
          <div className="ch-novel-head">
            <h2>{title}</h2>
            <button
              type="button"
              className="ch-btn ch-novel-rename-button"
              data-novel-row
              onClick={() => setRenaming(true)}
            >
              {t('novel.rename')}
              <kbd>{t('novel.renameKey')}</kbd>
            </button>
            <CloseButton purpose="generic" onClose={() => onClose(true)} />
          </div>
          <p className="ch-novel-stats">{stats}</p>
        </>
      )}
      <div className="ch-novel-rule" />
      <p className="ch-label">{t('novel.others')}</p>
      {others?.length === 0 && <p className="ch-novel-alone">{t('novel.alone')}</p>}
      {others?.map((p) => (
        <button
          key={p.id}
          type="button"
          className="ch-novel-other"
          data-novel-row
          onClick={() => ctx.openProject(p.id)}
        >
          <b>{p.title}</b>
          <small>{openedWhen(t, ctx.language, p.updatedAt)}</small>
        </button>
      ))}
      <div className="ch-novel-actions">
        <button type="button" className="ch-btn" data-novel-row onClick={() => ctx.openLibrary()}>
          {t('novel.all')}
          {ctx.shortcutLabel('openLibrary') && <kbd>{ctx.shortcutLabel('openLibrary')}</kbd>}
        </button>
        <button
          type="button"
          className="ch-btn"
          data-novel-row
          onClick={() => ctx.openLibrary(true)}
        >
          {t('novel.new')}
        </button>
      </div>
      {!renaming && <p className="ch-novel-hint">{t('novel.hint')}</p>}
    </div>
  );
}

/** The title as a field (the author writes): ⏎ renames, Échap cancels; an empty title is not saved. */
function RenameField({
  title,
  onDone,
}: {
  readonly title: string;
  readonly onDone: (title: string | null) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(title);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.select(), []);
  const submit = () => {
    const next = value.trim();
    onDone(next && next !== title ? next : null);
  };
  return (
    <form
      className="ch-novel-renaming"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <input
        ref={input}
        value={value}
        aria-label={t('novel.titleField')}
        onChange={(event) => setValue(event.target.value)}
      />
      <div className="ch-novel-renaming-foot">
        <button type="submit" className="ch-btn is-author is-lit" disabled={!value.trim()}>
          {t('novel.rename')}
          <kbd>⏎</kbd>
        </button>
        <button type="button" className="ch-btn" onClick={() => onDone(null)}>
          {t('novel.cancel')}
          <kbd>{t('close.key')}</kbd>
        </button>
      </div>
    </form>
  );
}
