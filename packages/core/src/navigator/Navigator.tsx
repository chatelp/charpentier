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
import { Fragment, useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import {
  formatCheckpointDate,
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
  trashChapterAndMove,
  trashSceneAndMove,
} from '../commands/workspace-commands';
import type { WorkspaceContext } from '../workspace/workspace-context';
import './navigator.css';
import { useHostWords } from '../app/host-words';

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
  /** False while the palette is open on top: focus comes back when it closes. */
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

  const focused =
    items.find((i) => i.id === focusedId) ?? items.find((i) => i.id === ctx.sceneId) ?? items[0];

  useEffect(() => {
    if (active && focused) elements.current.get(focused.id)?.focus();
  }, [active, focused, focusTick]);

  const focusItem = (id: string | undefined) => {
    if (!id) return;
    setFocusedId(id);
    setFocusTick((n) => n + 1);
  };

  const neighbourId = (item: Item) => {
    const index = items.findIndex((i) => i.id === item.id);
    return (items[index + 1] ?? items[index - 1])?.id;
  };

  const openItem = (item: Item) => {
    const sceneId = item.kind === 'scene' ? item.id : outline[item.index]?.scenes[0]?.id;
    if (!sceneId) return;
    ctx.openScene(sceneId);
    onClose();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (!focused) return;
    const index = items.findIndex((i) => i.id === focused.id);
    const key = event.key;
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    if ((key === 'ArrowDown' || key === 'ArrowUp') && event.altKey) {
      handled();
      const direction = key === 'ArrowDown' ? 1 : -1;
      if (focused.kind === 'scene') moveSceneStep(ctx.root, focused.id, direction);
      else moveChapterStep(ctx.root, focused.id, direction);
      focusItem(focused.id);
    } else if (key === 'ArrowDown') {
      handled();
      focusItem(items[Math.min(index + 1, items.length - 1)]?.id);
    } else if (key === 'ArrowUp') {
      handled();
      focusItem(items[Math.max(index - 1, 0)]?.id);
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
    } else if (
      (key === 'Delete' || key === 'Backspace') &&
      (event.target as HTMLElement).closest('[data-variant]')
    ) {
      // On a variant's line the key is for the variant, never for its whole scene.
      handled();
      const line = (event.target as HTMLElement).closest<HTMLElement>('[data-variant]');
      trashVariantOfScene(ctx, line?.dataset['variant']);
      focusItem(focused.id);
    } else if (key === 'Delete' || key === 'Backspace') {
      handled();
      const next = neighbourId(focused);
      if (focused.kind === 'scene') trashSceneAndMove(ctx, focused.id);
      else trashChapterAndMove(ctx, focused.id);
      focusItem(next);
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
        picto="manuscrit"
        variant="manuscript"
        onClose={onClose}
        name={t('navigator.title')}
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
                <span className="ch-nav-meta" aria-hidden="true">
                  {dots > 0 && <span className="ch-nav-dots">{'•'.repeat(dots)}</span>}
                  {count !== undefined && count > 0 && <span>{number.format(count)}</span>}
                  {count === 0 && item.kind === 'scene' && <span>—</span>}
                  {scene && scene.variants.length > 1 && (
                    <span>{t('navigator.variantCount', { count: scene.variants.length })}</span>
                  )}
                </span>
              </li>
              {item.id === ctx.sceneId && currentScene && (
                // Variants and recent restore points of the open scene (⌥⌘V, ⌘S from the keyboard).
                <li role="none" className="ch-nav-sub">
                  {currentScene.variants.length > 1 && (
                    <>
                      <p className="ch-nav-sub-title ch-label">{t('navigator.variants')}</p>
                      {currentScene.variants.map((v, i) => (
                        <button
                          key={v.id}
                          type="button"
                          tabIndex={-1}
                          data-variant={v.id}
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
                      ))}
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
      <p className="ch-nav-hint">{t('navigator.hint', { move: `${host.key('Alt-ArrowUp')}↓` })}</p>
    </aside>
  );
}
