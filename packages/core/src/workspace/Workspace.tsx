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
export function ProjectWorkspace({ session }: { readonly session: ProjectSession }) {
  const { t } = useTranslation();
  const platform = usePlatform();
  const { root, projectId, language } = session;

  const [requestedSceneId, setRequestedSceneId] = useState(session.initialSceneId);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [palette, setPalette] = useState<{ key: number; request: PaletteRequest } | null>(null);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
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
    projectId,
    root,
    sceneId,
    editor,
    sceneDocs,
    language,
    openScene,
    openPalette: (request = { kind: 'commands' }) =>
      setPalette({ key: ++paletteSequence, request }),
    toggleNavigator: () => setNavigatorOpen((open) => !open),
    shortcutLabel: (id) => registry.shortcutLabel(id),
    notify: (text) => setStatus({ key: ++paletteSequence, text }),
    prefs,
    updatePrefs,
  };

  // Global shortcuts. The listener reads the latest context through a ref.
  const latest = useRef({ ctx, paletteOpen: false });
  useLayoutEffect(() => {
    latest.current = { ctx, paletteOpen: palette !== null };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || latest.current.paletteOpen) return;
      const command = registry.forEvent(event, latest.current.ctx);
      if (!command) return;
      event.preventDefault();
      event.stopPropagation();
      void command.run(latest.current.ctx);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [registry]);

  // Back to the text whenever nothing else holds the focus. Synchronous on
  // purpose: TipTap's `focus()` waits a frame and could then take the focus
  // from a command line opened in between.
  const focusTextIfIdle = useCallback(() => {
    if (!latest.current.paletteOpen && editor && !editor.isDestroyed) editor.view.focus();
  }, [editor]);
  const lastFocusedEditor = useRef<Editor | null>(null);
  useEffect(() => {
    if (editor && editor !== lastFocusedEditor.current && !palette && !navigatorOpen) {
      lastFocusedEditor.current = editor;
      editor.commands.focus('end');
    }
  }, [editor, palette, navigatorOpen]);

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
    latest.current.paletteOpen = false;
    if (!navigatorOpen) focusTextIfIdle();
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

  const paletteScopes: Record<string, PaletteScope> = {
    '#': {
      label: t('palette.scenesGroup'),
      items: outline.flatMap((c) =>
        c.scenes.map((s) => ({ id: s.id, label: s.title, detail: c.title })),
      ),
      onPick: openScene,
    },
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
      <WritingFooter words={words} status={status?.text} mentorNote={mentorNote} />
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
