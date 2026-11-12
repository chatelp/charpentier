import type { Platform } from '@charpentier/platform';
import type { i18n } from 'i18next';
import { useEffect, useState } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { openDefaultProject, type ProjectSession } from '../workspace/default-scene';
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
  const [opening, setOpening] = useState<Opening>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let opened: ProjectSession | undefined;
    openDefaultProject(platform, {
      project: t('manuscript.defaultProjectTitle'),
      chapter: t('manuscript.defaultChapterTitle'),
      scene: t('manuscript.defaultSceneTitle'),
    }).then(
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
  }, [platform, t]);

  return (
    <>
      {opening.state === 'ready' && <ProjectWorkspace session={opening.session} />}
      {opening.state === 'error' && <p role="alert">{t('app.openError')}</p>}
    </>
  );
}
