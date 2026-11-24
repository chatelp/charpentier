import {
  addInterviewMessage,
  AUTHOR,
  listEntities,
  listWorkRecords,
  readMentorLevel,
  MAIN_VERSION,
  readProjectMeta,
  readOutline,
  sceneIsCommon,
  versionsSharingScene,
  workKey,
  bornIn,
} from '@charpentier/schema';
import type * as Y from 'yjs';
import type { Editor } from '@tiptap/core';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type SetStateAction,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CompagnonBlocked } from '../mentor/Blocked';
import { useMediaQuery } from '../hooks/use-media-query';
import { usePlatform } from '../app/platform-context';
import { announceCommand } from '../commands/announce';
import { matchesCharacter, parseKeybinding } from '../commands/keybinding';
import { Atelier, type AtelierLocation } from '../atelier/Atelier';
import type { SheetTarget } from '../atelier/atelier-data';
import { SheetPanel } from '../atelier/SheetPanel';
import type { KnownName } from '../mentor/character-names';
import { sheetScope } from '../atelier/sheet-scope';
import { Overview } from '../overview/Overview';
import { useSceneTexts, useWordsOf } from '../overview/use-scene-words';
import { toRoman } from './roman';
import { Conversation } from '../mentor/Conversation';
import { InterventionSlider } from '../mentor/InterventionSlider';
import { MentorPanel } from '../mentor/MentorPanel';
import { SignalNote } from '../mentor/SignalNote';
import { applyCorrection, insertExample } from '../mentor/apply-suggestion';
import { placedSignals } from '../mentor/signal-decorations';
import { useMentorMarks } from '../mentor/use-mentor-marks';
import '../mentor/mentor.css';
import { variantLabel } from '../commands/variant-commands';
import { bracketed, fileManagerName } from '../app/host-words';
import { buildMenuModel } from '../commands/menu-model';
import { keySoundOf, playKeySound, playSound, setSoundSettings } from '../sound/sounds';
import { createWorkspaceRegistry } from '../commands/workspace-commands';
import { createLanguageChecker } from '../language/checker';
import { knownWordsOf } from '../language/known-words';
import { SceneEditor } from '../editor/SceneEditor';
import { useDocSnapshot } from '../hooks/use-doc-snapshot';
import { Navigator } from '../navigator/Navigator';
import { ThingMenuHost } from '../menu/ThingMenuSheet';
import { ariaKeyShortcut, type MenuRequest } from '../menu/thing-menu';
import { CommandPalette } from '../palette/CommandPalette';
import type { PaletteRequest, PaletteScope } from '../palette/palette-request';
import { lastScenePref, type ProjectSession } from './default-scene';
import { panelsPref, readPanels, type StoredPanels } from './panels-pref';
import { projectStatsPref } from '../library/project-stats';
import { CommandZone, Console, ConsoleKey, DisplaySheet, ModeSwitch } from './EntryPoints';
import { NovelButton, NovelSheet, readVersionsView, useActiveVersionName } from './NovelTitle';
import { sceneInActiveVersion, spaced } from '../commands/version-commands';
import { GuidedTour, WELCOMED_PREF, WelcomeNote } from './Onboarding';
import { SceneHeader, SceneOpener, WritingFooter } from './SceneChrome';
import { useSceneDocs } from './use-scene-docs';
import { useTypingFade, useTypewriterScroll, useWordCount } from './use-writing-surface';
import { useWordsToday } from './use-words-today';
import type { UndoOffer, WorkspaceContext } from './workspace-context';
import { useWritingPrefs } from './writing-prefs';
import { isCovered } from '../features/cover';
import { featureText } from '../features/feature';
import { FeatureFooterItems, FeatureTopZones, useFeatures } from '../features/features-context';
import { SettingsView } from '../features/SettingsView';
import { BoardSettingsView } from '../features/BoardSettingsView';
import { appSettingsSections } from '../settings/app-settings';
import './workspace.css';
import { CloseButton } from '../icons/CloseButton';
import { useTwoPresses } from '../confirm/two-presses';
import { useBackgroundWork, workName } from '../work/use-background-work';
import { useMentorDoc, workLocation } from '../work/WorkBlock';
import { formatWhen } from '../work/work-format';

let paletteSequence = 0;

/** A line of the footer's state: a confirmation, or what went to the trash and its « Annuler ». */
interface StatusLine {
  readonly key: number;
  readonly text: string;
  /** The name of « Annuler », when the line offers a way back. */
  readonly undoLabel?: string;
  /** The thing's name in `text`, the only part that is cut. */
  readonly name?: string | undefined;
}

const STATUS_MS = 4000;
const UNDO_STATUS_MS = 8000;
/** Once the pointer leaves a message held past its time, it stays a moment for the eye. */
const AFTER_HOVER_MS = 1500;
/** Keys that make no gesture by themselves (a chord's first half). */
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'Fn']);

/**
 * Under this width the Compagnon's notes unfold under their paragraph (docs/DESIGN.md §4.2):
 * the margin must hold the gap (3.5rem), the note and a little air, on both sides of the text.
 */
const narrowWindow = (measureRem: number) =>
  `(max-width: ${Math.round((measureRem + 2 * (3.5 + 18.5 + 1.5)) * 16)}px)`;

/** The commands offered when the command line opens empty (docs/DESIGN.md §4.6). */
const SUGGESTED_COMMANDS = [
  'newScene',
  'newChapter',
  'toggleNavigator',
  'goToScene',
  'analyzeScene',
  'talkToMentor',
  'toggleAtelier',
  'newCharacter',
];
const RECENT_COMMANDS = 4;
const RECENT_COMMANDS_PREF = 'recentCommands';

/** Characters' names as recognised in the text: full name, then first name. */
const readKnownNames = (doc: Y.Doc): KnownName[] =>
  listEntities(doc, 'characters')
    .filter((c) => c.status !== 'rejected')
    .flatMap((c) => {
      const name = c.fields['name']?.value ?? c.fields['name']?.proposal?.value;
      if (typeof name !== 'string' || !name.trim()) return [];
      const first = name.trim().split(/\s+/)[0] ?? '';
      return [{ entityId: c.id, forms: [...new Set([name.trim(), first])] }];
    });

/** The writing workspace of one project: editor, drawer, command line, shortcuts. */
export function ProjectWorkspace({
  session,
  onLibrary,
  onOpenProject,
  titleSlot = null,
}: {
  readonly session: ProjectSession;
  /** Shows the library of projects (`creating`: with the new project form open). */
  readonly onLibrary: (creating: boolean) => void;
  /** Opens another project (from the novel's sheet). */
  readonly onOpenProject?: (projectId: string) => void;
  /** The Mac's title bar, where the novel's button goes (null: at the top left of the page). */
  readonly titleSlot?: HTMLElement | null;
}) {
  const { t } = useTranslation();
  const platform = usePlatform();
  const { root, projectId, language } = session;

  const [requestedSceneId, setRequestedSceneId] = useState(session.initialSceneId);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [palette, setPalette] = useState<{ key: number; request: PaletteRequest } | null>(null);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  // The novel's sheet (docs/DESIGN.md §4.8, 1.19): open, and on its title field or not.
  const [novel, setNovel] = useState<{ mode: 'sheet' | 'renaming' | 'version' } | null>(null);
  const [view, setView] = useState<WorkspaceContext['view']>('write');
  const [atelierLocation, setAtelierLocation] = useState<AtelierLocation>({ rail: 'meta' });
  const [atelierFocus, setAtelierFocus] = useState(0);
  const paletteReturn = useRef<Element | null>(null);
  const [prefs, updatePrefs] = useWritingPrefs(platform.preferences);
  const scroller = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLElement>(null);
  const [mentorPanel, setMentorPanelState] = useState<'points' | 'conversation' | null>(null);
  // The sheet beside the text (« fiche en volet »): shares the right side with the Compagnon's panel.
  const [sheetPanel, setSheetPanel] = useState<SheetTarget | null>(null);
  // The author's gestures to enter a panel: the only thing that gives it the
  // focus (`usePanelEntry`). Reopening with the project is not one.
  const [panelEntry, setPanelEntry] = useState(0);
  const setMentorPanel = useCallback((tab: SetStateAction<'points' | 'conversation' | null>) => {
    setSheetPanel(null);
    setMentorPanelState(tab);
    if (tab !== null) setPanelEntry((n) => n + 1);
  }, []);
  // Open panels stay open the next time the project opens (docs/DESIGN.md §4.8):
  // an interface preference per project, not project content.
  const panelsLoaded = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void platform.preferences.get<unknown>(panelsPref(projectId)).then((stored) => {
      if (cancelled) return;
      panelsLoaded.current = true;
      const panels = readPanels(stored);
      if (panels.navigator) setNavigatorOpen(true);
      if (panels.mentor) setMentorPanelState(panels.mentor);
      else if (panels.sheet) setSheetPanel(panels.sheet);
    });
    return () => {
      cancelled = true;
    };
  }, [platform, projectId]);
  useEffect(() => {
    if (!panelsLoaded.current) return;
    const panels: StoredPanels = {
      navigator: navigatorOpen,
      mentor: mentorPanel,
      sheet: sheetPanel,
    };
    void platform.preferences.set(panelsPref(projectId), panels);
  }, [platform, projectId, navigatorOpen, mentorPanel, sheetPanel]);
  // The commands last chosen in the command line, offered first when it opens empty.
  const [recentCommands, setRecentCommands] = useState<readonly string[]>([]);
  useEffect(() => {
    let cancelled = false;
    void platform.preferences.get<unknown>(RECENT_COMMANDS_PREF).then((stored) => {
      if (!cancelled && Array.isArray(stored))
        setRecentCommands(stored.filter((id): id is string => typeof id === 'string'));
    });
    return () => {
      cancelled = true;
    };
  }, [platform]);
  const rememberCommand = (id: string) => {
    const next = [id, ...recentCommands.filter((r) => r !== id)].slice(0, RECENT_COMMANDS);
    setRecentCommands(next);
    void platform.preferences.set(RECENT_COMMANDS_PREF, next);
  };
  // The display sheet behind « Aa ».
  const [displayOpen, setDisplayOpen] = useState(false);
  // The menu of a thing (docs/DESIGN.md §4.7): one for the whole workspace, whatever opens it.
  const [menu, setMenu] = useState<MenuRequest<WorkspaceContext> | null>(null);
  // A command asked for a scene that was not the open one: it waits for that scene's documents.
  const [pendingCommand, setPendingCommand] = useState<{
    readonly sceneId: string;
    readonly commandId: string;
  } | null>(null);
  // First launch: the Compagnon's welcome, then (on request) the guided tour.
  const [welcome, setWelcome] = useState(false);
  const [touring, setTouring] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void platform.preferences.get<unknown>(WELCOMED_PREF).then((welcomed) => {
      if (!cancelled && welcomed !== true) setWelcome(true);
    });
    return () => {
      cancelled = true;
    };
  }, [platform]);
  const closeWelcome = useCallback(() => {
    setWelcome(false);
    void platform.preferences.set(WELCOMED_PREF, true);
  }, [platform]);
  const startTour = useCallback(() => {
    closeWelcome();
    setNavigatorOpen(false);
    setMentorPanelState(null);
    setSheetPanel(null);
    setDisplayOpen(false);
    setView('write');
    setTouring(true);
  }, [closeWelcome]);
  // The welcome leaves the cursor in the text: there ⏎ starts the tour, Échap
  // or the first letter typed puts it off.
  useEffect(() => {
    if (!welcome || !editor || editor.isDestroyed) return;
    const dom = editor.view.dom;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Enter') {
        // Not a new paragraph: the editor's own listener on this element must not see it.
        event.preventDefault();
        event.stopImmediatePropagation();
        startTour();
      } else if (event.key === 'Escape' || event.key.length === 1) closeWelcome();
    };
    dom.addEventListener('keydown', onKeyDown, true);
    return () => dom.removeEventListener('keydown', onKeyDown, true);
  }, [welcome, editor, startTour, closeWelcome]);
  const [welcomeTop, setWelcomeTop] = useState(0);
  useLayoutEffect(() => {
    if (!welcome || !editor || editor.isDestroyed || !page.current) return;
    setWelcomeTop(
      editor.view.dom.getBoundingClientRect().top - page.current.getBoundingClientRect().top,
    );
  }, [welcome, editor]);
  // While typing, the entry points fade (docs/DESIGN.md §4.8).
  const typing = useTypingFade(editor);
  // A remark to show once its scene's editor is ready (going there from the panel).
  const pendingSignal = useRef<string | null>(null);

  // What the features bring (docs/PLAN.md phase 5.1).
  const features = useFeatures();
  // The machine's settings come from the features (the X250's); the app's are the core's (7.3).
  const systemSections = useMemo(() => features.flatMap((f) => f.settings ?? []), [features]);
  const appSections = useMemo(
    () => appSettingsSections({ platform }, { systemAbout: systemSections.length > 0 }),
    [platform, systemSections.length],
  );
  const featureViews = useMemo(() => features.flatMap((f) => f.views ?? []), [features]);
  const [settingsSection, setSettingsSection] = useState<string>();
  const [systemSection, setSystemSection] = useState<string>();
  const registry = useMemo(
    () =>
      createWorkspaceRegistry(
        platform.keybindings.primaryModifier,
        platform.keybindings.reserved,
        features,
      ),
    [platform, features],
  );
  // What a command's title takes from the host (« Afficher … dans le Finder »).
  const hostWords = useMemo(
    () => ({ fileManager: fileManagerName(t, platform.keybindings.primaryModifier) }),
    [t, platform],
  );
  const outline = useDocSnapshot(root, readOutline);
  const mentorLevel = useDocSnapshot(root, readMentorLevel);
  // The editor is rebuilt only when the language check turns on or off, not at every level.
  const languageOn = mentorLevel > 1;
  const scenes = outline.flatMap((c) => c.scenes);
  // The requested scene may vanish (trashed on another device): fall back to the first one.
  // Out of the version (another device switched it, DESIGN 1.20): the nearest scene before it.
  const scene =
    scenes.find((s) => s.id === requestedSceneId) ??
    scenes.find((s) => s.id === sceneInActiveVersion({ root }, requestedSceneId)) ??
    scenes[0];
  const versionsView = useDocSnapshot(root, readVersionsView);
  const versionName = useActiveVersionName(root);
  const sceneId = scene?.id ?? requestedSceneId;
  const chapterIndex = outline.findIndex((c) => c.scenes.some((s) => s.id === sceneId));
  const chapter = outline[chapterIndex];
  const sceneDocs = useSceneDocs(platform, projectId, sceneId, scene?.activeVariantId ?? '');
  const [status, setStatus] = useState<StatusLine | null>(null);
  // The two presses of a big piece (DESIGN §4.7, rule 5): one thing armed at a time.
  const { presses, armed } = useTwoPresses();
  // The remarks of each background work, at the head of the points.
  const mentorDoc = useMentorDoc(projectId);
  const work = useBackgroundWork(
    platform,
    projectId,
    (ref, outcome, reference) => {
      if (outcome === 'answered')
        setStatus({
          key: ++paletteSequence,
          text: t(`work.task.${ref.task}.footerDone`, {
            name: reference?.title ?? workName(root, ref),
            // « (⌘0) » after the place, or nothing when the command has no key.
            key: ((label) => (label ? ` (${label})` : ''))(
              registry.shortcutLabel(ref.task === 'style' ? 'atelierInterview' : 'talkToMentor'),
            ),
          }),
        });
    },
    // The file the author gave enters the interview as their own message (phase 6.4).
    (reference) =>
      addInterviewMessage(
        mentorDoc,
        {
          role: 'author',
          text: '',
          mode: 'free',
          ...bornIn(root),
          reference: {
            title: reference.title,
            ...(reference.author && { author: reference.author }),
            format: reference.format,
            words: reference.words,
          },
        },
        AUTHOR,
      ),
  );
  const workRecords = useDocSnapshot(mentorDoc, listWorkRecords);
  const workGroups = useMemo(
    () =>
      // A reading of a reference text leaves no remark: no group of its own.
      workRecords
        .filter(([ref]) => ref.task !== 'style')
        .map(([ref, record]) => {
          const today = new Date(record.at).toDateString() === new Date().toDateString();
          const when = today
            ? new Date(record.at).toLocaleTimeString(language, {
                hour: '2-digit',
                minute: '2-digit',
              })
            : formatWhen(t, record.at, language, new Date(), true);
          return {
            key: workKey(ref),
            label: `${t(`work.task.${ref.task}.bilan`, { name: workName(root, ref) })} · ${when}`,
            signalIds: record.signalIds,
          };
        }),
    [workRecords, language, root, t],
  );
  // Leaving the module (or the character) where a work waits for « Lancer » cancels it.
  const confirming = work.state.confirm?.ref;
  const cancelWork = work.cancel;
  useEffect(() => {
    if (!confirming) return;
    const here = workLocation(confirming);
    const same =
      view === 'atelier' &&
      (atelierLocation.rail === here.rail ||
        (confirming.task === 'style' && atelierLocation.rail === 'style')) &&
      (confirming.task !== 'character' ||
        atelierLocation.target?.entityId === confirming.characterId);
    if (!same) cancelWork(confirming);
  }, [confirming, view, atelierLocation, cancelWork]);
  const { agents } = platform;
  const subscribeAgents = useCallback(
    (onChange: () => void) => agents.onStatusChange(onChange),
    [agents],
  );
  const agentsStatus = useSyncExternalStore(subscribeAgents, () => agents.status());
  // Sync with the author's server (step 4.4): its state in the footer.
  const { sync } = platform;
  const subscribeSync = useCallback(
    (onChange: () => void) => sync?.onStatusChange(onChange) ?? (() => {}),
    [sync],
  );
  const syncStatus = useSyncExternalStore(subscribeSync, () => sync?.status() ?? 'off');
  const words = useWordCount(editor);
  const { texts: storedTexts, variantWords } = useSceneTexts(platform, projectId, outline, sceneId);
  const storedWords = useWordsOf(storedTexts);
  // The open scene's text is live (its word count changes with every edit).
  const sceneTexts = useMemo(
    () =>
      editor && !editor.isDestroyed && words >= 0
        ? new Map(storedTexts).set(
            sceneId,
            editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n', ' '),
          )
        : storedTexts,
    [storedTexts, editor, sceneId, words],
  );
  // The open scene counts live, from its editor.
  const sceneWords = useMemo(
    () => (editor ? new Map(storedWords).set(sceneId, words) : storedWords),
    [storedWords, editor, sceneId, words],
  );
  const wordsToday = useWordsToday(
    platform.preferences,
    projectId,
    `${sceneId}/${scene?.activeVariantId ?? ''}`,
    editor ? words : undefined,
  );
  // Words and scenes of the project, for the library's cards (kept on the device).
  const totalWords = [...sceneWords.values()].reduce((a, b) => a + b, 0);
  const sceneCount = scenes.length;
  const stats = useRef({ words: totalWords, scenes: sceneCount });
  useLayoutEffect(() => {
    stats.current = { words: totalWords, scenes: sceneCount };
  });
  useEffect(() => {
    const save = () => void platform.preferences.set(projectStatsPref(projectId), stats.current);
    const timer = setTimeout(save, 2000);
    return () => clearTimeout(timer);
  }, [platform, projectId, totalWords, sceneCount]);
  // Leaving the project (to the library, say): saved at once.
  useEffect(
    () => () => void platform.preferences.set(projectStatsPref(projectId), stats.current),
    [platform, projectId],
  );
  const languageCheck = useMemo(
    () =>
      // Level 1 « Discret »: nothing while writing (D-19).
      !languageOn
        ? null
        : createLanguageChecker({
            spellcheck: platform.spellcheck,
            language,
            knownWords: () => knownWordsOf(root),
          }),
    [platform, language, root, languageOn],
  );
  useTypewriterScroll(editor, scroller, prefs.typewriter);
  // Known characters' names in the text (the editor reads them through a ref).
  const knownNames = useDocSnapshot(root, readKnownNames);
  const namesRef = useRef(knownNames);
  useLayoutEffect(() => {
    namesRef.current = knownNames;
  });
  const nameOptions = useMemo(() => ({ names: () => namesRef.current }), []);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.commands.refreshCharacterNames();
    // A new character's name is no longer a spelling mistake.
    editor.commands.refreshLanguageCheck();
  }, [editor, knownNames]);

  // Narrow window (docs/DESIGN.md §4.2): the note unfolds under its paragraph, in this element.
  const narrow = useMediaQuery(narrowWindow(prefs.measure));
  const noteSlot = useMemo(() => {
    const slot = document.createElement('div');
    slot.className = 'ch-note-slot';
    slot.contentEditable = 'false';
    return slot;
  }, []);
  const marks = useMentorMarks({
    root,
    sceneId,
    variantId: scene?.activeVariantId ?? '',
    editor,
    page,
    // D-19: the pause before a note unfolds by itself, by level.
    pauseMs: mentorLevel === 1 ? null : mentorLevel === 2 ? 3000 : 1500,
    noteSlot: narrow ? noteSlot : null,
  });

  // ─── When the Compagnon reads (D-19) ───
  // Readings under way: « lit la scène… » in the title of his panel (DESIGN 1.24).
  const [reading, setReading] = useState(0);
  const analyze = useCallback(
    (sceneIds: readonly string[], automatic: boolean) => {
      if (sceneIds.length === 0) return;
      setReading((n) => n + 1);
      const done = platform.agents
        .analyze({ projectId, sceneIds, automatic })
        .finally(() => setReading((n) => n - 1));
      void done.then((result) => {
        if (!automatic && result !== 'answered')
          setStatus({ key: ++paletteSequence, text: t(`mentor.ask.${result}`) });
        if (!automatic && result === 'answered')
          setStatus({
            key: ++paletteSequence,
            text: t('mentor.analysisDone', {
              key: bracketed(registry.shortcutLabel('toggleMentorPanel')),
            }),
          });
      });
    },
    [platform, projectId, t, registry],
  );
  const reviewChapter = useCallback(
    (chapterId: string, automatic: boolean) => {
      void platform.agents.reviewChapter({ projectId, chapterId, automatic }).then((result) => {
        if (!automatic)
          setStatus({
            key: ++paletteSequence,
            text:
              result === 'answered'
                ? t('mentor.reviewDone', {
                    key: bracketed(registry.shortcutLabel('toggleMentorPanel')),
                  })
                : t(`mentor.ask.${result}`),
          });
      });
    },
    [platform, projectId, t, registry],
  );
  // Leaving a scene (level 2 and up) analyses it. Leaving the last scene of a
  // chapter for another chapter (level 4) also brings the chapter's review.
  // (Runs again when the outline changes, but then the scene has not changed.)
  const previousScene = useRef(sceneId);
  useEffect(() => {
    const left = previousScene.current;
    previousScene.current = sceneId;
    if (left === sceneId || mentorLevel < 2 || agentsStatus !== 'available') return;
    analyze([left], true);
    // Going on to a later chapter, not back to an earlier one.
    const chapters = outline;
    const indexOf = (id: string) => chapters.findIndex((c) => c.scenes.some((s) => s.id === id));
    const finished = chapters[indexOf(left)];
    if (
      mentorLevel === 4 &&
      finished &&
      finished.scenes.at(-1)?.id === left &&
      indexOf(sceneId) > indexOf(left)
    )
      reviewChapter(finished.id, true);
  }, [sceneId, mentorLevel, agentsStatus, analyze, reviewChapter, outline]);
  // Two minutes without writing (level 3 and up) analyses the open scene.
  useEffect(() => {
    if (!editor || mentorLevel < 3 || agentsStatus !== 'available') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onUpdate = () => {
      clearTimeout(timer);
      timer = setTimeout(() => analyze([sceneId], true), 120_000);
    };
    editor.on('update', onUpdate);
    return () => {
      clearTimeout(timer);
      editor.off('update', onUpdate);
    };
  }, [editor, mentorLevel, agentsStatus, sceneId, analyze]);

  // Another scene opens at its top: the page does not keep the previous one's scroll (a short
  // scene would open with its title hidden). Going to a remark scrolls to it afterwards.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [sceneId]);

  // Going to a remark in another scene: once its editor is there, select the passage.
  const { openNote, sceneSignals } = marks;
  const showPendingSignal = useCallback(() => {
    const id = pendingSignal.current;
    if (!id || !editor || editor.isDestroyed) return;
    const placed = placedSignals(editor.state).find((p) => p.signal.id === id);
    if (!placed) return;
    pendingSignal.current = null;
    editor.chain().setTextSelection({ from: placed.from, to: placed.to }).scrollIntoView().run();
    editor.view.focus();
    openNote(placed.signal.id, false);
  }, [editor, openNote]);
  useEffect(() => {
    // The editor of the target scene appeared, or its remarks were placed.
    const timer = setTimeout(showPendingSignal, 0);
    return () => clearTimeout(timer);
  }, [showPendingSignal, sceneSignals]);

  const notify = (text: string) => setStatus({ key: ++paletteSequence, text });

  // The ways back on offer after things went to the trash, the most recent last: ⌘Z, or
  // « Annuler » in the status line, takes them one by one (DESIGN §4.7, 1.37), until the author
  // types anything (then ⌘Z is the text's again).
  const [offers, setOffers] = useState<readonly UndoOffer[]>([]);
  const offerUndo = (offer: UndoOffer) => {
    setOffers((list) => [...list, offer]);
    setStatus({
      key: ++paletteSequence,
      text: offer.message,
      undoLabel: offer.label,
      name: offer.name,
    });
  };
  const undoOffered = () => {
    const offer = offers.at(-1);
    if (!offer) return false;
    setOffers(offers.slice(0, -1));
    offer.undo();
    notify(t('status.trashUndone'));
    return true;
  };
  useEffect(() => {
    // (Unchanged while there is nothing to forget: typing renders nothing more.)
    const forget = (event: Event) => {
      // Typing a command's name in the command line changes nothing in the project:
      // what went to the trash can still come back.
      if ((event.target as Element | null)?.closest?.('.ch-cmdbar')) return;
      setOffers((list) => (list.length > 0 ? [] : list));
      // « Annuler » goes with them: it would aim at nothing.
      setStatus((line) => (line?.undoLabel ? null : line));
    };
    window.addEventListener('beforeinput', forget, true);
    return () => {
      window.removeEventListener('beforeinput', forget, true);
      setOffers([]);
    };
  }, [root]);
  // A trash's message goes as soon as the author does something else (a key, a click
  // elsewhere): ⌘Z then no longer aims at it in their mind. Looked at once the gesture is
  // done, so that what it said itself (another trash, « Remis en place. ») stays.
  useEffect(() => {
    if (!status?.undoLabel) return;
    const shown = status.key;
    const later: ReturnType<typeof setTimeout>[] = [];
    const onGesture = (event: Event) => {
      if (event instanceof KeyboardEvent && MODIFIER_KEYS.has(event.key)) return;
      if (event.target instanceof Element && event.target.closest('.ch-footer-posed')) return;
      later.push(setTimeout(() => setStatus((line) => (line?.key === shown ? null : line)), 0));
    };
    document.addEventListener('keydown', onGesture, true);
    document.addEventListener('pointerdown', onGesture, true);
    return () => {
      document.removeEventListener('keydown', onGesture, true);
      document.removeEventListener('pointerdown', onGesture, true);
      later.forEach(clearTimeout);
    };
  }, [status]);

  // The first time the author writes in a common scene outside Principale, a line says it goes
  // for every version that shares it (DESIGN 1.20), once per scene.
  const toldCommon = useRef(new Set<string>());
  useEffect(() => {
    if (!editor || versionsView.active === MAIN_VERSION) return;
    const onUpdate = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (!transaction.docChanged || toldCommon.current.has(sceneId)) return;
      if (!sceneIsCommon(root, sceneId, versionsView.active)) return;
      toldCommon.current.add(sceneId);
      const count = versionsSharingScene(root, sceneId);
      setStatus({
        key: ++paletteSequence,
        text: t(count === 2 ? 'versions.firstTypingTwo' : 'versions.firstTypingMany', {
          count,
          shortcut: spaced(registry.shortcutLabel('newVariant')),
        }),
      });
    };
    editor.on('update', onUpdate);
    return () => {
      editor.off('update', onUpdate);
    };
  }, [editor, versionsView.active, sceneId, root, t, registry]);

  const openScene = useCallback(
    (id: string) => {
      // Going elsewhere drops a command that waited for another scene.
      setPendingCommand(null);
      setRequestedSceneId(id);
      void platform.preferences.set(lastScenePref(projectId), id);
    },
    [platform, projectId],
  );

  const ctx: WorkspaceContext = {
    t,
    platform,
    projectId,
    root,
    sceneId,
    outline,
    editor,
    sceneDocs,
    language,
    openScene,
    openPalette: (request = { kind: 'commands' }) =>
      setPalette({ key: ++paletteSequence, request }),
    view,
    openAtelier: (location) => {
      if (location) setAtelierLocation(location);
      setView('atelier');
      setNavigatorOpen(false);
      setAtelierFocus((n) => n + 1);
    },
    openWriting: () => setView('write'),
    openSettings: (sectionId) => {
      if (sectionId) setSettingsSection(sectionId);
      setNavigatorOpen(false);
      setView('settings');
      setAtelierFocus((n) => n + 1);
    },
    openSystemSettings: (sectionId) => {
      if (systemSections.length === 0) return;
      // No section asked: the board (DESIGN 1.23).
      setSystemSection(sectionId);
      setNavigatorOpen(false);
      setView('system-settings');
      setAtelierFocus((n) => n + 1);
    },
    openView: (viewId) => {
      if (!featureViews.some((v) => v.id === viewId)) return;
      setNavigatorOpen(false);
      setView(`view:${viewId}`);
    },
    runCommand: async (commandId, options) =>
      announceCommand({ id: commandId, from: 'control' }) &&
      // A command asks for its second press where it was run from.
      presses.within(options?.inline ? 'inline' : 'status', () => registry.execute(commandId, ctx)),
    confirmTwice: (request) => presses.pressHere(request),
    armed,
    openLibrary: (creating = false) => onLibrary(creating),
    openProject: (id) => {
      if (id !== projectId) onOpenProject?.(id);
    },
    novelOpen: novel !== null,
    toggleNovel: (mode) => {
      playSound(novel && !mode ? 'toc' : 'tic');
      setNavigatorOpen(false);
      setNovel(novel && !mode ? null : { mode: mode ?? 'sheet' });
    },
    openOverview: () => {
      setNavigatorOpen(false);
      setView('overview');
    },
    toggleNavigator: () => {
      playSound(navigatorOpen ? 'toc' : 'tic');
      setNavigatorOpen(!navigatorOpen);
    },
    startTour,
    mentorPanel,
    toggleMentorPanel: (tab = 'points') => {
      playSound(mentorPanel === tab ? 'toc' : 'tic');
      setMentorPanel(mentorPanel === tab ? null : tab);
    },
    openSignalNote: (id) => {
      playSound('tic');
      marks.openNote(id, true);
    },
    openSheet: (target) => {
      playSound('tic');
      setMentorPanelState(null);
      setSheetPanel(target);
      setPanelEntry((n) => n + 1);
    },
    panelEntry,
    mentorLevel,
    analyze,
    reviewChapter,
    work: work.state,
    askWork: (ref) => {
      work.ask(ref);
      // A reference text asked from Style et voix is confirmed there, in its block.
      const onStylePage = view === 'atelier' && atelierLocation.rail === 'style';
      if (!(ref.task === 'style' && onStylePage)) setAtelierLocation(workLocation(ref));
      setView('atelier');
      setNavigatorOpen(false);
    },
    cancelWork: work.cancel,
    launchWork: work.launch,
    stopWork: work.stop,
    atelierLocation,
    sceneWords,
    sceneTexts,
    sceneHasText: (id) => {
      const read = variantWords(id);
      // The open scene's active variant counts live, in its editor.
      const live = id === sceneId && editor ? words : undefined;
      if (live) return true;
      // (Alone, it says it all: a scene just made is empty, read or not.)
      if (live !== undefined && scene?.variants.length === 1) return false;
      if (!read) return undefined;
      const active = id === sceneId ? scene?.activeVariantId : undefined;
      return [...read].some(
        ([variant, n]) => (live !== undefined && variant === active ? 0 : n) > 0,
      );
    },
    shortcutLabel: (id) => registry.shortcutLabel(id),
    shortcutChord: (id) => registry.chord(id),
    menuOf: menu?.id ?? null,
    openMenu: (request) => {
      playSound('tic');
      setMenu(request);
    },
    runOnScene: (id, commandId) => {
      if (id === sceneId && sceneDocs) return void ctx.runCommand(commandId);
      openScene(id);
      setPendingCommand({ sceneId: id, commandId });
    },
    notify,
    offerUndo,
    undoOffered,
    wordsToday,
    typing,
    prefs,
    updatePrefs,
  };

  // Global shortcuts. The listener reads the latest context through a ref.
  const primaryModifier = platform.keybindings.primaryModifier;
  const latest = useRef(ctx);
  const paletteOpenRef = useRef(false);
  const paletteOpen = palette !== null;
  // The open menu, read again at every render: its entries follow the manuscript.
  const menuModel = menu ? menu.build(ctx) : null;
  const menuOpen = menuModel !== null;
  const menuOpenRef = useRef(false);
  const closeMenu = () => {
    if (!menu) return;
    playSound('toc');
    setMenu(null);
    // The thing's line has the focus again (synchronous: what was chosen may move it next).
    if (menu.line?.isConnected) menu.line.focus();
  };
  // The command that waited for another scene runs once, when that scene's documents are there.
  const ranPending = useRef<unknown>(null);
  useEffect(() => {
    if (!pendingCommand || ranPending.current === pendingCommand) return;
    if (!sceneDocs || pendingCommand.sceneId !== sceneId) return;
    ranPending.current = pendingCommand;
    void latest.current.runCommand(pendingCommand.commandId);
  }, [pendingCommand, sceneId, sceneDocs]);
  // The Compagnon's key, in the console and in the overview's strip (DESIGN 1.25).
  const toggleCompagnon = () => {
    playSound(mentorPanel ? 'toc' : 'tic');
    setMentorPanel(mentorPanel ? null : 'points');
  };
  useLayoutEffect(() => {
    latest.current = ctx;
    paletteOpenRef.current = paletteOpen;
    menuOpenRef.current = menuOpen;
  });
  // Where the focus goes back when the command line closes (an Atelier field…).
  // A layout effect runs before the command line takes the focus.
  useLayoutEffect(() => {
    if (paletteOpen) paletteReturn.current = document.activeElement;
  }, [paletteOpen]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || paletteOpenRef.current) return;
      // An open menu holds the keyboard: the keys it shows act on its thing, the others wait.
      if (menuOpenRef.current) return;
      // Under a feature's cover (the X250 locked), no shortcut of the app.
      if (isCovered()) return;
      // ⌘Z right after something went to the trash brings it back, wherever the
      // focus is (the editor binds ⌘Z itself: this listener comes first).
      if (
        matchesCharacter(parseKeybinding('Mod-z', primaryModifier), event) &&
        latest.current.undoOffered()
      ) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const command = registry.forEvent(event, latest.current);
      if (!command) return;
      event.preventDefault();
      event.stopPropagation();
      if (announceCommand({ id: command.id, from: 'key' })) void command.run(latest.current);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [registry, primaryModifier]);
  // The keyboard's layout, for the shortcuts with Alt (⌥⌘, on AZERTY is on the M
  // key); read again when the window comes back, the author may have switched.
  useEffect(() => {
    const keybindings = platform.keybindings;
    if (!keybindings.keyboardLayout) return;
    let alive = true;
    const read = () =>
      void keybindings.keyboardLayout?.().then((layout) => {
        if (alive && layout) registry.setKeyboardLayout(layout);
      });
    read();
    window.addEventListener('focus', read);
    return () => {
      alive = false;
      window.removeEventListener('focus', read);
    };
  }, [platform, registry]);
  // Échap leaves the settings and the full-frame views wherever the focus is:
  // a click on an empty spot of the page leaves it on the body, out of their
  // own key handlers (found on the X250).
  const fullFrame = view === 'settings' || view === 'system-settings' || view.startsWith('view:');
  useEffect(() => {
    if (!fullFrame || palette !== null || navigatorOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || isCovered()) return;
      const focused = document.activeElement;
      if (focused && focused !== document.body) return;
      event.preventDefault();
      setView('write');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullFrame, palette, navigatorOpen]);
  // The host's application menu (macOS menu bar): every command, chosen with the mouse.
  useEffect(() => {
    const menu = platform.menu;
    if (!menu) return;
    return menu.onCommand((id) => {
      if (!isCovered() && announceCommand({ id, from: 'control' }))
        void registry.execute(id, latest.current);
    });
  }, [platform, registry]);
  const { uiSounds, typingSounds } = prefs;
  useEffect(() => {
    platform.menu?.set(
      buildMenuModel(
        registry,
        t,
        {
          toggleUiSounds: uiSounds,
          toggleTypingSounds: typingSounds,
          toggleRejected: prefs.showRejected,
        },
        features,
        hostWords,
      ),
    );
  }, [platform, registry, t, uiSounds, typingSounds, prefs.showRejected, features, hostWords]);
  useEffect(
    () => setSoundSettings({ ui: uiSounds, typing: typingSounds }),
    [uiSounds, typingSounds],
  );
  // The typing sound, from the author's keys in the text only.
  useEffect(() => {
    if (!typingSounds || !editor || editor.isDestroyed) return;
    const dom = editor.view.dom;
    const onKeyDown = (event: KeyboardEvent) => {
      const kind = keySoundOf(event);
      if (kind) playKeySound(kind);
    };
    dom.addEventListener('keydown', onKeyDown);
    return () => dom.removeEventListener('keydown', onKeyDown);
  }, [typingSounds, editor]);

  // Back to the text whenever nothing else holds the focus. Synchronous on
  // purpose: TipTap's `focus()` waits a frame and could then take the focus
  // from a command line opened in between.
  const focusTextIfIdle = useCallback(() => {
    if (!paletteOpenRef.current && editor && !editor.isDestroyed) editor.view.focus();
  }, [editor]);
  const lastFocusedEditor = useRef<Editor | null>(null);
  useEffect(() => {
    if (
      editor &&
      editor !== lastFocusedEditor.current &&
      !palette &&
      !navigatorOpen &&
      // A panel the author is in keeps the focus; one that merely reopened with the project does not.
      !document.activeElement?.closest('.ch-mentor-panel') &&
      view === 'write'
    ) {
      lastFocusedEditor.current = editor;
      editor.commands.focus('end');
    }
  }, [editor, palette, navigatorOpen, view, mentorPanel]);

  // Back from the Atelier: the text, cursor where it was.
  const previousView = useRef(view);
  useEffect(() => {
    if (previousView.current !== 'write' && view === 'write' && !paletteOpenRef.current)
      focusTextIfIdle();
    previousView.current = view;
  }, [view, focusTextIfIdle]);

  const projectTitle = useDocSnapshot(root, readProjectMeta)?.title ?? '';
  useEffect(() => {
    if (!scene) return;
    const variant =
      scene.variants.length > 1 ? ` (${variantLabel(t, scene, scene.activeVariantId)})` : '';
    // The novel first (docs/DESIGN.md §4.8, 1.19): what the window list and Mission Control show.
    document.title = t('app.windowTitle', {
      novel: projectTitle || t('app.name'),
      scene: `${scene.title}${variant}`,
    });
  }, [scene, t, projectTitle]);

  // Confirmations fade after 4 s; a trash's message, with its « Annuler », after 8 s, and not
  // while the pointer is over it (DESIGN §4.7, 1.37).
  const [statusHovered, setStatusHovered] = useState<number | null>(null);
  const statusHeld = status?.undoLabel !== undefined && statusHovered === status.key;
  const statusDue = useRef({ key: -1, at: 0 });
  useEffect(() => {
    if (!status || statusHeld) return;
    if (statusDue.current.key !== status.key)
      statusDue.current = {
        key: status.key,
        at: Date.now() + (status.undoLabel ? UNDO_STATUS_MS : STATUS_MS),
      };
    const left = Math.max(statusDue.current.at - Date.now(), AFTER_HOVER_MS);
    const timer = setTimeout(() => setStatus(null), left);
    return () => clearTimeout(timer);
  }, [status, statusHeld]);
  const undoChord = registry.chord('undo');

  const closePalette = () => {
    setPalette(null);
    // A command chosen in the palette may open another one right after.
    paletteOpenRef.current = false;
    if (navigatorOpen) return;
    const back = paletteReturn.current;
    paletteReturn.current = null;
    // Back where the focus was: a panel the author was in, else the text.
    const there = back instanceof HTMLElement && back.isConnected ? back : null;
    if (view === 'write' && !there?.closest('.ch-mentor-panel')) focusTextIfIdle();
    else if (there) there.focus();
    else if (view === 'atelier') setAtelierFocus((n) => n + 1);
  };

  const paletteCommands = registry
    .available(ctx)
    .filter((command) => command.id !== 'openPalette')
    .map((command) => {
      const shortcut = registry.shortcutLabel(command.id);
      return {
        id: command.id,
        label: t(`commands.${command.id}` as 'commands.openPalette', hostWords),
        ...(shortcut && { shortcut }),
        confirms: command.confirms?.(ctx),
        run: () => {
          // Remembered once done: asked, the list must not move under the author.
          const asks = command.confirms?.(ctx);
          if (asks === undefined || presses.isArmed(asks)) rememberCommand(command.id);
          if (announceCommand({ id: command.id, from: 'palette' })) void command.run(ctx);
        },
      };
    });

  const paletteScopes: Record<string, PaletteScope> = !palette
    ? {}
    : {
        '#': {
          label: t('palette.scenesGroup'),
          items: outline.flatMap((c, ci) =>
            c.scenes.map((s, si) => {
              const count = sceneWords.get(s.id);
              return {
                id: s.id,
                label: `${toRoman(ci + 1)}.${si + 1} ${s.title}`,
                detail: [
                  count !== undefined && t('footer.words', { count }),
                  s.variants.length > 1 && t('palette.variantCount', { count: s.variants.length }),
                ]
                  .filter(Boolean)
                  .join(' · '),
              };
            }),
          ),
          onPick: (id) => {
            openScene(id);
            setView('write');
          },
        },
        '@': sheetScope(ctx),
        // A feature's prefix (`:` for the system) searches what follows it itself.
        ...Object.fromEntries(
          features.flatMap((f) =>
            (f.prefixes ?? []).map((p): [string, PaletteScope] => [
              p.prefix,
              {
                label: featureText(t)(p.label),
                items: [],
                search: (query) => p.search(ctx, query),
                onPick: (id, query) => p.onPick(ctx, id, query),
              },
            ]),
          ),
        ),
      };

  const mentorNote = {
    disabled: t('mentor.unavailableOnHost'),
    unconfigured: t('mentor.status.unconfigured'),
    locked: t('mentor.status.locked'),
    offline: t('mentor.status.offline'),
    available: undefined,
  }[agentsStatus];

  const surfaceStyle = {
    '--ch-text-size': `${prefs.textSize / 16}rem`,
    '--ch-measure': `${prefs.measure}rem`,
  } as CSSProperties;

  // The unfolded note: in the margin, or under its paragraph in a narrow window.
  const noteSignalId = marks.noteSignal?.id;
  const note = marks.noteSignal && (
    <SignalNote
      root={root}
      signal={marks.noteSignal}
      onOpenStyleChoice={(entityId) => ctx.openSheet({ module: 'style', entityId })}
      style={narrow ? {} : { top: marks.noteTop ?? 0 }}
      focus={marks.note?.focus ?? false}
      onFixText={() => {
        const placed =
          editor && placedSignals(editor.state).find((p) => p.signal.id === noteSignalId);
        if (editor && placed)
          editor.chain().focus().setTextSelection({ from: placed.from, to: placed.to }).run();
      }}
      onUpdateSheet={(ref) =>
        ctx.openAtelier({
          rail:
            ref.module === 'acts' || ref.module === 'arcs' || ref.module === 'structure'
              ? 'structure'
              : ref.module,
          target: {
            module: ref.module,
            ...('entityId' in ref && { entityId: ref.entityId }),
          },
        })
      }
      onApplyCorrection={(text) => {
        if (!editor || editor.isDestroyed) return false;
        const placed = placedSignals(editor.state).find((p) => p.signal.id === noteSignalId);
        // Only while the passage still reads what the correction was written for.
        const applied =
          placed !== undefined &&
          applyCorrection(editor, placed, placed.signal.suggestion?.quote, text);
        if (!applied) notify(t('mentor.correctionStale'));
        return applied;
      }}
      onInsertExample={(text) => {
        if (!editor || editor.isDestroyed) return;
        if (insertExample(editor, text)) notify(t('mentor.exampleInserted'));
      }}
      onClose={(backToText) => {
        marks.closeNote();
        if (backToText) focusTextIfIdle();
      }}
    />
  );

  return (
    <div
      className="ch-app"
      style={surfaceStyle}
      data-view={view}
      data-typing={(typing && view === 'write' && !displayOpen && !touring) || undefined}
      data-focus={prefs.focusMode || undefined}
      data-typewriter={prefs.typewriter || undefined}
      data-mentor-panel={mentorPanel ?? (sheetPanel ? 'sheet' : undefined)}
      data-navigator={navigatorOpen || undefined}
      data-narrow={narrow || undefined}
      data-mentor-level={mentorLevel}
      data-titlebar-novel={titleSlot ? '' : undefined}
    >
      <FeatureTopZones ctx={ctx} />
      {/* The novel's title (docs/DESIGN.md §4.8, 1.19): in the Mac's title bar, else top left of the page. */}
      {titleSlot
        ? createPortal(<NovelButton ctx={ctx} />, titleSlot)
        : view === 'write' && !navigatorOpen && <NovelButton ctx={ctx} />}
      {novel && (
        <NovelSheet
          key={novel.mode}
          ctx={ctx}
          mode={novel.mode}
          onClose={(backToText) => {
            playSound('toc');
            setNovel(null);
            if (backToText && view === 'write') focusTextIfIdle();
          }}
        />
      )}
      {/* Entry points (docs/DESIGN.md §4.8), in the order of the tab key; the console is in the footer. */}
      {view === 'write' && (
        <ModeSwitch
          view="write"
          shortcut={registry.shortcutLabel('toggleAtelier')}
          onWrite={focusTextIfIdle}
          onAtelier={() => ctx.openAtelier()}
        />
      )}
      <div
        ref={scroller}
        hidden={view !== 'write'}
        className={`ch-write${navigatorOpen ? ' is-behind' : ''}`}
        // A click on the faded page puts the drawer away.
        onMouseDown={navigatorOpen ? () => setNavigatorOpen(false) : undefined}
      >
        <SceneHeader
          chapter={chapter}
          chapterIndex={chapterIndex}
          scene={scene}
          version={
            scene && versionName && versionsView.active !== MAIN_VERSION
              ? { name: versionName, common: sceneIsCommon(root, scene.id, versionsView.active) }
              : undefined
          }
          onOutline={() => setNavigatorOpen(true)}
          onVariants={() => void ctx.runCommand('switchVariant')}
        />
        <main
          className="ch-page"
          ref={page}
          onClick={(event) => {
            // A click on a known name (without selecting text) opens the sheet beside the text.
            const name = (event.target as HTMLElement).closest<HTMLElement>('.ch-who');
            const entityId = name?.dataset['entityId'];
            if (entityId && document.getSelection()?.isCollapsed)
              ctx.openSheet({ module: 'characters', entityId });
          }}
        >
          <h1 className="ch-visually-hidden">{t('app.name')}</h1>
          <SceneOpener chapter={chapter} chapterIndex={chapterIndex} scene={scene} />
          {sceneDocs && (
            <SceneEditor
              key={`${sceneId}/${scene?.activeVariantId}`}
              fragment={sceneDocs.fragment}
              language={language}
              onEditor={setEditor}
              languageCheck={languageCheck}
              signals={marks.signalOptions}
              names={nameOptions}
            />
          )}
          {welcome && !touring && !mentorPanel && !marks.noteSignal && (
            <WelcomeNote
              style={{ top: welcomeTop }}
              onTour={startTour}
              onLater={() => {
                closeWelcome();
                focusTextIfIdle();
              }}
            />
          )}
          {marks.noteSignal &&
            !mentorPanel &&
            (narrow ? createPortal(note, noteSlot) : marks.noteTop !== null && note)}
        </main>
      </div>
      {view === 'atelier' && (
        <Atelier
          ctx={ctx}
          location={atelierLocation}
          active={palette === null && !navigatorOpen}
          focusRequest={atelierFocus}
          onLocation={(location, focus) => {
            setAtelierLocation(location);
            if (focus) setAtelierFocus((n) => n + 1);
          }}
          onWrite={() => setView('write')}
        />
      )}
      {sheetPanel && !mentorPanel && (
        <SheetPanel
          ctx={ctx}
          target={sheetPanel}
          active={palette === null}
          onOpenInAtelier={() => {
            setSheetPanel(null);
            ctx.openAtelier({ rail: 'characters', target: sheetPanel });
          }}
          onClose={() => {
            playSound('toc');
            setSheetPanel(null);
            focusTextIfIdle();
          }}
        />
      )}
      {mentorPanel && (
        <MentorPanel
          blocked={
            <CompagnonBlocked
              agents={ctx.platform.agents}
              onEnterKey={() => ctx.openSettings('compagnon')}
              enterKeyShortcut={ctx.shortcutLabel('openSettings')}
            />
          }
          root={root}
          outline={outline}
          sceneId={sceneId}
          signals={marks.openSignals}
          sceneOrder={
            editor && !editor.isDestroyed ? placedSignals(editor.state).map((p) => p.signal.id) : []
          }
          tab={mentorPanel}
          onTab={setMentorPanel}
          workGroups={workGroups}
          header={<InterventionSlider root={root} level={mentorLevel} />}
          state={
            agentsStatus === 'offline'
              ? t('mentor.context.offline')
              : agentsStatus === 'unconfigured'
                ? t('mentor.context.noKey')
                : agentsStatus === 'locked'
                  ? t('mentor.context.locked')
                  : reading > 0
                    ? t('mentor.context.reading')
                    : undefined
          }
          conversation={
            <Conversation
              ctx={ctx}
              projectId={projectId}
              sceneId={sceneId}
              active={palette === null && mentorPanel === 'conversation'}
              onInsertExample={(example) => {
                // D-11: the only way an example enters the text, on the author's gesture.
                if (!editor || editor.isDestroyed) return;
                if (insertExample(editor, example)) notify(t('mentor.exampleInserted'));
              }}
              onClose={() => {
                playSound('toc');
                setMentorPanel(null);
                focusTextIfIdle();
              }}
            />
          }
          active={palette === null}
          entry={panelEntry}
          onGoTo={(signal) => {
            const target = signal.textAnchor?.sceneId;
            if (target) {
              setView('write');
              pendingSignal.current = signal.id;
              if (target !== sceneId) openScene(target);
              else showPendingSignal();
            }
          }}
          onOpenSheet={(rail, target) => ctx.openAtelier({ rail, target })}
          onOpenStyleChoice={(entityId) => ctx.openSheet({ module: 'style', entityId })}
          {...(agentsStatus !== 'disabled' && {
            onAnalyze: () => void ctx.runCommand('analyzeScene'),
            analyzeShortcut: registry.shortcutLabel('analyzeScene'),
          })}
          onClose={() => {
            playSound('toc');
            setMentorPanel(null);
            focusTextIfIdle();
          }}
        />
      )}
      {view === 'settings' && (
        <SettingsView
          ctx={ctx}
          sections={appSections}
          section={settingsSection}
          active={palette === null && !navigatorOpen}
          focusRequest={atelierFocus}
          onSection={setSettingsSection}
          onClose={() => setView('write')}
          // On the X250, the rail leads to the machine's settings (D-36).
          {...(systemSections.length > 0 && {
            other: {
              label: t('appSettings.toSystem'),
              // The machine's key: ⊞ (Ctrl standing in for it on a Mac, as in the system menu).
              shortcut: `${platform.keybindings.primaryModifier === 'Meta' ? '⌃' : '⊞'},`,
              open: () => ctx.openSystemSettings(),
              icon: features.find((f) => f.settingsLook)?.settingsLook?.icon,
            },
          })}
        />
      )}
      {view === 'system-settings' && (
        <BoardSettingsView
          ctx={ctx}
          sections={systemSections}
          section={systemSection}
          active={palette === null && !navigatorOpen}
          focusRequest={atelierFocus}
          onSection={setSystemSection}
          onClose={() => setView('write')}
          other={{
            label: t('appSettings.toApp'),
            shortcut: registry.shortcutLabel('openSettings'),
            open: () => ctx.openSettings(),
          }}
        />
      )}
      {featureViews.map(
        ({ id, label, component: View, ownClose }) =>
          view === `view:${id}` && (
            <section
              key={id}
              className="ch-feature-view"
              aria-label={featureText(t)(label)}
              onKeyDown={(event) => {
                if (event.key !== 'Escape' || event.defaultPrevented) return;
                event.preventDefault();
                setView('write');
              }}
            >
              <View
                ctx={ctx}
                active={palette === null && !navigatorOpen}
                onClose={() => setView('write')}
              />
              {!ownClose && (
                <CloseButton purpose="toText" onClose={() => setView('write')} corner />
              )}
            </section>
          ),
      )}
      {view === 'overview' && (
        <Overview
          ctx={ctx}
          active={palette === null && !navigatorOpen}
          onOpen={(id) => {
            openScene(id);
            setView('write');
          }}
          onClose={() => setView('write')}
          compagnon={
            <ConsoleKey
              picto="compagnon"
              name={t('entry.compagnon')}
              title={t('entry.compagnonTitle')}
              shortcut={registry.shortcutLabel('toggleMentorPanel')}
              count={marks.openSignals.length}
              pressed={mentorPanel !== null}
              mentor
              band
              onToggle={toggleCompagnon}
            />
          }
        />
      )}
      {/* The first press, said (DESIGN §4.7): the status line's own is read from its button. */}
      <p className="ch-visually-hidden" aria-live="polite">
        {armed && armed.where !== 'status' ? t('confirm.again', { what: armed.what }) : ''}
      </p>
      <WritingFooter
        words={view === 'write' ? words : undefined}
        wordsToday={wordsToday}
        status={status?.text}
        undo={
          status?.undoLabel === undefined
            ? undefined
            : {
                label: status.undoLabel,
                name: status.name,
                shortcut: registry.shortcutLabel('undo'),
                keys: undoChord && ariaKeyShortcut(undoChord),
                // Exactly what ⌘Z does (DESIGN §5.0, rule 2).
                onUndo: () => void ctx.undoOffered(),
              }
        }
        confirm={
          armed?.where === 'status'
            ? {
                what: armed.what,
                left: armed.left,
                shortcut: armed.shortcut,
                keys: armed.keys?.[0] && ariaKeyShortcut(armed.keys[0]),
                onConfirm: () => void presses.confirm(),
              }
            : undefined
        }
        onStatusHover={(over) => setStatusHovered(over && status ? status.key : null)}
        mentorNote={mentorNote}
        onEnterKey={
          // Where the key is set: Réglages › Compagnon (DESIGN 1.24).
          agentsStatus === 'unconfigured'
            ? () => ctx.openSettings('compagnon')
            : agentsStatus === 'locked'
              ? () => void ctx.runCommand('unlockCompagnon')
              : undefined
        }
        features={<FeatureFooterItems ctx={ctx} />}
        work={
          work.state.running && {
            text: t(`work.task.${work.state.running.ref.task}.doing`, {
              name: work.state.running.reference?.title ?? workName(root, work.state.running.ref),
            }),
            onClick: () => {
              const ref = work.state.running?.ref;
              if (ref) ctx.openAtelier(workLocation(ref));
            },
          }
        }
        syncState={
          syncStatus === 'off'
            ? undefined
            : {
                text: t(`sync.status.${syncStatus}`),
                ...(syncStatus === 'unauthorized' && {
                  onClick: () => void ctx.runCommand('syncSignIn'),
                }),
              }
        }
        commandZone={
          view === 'write' && (
            <Console
              away={paletteOpen}
              manuscript={{
                shortcut: registry.shortcutLabel('toggleNavigator'),
                open: navigatorOpen,
                toggle: () => ctx.toggleNavigator(),
              }}
              compagnon={{
                shortcut: registry.shortcutLabel('toggleMentorPanel'),
                open: mentorPanel !== null,
                count: marks.openSignals.length,
                toggle: toggleCompagnon,
              }}
              commandZone={
                <CommandZone
                  shortcut={registry.shortcutLabel('openPalette')}
                  onOpen={() => ctx.openPalette()}
                />
              }
            />
          )
        }
        tools={
          view === 'write' && (
            <button
              type="button"
              className={`ch-footer-button is-display ch-chrome ch-display-toggle${displayOpen ? ' is-on' : ''}`}
              title={t('entry.displayTitle')}
              aria-expanded={displayOpen}
              onClick={() => {
                playSound(displayOpen ? 'toc' : 'tic');
                setDisplayOpen(!displayOpen);
              }}
            >
              {t('entry.display')}
            </button>
          )
        }
      />
      {displayOpen && view === 'write' && (
        <DisplaySheet
          prefs={prefs}
          updatePrefs={updatePrefs}
          shortcut={(id) => registry.shortcutLabel(id)}
          onSettings={() => {
            playSound('toc');
            setDisplayOpen(false);
            void ctx.runCommand('openSettings');
          }}
          onClose={(backToText) => {
            playSound('toc');
            setDisplayOpen(false);
            if (backToText) focusTextIfIdle();
          }}
        />
      )}
      {navigatorOpen && (
        <Navigator
          ctx={ctx}
          outline={outline}
          active={palette === null && !menuOpen}
          signals={marks.openSignals}
          onClose={() => {
            playSound('toc');
            setNavigatorOpen(false);
            focusTextIfIdle();
          }}
        />
      )}
      {menu && (
        <ThingMenuHost
          key={menu.id}
          menu={menuModel}
          line={menu.line}
          anchor={menu.anchor}
          surface={menu.surface}
          onGone={() => setMenu(null)}
          onClose={() => {
            // Closed without a choice: what waited for its second press is forgotten.
            presses.disarm();
            closeMenu();
          }}
          onChoose={(run) => {
            closeMenu();
            run();
          }}
        />
      )}
      {touring && (
        <GuidedTour
          shortcuts={{
            1: registry.shortcutLabel('toggleNavigator'),
            2: registry.shortcutLabel('toggleMentorPanel'),
            3: registry.shortcutLabel('openPalette'),
          }}
          onDone={() => {
            setTouring(false);
            focusTextIfIdle();
          }}
        />
      )}
      {palette && (
        <CommandPalette
          key={palette.key}
          request={palette.request}
          commands={paletteCommands}
          scopes={paletteScopes}
          recent={recentCommands}
          suggested={
            agentsStatus === 'unconfigured'
              ? ['setApiKey', ...SUGGESTED_COMMANDS]
              : agentsStatus === 'locked'
                ? ['unlockCompagnon', ...SUGGESTED_COMMANDS]
                : SUGGESTED_COMMANDS
          }
          onClose={closePalette}
          onDismiss={() => {
            // Closed without a choice: what waited for its second press is forgotten.
            presses.disarm();
            closePalette();
          }}
          armed={armed}
          onAsk={(run) => presses.within('palette', run)}
        />
      )}
    </div>
  );
}
