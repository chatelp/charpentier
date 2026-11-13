import type { LibraryFolderService, ProjectKind, ProjectSummary } from '@charpentier/platform';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlatform } from '../app/platform-context';
import { renameProjectEverywhere } from '../workspace/default-scene';
import { projectStatsPref, readProjectStats, type ProjectStats } from './project-stats';
import './library.css';

export interface LibraryProps {
  readonly currentProjectId: string | undefined;
  /** Start with the « new project » form open. */
  readonly creating?: boolean;
  readonly onOpen: (projectId: string) => void;
  readonly onClose: () => void;
}

type Row = ProjectSummary & { readonly trashed: boolean };

/**
 * The library (docs/DESIGN.md §4.9): every novel and short story of the
 * author, as cards. ↑↓ to move, ↵ to open (or restore from the trash),
 * N new novel, ⇧N new short story, R rename, ⌫ to the trash, Échap back.
 */
export function Library({ currentProjectId, creating = false, onOpen, onClose }: LibraryProps) {
  const { t, i18n } = useTranslation();
  const platform = usePlatform();
  const { library } = platform;
  const [rows, setRows] = useState<readonly Row[] | null>(null);
  const [stats, setStats] = useState<ReadonlyMap<string, ProjectStats>>(new Map());
  const [showTrash, setShowTrash] = useState(false);
  const [selectedId, setSelectedId] = useState(currentProjectId);
  const [form, setForm] = useState<
    | { mode: 'create'; title: string; kind: ProjectKind }
    | { mode: 'rename'; id: string; title: string }
    | null
  >(creating ? { mode: 'create', title: '', kind: 'novel' } : null);
  const items = useRef(new Map<string, HTMLElement>());

  const load = useCallback(async () => {
    const [live, trashed] = await Promise.all([library.list(), library.listTrashed()]);
    const found = await Promise.all(
      live.map(
        async (p) =>
          [p.id, readProjectStats(await platform.preferences.get(projectStatsPref(p.id)))] as const,
      ),
    );
    return {
      rows: [
        ...live.map((p) => ({ ...p, trashed: false })),
        ...trashed.map((p) => ({ ...p, trashed: true })),
      ],
      stats: new Map(found.filter((f): f is readonly [string, ProjectStats] => f[1] !== null)),
    };
  }, [library, platform]);
  const reload = async () => {
    const loaded = await load();
    setRows(loaded.rows);
    setStats(loaded.stats);
  };

  useEffect(() => {
    let cancelled = false;
    void load().then((loaded) => {
      if (cancelled) return;
      setRows(loaded.rows);
      setStats(loaded.stats);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const all = rows ?? [];
  const trashCount = all.filter((r) => r.trashed).length;
  const list = showTrash ? all : all.filter((r) => !r.trashed);
  const selected = list.find((r) => r.id === selectedId) ?? list[0];
  const empty = rows !== null && all.every((r) => r.trashed);

  useEffect(() => {
    if (!form && selected) items.current.get(selected.id)?.focus();
  }, [form, selected]);

  const date = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }).format(
      new Date(iso),
    );
  const number = new Intl.NumberFormat(i18n.language);
  const meta = (row: Row) => {
    if (row.trashed) return t('library.trashedOn', { date: date(row.trashedAt ?? row.updatedAt) });
    const found = stats.get(row.id);
    const today = new Date(row.updatedAt).toDateString() === new Date().toDateString();
    return [
      t(`atelier.projectKind.${row.kind}`),
      found && t('library.words', { count: found.words, formatted: number.format(found.words) }),
      found && t('library.scenes', { count: found.scenes }),
      today
        ? t(`library.openedToday.${row.kind}`)
        : t(`library.openedOn.${row.kind}`, { date: date(row.updatedAt) }),
    ]
      .filter(Boolean)
      .join(' · ');
  };

  const startCreating = (kind: ProjectKind) => setForm({ mode: 'create', title: '', kind });
  const rename = (row: Row) => setForm({ mode: 'rename', id: row.id, title: row.title });
  const trash = async (row: Row) => {
    // The open project stays open: trashing it only takes it off the list.
    await library.trash(row.id);
    await reload();
  };
  const restore = async (row: Row) => {
    await library.restore(row.id);
    await reload();
  };

  const submit = async () => {
    if (!form) return;
    const title = form.title.trim();
    if (form.mode === 'create') {
      const project = await library.create({
        title: title || t('library.untitled'),
        kind: form.kind,
      });
      setForm(null);
      onOpen(project.id);
    } else {
      if (title) await renameProjectEverywhere(platform, form.id, title);
      setForm(null);
      setSelectedId(form.id);
      await reload();
    }
  };

  const onKeyDown = async (event: KeyboardEvent<HTMLElement>) => {
    if (form || event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key;
    if (key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (key.toLowerCase() === 'n') {
      // N a novel, ⇧N a short story.
      event.preventDefault();
      startCreating(event.shiftKey ? 'short-story' : 'novel');
    }
    if (!selected || !(event.target as HTMLElement).closest('.ch-library-list')) return;
    const index = list.indexOf(selected);
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      const next =
        list[Math.max(0, Math.min(list.length - 1, index + (key === 'ArrowDown' ? 1 : -1)))];
      if (next) setSelectedId(next.id);
    } else if (key === 'Enter') {
      event.preventDefault();
      if (selected.trashed) await restore(selected);
      else onOpen(selected.id);
    } else if ((key.toLowerCase() === 'r' || key === 'F2') && !selected.trashed) {
      event.preventDefault();
      rename(selected);
    } else if ((key === 'Delete' || key === 'Backspace') && !selected.trashed) {
      event.preventDefault();
      await trash(selected);
    }
  };

  const onFormKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      setForm(null);
    } else if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      void submit();
    }
  };

  const newButtons = (
    <>
      <button type="button" className="ch-btn is-author" onClick={() => startCreating('novel')}>
        {t('library.newNovel')} <kbd>{t('library.newNovelKey')}</kbd>
      </button>
      <button type="button" className="ch-btn" onClick={() => startCreating('short-story')}>
        {t('library.newStory')} <kbd>{t('library.newStoryKey')}</kbd>
      </button>
    </>
  );

  return (
    <section
      className="ch-library"
      aria-label={t('library.label')}
      onKeyDown={(e) => void onKeyDown(e)}
    >
      <div className="ch-library-top">
        <h1 className="ch-library-title">{t('library.label')}</h1>
        {newButtons}
      </div>
      <p className="ch-library-sub">{t('library.hint')}</p>

      {form?.mode === 'create' && (
        <div
          className="ch-library-form ch-raised"
          role="group"
          aria-label={t('library.new')}
          onKeyDown={onFormKeyDown}
        >
          <input
            className="ch-field"
            autoFocus
            value={form.title}
            placeholder={t('library.titlePlaceholder')}
            aria-label={t('library.titlePlaceholder')}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <div className="ch-seg" role="radiogroup" aria-label={t('library.kind')}>
            {(['novel', 'short-story'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={form.kind === kind}
                className={form.kind === kind ? 'is-on' : undefined}
                onClick={() => setForm({ ...form, kind })}
              >
                {t(`atelier.projectKind.${kind}`)}
              </button>
            ))}
          </div>
          <button type="button" className="ch-btn" onClick={() => void submit()}>
            {t('library.create')} <kbd>{t('library.enterKey')}</kbd>
          </button>
        </div>
      )}

      {empty && !form && (
        <div className="ch-library-empty">
          <p>{t('library.empty')}</p>
          <p className="ch-library-empty-actions">{newButtons}</p>
        </div>
      )}

      <ul className="ch-library-list" role="listbox" aria-label={t('library.projects')}>
        {list.map((row, i) => {
          const isSelected = row.id === selected?.id;
          return (
            <li
              key={row.id}
              ref={(el) => {
                if (el) items.current.set(row.id, el);
                else items.current.delete(row.id);
              }}
              role="option"
              aria-selected={isSelected}
              aria-current={row.id === currentProjectId ? 'true' : undefined}
              tabIndex={isSelected ? 0 : -1}
              className={['ch-library-item', row.trashed && 'is-trashed'].filter(Boolean).join(' ')}
              onClick={() => setSelectedId(row.id)}
              onDoubleClick={() => !row.trashed && onOpen(row.id)}
            >
              {row.trashed && !list[i - 1]?.trashed && (
                <span className="ch-library-group ch-label">{t('library.trash')}</span>
              )}
              {form?.mode === 'rename' && form.id === row.id ? (
                <input
                  className="ch-field"
                  autoFocus
                  value={form.title}
                  aria-label={t('library.titlePlaceholder')}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  onKeyDown={onFormKeyDown}
                  onBlur={() => setForm(null)}
                />
              ) : (
                <span className="ch-library-name">{row.title}</span>
              )}
              <span className="ch-library-meta">{meta(row)}</span>
              <span className="ch-library-actions">
                {row.trashed ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    className="ch-btn"
                    onClick={() => void restore(row)}
                  >
                    {t('library.restore')} <kbd>{t('library.enterKey')}</kbd>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      tabIndex={-1}
                      className="ch-btn is-author"
                      onClick={() => onOpen(row.id)}
                    >
                      {t('library.open')} <kbd>{t('library.enterKey')}</kbd>
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      className="ch-btn"
                      onClick={() => rename(row)}
                    >
                      {t('library.rename')} <kbd>{t('library.renameKey')}</kbd>
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      className="ch-btn"
                      onClick={() => void trash(row)}
                    >
                      {t('library.toTrash')} <kbd>{t('library.toTrashKey')}</kbd>
                    </button>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <footer className="ch-library-foot">
        {trashCount > 0 && (
          <button
            type="button"
            className="ch-link"
            aria-pressed={showTrash}
            onClick={() => setShowTrash((shown) => !shown)}
          >
            {showTrash ? t('library.hideTrash') : t('library.showTrash', { count: trashCount })}
          </button>
        )}
        {platform.libraryFolder && <LibraryFolder service={platform.libraryFolder} />}
      </footer>
    </section>
  );
}

/** Where the projects are on disk (desktop), with the way to change it. */
function LibraryFolder({ service }: { readonly service: LibraryFolderService }) {
  const { t } = useTranslation();
  const [folder, setFolder] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    void service.current().then((current) => !cancelled && setFolder(current));
    return () => {
      cancelled = true;
    };
  }, [service]);
  return (
    <span className="ch-library-folder">
      {t('library.folder', { folder: folder ?? '' })}
      {' · '}
      <button type="button" className="ch-link" onClick={() => void service.choose()}>
        {t('library.chooseFolder')}
      </button>
      {' · '}
      <button type="button" className="ch-link" onClick={() => void service.reveal()}>
        {t('library.revealFolder')}
      </button>
    </span>
  );
}
