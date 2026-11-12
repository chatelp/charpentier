import {
  listChapters,
  moveChapter,
  moveChapterStep,
  moveScene,
  moveSceneStep,
  setActiveVariant,
  type OutlineChapter,
} from '@charpentier/schema';
import { Fragment, useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { variantLabel } from '../commands/variant-commands';
import { useTranslation } from 'react-i18next';
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
}

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
export function Navigator({ ctx, outline, active, onClose }: NavigatorProps) {
  const { t } = useTranslation();
  const items = flatten(outline);
  const [focusedId, setFocusedId] = useState(ctx.sceneId);
  const [focusTick, setFocusTick] = useState(0);
  const [dragged, setDragged] = useState<Item | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
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
      const others = listChapters(ctx.root).filter((c) => c.id !== dragged.id);
      moveChapter(
        ctx.root,
        dragged.id,
        others.findIndex((c) => c.id === chapterId),
      );
    }
    focusItem(dragged.id);
    setDragged(null);
  };

  const currentScene = outline.flatMap((c) => c.scenes).find((s) => s.id === ctx.sceneId);

  return (
    <aside className="ch-navigator ch-raised" aria-label={t('navigator.label')}>
      <h2 className="ch-nav-title ch-label">{t('navigator.title')}</h2>
      <ul
        className="ch-nav-tree"
        role="tree"
        aria-label={t('navigator.label')}
        onKeyDown={onKeyDown}
      >
        {items.map((item) => (
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
              {item.title}
            </li>
            {item.id === ctx.sceneId && currentScene && currentScene.variants.length > 1 && (
              // Mouse shortcut to the variants (⌥⌘V from the keyboard).
              <li role="none" className="ch-nav-sub">
                <p className="ch-nav-sub-title ch-label">{t('navigator.variants')}</p>
                {currentScene.variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    tabIndex={-1}
                    className={`ch-nav-variant${v.id === currentScene.activeVariantId ? ' is-active' : ''}`}
                    onClick={() => setActiveVariant(ctx.root, currentScene.id, v.id)}
                  >
                    {variantLabel(t, currentScene, v.id)}
                  </button>
                ))}
              </li>
            )}
          </Fragment>
        ))}
      </ul>
      <p className="ch-nav-hint">{t('navigator.hint')}</p>
    </aside>
  );
}
