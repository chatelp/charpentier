import type { OutlineChapter, SceneInfo } from '@charpentier/schema';
import { useTranslation } from 'react-i18next';
import { toRoman } from './roman';

export interface SceneChromeProps {
  readonly chapter: OutlineChapter | undefined;
  readonly chapterIndex: number;
  readonly scene: SceneInfo | undefined;
}

/**
 * Fixed header of the writing surface (docs/DESIGN.md §4.1): chapter in small
 * caps, scene in vermilion italics, variant when there are several. Clicking
 * opens the drawer (chapter, scene) or the variants.
 */
export function SceneHeader({
  chapter,
  chapterIndex,
  scene,
  onOutline,
  onVariants,
}: SceneChromeProps & {
  readonly onOutline: () => void;
  readonly onVariants: () => void;
}) {
  const { t } = useTranslation();
  if (!scene) return null;
  const sceneRank = (chapter?.scenes.findIndex((s) => s.id === scene.id) ?? -1) + 1;
  const variantIndex = scene.variants.findIndex((v) => v.id === scene.activeVariantId);
  return (
    <header className="ch-scene-header">
      {chapter && (
        <>
          <button type="button" tabIndex={-1} className="ch-crumb" onClick={onOutline}>
            {t('header.chapter', { numeral: toRoman(chapterIndex + 1), title: chapter.title })}
          </button>
          <span className="ch-crumb-sep" aria-hidden="true">
            —
          </span>
        </>
      )}
      <button type="button" tabIndex={-1} className="ch-crumb is-scene" onClick={onOutline}>
        {sceneRank > 0 ? t('header.scene', { rank: sceneRank, title: scene.title }) : scene.title}
      </button>
      {scene.variants.length > 1 && (
        <button type="button" tabIndex={-1} className="ch-crumb is-variant" onClick={onVariants}>
          {t('header.variant', { letter: variantLetter(variantIndex) })}
        </button>
      )}
    </header>
  );
}

/** A, B, C… for the variants of a scene (docs/DESIGN.md §4.4). */
export const variantLetter = (index: number): string =>
  index < 0 ? '?' : index < 26 ? String.fromCharCode(65 + index) : String(index + 1);

/** Opening of the scene, scrolling with the text: numeral, chapter, fleuron, scene title. */
export function SceneOpener({ chapter, chapterIndex, scene }: SceneChromeProps) {
  if (!scene) return null;
  return (
    <div className="ch-opener" aria-hidden="true">
      {chapter && (
        <>
          <div className="ch-opener-numeral">{toRoman(chapterIndex + 1)}</div>
          <div className="ch-opener-chapter">{chapter.title}</div>
        </>
      )}
      <div className="ch-opener-fleuron">⁂</div>
      <div className="ch-opener-scene">{scene.title}</div>
    </div>
  );
}

/** Footer (docs/DESIGN.md §4.1): words and today's progress; remarks, state. */
export function WritingFooter({
  words,
  wordsToday,
  remarks,
  onRemarks,
  status,
  mentorNote,
}: {
  /** Hidden outside the writing surface. */
  readonly words: number | undefined;
  readonly wordsToday: number;
  /** Open remarks of the Compagnon on this project. */
  readonly remarks: number;
  readonly onRemarks: () => void;
  readonly status: string | undefined;
  readonly mentorNote: string | undefined;
}) {
  const { t } = useTranslation();
  return (
    <footer className="ch-footer">
      <span className="ch-footer-words">
        {words !== undefined && <span>{t('footer.words', { count: words })}</span>}
        {words !== undefined && wordsToday > 0 && (
          <>
            {' · '}
            <span className="ch-footer-today">{t('footer.today', { count: wordsToday })}</span>
          </>
        )}
      </span>
      <span className="ch-footer-right">
        <span role="status" aria-live="polite">
          {status}
        </span>
        {remarks > 0 && (
          <button type="button" tabIndex={-1} className="ch-footer-remarks" onClick={onRemarks}>
            {t('footer.remarks', { count: remarks })}
          </button>
        )}
        {mentorNote && <span>{mentorNote}</span>}
        <span>{t('footer.saved')}</span>
      </span>
    </footer>
  );
}
