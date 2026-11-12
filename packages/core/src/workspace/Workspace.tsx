import { readOutline } from '@charpentier/schema';
import type { Editor } from '@tiptap/core';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useTranslation } from 'react-i18next';
import { usePlatform } from '../app/platform-context';
import { Atelier, type AtelierLocation } from '../atelier/Atelier';
import { sheetScope } from '../atelier/sheet-scope';
import { Overview } from '../overview/Overview';
import { variantLabel } from '../commands/variant-commands';
import { createWorkspaceRegistry } from '../commands/workspace-commands';
import { SceneEditor } from '../editor/SceneEditor';
import { useDocSnapshot } from '../hooks/use-doc-snapshot';
import { Navigator } from '../navigator/Navigator';
import { CommandPalette } from '../palette/CommandPalette';
import type { PaletteRequest, PaletteScope } from '../palette/palette-request';
import { lastScenePref, type ProjectSession } from './default-scene';
import { SceneHeader, SceneOpener, WritingFooter } from './SceneChrome';
import { useSceneDocs } from './use-scene-docs';
import { useTypewriterScroll, useWordCount } from './use-writing-surface';
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

  const registry = useMemo(
    () =>
      createWorkspaceRegistry(platform.keybindings.primaryModifier, platform.keybindings.reserved),
    [platform],
  );
  const outline = useDocSnapshot(root, readOutline);
  const scenes = outline.flatMap((c) => c.scenes);
  // The requested scene may vanish (trashed on another device): fall back to the first one.
  const scene = scenes.find((s) => s.id === requestedSceneId) ?? scenes[0];
  const sceneId = scene?.id ?? requestedSceneId;
  const chapterIndex = outline.findIndex((c) => c.scenes.some((s) => s.id === sceneId));
  const chapter = outline[chapterIndex];
  const sceneDocs = useSceneDocs(platform, projectId, sceneId, scene?.activeVariantId ?? '');
  const [status, setStatus] = useState<{ key: number; text: string } | null>(null);
  const words = useWordCount(editor);
  useTypewriterScroll(editor, scroller, prefs.typewriter);

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
    shortcutLabel: (id) => registry.shortcutLabel(id),
    notify: (text) => setStatus({ key: ++paletteSequence, text }),
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
      view === 'write'
    ) {
      lastFocusedEditor.current = editor;
      editor.commands.focus('end');
    }
  }, [editor, palette, navigatorOpen, view]);

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

  const mentorNote =
    platform.agents.status() === 'disabled' ? t('mentor.unavailableOnHost') : undefined;

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
          scene={scene}
          onOutline={() => setNavigatorOpen(true)}
          onVariants={() => void registry.execute('switchVariant', ctx)}
        />
        <main className="ch-page">
          <h1 className="ch-visually-hidden">{t('app.name')}</h1>
          <SceneOpener chapter={chapter} chapterIndex={chapterIndex} scene={scene} />
          {sceneDocs && (
            <SceneEditor
              key={`${sceneId}/${scene?.activeVariantId}`}
              fragment={sceneDocs.fragment}
              language={language}
              onEditor={setEditor}
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
        status={status?.text}
        mentorNote={mentorNote}
      />
      {navigatorOpen && (
        <Navigator
          ctx={ctx}
          outline={outline}
          active={palette === null}
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
