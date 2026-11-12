import { moveScene, moveSceneStep, readProjectMeta, setActiveVariant } from '@charpentier/schema';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlatform } from '../app/platform-context';
import { variantLabel } from '../commands/variant-commands';
import { sceneNumbers } from '../atelier/atelier-data';
import type { WorkspaceContext } from '../workspace/workspace-context';
import { useSceneWords } from './use-scene-words';
import './overview.css';

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
  const platform = usePlatform();
  const { outline } = ctx;
  const words = useSceneWords(platform, ctx.projectId, outline);
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

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!selected) return;
    const { ci, si, scene } = selected;
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    const column = (i: number) => outline[i]?.scenes ?? [];
    if (event.key === 'Escape') {
      handled();
      onClose();
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
        {t('overview.summary', {
          chapters: outline.length,
          scenes: all.length,
          words: number.format(total),
          count: all.length,
        })}
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
        <footer className="ch-overview-strip ch-raised">
          <span className="ch-label">
            {t('overview.variantsOf', { title: selected.scene.title })}
          </span>
          {selected.scene.variants.map((v) => (
            <button
              key={v.id}
              type="button"
              tabIndex={-1}
              className={`ch-strip-variant${v.id === selected.scene.activeVariantId ? ' is-active' : ''}`}
              onClick={() => setActiveVariant(ctx.root, selected.scene.id, v.id)}
            >
              {variantLabel(t, selected.scene, v.id)}
            </button>
          ))}
          <span className="ch-overview-hint">{t('overview.hint')}</span>
        </footer>
      )}
    </section>
  );
}
