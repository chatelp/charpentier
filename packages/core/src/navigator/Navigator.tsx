import {
  activeVersionId,
  listScenesOutOfVersion,
  MAIN_VERSION,
  sceneIsCommon,
  setSceneInVersion,
  moveChapter,
  moveChapterStep,
  moveScene,
  moveSceneStep,
  listCheckpoints,
  setActiveVariant,
  type OutlineChapter,
  type Signal,
  readProjectMeta,
} from '@charpentier/schema';
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import {
  formatCheckpointDate,
  promptRenameVariant,
  trashVariantOfScene,
  variantLabel,
} from '../commands/variant-commands';
import { useDocSnapshot } from '../hooks/use-doc-snapshot';
import { variantLetter } from '../workspace/SceneChrome';
import { useActiveVersionName } from '../workspace/NovelTitle';
import { toRoman } from '../workspace/roman';

import { useTranslation } from 'react-i18next';
import { PanelTitle } from '../icons/Pictogram';
import * as Y from 'yjs';
import {
  newChapterAt,
  newSceneAfter,
  promptRenameChapter,
  promptRenameScene,
  askTrashChapter,
  askTrashScene,
  trashArmId,
} from '../commands/workspace-commands';
import type { WorkspaceContext } from '../workspace/workspace-context';
import './navigator.css';
import { useHostWords } from '../app/host-words';
import { MoreButton } from '../menu/MoreButton';
import { TrashFoot } from '../trash/TrashFoot';
import { manuscriptTrash } from '../trash/manuscript-trash';
import type { ThingMenu } from '../menu/thing-menu';
import {
  chapterMenu,
  DRAWER_KEYS,
  manuscriptMenu,
  sceneMenu,
  trashKeyFrom,
  variantMenu,
  type DrawerHands,
} from './navigator-menus';

type Item =
  | {
      readonly kind: 'chapter';
      readonly id: string;
      readonly title: string;
      readonly index: number;
    }
  | {
      readonly kind: 'scene';
      readonly id: string;
      readonly title: string;
      readonly chapterId: string;
      readonly index: number;
    };

export interface NavigatorProps {
  readonly ctx: WorkspaceContext;
  readonly outline: readonly OutlineChapter[];
  /** False while the palette or a thing's menu is open on top: focus comes back when it closes. */
  readonly active: boolean;
  readonly onClose: () => void;
  /** Open remarks of the Compagnon (dots next to their scenes). */
  readonly signals: readonly Signal[];
}

const noHistory = new Y.Doc();
const readCheckpoints = (doc: Y.Doc) => listCheckpoints(doc);

function flatten(outline: readonly OutlineChapter[]): Item[] {
  return outline.flatMap((c, ci) => [
    { kind: 'chapter' as const, id: c.id, title: c.title, index: ci },
    ...c.scenes.map((s, si) => ({
      kind: 'scene' as const,
      id: s.id,
      title: s.title,
      chapterId: c.id,
      index: si,
    })),
  ]);
}

/** The lines ↑ ↓ walk: chapters, scenes, and the variants of the open scene under it. */
const LINE = '[role="treeitem"], .ch-nav-variant';
const linesOf = (list: HTMLElement) => [...list.querySelectorAll<HTMLElement>(LINE)];

/**
 * Outline of the manuscript: chapters and scenes. Fully usable from the
 * keyboard (↑↓, ↵, ⌥↑↓, R, N, ⇧N, ⌫, Échap) and by drag and drop.
 */
export function Navigator({ ctx, outline, active, onClose, signals }: NavigatorProps) {
  const { t } = useTranslation();
  const host = useHostWords();
  const items = flatten(outline);
  const [focusedId, setFocusedId] = useState(ctx.sceneId);
  const [focusTick, setFocusTick] = useState(0);
  const [dragged, setDragged] = useState<Item | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // Working versions (DESIGN 1.20): the version's own scenes say so; the others wait below.
  const versionName = useActiveVersionName(ctx.root);
  const activeVersion = activeVersionId(ctx.root);
  const outOfVersion = versionName ? listScenesOutOfVersion(ctx.root) : [];
  const [showOut, setShowOut] = useState(false);
  const elements = useRef(new Map<string, HTMLLIElement>());
  const tree = useRef<HTMLUListElement>(null);

  const focused =
    items.find((i) => i.id === focusedId) ?? items.find((i) => i.id === ctx.sceneId) ?? items[0];

  // The last request of `focusItem` answered: a key that moves the focus is one.
  const answered = useRef(-1);
  useEffect(() => {
    if (!active || !focused) return;
    const asked = answered.current !== focusTick;
    answered.current = focusTick;
    // A variant's line that holds the focus keeps it until a key moves it: there, the keys
    // are the variant's (docs/DESIGN.md §5.0, rule 6).
    // (So does a line of the trash at the foot.)
    if (!asked && document.activeElement?.closest('[data-variant], .ch-trash-foot')) return;
    elements.current.get(focused.id)?.focus();
  }, [active, focused, focusTick]);

  const focusItem = (id: string | undefined) => {
    if (!id) return;
    setFocusedId(id);
    setFocusTick((n) => n + 1);
  };

  /** A line of the drawer: a variant's holds the focus itself, the others take it by their id. */
  const focusLine = (line: HTMLElement | undefined) => {
    const item = [...elements.current].find(([, element]) => element === line);
    if (item) focusItem(item[0]);
    else line?.focus();
  };

  const neighbourId = (item: Item) => {
    const index = items.findIndex((i) => i.id === item.id);
    return (items[index + 1] ?? items[index - 1])?.id;
  };

  const openScene = (sceneId: string) => {
    ctx.openScene(sceneId);
    onClose();
  };
  const openItem = (item: Item) => {
    const sceneId = item.kind === 'scene' ? item.id : outline[item.index]?.scenes[0]?.id;
    if (sceneId) openScene(sceneId);
  };

  // ─── The menu of a thing (docs/DESIGN.md §4.7) ──────────────────────────
  const hands: DrawerHands = { focus: focusItem, open: openScene };
  const menuKey = host.key(DRAWER_KEYS.menu[0]);
  /** Under the « ⋯ » of the thing's line, or at the pointer for a right click. */
  const openMenu = (
    id: string,
    build: (c: WorkspaceContext) => ThingMenu | null,
    line: HTMLElement | null,
    more: HTMLElement | null | undefined,
    pointer?: { readonly x: number; readonly y: number },
  ) => {
    const anchor = pointer
      ? ({ kind: 'point', ...pointer } as const)
      : more && ({ kind: 'button', element: more } as const);
    if (anchor) ctx.openMenu({ id, anchor, surface: 'tool', line, build });
  };
  const menuOfItem = (item: Item) =>
    item.kind === 'scene'
      ? (c: WorkspaceContext) => sceneMenu(c, item.id, hands)
      : (c: WorkspaceContext) => chapterMenu(c, item.id, hands);
  const openItemMenu = (item: Item, pointer?: { x: number; y: number }) => {
    const line = elements.current.get(item.id) ?? null;
    openMenu(
      `${item.kind}:${item.id}`,
      menuOfItem(item),
      line,
      line?.querySelector<HTMLElement>('.ch-more'),
      pointer,
    );
  };
  /** `line`: the variant's line, its button (which takes the focus back) and its « ⋯ ». */
  const openVariantMenu = (
    variantId: string,
    line: HTMLElement,
    pointer?: { x: number; y: number },
  ) =>
    openMenu(
      `variant:${variantId}`,
      (c) => variantMenu(c, variantId, hands),
      line.querySelector<HTMLElement>('.ch-nav-variant'),
      line.querySelector<HTMLElement>('.ch-more'),
      pointer,
    );
  const title = useRef<HTMLDivElement>(null);
  const openManuscriptMenu = (pointer?: { x: number; y: number }) => {
    const focusedId = focused?.id ?? ctx.sceneId;
    openMenu(
      'manuscript',
      (c) => manuscriptMenu(c, focusedId, hands),
      elements.current.get(focusedId) ?? null,
      title.current?.querySelector<HTMLElement>('.ch-more'),
      pointer,
    );
  };
  /**
   * A right click (Ctrl-click on a Mac) opens the thing's menu at the pointer, never the
   * browser's; the menu key of a keyboard opens it under the « ⋯ », as `M` does.
   */
  const onMenuGesture = (event: MouseEvent, open: (pointer?: { x: number; y: number }) => void) => {
    event.preventDefault();
    event.stopPropagation();
    const byPointer = event.button === 2 || event.ctrlKey;
    open(byPointer ? { x: event.clientX, y: event.clientY } : undefined);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (!focused) return;
    const key = event.key;
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    const letter = (wanted: string) =>
      key.toLowerCase() === wanted && !event.metaKey && !event.ctrlKey && !event.altKey;
    // On a variant's line the keys are for the variant, never for its whole scene.
    const variantLine = (event.target as HTMLElement).closest<HTMLElement>('[data-variant]');
    const variantId = variantLine?.dataset['variant'];
    if (letter('m') || (key === 'F10' && event.shiftKey)) {
      handled();
      if (variantLine && variantId) openVariantMenu(variantId, variantLine);
      else openItemMenu(focused);
    } else if (variantLine && variantId && key === 'Enter') {
      handled();
      setActiveVariant(ctx.root, ctx.sceneId, variantId);
    } else if (variantLine && variantId && (key === 'F2' || letter('r'))) {
      handled();
      promptRenameVariant(ctx, variantId);
    } else if ((key === 'ArrowDown' || key === 'ArrowUp') && event.altKey) {
      handled();
      // Moving is the scene's: not from the line of one of its variants (rule 6).
      if (variantLine) return;
      const direction = key === 'ArrowDown' ? 1 : -1;
      if (focused.kind === 'scene') moveSceneStep(ctx.root, focused.id, direction);
      else moveChapterStep(ctx.root, focused.id, direction);
      focusItem(focused.id);
    } else if ((key === 'ArrowDown' || key === 'ArrowUp') && !event.altKey) {
      handled();
      const lines = linesOf(event.currentTarget);
      const from =
        (event.target as HTMLElement).closest<HTMLElement>(LINE) ??
        elements.current.get(focused.id);
      const at = from ? lines.indexOf(from) : -1;
      const next = lines[at + (key === 'ArrowDown' ? 1 : -1)];
      // From the last line, down to the trash at the foot (DESIGN §4.7).
      const foot =
        key === 'ArrowDown' && !next
          ? event.currentTarget.parentElement?.querySelector<HTMLElement>('[data-trash-row]')
          : null;
      focusLine(foot ?? next);
    } else if (key === 'Home') {
      handled();
      focusItem(items[0]?.id);
    } else if (key === 'End') {
      handled();
      focusItem(items[items.length - 1]?.id);
    } else if (key === 'Enter') {
      handled();
      openItem(focused);
    } else if (key === 'Escape') {
      handled();
      onClose();
    } else if (key === 'F2' || (key.toLowerCase() === 'r' && !event.metaKey && !event.ctrlKey)) {
      handled();
      if (focused.kind === 'scene') promptRenameScene(ctx, focused.id);
      else promptRenameChapter(ctx, focused.id);
    } else if (key === 'N' || (key === 'n' && event.shiftKey)) {
      handled();
      const chapterIndex =
        focused.kind === 'chapter'
          ? focused.index
          : outline.findIndex((c) => c.id === focused.chapterId);
      focusItem(newChapterAt(ctx, chapterIndex + 1).sceneId);
    } else if (key === 'n' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      handled();
      const id =
        focused.kind === 'scene'
          ? newSceneAfter(ctx, focused.chapterId, focused.index + 1)
          : newSceneAfter(ctx, focused.id, outline[focused.index]?.scenes.length ?? 0);
      focusItem(id);
    } else if (
      key.toLowerCase() === 'v' &&
      focused.kind === 'scene' &&
      !event.metaKey &&
      !event.ctrlKey
    ) {
      handled();
      const scene = sceneById.get(focused.id);
      if (!scene || scene.variants.length < 2) return;
      ctx.openPalette({
        kind: 'pick',
        placeholder: t('palette.pickVariant'),
        items: scene.variants.map((v, i) => ({
          id: v.id,
          label: `${variantLetter(i)} · ${variantLabel(t, scene, v.id)}`,
          ...(v.id === scene.activeVariantId && { detail: t('palette.activeVariant') }),
        })),
        onPick: (variantId) => {
          setActiveVariant(ctx.root, scene.id, variantId);
          ctx.openScene(scene.id);
        },
      });
    } else if ((key === 'Delete' || key === 'Backspace') && event.repeat) {
      // Held down, it is one press: the next line does not go with this one.
      handled();
    } else if ((key === 'Delete' || key === 'Backspace') && variantLine) {
      handled();
      trashVariantOfScene(ctx, variantId);
      focusItem(focused.id);
    } else if (key === 'Delete' || key === 'Backspace') {
      handled();
      const next = neighbourId(focused);
      // A big piece goes at the second ⌫: the status line asks meanwhile (DESIGN §4.7).
      const from = trashKeyFrom(ctx, 'status');
      if (focused.kind === 'scene') askTrashScene(ctx, focused.id, from, () => focusItem(next));
      else askTrashChapter(ctx, focused.id, from, () => focusItem(next));
    }
  };

  // ─── Drag and drop ──────────────────────────────────────────────────────
  const onDrop = (event: DragEvent, target: Item) => {
    event.preventDefault();
    setDropTarget(null);
    if (!dragged || dragged.id === target.id) return;
    if (dragged.kind === 'scene') {
      const chapterId = target.kind === 'scene' ? target.chapterId : target.id;
      const siblings =
        outline.find((c) => c.id === chapterId)?.scenes.filter((s) => s.id !== dragged.id) ?? [];
      const index =
        target.kind === 'scene' ? siblings.findIndex((s) => s.id === target.id) : siblings.length;
      moveScene(ctx.root, dragged.id, { chapterId, index });
    } else {
      const chapterId = target.kind === 'chapter' ? target.id : target.chapterId;
      const others = outline.filter((c) => c.id !== dragged.id);
      moveChapter(
        ctx.root,
        dragged.id,
        others.findIndex((c) => c.id === chapterId),
      );
    }
    focusItem(dragged.id);
    setDragged(null);
  };

  const sceneById = new Map(outline.flatMap((c) => c.scenes).map((s) => [s.id, s]));
  const currentScene = sceneById.get(ctx.sceneId);
  const words = ctx.sceneWords;
  const number = new Intl.NumberFormat(ctx.language);
  const history = useDocSnapshot(ctx.sceneDocs?.historyDoc ?? noHistory, readCheckpoints);
  const checkpoints = history
    .filter((c) => c.variantId === currentScene?.activeVariantId)
    .slice(0, 3);

  const numberOf = (item: Item) =>
    item.kind === 'chapter' ? toRoman(item.index + 1) : String(item.index + 1);
  const wordsOf = (item: Item) =>
    item.kind === 'chapter'
      ? (outline[item.index]?.scenes ?? []).reduce((sum, s) => sum + (words.get(s.id) ?? 0), 0)
      : words.get(item.id);
  const dotsOf = (sceneId: string) =>
    Math.min(4, signals.filter((sig) => sig.textAnchor?.sceneId === sceneId).length);

  return (
    <aside className="ch-navigator ch-raised ch-tool" aria-label={t('navigator.label')}>
      <PanelTitle
        ref={title}
        picto="manuscrit"
        variant="manuscript"
        onClose={onClose}
        name={t('navigator.title')}
        // The manuscript's own menu: « ⋯ » beside the title, and the right click on it.
        onNameMenu={(event) => onMenuGesture(event, openManuscriptMenu)}
        more={
          <MoreButton
            label={t('thingMenu.actionsOf.manuscript', {
              name: readProjectMeta(ctx.root)?.title ?? '',
            })}
            open={ctx.menuOf === 'manuscript'}
            onOpen={() => openManuscriptMenu()}
          />
        }
        context={
          versionName ? (
            // A version active (DESIGN 1.20): no word count, and the novel's title is cut, not the version.
            <span className="ch-panel-title-novel-line">
              <button
                type="button"
                tabIndex={-1}
                className="ch-panel-title-novel"
                title={t('novel.buttonVersions')}
                onClick={() => ctx.toggleNovel()}
              >
                {readProjectMeta(ctx.root)?.title}
              </button>
              <span aria-hidden="true">{' · '}</span>
              <i>{versionName}</i>
            </span>
          ) : (
            <>
              {/* The novel's title opens its sheet (docs/DESIGN.md §4.8, 1.19). */}
              <button
                type="button"
                tabIndex={-1}
                className="ch-panel-title-novel"
                title={t('novel.button')}
                onClick={() => ctx.toggleNovel()}
              >
                {readProjectMeta(ctx.root)?.title}
              </button>
              {' · '}
              {t('footer.words', { count: [...words.values()].reduce((a, b) => a + b, 0) })}
            </>
          )
        }
      />
      <div className="ch-seg ch-nav-seg" role="group">
        <button type="button" tabIndex={-1} className="is-on" aria-pressed="true">
          {t('navigator.title')}
        </button>
        <button type="button" tabIndex={-1} onClick={ctx.openOverview}>
          {t('navigator.overview')} <kbd>{ctx.shortcutLabel('toggleOverview')}</kbd>
        </button>
      </div>
      <ul
        ref={tree}
        className="ch-nav-tree"
        role="tree"
        aria-label={t('navigator.label')}
        onKeyDown={onKeyDown}
      >
        {items.map((item) => {
          const count = wordsOf(item);
          const scene = item.kind === 'scene' ? sceneById.get(item.id) : undefined;
          const dots = item.kind === 'scene' ? dotsOf(item.id) : 0;
          return (
            <Fragment key={item.id}>
              <li
                ref={(el) => {
                  if (el) elements.current.set(item.id, el);
                  else elements.current.delete(item.id);
                }}
                role="treeitem"
                aria-level={item.kind === 'chapter' ? 1 : 2}
                aria-selected={item.id === focused?.id}
                aria-current={item.id === ctx.sceneId ? 'true' : undefined}
                aria-label={item.title}
                tabIndex={item.id === focused?.id ? 0 : -1}
                className={[
                  'ch-nav-item',
                  `ch-nav-${item.kind}`,
                  item.id === ctx.sceneId && 'is-current',
                  item.id === dropTarget && 'is-drop-target',
                ]
                  .filter(Boolean)
                  .join(' ')}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', item.title);
                  setDragged(item);
                }}
                onDragEnd={() => {
                  setDragged(null);
                  setDropTarget(null);
                }}
                onDragOver={(e) => {
                  if (!dragged) return;
                  e.preventDefault();
                  setDropTarget(item.id);
                }}
                onDrop={(e) => onDrop(e, item)}
                onFocus={() => setFocusedId(item.id)}
                onClick={() => openItem(item)}
                onContextMenu={(e) => onMenuGesture(e, (pointer) => openItemMenu(item, pointer))}
              >
                <span className="ch-nav-name">
                  {item.kind === 'chapter' && (
                    <span className="ch-nav-fleuron" aria-hidden="true">
                      ⁂
                    </span>
                  )}
                  {numberOf(item)} · {item.title}
                  {item.kind === 'scene' &&
                    versionName &&
                    activeVersion !== MAIN_VERSION &&
                    !sceneIsCommon(ctx.root, item.id, activeVersion) && (
                      <span className="ch-nav-own">{versionName}</span>
                    )}
                </span>
                {/* Armed from its line: its key and the seconds, in place of its words (DESIGN 1.43). */}
                {ctx.armed?.where === 'status' && ctx.armed.id === trashArmId(item.id) ? (
                  <span className="ch-nav-meta ch-nav-armed" aria-hidden="true">
                    <kbd>{ctx.armed.shortcut}</kbd>
                    <span>{t('confirm.left', { count: ctx.armed.left })}</span>
                  </span>
                ) : (
                  <span className="ch-nav-meta" aria-hidden="true">
                    {dots > 0 && <span className="ch-nav-dots">{'•'.repeat(dots)}</span>}
                    {count !== undefined && count > 0 && <span>{number.format(count)}</span>}
                    {count === 0 && item.kind === 'scene' && <span>—</span>}
                    {scene && scene.variants.length > 1 && (
                      <span>{t('navigator.variantCount', { count: scene.variants.length })}</span>
                    )}
                  </span>
                )}
                <MoreButton
                  label={t(`thingMenu.actionsOf.${item.kind}`, { name: item.title })}
                  shortcut={menuKey}
                  open={ctx.menuOf === `${item.kind}:${item.id}`}
                  onOpen={() => openItemMenu(item)}
                />
              </li>
              {item.id === ctx.sceneId && currentScene && (
                // Variants and recent restore points of the open scene (⌥⌘V, ⌘S from the keyboard).
                <li role="none" className="ch-nav-sub">
                  {currentScene.variants.length > 1 && (
                    <>
                      <p className="ch-nav-sub-title ch-label">{t('navigator.variants')}</p>
                      <ul className="ch-nav-variants" role="none">
                        {currentScene.variants.map((v, i) => (
                          <li
                            role="none"
                            key={v.id}
                            className="ch-nav-variant-line"
                            data-variant={v.id}
                            onContextMenu={(e) => {
                              const line = e.currentTarget;
                              onMenuGesture(e, (pointer) => openVariantMenu(v.id, line, pointer));
                            }}
                          >
                            <button
                              type="button"
                              tabIndex={-1}
                              className={`ch-nav-variant${v.id === currentScene.activeVariantId ? ' is-active' : ''}`}
                              onClick={() => setActiveVariant(ctx.root, currentScene.id, v.id)}
                            >
                              <span>
                                {variantLetter(i)} · {variantLabel(t, currentScene, v.id)}
                              </span>
                              <span className="ch-nav-sub-meta">
                                {v.id === currentScene.activeVariantId
                                  ? t('navigator.activeVariant')
                                  : ''}
                              </span>
                            </button>
                            <MoreButton
                              label={t('thingMenu.actionsOf.variant', {
                                name: variantLabel(t, currentScene, v.id),
                              })}
                              shortcut={menuKey}
                              open={ctx.menuOf === `variant:${v.id}`}
                              onOpen={(button) => {
                                const line = button.closest<HTMLElement>('[data-variant]');
                                if (line) openVariantMenu(v.id, line);
                              }}
                            />
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {checkpoints.length > 0 && (
                    <>
                      <p className="ch-nav-sub-title ch-label">{t('navigator.checkpoints')}</p>
                      {checkpoints.map((c) => (
                        <p key={c.id} className="ch-nav-checkpoint">
                          <span>{formatCheckpointDate(ctx, c.createdAt)}</span>
                          <span className="ch-nav-sub-meta">
                            {c.label ? `« ${c.label} »` : t(`history.reason.${c.reason}`)}
                          </span>
                        </p>
                      ))}
                    </>
                  )}
                </li>
              )}
            </Fragment>
          );
        })}
      </ul>
      {outOfVersion.length > 0 && (
        <div className="ch-nav-out">
          <p>
            {t('versions.out', { count: outOfVersion.length })}
            {' · '}
            <button type="button" className="ch-link" onClick={() => setShowOut(!showOut)}>
              {t(showOut ? 'versions.hide' : 'versions.show')}
            </button>
          </p>
          {showOut &&
            outOfVersion.map((s) => (
              <p key={s.id} className="ch-nav-out-scene">
                <span>{s.title}</span>
                <button
                  type="button"
                  className="ch-link"
                  onClick={() => {
                    setSceneInVersion(ctx.root, s.id, true);
                    ctx.openScene(s.id);
                  }}
                >
                  {t('versions.addHere')}
                </button>
              </p>
            ))}
        </div>
      )}
      <TrashFoot
        lines={manuscriptTrash(ctx)}
        listName={t('trash.list.manuscript')}
        onRestored={(line) => focusItem(line.back)}
        onLeave={() => focusLine(tree.current ? linesOf(tree.current).at(-1) : undefined)}
        onEscape={onClose}
      />
      <p className="ch-nav-hint">
        {t('navigator.hint', {
          move: `${host.key('Alt-ArrowUp')}↓`,
          chapter: host.key('Shift-n'),
        })}
      </p>
    </aside>
  );
}
