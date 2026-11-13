import {
  checkpointText,
  createVariantFromCheckpoint,
  fragmentPlainText,
  listCheckpoints,
  moveScene,
  moveSceneStep,
  readProjectMeta,
  restoreCheckpoint,
  setActiveVariant,
  variantFragment,
  type CheckpointInfo,
} from '@charpentier/schema';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Doc as YDoc } from 'yjs';
import type * as Y from 'yjs';
import { formatCheckpointDate, variantLabel } from '../commands/variant-commands';
import { sceneNumbers } from '../atelier/atelier-data';
import { countWords } from '../editor/word-count';
import { useDocSnapshot } from '../hooks/use-doc-snapshot';
import type { WorkspaceContext } from '../workspace/workspace-context';
import { useSceneHistory } from './use-scene-history';
import './overview.css';

const readCheckpoints = (doc: Y.Doc) => listCheckpoints(doc);
/** Restore points shown in the strip; the others through « Tous (N)… ». */
const SHOWN_CHECKPOINTS = 3;
/** Opening lines of a restore point in its preview. */
const PREVIEW_LENGTH = 220;

/** Moves the focus to the previous or next chip of the same group in the strip. */
function stepChip(from: HTMLElement, step: number) {
  const chips = [
    ...(from.closest('[data-strip-group]')?.querySelectorAll<HTMLElement>('[data-chip]') ?? []),
  ];
  chips[Math.max(0, Math.min(chips.length - 1, chips.indexOf(from) + step))]?.focus();
}

export interface OverviewProps {
  readonly ctx: WorkspaceContext;
  /** False while the command line is open on top. */
  readonly active: boolean;
  /** Open a scene and go back to writing. */
  readonly onOpen: (sceneId: string) => void;
  readonly onClose: () => void;
}

/**
 * Overview of the manuscript (docs/DESIGN.md §4.4): a column per chapter, a
 * card per scene. Arrows move, ⌥ + arrows move the scene, ↵ writes, Échap goes back.
 */
export function Overview({ ctx, active, onOpen, onClose }: OverviewProps) {
  const { t, i18n } = useTranslation();
  const { outline } = ctx;
  const words = ctx.sceneWords;
  const numbers = useMemo(() => sceneNumbers(outline), [outline]);
  const [selectedId, setSelectedId] = useState(ctx.sceneId);
  const cards = useRef(new Map<string, HTMLElement>());
  const number = new Intl.NumberFormat(i18n.language);

  const all = outline.flatMap((c, ci) => c.scenes.map((s, si) => ({ scene: s, ci, si })));
  const selected = all.find((x) => x.scene.id === selectedId) ?? all[0];

  useEffect(() => {
    if (active && selected) cards.current.get(selected.scene.id)?.focus();
  }, [active, selected]);

  const total = [...words.values()].reduce((a, b) => a + b, 0);
  const project = readProjectMeta(ctx.root);

  // ─── The strip: variants and restore points of the selected scene (docs/DESIGN.md §4.4) ───
  const history = useSceneHistory(ctx.platform, ctx.projectId, selected?.scene.id);
  const allCheckpoints = useDocSnapshot(history?.historyDoc ?? noHistoryDoc(), readCheckpoints);
  const checkpoints = history
    ? allCheckpoints.filter((c) => c.variantId === selected?.scene.activeVariantId)
    : [];
  const [previewId, setPreviewId] = useState<string | null>(null);
  const preview = checkpoints.find((c) => c.id === previewId);
  const previewRef = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLElement>(null);
  useEffect(() => {
    if (preview) previewRef.current?.focus();
  }, [preview]);

  // Two neighbouring points of the same minute get their seconds.
  const chipDate = (
    c: CheckpointInfo,
    before: CheckpointInfo | undefined,
    after: CheckpointInfo | undefined,
  ) => {
    const label = formatCheckpointDate(ctx, c.createdAt);
    const same = (other: CheckpointInfo | undefined) =>
      other !== undefined && formatCheckpointDate(ctx, other.createdAt) === label;
    return same(before) || same(after) ? formatCheckpointDate(ctx, c.createdAt, true) : label;
  };
  const closePreview = () => {
    setPreviewId(null);
    strip.current?.querySelector<HTMLElement>(`[data-chip="${previewId}"]`)?.focus();
  };
  const restore = (checkpoint: CheckpointInfo) => {
    if (!history) return;
    restoreCheckpoint(history.sceneDoc, history.historyDoc, checkpoint.id);
    ctx.notify(
      t('status.checkpointRestored', { date: formatCheckpointDate(ctx, checkpoint.createdAt) }),
    );
    closePreview();
  };
  const toVariant = (checkpoint: CheckpointInfo) => {
    if (!history || !selected) return;
    const name = formatCheckpointDate(ctx, checkpoint.createdAt);
    createVariantFromCheckpoint(ctx.root, history.sceneDoc, history.historyDoc, selected.scene.id, {
      checkpointId: checkpoint.id,
      name,
      activate: true,
    });
    ctx.notify(t('status.variantCreated', { name }));
    closePreview();
  };
  const allPoints = () =>
    ctx.openPalette({
      kind: 'pick',
      placeholder: t('palette.pickCheckpoint'),
      empty: t('palette.noCheckpoints'),
      items: checkpoints.map((c) => ({
        id: c.id,
        label: [formatCheckpointDate(ctx, c.createdAt), c.label].filter(Boolean).join(' · '),
        detail: t(`history.reason.${c.reason}`),
      })),
      onPick: setPreviewId,
    });

  const onStripKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      stepChip(target, event.key === 'ArrowRight' ? 1 : -1);
    } else if (event.key === 'Escape') {
      // Up to the cards.
      event.preventDefault();
      if (selected) cards.current.get(selected.scene.id)?.focus();
    }
    // ↵ on a chip is the button's own click.
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!selected) return;
    if ((event.target as HTMLElement).closest('.ch-overview-strip')) return;
    const { ci, si, scene } = selected;
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    const column = (i: number) => outline[i]?.scenes ?? [];
    const key = event.key.toLowerCase();
    if (event.key === 'Escape') {
      handled();
      onClose();
    } else if ((key === 'v' || key === 'h') && !event.metaKey && !event.ctrlKey && !event.altKey) {
      // V, H: into the variants or the restore points of the strip.
      handled();
      strip.current?.querySelector<HTMLElement>(`[data-strip-group="${key}"] [data-chip]`)?.focus();
    } else if (event.key === 'Enter') {
      handled();
      onOpen(scene.id);
    } else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      handled();
      moveSceneStep(ctx.root, scene.id, event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      handled();
      // Like ⌥↑↓ across a chapter boundary: end of the previous one, start of the next.
      const right = event.key === 'ArrowRight';
      const target = outline[ci + (right ? 1 : -1)];
      if (target)
        moveScene(ctx.root, scene.id, {
          chapterId: target.id,
          index: right ? 0 : target.scenes.length,
        });
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      handled();
      const next = column(ci)[si + (event.key === 'ArrowDown' ? 1 : -1)];
      if (next) setSelectedId(next.id);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      handled();
      const step = event.key === 'ArrowRight' ? 1 : -1;
      // Next chapter that has scenes, same rank or its last scene.
      for (let i = ci + step; i >= 0 && i < outline.length; i += step) {
        const scenes = column(i);
        const next = scenes[Math.min(si, scenes.length - 1)];
        if (next) {
          setSelectedId(next.id);
          break;
        }
      }
    }
  };

  return (
    <section className="ch-overview" aria-label={t('overview.label')} onKeyDown={onKeyDown}>
      <h2 className="ch-overview-title">{project?.title}</h2>
      <p className="ch-overview-sub">
        {[
          t('overview.chapters', { count: outline.length }),
          t('overview.scenes', { count: all.length }),
          t('overview.words', { count: total, formatted: number.format(total) }),
        ].join(' · ')}
      </p>
      <div className="ch-overview-cols">
        {outline.map((chapter) => (
          <div key={chapter.id} className="ch-overview-col" role="group" aria-label={chapter.title}>
            <h3>
              {chapter.title}
              <span>
                {number.format(chapter.scenes.reduce((a, s) => a + (words.get(s.id) ?? 0), 0))}
              </span>
            </h3>
            {chapter.scenes.map((scene) => (
              <article
                key={scene.id}
                ref={(el) => {
                  if (el) cards.current.set(scene.id, el);
                  else cards.current.delete(scene.id);
                }}
                tabIndex={scene.id === selected?.scene.id ? 0 : -1}
                aria-current={scene.id === ctx.sceneId ? 'true' : undefined}
                aria-label={`${numbers.get(scene.id) ?? ''} ${scene.title}`}
                className={[
                  'ch-card',
                  scene.id === ctx.sceneId && 'is-current',
                  scene.id === selected?.scene.id && 'is-selected',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onFocus={() => setSelectedId(scene.id)}
                onClick={() => setSelectedId(scene.id)}
                onDoubleClick={() => onOpen(scene.id)}
              >
                <div className="ch-card-n">{numbers.get(scene.id)}</div>
                <div className="ch-card-t">{scene.title}</div>
                <div className="ch-card-m">
                  <span>
                    {words.has(scene.id)
                      ? t('footer.words', { count: words.get(scene.id) ?? 0 })
                      : ''}
                  </span>
                  {scene.variants.length > 1 && (
                    <span>{t('overview.variants', { count: scene.variants.length })}</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        ))}
      </div>
      {selected && (
        <footer
          ref={strip}
          className="ch-overview-strip ch-raised ch-tool"
          aria-label={t('overview.stripOf', { title: selected.scene.title })}
          onKeyDown={onStripKeyDown}
        >
          {preview && history && (
            <CheckpointPreview
              ref={previewRef}
              ctx={ctx}
              checkpoint={preview}
              text={checkpointText(history.historyDoc, preview.id)}
              current={fragmentPlainText(
                variantFragment(history.sceneDoc, selected.scene.activeVariantId),
              )}
              variant={variantLabel(t, selected.scene, selected.scene.activeVariantId)}
              onRestore={() => restore(preview)}
              onVariant={() => toVariant(preview)}
              onClose={closePreview}
            />
          )}
          <div
            className="ch-strip-group"
            data-strip-group="v"
            role="group"
            aria-label={t('overview.variantsGroup')}
          >
            <span className="ch-label">
              {t('overview.variantsGroup')} <kbd>{t('overview.variantsKey')}</kbd>
            </span>
            {selected.scene.variants.map((v) => (
              <button
                key={v.id}
                type="button"
                tabIndex={-1}
                data-chip={v.id}
                className={`ch-chip ch-strip-chip${v.id === selected.scene.activeVariantId ? ' is-active' : ''}`}
                onClick={() => setActiveVariant(ctx.root, selected.scene.id, v.id)}
              >
                {variantLabel(t, selected.scene, v.id)}
              </button>
            ))}
          </div>
          <div
            className="ch-strip-group"
            data-strip-group="h"
            role="group"
            aria-label={t('overview.restoreGroup')}
          >
            <span className="ch-label">
              {t('overview.restoreGroup')} <kbd>{t('overview.restoreKey')}</kbd>
            </span>
            {checkpoints.length === 0 && (
              <span className="ch-strip-none">{t('overview.noCheckpoint')}</span>
            )}
            {checkpoints.slice(0, SHOWN_CHECKPOINTS).map((c, i, shown) => (
              <button
                key={c.id}
                type="button"
                tabIndex={-1}
                data-chip={c.id}
                className={`ch-chip ch-strip-chip${c.id === previewId ? ' is-active' : ''}`}
                onClick={() => setPreviewId(c.id)}
              >
                {chipDate(c, shown[i - 1], shown[i + 1])}{' '}
                <span className="ch-strip-reason">
                  {'· '}
                  {c.label ? `« ${c.label} »` : t(`history.reason.${c.reason}`)}
                </span>
              </button>
            ))}
            {checkpoints.length > SHOWN_CHECKPOINTS && (
              <button
                type="button"
                tabIndex={-1}
                data-chip="all"
                className="ch-strip-more"
                onClick={allPoints}
              >
                {t('overview.allCheckpoints', { count: checkpoints.length })}
              </button>
            )}
          </div>
          <span className="ch-overview-hint">{t('overview.hint')}</span>
        </footer>
      )}
    </section>
  );
}

/** An empty document, while the selected scene's history opens. */
let emptyHistory: Y.Doc | undefined;
function noHistoryDoc(): Y.Doc {
  emptyHistory ??= new YDoc();
  return emptyHistory;
}

/**
 * The preview of a restore point, above the strip (docs/DESIGN.md §4.4): its
 * date and reason, the opening lines of that version, the difference in words,
 * and what can be done with it. ↵ restores, ⇧↵ makes it a variant, Échap closes.
 */
function CheckpointPreview({
  ref,
  ctx,
  checkpoint,
  text,
  current,
  variant,
  onRestore,
  onVariant,
  onClose,
}: {
  readonly ref: Ref<HTMLDivElement>;
  readonly ctx: WorkspaceContext;
  readonly checkpoint: CheckpointInfo;
  readonly text: string;
  readonly current: string;
  readonly variant: string;
  readonly onRestore: () => void;
  readonly onVariant: () => void;
  readonly onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const number = new Intl.NumberFormat(i18n.language);
  const words = countWords(text);
  const delta = words - countWords(current);
  const opening = text.replace(/\s+/g, ' ').trim();
  const reason = checkpoint.label
    ? `« ${checkpoint.label} »`
    : t(`history.reason.${checkpoint.reason}`);
  return (
    <div
      ref={ref}
      className="ch-checkpoint-preview ch-raised ch-tool"
      role="dialog"
      aria-label={formatCheckpointDate(ctx, checkpoint.createdAt)}
      tabIndex={-1}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          if (event.shiftKey) onVariant();
          else onRestore();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <p className="ch-checkpoint-head">
        {formatCheckpointDate(ctx, checkpoint.createdAt)} · {reason}
      </p>
      <p className="ch-checkpoint-text">
        {opening
          ? opening.length > PREVIEW_LENGTH
            ? `${opening.slice(0, PREVIEW_LENGTH)}…`
            : opening
          : t('history.emptyText')}
      </p>
      <p className="ch-checkpoint-words">
        {t(
          delta < 0
            ? 'overview.previewWordsLess'
            : delta > 0
              ? 'overview.previewWordsMore'
              : 'overview.previewWordsSame',
          {
            words: number.format(words),
            delta: number.format(Math.abs(delta)),
            variant,
          },
        )}
      </p>
      <p className="ch-note-actions">
        <button type="button" tabIndex={-1} className="ch-btn is-author" onClick={onRestore}>
          {t('overview.restore')} <kbd>{t('overview.restoreActionKey')}</kbd>
        </button>
        <button type="button" tabIndex={-1} className="ch-btn" onClick={onVariant}>
          {t('overview.toVariant')} <kbd>{t('overview.toVariantKey')}</kbd>
        </button>
        <button type="button" tabIndex={-1} className="ch-btn" onClick={onClose}>
          {t('overview.close')} <kbd>{t('overview.closeKey')}</kbd>
        </button>
      </p>
    </div>
  );
}
