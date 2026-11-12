import type { Platform } from '@charpentier/platform';
import type { i18n } from 'i18next';
import { useEffect, useState } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { SceneEditor } from '../editor/SceneEditor';
import { openDefaultScene, type OpenScene } from '../workspace/default-scene';
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
        <Workspace />
      </I18nextProvider>
    </PlatformContext.Provider>
  );
}

type Opening = { state: 'loading' } | { state: 'ready'; scene: OpenScene } | { state: 'error' };

function Workspace() {
  const { t } = useTranslation();
  const platform = usePlatform();
  const [opening, setOpening] = useState<Opening>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let opened: OpenScene | undefined;
    openDefaultScene(platform, {
      project: t('manuscript.defaultProjectTitle'),
      chapter: t('manuscript.defaultChapterTitle'),
      scene: t('manuscript.defaultSceneTitle'),
    }).then(
      (scene) => {
        if (cancelled) void scene.close();
        else {
          opened = scene;
          setOpening({ state: 'ready', scene });
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

  const mentorUnavailable = platform.agents.status() === 'disabled';

  return (
    <main className="ch-surface">
      <h1 className="ch-visually-hidden">{t('app.name')}</h1>
      {opening.state === 'ready' && (
        <SceneEditor fragment={opening.scene.fragment} language={opening.scene.language} />
      )}
      {opening.state === 'error' && <p role="alert">{t('app.openError')}</p>}
      {mentorUnavailable && <p className="ch-status">{t('mentor.unavailableOnHost')}</p>}
    </main>
  );
}
