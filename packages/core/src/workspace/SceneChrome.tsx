import type { OutlineChapter, SceneInfo } from '@charpentier/schema';
import { useTranslation } from 'react-i18next';
import { variantLabel } from '../commands/variant-commands';
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
  scene,
  onOutline,
  onVariants,
}: Omit<SceneChromeProps, 'chapterIndex'> & {
  readonly onOutline: () => void;
  readonly onVariants: () => void;
}) {
  const { t } = useTranslation();
  if (!scene) return null;
  return (
    <header className="ch-scene-header">
      {chapter && (
        <button type="button" tabIndex={-1} className="ch-crumb" onClick={onOutline}>
          {chapter.title}
        </button>
      )}
      <button type="button" tabIndex={-1} className="ch-crumb is-scene" onClick={onOutline}>
        {scene.title}
      </button>
      {scene.variants.length > 1 && (
        <button type="button" tabIndex={-1} className="ch-crumb is-variant" onClick={onVariants}>
          {variantLabel(t, scene, scene.activeVariantId)}
        </button>
      )}
    </header>
  );
}

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

/** Footer: word count on the left; confirmations and the Compagnon's state on the right. */
export function WritingFooter({
  words,
  status,
  mentorNote,
}: {
  readonly words: number;
  readonly status: string | undefined;
  readonly mentorNote: string | undefined;
}) {
  const { t } = useTranslation();
  return (
    <footer className="ch-footer">
      <span className="ch-footer-words">{t('footer.words', { count: words })}</span>
      <span className="ch-footer-right">
        <span role="status" aria-live="polite">
          {status}
        </span>
        {mentorNote && <span>{mentorNote}</span>}
      </span>
    </footer>
  );
}
