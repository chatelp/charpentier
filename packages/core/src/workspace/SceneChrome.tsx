import type { OutlineChapter, SceneInfo } from '@charpentier/schema';
import type { ReactNode } from 'react';
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
  version,
  onOutline,
  onVariants,
}: SceneChromeProps & {
  /**
   * Outside Principale (DESIGN 1.20): the version whose own variant the scene
   * reads, or `common` when it shares Principale's (writing goes for all).
   */
  readonly version?: { readonly name: string; readonly common: boolean } | undefined;
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
      {version ? (
        <>
          <span className="ch-crumb-sep" aria-hidden="true">
            ·
          </span>
          <button
            type="button"
            tabIndex={-1}
            className={`ch-crumb is-version${version.common ? ' is-common' : ''}`}
            title={
              version.common
                ? t('versions.commonTitle')
                : t('versions.ownTitle', { version: version.name })
            }
            aria-label={
              version.common
                ? t('versions.commonLabel')
                : t('versions.ownLabel', { version: version.name })
            }
            onClick={onVariants}
          >
            {version.common ? t('versions.common') : version.name}
          </button>
        </>
      ) : (
        scene.variants.length > 1 && (
          <button type="button" tabIndex={-1} className="ch-crumb is-variant" onClick={onVariants}>
            {t('header.variant', { letter: variantLetter(variantIndex) })}
          </button>
        )
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

/**
 * Footer (docs/DESIGN.md §4.1): words and today's progress; the command zone
 * in the middle; remarks, state and the display button on the right.
 */
export function WritingFooter({
  words,
  wordsToday,
  remarks,
  onRemarks,
  status,
  mentorNote,
  onEnterKey,
  commandZone,
  tools,
  features,
  syncState,
  work,
}: {
  /** Hidden outside the writing surface. */
  readonly words: number | undefined;
  readonly wordsToday: number;
  /** Open remarks of the Compagnon on this project. */
  readonly remarks: number;
  readonly onRemarks: () => void;
  readonly status: string | undefined;
  readonly mentorNote: string | undefined;
  /** The Compagnon waits for its key: « Compagnon : saisir la clé », clickable. */
  readonly onEnterKey?: (() => void) | undefined;
  readonly commandZone?: ReactNode;
  /** Buttons at the far right (« Aa »). */
  readonly tools?: ReactNode;
  /** The features' states, before the buttons (docs/PLAN.md phase 5.1). */
  readonly features?: ReactNode;
  /** Where the sync stands (step 4.4); clickable when it waits on the author. */
  readonly syncState?: { readonly text: string; readonly onClick?: () => void } | undefined;
  /** The Compagnon's background work, while it runs: a click opens its module. */
  readonly work?: { readonly text: string; readonly onClick: () => void } | undefined;
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
      <span className="ch-footer-middle">{commandZone}</span>
      <span className="ch-footer-right">
        {work && (
          <button
            type="button"
            tabIndex={-1}
            className="ch-footer-button is-mentor ch-footer-work"
            onClick={work.onClick}
          >
            {work.text}
          </button>
        )}
        <span role="status" aria-live="polite" className="ch-footer-fit">
          {status}
        </span>
        {remarks > 0 && (
          <button type="button" tabIndex={-1} className="ch-footer-remarks" onClick={onRemarks}>
            {t('footer.remarks', { count: remarks })}
          </button>
        )}
        {onEnterKey ? (
          <button
            type="button"
            className="ch-footer-button is-mentor ch-footer-key"
            title={t('mentor.ask.toSettings')}
            onClick={onEnterKey}
          >
            {t('footer.enterKey')}
          </button>
        ) : (
          // One state message at a time, whole: the most recent (a confirmation) wins.
          mentorNote &&
          !status && (
            <span className="ch-footer-fit" title={mentorNote}>
              {mentorNote}
            </span>
          )
        )}
        <span className="ch-footer-saved">{t('footer.saved')}</span>
        {syncState &&
          (syncState.onClick ? (
            <button
              type="button"
              className="ch-footer-button is-mentor ch-footer-fit"
              onClick={syncState.onClick}
            >
              {syncState.text}
            </button>
          ) : (
            <span className="ch-footer-fit ch-footer-sync">{syncState.text}</span>
          ))}
        {features}
        {tools}
      </span>
    </footer>
  );
}
