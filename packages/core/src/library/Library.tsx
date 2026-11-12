import type { ProjectKind, ProjectSummary } from '@charpentier/platform';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlatform } from '../app/platform-context';
import { renameProjectEverywhere } from '../workspace/default-scene';
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
 * The library (phase 1.10): every novel and short story of the author.
 * ↑↓ to move, ↵ to open (or restore from the trash), N new, R rename,
 * ⌫ to the trash, Échap back to writing.
 */
export function Library({ currentProjectId, creating = false, onOpen, onClose }: LibraryProps) {
  const { t, i18n } = useTranslation();
  const { library } = usePlatform();
  const [rows, setRows] = useState<readonly Row[] | null>(null);
  const [selectedId, setSelectedId] = useState(currentProjectId);
  const [form, setForm] = useState<
    | { mode: 'create'; title: string; kind: ProjectKind }
    | { mode: 'rename'; id: string; title: string }
    | null
  >(creating ? { mode: 'create', title: '', kind: 'novel' } : null);
  const items = useRef(new Map<string, HTMLElement>());
  const platform = usePlatform();

  const reload = useCallback(async () => {
    const [live, trashed] = await Promise.all([library.list(), library.listTrashed()]);
    setRows([
      ...live.map((p) => ({ ...p, trashed: false })),
      ...trashed.map((p) => ({ ...p, trashed: true })),
    ]);
  }, [library]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([library.list(), library.listTrashed()]).then(([live, trashed]) => {
      if (!cancelled)
        setRows([
          ...live.map((p) => ({ ...p, trashed: false })),
          ...trashed.map((p) => ({ ...p, trashed: true })),
        ]);
    });
    return () => {
      cancelled = true;
    };
  }, [library]);

  const list = rows ?? [];
  const selected = list.find((r) => r.id === selectedId) ?? list[0];

  useEffect(() => {
    if (!form && selected) items.current.get(selected.id)?.focus();
  }, [form, selected]);

  const date = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso));

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

  const onListKeyDown = async (event: KeyboardEvent<HTMLUListElement>) => {
    if (!selected || event.metaKey || event.ctrlKey || event.altKey) return;
    const index = list.indexOf(selected);
    const key = event.key;
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      const next =
        list[Math.max(0, Math.min(list.length - 1, index + (key === 'ArrowDown' ? 1 : -1)))];
      if (next) setSelectedId(next.id);
    } else if (key === 'Enter') {
      event.preventDefault();
      if (selected.trashed) {
        await library.restore(selected.id);
        await reload();
      } else onOpen(selected.id);
    } else if (key.toLowerCase() === 'n') {
      event.preventDefault();
      setForm({ mode: 'create', title: '', kind: 'novel' });
    } else if ((key.toLowerCase() === 'r' || key === 'F2') && !selected.trashed) {
      event.preventDefault();
      setForm({ mode: 'rename', id: selected.id, title: selected.title });
    } else if ((key === 'Delete' || key === 'Backspace') && !selected.trashed) {
      event.preventDefault();
      // The open project stays open: trashing it only takes it off the list.
      await library.trash(selected.id);
      await reload();
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

  return (
    <section
      className="ch-library"
      aria-label={t('library.label')}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !form) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <h1 className="ch-library-title">{t('library.label')}</h1>
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

      <ul
        className="ch-library-list"
        role="listbox"
        aria-label={t('library.projects')}
        onKeyDown={(e) => void onListKeyDown(e)}
      >
        {list.map((row, i) => (
          <li
            key={row.id}
            ref={(el) => {
              if (el) items.current.set(row.id, el);
              else items.current.delete(row.id);
            }}
            role="option"
            aria-selected={row.id === selected?.id}
            aria-current={row.id === currentProjectId ? 'true' : undefined}
            tabIndex={row.id === selected?.id ? 0 : -1}
            className={[
              'ch-library-item',
              row.trashed && 'is-trashed',
              row.id === currentProjectId && 'is-current',
            ]
              .filter(Boolean)
              .join(' ')}
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
            <span className="ch-library-meta">
              {row.trashed
                ? t('library.trashedOn', { date: date(row.trashedAt ?? row.updatedAt) })
                : `${t(`atelier.projectKind.${row.kind}`)} · ${date(row.updatedAt)}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
