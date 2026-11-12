import { readMentorLevel, readOutline } from '@charpentier/schema';
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
} from 'react';
import { useTranslation } from 'react-i18next';
import { usePlatform } from '../app/platform-context';
import { Atelier, type AtelierLocation } from '../atelier/Atelier';
import { sheetScope } from '../atelier/sheet-scope';
import { Overview } from '../overview/Overview';
import { Conversation } from '../mentor/Conversation';
import { InterventionSlider } from '../mentor/InterventionSlider';
import { MentorPanel } from '../mentor/MentorPanel';
import { SignalNote } from '../mentor/SignalNote';
import { placedSignals } from '../mentor/signal-decorations';
import { useMentorMarks } from '../mentor/use-mentor-marks';
import '../mentor/mentor.css';
import { variantLabel } from '../commands/variant-commands';
import { createWorkspaceRegistry } from '../commands/workspace-commands';
import { createLanguageChecker } from '../language/checker';
import { knownWordsOf } from '../language/known-words';
import { SceneEditor } from '../editor/SceneEditor';
import { useDocSnapshot } from '../hooks/use-doc-snapshot';
import { Navigator } from '../navigator/Navigator';
import { CommandPalette } from '../palette/CommandPalette';
import type { PaletteRequest, PaletteScope } from '../palette/palette-request';
import { lastScenePref, type ProjectSession } from './default-scene';
import { SceneHeader, SceneOpener, WritingFooter } from './SceneChrome';
import { useSceneDocs } from './use-scene-docs';
import { useTypewriterScroll, useWordCount } from './use-writing-surface';
import { useWordsToday } from './use-words-today';
import type { WorkspaceContext } from './workspace-context';
import { useWritingPrefs } from './writing-prefs';
import './workspace.css';

let paletteSequence = 0;

/** The writing workspace of one project: editor, drawer, command line, shortcuts. */
export function ProjectWorkspace({
  session,
  onLibrary,
}: {
  readonly session: ProjectSession;
  /** Shows the library of projects (`creating`: with the new project form open). */
  readonly onLibrary: (creating: boolean) => void;
}) {
  const { t } = useTranslation();
  const platform = usePlatform();
  const { root, projectId, language } = session;

  const [requestedSceneId, setRequestedSceneId] = useState(session.initialSceneId);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [palette, setPalette] = useState<{ key: number; request: PaletteRequest } | null>(null);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [view, setView] = useState<WorkspaceContext['view']>('write');
  const [atelierLocation, setAtelierLocation] = useState<AtelierLocation>({ rail: 'meta' });
  const [atelierFocus, setAtelierFocus] = useState(0);
  const paletteReturn = useRef<Element | null>(null);
  const [prefs, updatePrefs] = useWritingPrefs(platform.preferences);
  const scroller = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLElement>(null);
  const [mentorPanel, setMentorPanel] = useState<'points' | 'conversation' | null>(null);
  // A remark to show once its scene's editor is ready (going there from the panel).
  const pendingSignal = useRef<string | null>(null);

  const registry = useMemo(
    () =>
      createWorkspaceRegistry(platform.keybindings.primaryModifier, platform.keybindings.reserved),
    [platform],
  );
  const outline = useDocSnapshot(root, readOutline);
  const mentorLevel = useDocSnapshot(root, readMentorLevel);
  // The editor is rebuilt only when the language check turns on or off, not at every level.
  const languageOn = mentorLevel > 1;
  const scenes = outline.flatMap((c) => c.scenes);
  // The requested scene may vanish (trashed on another device): fall back to the first one.
  const scene = scenes.find((s) => s.id === requestedSceneId) ?? scenes[0];
  const sceneId = scene?.id ?? requestedSceneId;
  const chapterIndex = outline.findIndex((c) => c.scenes.some((s) => s.id === sceneId));
  const chapter = outline[chapterIndex];
  const sceneDocs = useSceneDocs(platform, projectId, sceneId, scene?.activeVariantId ?? '');
  const [status, setStatus] = useState<{ key: number; text: string } | null>(null);
  const { agents } = platform;
  const subscribeAgents = useCallback(
    (onChange: () => void) => agents.onStatusChange(onChange),
    [agents],
  );
  const agentsStatus = useSyncExternalStore(subscribeAgents, () => agents.status());
  const words = useWordCount(editor);
  const wordsToday = useWordsToday(
    platform.preferences,
    projectId,
    `${sceneId}/${scene?.activeVariantId ?? ''}`,
    editor ? words : undefined,
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
  const marks = useMentorMarks({
    root,
    sceneId,
    variantId: scene?.activeVariantId ?? '',
    editor,
    page,
    // D-19: the pause before a note unfolds by itself, by level.
    pauseMs: mentorLevel === 1 ? null : mentorLevel === 2 ? 3000 : 1500,
  });

  // ─── When the Compagnon reads (D-19) ───
  const analyze = useCallback(
    (sceneIds: readonly string[], automatic: boolean) => {
      if (sceneIds.length === 0) return;
      void platform.agents.analyze({ projectId, sceneIds, automatic }).then((result) => {
        if (!automatic && result !== 'answered')
          setStatus({ key: ++paletteSequence, text: t(`mentor.ask.${result}`) });
        if (!automatic && result === 'answered')
          setStatus({ key: ++paletteSequence, text: t('mentor.analysisDone') });
      });
    },
    [platform, projectId, t],
  );
  // Leaving a scene (level 2 and up) analyses it.
  const previousScene = useRef(sceneId);
  useEffect(() => {
    const left = previousScene.current;
    previousScene.current = sceneId;
    if (left !== sceneId && mentorLevel >= 2 && agentsStatus === 'available') analyze([left], true);
  }, [sceneId, mentorLevel, agentsStatus, analyze]);
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

  const openScene = useCallback(
    (id: string) => {
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
    openLibrary: (creating = false) => onLibrary(creating),
    openOverview: () => {
      setNavigatorOpen(false);
      setView('overview');
    },
    toggleNavigator: () => setNavigatorOpen((open) => !open),
    mentorPanel,
    toggleMentorPanel: (tab = 'points') => setMentorPanel((open) => (open === tab ? null : tab)),
    openSignalNote: (id) => marks.openNote(id, true),
    mentorLevel,
    analyze,
    shortcutLabel: (id) => registry.shortcutLabel(id),
    notify,
    prefs,
    updatePrefs,
  };

  // Global shortcuts. The listener reads the latest context through a ref.
  const latest = useRef(ctx);
  const paletteOpenRef = useRef(false);
  const paletteOpen = palette !== null;
  useLayoutEffect(() => {
    latest.current = ctx;
    paletteOpenRef.current = paletteOpen;
  });
  // Where the focus goes back when the command line closes (an Atelier field…).
  // A layout effect runs before the command line takes the focus.
  useLayoutEffect(() => {
    if (paletteOpen) paletteReturn.current = document.activeElement;
  }, [paletteOpen]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || paletteOpenRef.current) return;
      const command = registry.forEvent(event, latest.current);
      if (!command) return;
      event.preventDefault();
      event.stopPropagation();
      void command.run(latest.current);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [registry]);

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
      !mentorPanel &&
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

  useEffect(() => {
    if (!scene) return;
    const variant =
      scene.variants.length > 1 ? ` (${variantLabel(t, scene, scene.activeVariantId)})` : '';
    document.title = `${scene.title}${variant} · ${t('app.name')}`;
  }, [scene, t]);

  // Confirmations fade after a few seconds.
  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 4000);
    return () => clearTimeout(timer);
  }, [status]);

  const closePalette = () => {
    setPalette(null);
    // A command chosen in the palette may open another one right after.
    paletteOpenRef.current = false;
    if (navigatorOpen) return;
    const back = paletteReturn.current;
    paletteReturn.current = null;
    if (view === 'write') focusTextIfIdle();
    else if (back instanceof HTMLElement && back.isConnected) back.focus();
    else if (view === 'atelier') setAtelierFocus((n) => n + 1);
  };

  const paletteCommands = registry
    .available(ctx)
    .filter((command) => command.id !== 'openPalette')
    .map((command) => {
      const shortcut = registry.shortcutLabel(command.id);
      return {
        id: command.id,
        label: t(`commands.${command.id}` as 'commands.openPalette'),
        ...(shortcut && { shortcut }),
        run: () => void command.run(ctx),
      };
    });

  const paletteScopes: Record<string, PaletteScope> = !palette
    ? {}
    : {
        '#': {
          label: t('palette.scenesGroup'),
          items: outline.flatMap((c) =>
            c.scenes.map((s) => ({ id: s.id, label: s.title, detail: c.title })),
          ),
          onPick: (id) => {
            openScene(id);
            setView('write');
          },
        },
        '@': sheetScope(ctx),
      };

  const mentorNote = {
    disabled: t('mentor.unavailableOnHost'),
    unconfigured: t('mentor.status.unconfigured'),
    offline: t('mentor.status.offline'),
    available: undefined,
  }[agentsStatus];

  const surfaceStyle = {
    '--ch-text-size': `${prefs.textSize / 16}rem`,
    '--ch-measure': `${prefs.measure}rem`,
  } as CSSProperties;

  return (
    <div
      className="ch-app"
      style={surfaceStyle}
      data-focus={prefs.focusMode || undefined}
      data-typewriter={prefs.typewriter || undefined}
      data-mentor-panel={mentorPanel ?? undefined}
      data-mentor-level={mentorLevel}
    >
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
          onOutline={() => setNavigatorOpen(true)}
          onVariants={() => void registry.execute('switchVariant', ctx)}
        />
        <main className="ch-page" ref={page}>
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
            />
          )}
          {marks.noteSignal && marks.noteTop !== null && !mentorPanel && (
            <SignalNote
              root={root}
              signal={marks.noteSignal}
              style={{ top: marks.noteTop }}
              focus={marks.note?.focus ?? false}
              onFixText={() => {
                const placed =
                  editor &&
                  placedSignals(editor.state).find((p) => p.signal.id === marks.noteSignal?.id);
                if (editor && placed)
                  editor
                    .chain()
                    .focus()
                    .setTextSelection({ from: placed.from, to: placed.to })
                    .run();
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
                const placed =
                  editor &&
                  placedSignals(editor.state).find((p) => p.signal.id === marks.noteSignal?.id);
                if (editor && placed)
                  editor
                    .chain()
                    .focus()
                    .insertContentAt({ from: placed.from, to: placed.to }, text)
                    .run();
              }}
              onInsertExample={(text) => {
                if (!editor || editor.isDestroyed) return;
                editor.chain().focus().insertContent(text).run();
                notify(t('mentor.exampleInserted'));
              }}
              onClose={(backToText) => {
                marks.closeNote();
                if (backToText) focusTextIfIdle();
              }}
            />
          )}
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
      {mentorPanel && (
        <MentorPanel
          root={root}
          outline={outline}
          sceneId={sceneId}
          signals={marks.openSignals}
          sceneOrder={
            editor && !editor.isDestroyed ? placedSignals(editor.state).map((p) => p.signal.id) : []
          }
          tab={mentorPanel}
          onTab={setMentorPanel}
          header={<InterventionSlider root={root} level={mentorLevel} />}
          conversation={
            <Conversation
              projectId={projectId}
              sceneId={sceneId}
              active={palette === null && mentorPanel === 'conversation'}
              onInsertExample={(example) => {
                // D-11: the only way an example enters the text, on the author's gesture.
                if (!editor || editor.isDestroyed) return;
                editor.chain().focus().insertContent(example).run();
                notify(t('mentor.exampleInserted'));
              }}
              onClose={() => {
                setMentorPanel(null);
                focusTextIfIdle();
              }}
            />
          }
          active={palette === null}
          onGoTo={(signal) => {
            const target = signal.textAnchor?.sceneId;
            if (target) {
              setView('write');
              pendingSignal.current = signal.id;
              if (target !== sceneId) openScene(target);
              else showPendingSignal();
            }
          }}
          onClose={() => {
            setMentorPanel(null);
            focusTextIfIdle();
          }}
        />
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
        />
      )}
      <WritingFooter
        words={view === 'write' ? words : undefined}
        wordsToday={wordsToday}
        remarks={marks.openSignals.length}
        onRemarks={() => setMentorPanel('points')}
        status={status?.text}
        mentorNote={mentorNote}
      />
      {navigatorOpen && (
        <Navigator
          ctx={ctx}
          outline={outline}
          active={palette === null}
          signals={marks.openSignals}
          onClose={() => {
            setNavigatorOpen(false);
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
          onClose={closePalette}
        />
      )}
    </div>
  );
}
