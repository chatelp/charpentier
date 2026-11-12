import type { Platform } from '@charpentier/platform';
import type { i18n } from 'i18next';
import { useEffect, useMemo, useState } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { Library } from '../library/Library';
import { TitleBar } from './TitleBar';
import { initialProjectId, openProject, type ProjectSession } from '../workspace/default-scene';
import { ProjectWorkspace } from '../workspace/Workspace';
import { PlatformContext, usePlatform } from './platform-context';

export interface AppProps {
  readonly platform: Platform;
  readonly i18n: i18n;
}

/** Root of the application, identical in every host. */
export function App({ platform, i18n }: AppProps) {
  return (
    <PlatformContext.Provider value={platform}>
      <I18nextProvider i18n={i18n}>
        <Root />
      </I18nextProvider>
    </PlatformContext.Provider>
  );
}

type Opening =
  { state: 'loading' } | { state: 'ready'; session: ProjectSession } | { state: 'error' };

function Root() {
  const { t } = useTranslation();
  const platform = usePlatform();
  const [projectId, setProjectId] = useState<string>();
  const [opening, setOpening] = useState<Opening>({ state: 'loading' });
  const [library, setLibrary] = useState<{ creating: boolean } | null>(null);

  const titles = useMemo(
    () => ({
      project: t('manuscript.defaultProjectTitle'),
      chapter: t('manuscript.defaultChapterTitle'),
      scene: t('manuscript.defaultSceneTitle'),
    }),
    [t],
  );

  // Which project to open at start.
  useEffect(() => {
    let cancelled = false;
    initialProjectId(platform, titles).then(
      (id) => !cancelled && setProjectId(id),
      (error: unknown) => {
        console.error(error);
        if (!cancelled) setOpening({ state: 'error' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [platform, titles]);

  // Opens it, and closes it when another one is chosen.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    let opened: ProjectSession | undefined;
    openProject(platform, projectId, titles).then(
      (session) => {
        if (cancelled) void session.close();
        else {
          opened = session;
          setOpening({ state: 'ready', session });
        }
      },
      (error: unknown) => {
        console.error(error);
        if (!cancelled) setOpening({ state: 'error' });
      },
    );
    return () => {
      cancelled = true;
      void opened?.close();
    };
  }, [platform, projectId, titles]);

  // While another project opens, the previous session is no longer shown.
  const shown =
    opening.state === 'ready' && opening.session.projectId !== projectId
      ? ({ state: 'loading' } as const)
      : opening;

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--ch-titlebar-offset',
      `${platform.titleBarHeight ?? 0}px`,
    );
  }, [platform]);

  const titleBar = platform.titleBarHeight ? (
    <TitleBar root={shown.state === 'ready' ? shown.session.root : undefined} />
  ) : null;

  if (library)
    return (
      <>
        {titleBar}
        <Library
          currentProjectId={projectId}
          creating={library.creating}
          onOpen={(id) => {
            setLibrary(null);
            setProjectId(id);
          }}
          onClose={() => setLibrary(null)}
        />
      </>
    );

  return (
    <>
      {titleBar}
      {shown.state === 'ready' && (
        <ProjectWorkspace
          key={shown.session.projectId}
          session={shown.session}
          onLibrary={(creating) => setLibrary({ creating })}
        />
      )}
      {shown.state === 'error' && <p role="alert">{t('app.openError')}</p>}
    </>
  );
}
