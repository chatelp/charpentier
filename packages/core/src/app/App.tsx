import type { Platform } from '@charpentier/platform';
import type { i18n } from 'i18next';
import { I18nextProvider, useTranslation } from 'react-i18next';
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
        <WritingSurface />
      </I18nextProvider>
    </PlatformContext.Provider>
  );
}

function WritingSurface() {
  const { t } = useTranslation();
  const platform = usePlatform();
  const mentorUnavailable = platform.agents.status() === 'disabled';

  return (
    <main className="ch-surface">
      <h1 className="ch-visually-hidden">{t('app.name')}</h1>
      <p className="ch-placeholder">{t('editor.emptyScene')}</p>
      {mentorUnavailable && <p className="ch-status">{t('mentor.unavailableOnHost')}</p>}
    </main>
  );
}
