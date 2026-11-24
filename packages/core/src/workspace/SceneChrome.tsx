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
  status,
  undo,
  confirm,
  onStatusHover,
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
  readonly status: string | undefined;
  /**
   * After a trash, the line's one button (docs/DESIGN.md §4.7, 1.37): « Annuler » and the
   * undo key, named for what it brings back.
   */
  readonly undo?:
    | {
        readonly label: string;
        readonly shortcut: string | undefined;
        /** The key, as `aria-keyshortcuts` says it. */
        readonly keys: string | undefined;
        readonly onUndo: () => void;
      }
    | undefined;
  /**
   * A big piece armed from the keyboard (docs/DESIGN.md §4.7 « Les deux appuis »): the status
   * line carries the phrase as a button, its key and the seconds left; the button confirms.
   */
  readonly confirm?:
    | {
        readonly what: string;
        readonly left: number;
        readonly shortcut: string | undefined;
        readonly keys: string | undefined;
        readonly onConfirm: () => void;
      }
    | undefined;
  /** The pointer came over the state line, or left it (a trash's message stays meanwhile). */
  readonly onStatusHover?: (over: boolean) => void;
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
        <span
          className={`ch-footer-status${undo ? ' has-undo' : ''}`}
          onPointerEnter={() => onStatusHover?.(true)}
          onPointerMove={() => onStatusHover?.(true)}
          onPointerLeave={() => onStatusHover?.(false)}
        >
          <span role="status" aria-live="polite" className="ch-footer-fit">
            {confirm ? (
              <span className="ch-visually-hidden">
                {t('confirm.again', { what: confirm.what })}
              </span>
            ) : (
              status
            )}
          </span>
          {!confirm && undo && (
            <button
              type="button"
              className="ch-footer-button ch-footer-undo"
              aria-label={undo.label}
              aria-keyshortcuts={undo.keys}
              // The focus stays where the author was, as with the key.
              onMouseDown={(event) => event.preventDefault()}
              onClick={undo.onUndo}
            >
              {t('status.undo')}
              {undo.shortcut && <kbd>{undo.shortcut}</kbd>}
            </button>
          )}
        </span>
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
      {confirm && (
        // Above the foot, right-aligned, whole on one line: the foot's column is too narrow
        // for the phrase once a panel is open (DESIGN §4.7 « Les deux appuis »).
        <button
          type="button"
          className="ch-footer-button ch-footer-confirm"
          aria-keyshortcuts={confirm.keys}
          onMouseDown={(event) => event.preventDefault()}
          onClick={confirm.onConfirm}
        >
          {t('confirm.ask', { what: confirm.what })}
          {confirm.shortcut && <kbd>{confirm.shortcut}</kbd>}
          <span className="ch-confirm-left">{t('confirm.left', { count: confirm.left })}</span>
        </button>
      )}
    </footer>
  );
}
