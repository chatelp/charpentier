import {
  acceptProposal,
  knownByField,
  readFieldRef,
  reconsiderEntity,
  rejectEntity,
  validateEntity,
  type EntityInfo,
  type EntityModule,
  type FieldState,
  type OutlineChapter,
} from '@charpentier/schema';
import { firstEvidenceScene } from './atelier-data';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { filterByQuery } from '../commands/registry';
import { useDocSnapshot } from '../hooks/use-doc-snapshot';
import type { WorkspaceContext } from '../workspace/workspace-context';
import {
  conflictFor,
  fieldRefOf,
  fieldState,
  pendingCount,
  RAIL_SOURCES,
  readAtelier,
  sceneNumbers,
  shownValue,
  type AtelierData,
  type SheetTarget,
} from './atelier-data';
import { createEntityPrompt, trashEntityAndNotify } from './atelier-actions';
import { CommandZone, ModeSwitch } from '../workspace/EntryPoints';
import { playSound } from '../sound/sounds';
import { Medallion, Monogram, type PictogramName } from '../icons/Pictogram';
import { FieldRow } from './FieldRow';
import { ATELIER_MODULES, moduleDefs, type AtelierModule, type FieldDef } from './module-defs';
import './atelier.css';

export interface AtelierLocation {
  readonly rail: AtelierModule;
  readonly target?: SheetTarget;
}

export interface AtelierProps {
  readonly ctx: WorkspaceContext;
  readonly location: AtelierLocation;
  /** False while the command line is open on top: focus comes back when it closes. */
  readonly active: boolean;
  /** Bumped to put the focus back on the list (⌘E, ⌘1…5). */
  readonly focusRequest: number;
  /** `focus`: put the focus on the selected entry once shown (after a creation). */
  readonly onLocation: (location: AtelierLocation, focus?: boolean) => void;
  readonly onWrite: () => void;
}

interface Entry {
  readonly key: string;
  readonly target: SheetTarget;
  readonly title: string;
  readonly subtitle?: string;
  readonly proposed: boolean;
  /** Rejected by the author, listed only with « Afficher les rejets ». */
  readonly rejected?: boolean;
  readonly group?: string;
}

const asText = (v: unknown) => (typeof v === 'string' ? v : '');

const FOCUSABLE = '[data-atl-focus]';

function focusWithin(ref: RefObject<HTMLElement | null>, selector = FOCUSABLE) {
  const container = ref.current;
  const target =
    container?.querySelector<HTMLElement>(`${selector}[aria-selected="true"]`) ??
    container?.querySelector<HTMLElement>(selector);
  target?.focus();
}

/** Moves the focus to the previous or next element matching `selector` in `container`. */
function moveFocus(container: HTMLElement | null, selector: string, step: 1 | -1) {
  if (!container) return;
  const items = [...container.querySelectorAll<HTMLElement>(selector)];
  const index = items.findIndex((el) => el === document.activeElement);
  items[Math.max(0, Math.min(items.length - 1, index + step))]?.focus();
}

/** The pictogram of each module in the rail (docs/DESIGN.md §4.11). */
const RAIL_PICTOS: Record<AtelierModule, PictogramName> = {
  meta: 'meta',
  characters: 'personnages',
  structure: 'structure',
  worldRules: 'regles',
  clues: 'indices',
};

/** The « + New » buttons under the filter, by rail (docs/DESIGN.md §4.5). */
const NEW_ENTRY: Record<AtelierModule, readonly EntityModule[]> = {
  meta: [],
  characters: ['characters'],
  structure: ['acts', 'arcs'],
  worldRules: ['worldRules'],
  clues: ['clues'],
};

/**
 * The Atelier (docs/DESIGN.md §4.5): rail of modules, list of entries, sheet.
 * Everything is reachable from the keyboard; Échap goes back to the text.
 */
export function Atelier({
  ctx,
  location,
  active,
  focusRequest,
  onLocation,
  onWrite,
}: AtelierProps) {
  const { t } = useTranslation();
  const data = useDocSnapshot(ctx.root, readAtelier);
  const numbers = useMemo(() => sceneNumbers(ctx.outline), [ctx.outline]);
  const [query, setQuery] = useState('');
  const railRef = useRef<HTMLUListElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const showRejected = ctx.prefs.showRejected;
  const toggleRejected = () => ctx.updatePrefs((p) => ({ showRejected: !p.showRejected }));
  const entries = useEntries(data, location.rail, numbers, showRejected);
  const rejectedEntries = RAIL_SOURCES[location.rail].reduce(
    (n, m) => n + (data.rejectedEntities[m as EntityModule]?.length ?? 0),
    0,
  );
  const hasList = location.rail !== 'meta';
  const shown = filterByQuery(entries, query, (e) => `${e.title} ${e.subtitle ?? ''}`);
  const selected =
    entries.find(
      (e) =>
        e.target.module === location.target?.module &&
        e.target.entityId === location.target.entityId,
    ) ?? entries[0];

  const select = (entry: Entry | undefined) =>
    entry && onLocation({ rail: location.rail, target: entry.target });

  // Focus: on the list (or the sheet when there is none) when asked.
  useEffect(() => {
    if (!active) return;
    if (hasList && selected) focusWithin(listRef);
    else if (hasList) focusWithin(railRef);
    else sheetRef.current?.querySelector<HTMLElement>('[data-field-value]')?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when asked
  }, [focusRequest]);

  const onRootKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented) return;
    const typing =
      event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
    if (event.key === 'Escape') {
      event.preventDefault();
      onWrite();
    } else if (event.key === 'X' && event.shiftKey && !typing && !event.metaKey && !event.ctrlKey) {
      // ⇧X: show or hide the rejections (docs/DESIGN.md §4.5).
      event.preventDefault();
      toggleRejected();
    } else if (
      event.key.toLowerCase() === 'n' &&
      !typing &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !(event.target instanceof HTMLElement && event.target.hasAttribute('data-field-value'))
    ) {
      // N: a new entry, from the rail or the list.
      const module = newEntityModule(location.rail, selected);
      if (!module) return;
      event.preventDefault();
      createEntityPrompt(ctx, module, (id) =>
        onLocation({ rail: location.rail, target: { module, entityId: id } }, true),
      );
    }
  };

  const onRailKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const index = ATELIER_MODULES.indexOf(location.rail);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next =
        ATELIER_MODULES[
          Math.max(
            0,
            Math.min(ATELIER_MODULES.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)),
          )
        ];
      if (next) {
        onLocation({ rail: next });
        setQuery('');
        setTimeout(() => focusWithin(railRef));
      }
    } else if (event.key === 'Enter' || event.key === 'ArrowRight') {
      event.preventDefault();
      if (hasList) focusWithin(listRef);
      else sheetRef.current?.querySelector<HTMLElement>('[data-field-value]')?.focus();
    }
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const index = shown.findIndex((e) => e.key === selected?.key);
    const key = event.key;
    const entity = selected?.target.entityId;
    const module = selected?.target.module as EntityModule;
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      const next =
        shown[Math.max(0, Math.min(shown.length - 1, index + (key === 'ArrowDown' ? 1 : -1)))];
      select(next);
      setTimeout(() => focusWithin(listRef));
    } else if (key === 'Enter' || key === 'ArrowRight') {
      event.preventDefault();
      sheetRef.current?.querySelector<HTMLElement>('[data-field-value]')?.focus();
    } else if (key === 'ArrowLeft') {
      event.preventDefault();
      focusWithin(railRef);
    } else if (key === '/') {
      event.preventDefault();
      listRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    } else if ((key === 'Delete' || key === 'Backspace') && entity) {
      event.preventDefault();
      const next = shown[index + 1] ?? shown[index - 1];
      trashEntityAndNotify(ctx, module, entity, selected.title);
      select(next);
    } else if (event.shiftKey) {
      return;
    } else if (key.toLowerCase() === 'v' && entity && selected.proposed) {
      event.preventDefault();
      playSound('click');
      validateEntity(ctx.root, module, entity);
      // Taken with its name; its other fields wait for the author, one by one.
      const def = moduleDefs[module];
      if (def.kind === 'entity') {
        const titleRef = { module, entityId: entity, field: def.titleField } as const;
        if (readFieldRef(ctx.root, titleRef).status === 'proposed')
          acceptProposal(ctx.root, titleRef);
      }
    } else if (key.toLowerCase() === 'x' && entity && selected.proposed) {
      event.preventDefault();
      playSound('toc');
      rejectEntity(ctx.root, module, entity);
    }
  };

  const onSheetKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLElement) || !event.target.hasAttribute('data-field-value'))
      return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveFocus(sheetRef.current, '[data-field-value]', event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusWithin(hasList ? listRef : railRef);
    }
  };

  return (
    <section className="ch-atelier" aria-label={t('atelier.label')} onKeyDown={onRootKeyDown}>
      <nav className="ch-atl-rail ch-raised ch-tool">
        <ModeSwitch
          view="atelier"
          className="is-inline"
          shortcut={ctx.shortcutLabel('toggleAtelier')}
          onWrite={onWrite}
          onAtelier={() => focusWithin(railRef)}
        />
        <ul
          ref={railRef}
          className="ch-atl-modules"
          role="listbox"
          aria-label={t('atelier.modulesLabel')}
          onKeyDown={onRailKeyDown}
        >
          {ATELIER_MODULES.map((m) => {
            const pending = pendingCount(data, m);
            return (
              <li
                key={m}
                role="option"
                aria-selected={m === location.rail}
                tabIndex={m === location.rail ? 0 : -1}
                data-atl-focus=""
                className="ch-atl-module"
                onClick={() => {
                  onLocation({ rail: m });
                  setQuery('');
                }}
              >
                <Medallion name={RAIL_PICTOS[m]} size={30} active={m === location.rail} />
                <span className="ch-atl-module-name">{t(`atelier.modules.${m}`)}</span>
                {pending > 0 && <span className="ch-atl-count">{pending}</span>}
              </li>
            );
          })}
        </ul>
        <div className="ch-atl-rail-foot">
          <CommandZone
            inline
            shortcut={ctx.shortcutLabel('openPalette')}
            onOpen={() => ctx.openPalette()}
          />
        </div>
        <p className="ch-atl-hint">
          {t('atelier.railHint', {
            toggle: ctx.shortcutLabel('toggleAtelier') ?? '',
            // ⌘1 or ⌥⌘1 (where a browser keeps ⌘1…9) → ⌘1…5
            modules: `${ctx.shortcutLabel('atelierMeta') ?? ''}…${ATELIER_MODULES.length}`,
          })}
        </p>
      </nav>

      {hasList && (
        <div ref={listRef} className="ch-atl-list ch-raised ch-tool" onKeyDown={onListKeyDown}>
          <div className="ch-filter">
            <input
              className="ch-field"
              value={query}
              placeholder={t('atelier.filter')}
              aria-label={t('atelier.filter')}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'Enter') {
                  e.preventDefault();
                  select(shown[0]);
                  setTimeout(() => focusWithin(listRef));
                } else if (e.key === 'Escape' && query) {
                  e.preventDefault();
                  setQuery('');
                }
              }}
            />
            <kbd className="ch-filter-key">{t('atelier.filterKey')}</kbd>
          </div>
          {NEW_ENTRY[location.rail].map((module) => (
            <button
              key={module}
              type="button"
              className="ch-btn ch-atl-new"
              title={t('atelier.newKeyHint')}
              onClick={() =>
                createEntityPrompt(ctx, module, (id) =>
                  onLocation({ rail: location.rail, target: { module, entityId: id } }, true),
                )
              }
            >
              {t(`atelier.newEntry.${module}`)}
            </button>
          ))}
          {entries.length === 0 && (
            <p className="ch-atl-empty">{t(`atelier.emptyList.${location.rail}`)}</p>
          )}
          <ul
            className="ch-atl-entries"
            role="listbox"
            aria-label={t(`atelier.modules.${location.rail}`)}
          >
            {shown.map((entry, i) => (
              <EntryItem
                key={entry.key}
                entry={entry}
                showGroup={entry.group !== undefined && entry.group !== shown[i - 1]?.group}
                selected={entry.key === selected?.key}
                onSelect={() => select(entry)}
                onReconsider={() => {
                  const { module: m, entityId } = entry.target;
                  if (!entityId) return;
                  playSound('click');
                  reconsiderEntity(ctx.root, m as EntityModule, entityId);
                }}
              />
            ))}
          </ul>
          {!showRejected && rejectedEntries > 0 && (
            <p className="ch-atl-rejected">
              {t('atelier.rejectedEntries', { count: rejectedEntries })}
              {' · '}
              <button type="button" className="ch-link" onClick={toggleRejected}>
                {t('atelier.showRejected')} <kbd>{t('atelier.legend.toggleKey')}</kbd>
              </button>
            </p>
          )}
          <p className="ch-atl-hint">{t('atelier.listHint')}</p>
        </div>
      )}

      <div ref={sheetRef} className="ch-sheet" onKeyDown={onSheetKeyDown}>
        {selected && (
          <Sheet
            ctx={ctx}
            data={data}
            target={selected.target}
            title={selected.title}
            sceneNumber={(id) => numbers.get(id)}
            onShowPassage={(sceneId) => {
              ctx.openScene(sceneId);
              onWrite();
            }}
          />
        )}
      </div>
    </section>
  );
}

function EntryItem({
  entry,
  showGroup,
  selected,
  onSelect,
  onReconsider,
}: {
  readonly entry: Entry;
  readonly showGroup: boolean;
  readonly selected: boolean;
  readonly onSelect: () => void;
  /** « Reprendre » a rejected entry: a proposal again. */
  readonly onReconsider: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {showGroup && (
        <li role="presentation" className="ch-atl-group ch-label">
          {entry.group}
        </li>
      )}
      <li
        role="option"
        aria-selected={selected}
        tabIndex={selected ? 0 : -1}
        data-atl-focus=""
        className={`ch-atl-entry${entry.proposed ? ' is-proposed' : ''}${entry.rejected ? ' is-rejected' : ''}`}
        onClick={onSelect}
      >
        <Monogram
          title={entry.title}
          size={30}
          state={selected ? 'active' : entry.proposed ? 'proposed' : 'rest'}
        />
        <span className="ch-atl-entry-text">
          <span className="ch-atl-entry-title">{entry.title}</span>
          {entry.subtitle && <span className="ch-atl-sub">{entry.subtitle}</span>}
        </span>
        {entry.rejected && (
          <button
            type="button"
            tabIndex={-1}
            className="ch-btn"
            onClick={(event) => {
              event.stopPropagation();
              onReconsider();
            }}
          >
            {t('atelier.reconsider')}
          </button>
        )}
      </li>
    </>
  );
}

/** Which entity N creates from the list of a rail entry. */
function newEntityModule(
  rail: AtelierModule,
  selected: Entry | undefined,
): EntityModule | undefined {
  if (rail === 'structure') return selected?.target.module === 'arcs' ? 'arcs' : 'acts';
  if (rail === 'meta') return undefined;
  return rail;
}

function useEntries(
  data: AtelierData,
  rail: AtelierModule,
  numbers: ReadonlyMap<string, string>,
  showRejected: boolean,
): Entry[] {
  const { t } = useTranslation();
  const entityEntries = (module: EntityModule, group?: string): Entry[] => {
    const def = moduleDefs[module];
    if (def.kind !== 'entity') return [];
    const shown = showRejected
      ? [...data.entities[module], ...data.rejectedEntities[module]]
      : data.entities[module];
    return shown.map((entity: EntityInfo) => {
      const title = asText(shownValue(entity.fields[def.titleField] ?? EMPTY));
      const subtitleRaw = def.subtitleField
        ? asText(shownValue(entity.fields[def.subtitleField] ?? EMPTY))
        : '';
      const subtitleField = def.sections
        .flatMap((s) => s.fields)
        .find((f) => f.key === def.subtitleField);
      const subtitle =
        subtitleRaw && subtitleField?.kind === 'choice'
          ? t(`atelier.options.${subtitleField.key}.${subtitleRaw}` as 'atelier.options.kind.clue')
          : subtitleRaw;
      const conflicts = data.conflicts.filter(
        (s) => s.fieldRef && 'entityId' in s.fieldRef && s.fieldRef.entityId === entity.id,
      ).length;
      const proposedIn = firstEvidenceScene(entity.fields[def.titleField]);
      const details =
        entity.status === 'rejected'
          ? [t('atelier.rejectedEntry')]
          : entity.status === 'proposed'
            ? [
                t('atelier.proposedEntry'),
                proposedIn &&
                  numbers.get(proposedIn) &&
                  t('atelier.inScene', { number: numbers.get(proposedIn) }),
              ]
            : [subtitle, conflicts > 0 && t('atelier.contradictions', { count: conflicts })];
      const line = details.filter(Boolean).join(' · ');
      return {
        key: `${module}:${entity.id}`,
        target: { module, entityId: entity.id },
        title: title || t(`atelier.untitled.${module}`),
        ...(line && { subtitle: line }),
        proposed: entity.status === 'proposed',
        ...(entity.status === 'rejected' && { rejected: true }),
        ...(group && { group }),
      };
    });
  };
  switch (rail) {
    case 'meta':
      return [
        {
          key: 'meta',
          target: { module: 'meta' },
          title: data.project?.title ?? '',
          proposed: false,
        },
      ];
    case 'structure':
      return [
        {
          key: 'structure',
          target: { module: 'structure' },
          title: t('atelier.structureModel'),
          proposed: false,
          group: t('atelier.groups.model'),
        },
        ...entityEntries('acts', t('atelier.groups.acts')),
        ...entityEntries('arcs', t('atelier.groups.arcs')),
      ];
    default:
      return entityEntries(rail);
  }
}

const EMPTY: FieldState = { status: undefined, rejected: [] };

/**
 * Scenes where a character appears (filled automatically, docs/SPEC.md §5.5):
 * those whose text names them, by full name or first name.
 */
export function appearancesOf(
  name: string,
  outline: readonly OutlineChapter[],
  texts: ReadonlyMap<string, string>,
): string[] {
  const names = [name.trim(), name.trim().split(/\s+/)[0] ?? '']
    .filter((n) => n.length > 2)
    .map(
      (n) =>
        new RegExp(`(?<![\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u'),
    );
  if (names.length === 0) return [];
  return outline
    .flatMap((c) => c.scenes.map((s) => s.id))
    .filter((id) => names.some((re) => re.test(texts.get(id) ?? '')));
}

export function Sheet({
  ctx,
  data,
  target,
  title,
  sceneNumber,
  onShowPassage,
}: {
  readonly ctx: WorkspaceContext;
  readonly data: AtelierData;
  readonly target: SheetTarget;
  readonly title: string;
  readonly sceneNumber: (sceneId: string) => string | undefined;
  readonly onShowPassage: (sceneId: string) => void;
}) {
  const { t } = useTranslation();
  const def = moduleDefs[target.module];
  const showRejected = ctx.prefs.showRejected;
  const toggleRejected = () => ctx.updatePrefs((p) => ({ showRejected: !p.showRejected }));
  const row = (
    field: FieldDef,
    label = t(`atelier.fields.${target.module}.${field.key}` as 'atelier.fields.meta.pitch'),
  ) => {
    const ref = fieldRefOf(target, field.key);
    return (
      <FieldRow
        key={field.key}
        ctx={ctx}
        fieldRef={ref}
        def={field}
        label={label}
        state={fieldState(data, target, field.key)}
        conflict={conflictFor(data, ref)}
        sceneNumber={sceneNumber}
        onShowPassage={onShowPassage}
        showRejected={showRejected}
        onShowRejected={toggleRejected}
      />
    );
  };
  // What « afficher (N) » counts: the rejections in this sheet and the rejected entries of its module.
  const fieldKeys = def.sections.flatMap((s) => s.fields.map((f) => f.key));
  const rejections =
    fieldKeys.reduce((n, key) => n + fieldState(data, target, key).rejected.length, 0) +
    (data.rejectedEntities[target.module as EntityModule]?.length ?? 0);
  const characters = data.entities.characters;
  const appearances =
    target.module === 'characters' ? appearancesOf(title, ctx.outline, ctx.sceneTexts) : [];
  const occupation =
    target.module === 'characters'
      ? asText(shownValue(fieldState(data, target, 'occupation')))
      : '';
  const lead =
    target.module === 'meta'
      ? t(`atelier.projectKind.${data.project?.kind ?? 'novel'}`)
      : target.module === 'characters'
        ? [
            t('atelier.lead.characters'),
            occupation,
            appearances.length > 0 && t('atelier.sceneCount', { count: appearances.length }),
          ]
            .filter(Boolean)
            .join(' · ')
        : t(`atelier.lead.${target.module}`);

  return (
    <article className="ch-sheet-body" aria-label={title}>
      <div className="ch-sheet-head">
        <Monogram title={title} size={62} />
        <h2 className="ch-sheet-title">{title}</h2>
      </div>
      <p className="ch-sheet-lead">{lead}</p>
      <p className="ch-legend">
        <span aria-hidden="true">
          <i className="is-proposed" />
          {t('atelier.legend.proposed')}
        </span>
        <span aria-hidden="true">
          <i className="is-validated" />
          {t('atelier.legend.validated')}
        </span>
        {/* « Afficher les rejets »: the legend's rejected sample is the switch (⇧X), when there is any. */}
        {rejections === 0 && !showRejected ? (
          <span aria-hidden="true">
            <i className="is-rejected" />
            {t('atelier.legend.rejected')}
          </span>
        ) : (
          <button
            type="button"
            className="ch-legend-toggle"
            aria-pressed={showRejected}
            title={t('commands.toggleRejected')}
            onClick={toggleRejected}
          >
            <i className="is-rejected" />
            {t('atelier.legend.rejected')}
            {' · '}
            {showRejected
              ? t('atelier.legend.hide')
              : t('atelier.legend.show', { count: rejections })}{' '}
            <kbd>{t('atelier.legend.toggleKey')}</kbd>
          </button>
        )}
        <span aria-hidden="true">
          <i className="is-contradicted" />
          {t('atelier.legend.contradicted')}
        </span>
      </p>
      <div className="ch-sections">
        {def.sections.map((section) => (
          <section key={section.key} className={`ch-section${section.wide ? ' is-wide' : ''}`}>
            <h3 className="ch-label ch-engraved">
              {t(
                `atelier.sections.${target.module}.${section.key}` as 'atelier.sections.meta.story',
              )}
            </h3>
            {section.fields.map((f) => row(f))}
          </section>
        ))}
        {target.module === 'clues' && (
          <section className="ch-section is-wide">
            <h3 className="ch-label ch-engraved">{t('atelier.sections.clues.knownBy')}</h3>
            <p className="ch-section-note">{t('atelier.knownByNote')}</p>
            {row({ key: knownByField('reader'), kind: 'scene' }, t('atelier.reader'))}
            {characters.map((c) =>
              row(
                { key: knownByField(c.id), kind: 'scene' },
                asText(shownValue(c.fields['name'] ?? EMPTY)) || t('atelier.untitled.characters'),
              ),
            )}
          </section>
        )}
        {target.module === 'characters' && (
          <section className="ch-section is-wide">
            <h3 className="ch-label ch-engraved">
              {t('atelier.sections.characters.appearances')}{' '}
              <span className="ch-section-aside">{t('atelier.appearancesNote')}</span>
            </h3>
            {appearances.length === 0 ? (
              <p className="ch-section-note">{t('atelier.noAppearance')}</p>
            ) : (
              <p className="ch-chips">
                {appearances.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className="ch-chip"
                    onClick={() => onShowPassage(id)}
                  >
                    {sceneNumber(id)}
                  </button>
                ))}
              </p>
            )}
          </section>
        )}
      </div>
    </article>
  );
}
