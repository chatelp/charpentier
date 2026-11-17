import type { ProjectSummary } from '@charpentier/platform';
import {
  activeVersionId,
  listVersions,
  listVersionScenes,
  MAIN_VERSION,
  readProjectMeta,
  renameVersion,
  trashVersion,
  versionOwnScenes,
  createVersion,
  type VersionInfo,
} from '@charpentier/schema';
import type * as Y from 'yjs';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useDocSnapshot } from '../hooks/use-doc-snapshot';
import {
  goToVersion,
  sceneInActiveVersion,
  spaced,
  versionLabel,
} from '../commands/version-commands';
import { CloseButton } from '../icons/CloseButton';
import { playSound } from '../sound/sounds';
import { renameProjectEverywhere } from './default-scene';
import type { WorkspaceContext } from './workspace-context';
import './novel.css';

/** How many of the other novels the sheet shows (the library holds them all). */
const OTHERS = 3;

/** The novel's working versions as the sheet and the title show them (DESIGN 1.20). */
interface VersionsView {
  readonly versions: readonly VersionInfo[];
  readonly active: string;
  /** Scenes of Principale, and each other version's own scenes. */
  readonly counts: ReadonlyMap<string, number>;
}

export function readVersionsView(doc: Y.Doc): VersionsView {
  const versions = listVersions(doc);
  return {
    versions,
    active: activeVersionId(doc),
    counts: new Map(
      versions.map((v) => [
        v.id,
        v.isMain ? listVersionScenes(doc, MAIN_VERSION).length : versionOwnScenes(doc, v.id),
      ]),
    ),
  };
}

/** The active version's name, when the novel has more than one (else nothing is said of versions). */
export function useActiveVersionName(root: Y.Doc): string | undefined {
  const { t } = useTranslation();
  const view = useDocSnapshot(root, readVersionsView);
  if (view.versions.length < 2) return undefined;
  const active = view.versions.find((v) => v.id === view.active);
  return active ? versionLabel(t, active) : undefined;
}

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
  // The active version, as soon as the novel has two (DESIGN 1.20).
  const version = useActiveVersionName(ctx.root);
  return (
    <button
      type="button"
      className={`ch-novel ch-chrome${ctx.novelOpen ? ' is-open' : ''} ${className}`}
      title={t(version ? 'novel.buttonVersions' : 'novel.button')}
      aria-label={
        version
          ? t('novel.buttonLabelVersion', { title, version })
          : t('novel.buttonLabel', { title })
      }
      aria-haspopup="dialog"
      aria-expanded={ctx.novelOpen}
      onClick={() => ctx.toggleNovel()}
    >
      <span className="ch-novel-title">
        {title}
        {version && (
          <>
            {' · '}
            <b>{version}</b>
          </>
        )}
      </span>
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
  mode = 'sheet',
  onClose,
}: {
  readonly ctx: WorkspaceContext;
  /** Opened on the title as a field, or on a new version's name. */
  readonly mode?: 'sheet' | 'renaming' | 'version';
  readonly onClose: (backToText: boolean) => void;
}) {
  const { t } = useTranslation();
  const meta = useDocSnapshot(ctx.root, readProjectMeta);
  const title = meta?.title ?? '';
  const view = useDocSnapshot(ctx.root, readVersionsView);
  const several = view.versions.length > 1;
  const activeVersion = view.versions.find((v) => v.id === view.active);
  const activeName = activeVersion ? versionLabel(t, activeVersion) : '';
  const [renaming, setRenaming] = useState(mode === 'renaming');
  // A new version's name, or a version renamed on its line.
  const [creating, setCreating] = useState(mode === 'version');
  const [renamingVersion, setRenamingVersion] = useState<string | null>(null);
  // A version's line has the focus: R and the sheet's foot speak of the version.
  const [versionFocused, setVersionFocused] = useState(false);
  const editing = renaming || creating || renamingVersion !== null;
  const focusLater = (selector: string) =>
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>(selector)?.focus());
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
    if (editing || others === null) return;
    const sheet = ref.current;
    (
      sheet?.querySelector<HTMLElement>('.ch-novel-other') ??
      sheet?.querySelector<HTMLElement>('.ch-novel-all')
    )?.focus();
    // Only when the list comes: not after each edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [others]);

  const chapters = ctx.outline.length;
  const scenes = ctx.outline.reduce((n, c) => n + c.scenes.length, 0);
  const words = [...ctx.sceneWords.values()].reduce((a, b) => a + b, 0);
  const number = new Intl.NumberFormat(ctx.language);
  const stats = [
    ...(several
      ? [t('versions.stats', { version: activeName })]
      : [
          t(meta?.kind === 'short-story' ? 'novel.shortStory' : 'novel.novel'),
          t('overview.chapters', { count: chapters }),
        ]),
    t('overview.scenes', { count: scenes }),
    t('overview.words', { count: words, formatted: number.format(words) }),
  ].join(' · ');

  const trash = (version: VersionInfo) => {
    const at = sceneInActiveVersion(ctx, ctx.sceneId);
    trashVersion(ctx.root, version.id);
    const target = sceneInActiveVersion(ctx, at ?? ctx.sceneId);
    if (target && target !== ctx.sceneId) ctx.openScene(target);
    ctx.notify(t('versions.trashed', { version: versionLabel(t, version) }));
    focusLater('.ch-novel-version.is-on');
  };

  const rows = () => [...(ref.current?.querySelectorAll<HTMLElement>('[data-novel-row]') ?? [])];
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    if (event.key === 'Escape') {
      handled();
      if (renaming) setRenaming(false);
      else if (creating) {
        setCreating(false);
        focusLater('.ch-novel-new-version');
      } else if (renamingVersion !== null) {
        focusLater(`[data-version="${renamingVersion}"]`);
        setRenamingVersion(null);
      } else onClose(true);
      return;
    }
    if (editing) return;
    const key = event.key.toLowerCase();
    // On a version's line, R and ⌫ act on the version (DESIGN 1.20); elsewhere, R renames the novel.
    const line = (event.target as HTMLElement).closest<HTMLElement>('[data-version]');
    const version = view.versions.find((v) => v.id === line?.dataset['version']);
    if (key === 'r' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      handled();
      if (version) setRenamingVersion(version.id);
      else setRenaming(true);
    } else if ((event.key === 'Backspace' || event.key === 'Delete') && version) {
      handled();
      if (!version.isMain) trash(version);
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
        <NameField
          initial={title}
          label={t('novel.titleField')}
          submit={t('novel.rename')}
          className="is-title"
          onDone={(next) => {
            setRenaming(false);
            if (next) void renameProjectEverywhere(ctx.platform, ctx.projectId, next, ctx.root);
            focusLater('.ch-novel-rename-button');
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
              {/* On a version's line, R renames the version: the key is not the title's then. */}
              {!versionFocused && <kbd>{t('novel.renameKey')}</kbd>}
            </button>
            <CloseButton purpose="generic" onClose={() => onClose(true)} />
          </div>
          <p className="ch-novel-stats">{stats}</p>
        </>
      )}
      <div className="ch-novel-rule" />
      {/* Working versions (DESIGN 1.20): only the sheet speaks of them while there is one. */}
      <p className="ch-label" title={several ? t('versions.everywhere') : undefined}>
        {t('versions.title')}
      </p>
      {several ? (
        <div className="ch-novel-versions" role="radiogroup" aria-label={t('versions.title')}>
          {view.versions.map((v) => {
            const name = versionLabel(t, v);
            if (renamingVersion === v.id)
              return (
                <NameField
                  key={v.id}
                  initial={name}
                  label={t('versions.nameField')}
                  submit={t('versions.rename')}
                  onDone={(next) => {
                    setRenamingVersion(null);
                    if (next) renameVersion(ctx.root, v.id, next);
                    focusLater(`[data-version="${v.id}"]`);
                  }}
                />
              );
            const count = view.counts.get(v.id) ?? 0;
            const note = v.isMain
              ? t('versions.scenes', { count })
              : t('versions.when', {
                  what: t('versions.own', { count }),
                  when: openedWhen(t, ctx.language, v.usedAt ?? v.createdAt),
                });
            const on = v.id === view.active;
            const go = () => {
              playSound('tic');
              goToVersion(ctx, v.id);
            };
            return (
              <div
                key={v.id}
                role="radio"
                aria-checked={on}
                tabIndex={0}
                className={`ch-novel-version${on ? ' is-on' : ''}`}
                data-novel-row
                data-version={v.id}
                onFocus={() => setVersionFocused(true)}
                onBlur={() => setVersionFocused(false)}
                onClick={go}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  event.stopPropagation();
                  go();
                }}
              >
                <b>{name}</b>
                <small>{note}</small>
                <span className="ch-novel-version-actions">
                  <button
                    type="button"
                    tabIndex={-1}
                    className="ch-btn"
                    onClick={(event) => {
                      event.stopPropagation();
                      setRenamingVersion(v.id);
                    }}
                  >
                    {t('versions.rename')}
                    <kbd>{t('versions.renameKey')}</kbd>
                  </button>
                  {!v.isMain && (
                    <button
                      type="button"
                      tabIndex={-1}
                      className="ch-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        trash(v);
                      }}
                    >
                      {t('versions.trash')}
                      <kbd>{t('versions.trashKey')}</kbd>
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="ch-novel-alone">{t('versions.single')}</p>
      )}
      {creating ? (
        <NameField
          initial=""
          label={t('versions.nameField')}
          submit={t('versions.create')}
          note={t('versions.from', {
            version: activeName || t('versions.main'),
            shortcut: spaced(ctx.shortcutLabel('newVariant')),
          })}
          onDone={(name) => {
            setCreating(false);
            if (!name) {
              focusLater('.ch-novel-new-version');
              return;
            }
            createVersion(ctx.root, name);
            ctx.notify(t('versions.switched', { version: name }));
            focusLater('.ch-novel-version.is-on');
          }}
        />
      ) : (
        <div className="ch-novel-actions">
          <button
            type="button"
            className="ch-btn ch-novel-new-version"
            data-novel-row
            onClick={() => setCreating(true)}
          >
            {t('versions.new')}
          </button>
        </div>
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
        <button
          type="button"
          className="ch-btn ch-novel-all"
          data-novel-row
          onClick={() => ctx.openLibrary()}
        >
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
      {!editing && (
        <p className="ch-novel-hint">{t(versionFocused ? 'novel.hintVersion' : 'novel.hint')}</p>
      )}
    </div>
  );
}

/**
 * A name as a field (the author writes: sunk, with the vermilion rule): ⏎
 * keeps it, Échap cancels (the sheet handles it); an empty or unchanged name
 * is not saved.
 */
function NameField({
  initial,
  label,
  submit,
  note,
  className = '',
  onDone,
}: {
  readonly initial: string;
  readonly label: string;
  readonly submit: string;
  readonly note?: string;
  readonly className?: string;
  readonly onDone: (name: string | null) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  return (
    <form
      className={`ch-novel-renaming ${className}`}
      onSubmit={(event) => {
        event.preventDefault();
        const next = value.trim();
        onDone(next && next !== initial ? next : null);
      }}
    >
      <input
        ref={input}
        value={value}
        aria-label={label}
        onChange={(event) => setValue(event.target.value)}
      />
      {note && <p className="ch-novel-renaming-note">{note}</p>}
      <div className="ch-novel-renaming-foot">
        <button type="submit" className="ch-btn is-author is-lit" disabled={!value.trim()}>
          {submit}
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
