import { readOutline } from '@charpentier/schema';
import type { Editor } from '@tiptap/core';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlatform } from '../app/platform-context';
import { createWorkspaceRegistry } from '../commands/workspace-commands';
import { SceneEditor } from '../editor/SceneEditor';
import { useDocSnapshot } from '../hooks/use-doc-snapshot';
import { Navigator } from '../navigator/Navigator';
import { CommandPalette } from '../palette/CommandPalette';
import type { PaletteRequest } from '../palette/palette-request';
import { lastScenePref, type ProjectSession } from './default-scene';
import { variantLabel } from '../commands/variant-commands';
import { useSceneDocs } from './use-scene-docs';
import type { WorkspaceContext } from './workspace-context';

let paletteSequence = 0;

/** The writing workspace of one project: editor, navigator, palette, shortcuts. */
export function ProjectWorkspace({ session }: { readonly session: ProjectSession }) {
  const { t } = useTranslation();
  const platform = usePlatform();
  const { root, projectId, language } = session;

  const [requestedSceneId, setRequestedSceneId] = useState(session.initialSceneId);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [palette, setPalette] = useState<{ key: number; request: PaletteRequest } | null>(null);
  const [navigatorOpen, setNavigatorOpen] = useState(false);

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
  const sceneDocs = useSceneDocs(platform, projectId, sceneId, scene?.activeVariantId ?? '');
  const [status, setStatus] = useState<{ key: number; text: string } | null>(null);

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

  // Back to the text whenever nothing else holds the focus.
  const focusTextIfIdle = useCallback(() => {
    if (!latest.current.paletteOpen) editor?.commands.focus();
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

  return (
    <>
      <main className="ch-surface">
        <h1 className="ch-visually-hidden">{t('app.name')}</h1>
        {sceneDocs && (
          <SceneEditor
            key={`${sceneId}/${scene?.activeVariantId}`}
            fragment={sceneDocs.fragment}
            language={language}
            onEditor={setEditor}
          />
        )}
      </main>
      <p className="ch-toast" role="status" aria-live="polite">
        {status?.text}
      </p>
      {navigatorOpen && (
        <Navigator
          ctx={ctx}
          outline={outline}
          active={palette === null}
          onClose={() => {
            setNavigatorOpen(false);
            editor?.commands.focus();
          }}
        />
      )}
      {palette && (
        <CommandPalette
          key={palette.key}
          request={palette.request}
          commands={paletteCommands}
          onClose={closePalette}
        />
      )}
    </>
  );
}
