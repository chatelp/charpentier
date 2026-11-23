import type { Platform } from '@charpentier/platform';
import type { i18n } from 'i18next';
import { useEffect, useMemo, useRef, useState } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { Library } from '../library/Library';
import { TitleBar } from './TitleBar';
import { SignIn } from './SignIn';
import {
  initialProjectId,
  openProject,
  ProjectNotHereError,
  projectFromSync,
  type ProjectSession,
} from '../workspace/default-scene';
import { ProjectWorkspace } from '../workspace/Workspace';
import { PlatformContext, usePlatform } from './platform-context';
import {
  activeFeatures,
  installFeatureTexts,
  topZonesHeight,
  type Feature,
} from '../features/feature';
import { FeatureCovers } from '../features/cover';
import { FeaturesContext, FeatureTopZones, useFeatures } from '../features/features-context';
import fr from '../i18n/locales/fr.json';

export interface AppProps {
  readonly platform: Platform;
  readonly i18n: i18n;
  /** What this host adds to the core (docs/SPEC.md D-24): its system layer on the X250. */
  readonly features?: readonly Feature[];
}

const NO_FEATURES: readonly Feature[] = [];

/** The e-mail of the last account signed in on this device (the web app's door). */
const LAST_EMAIL = 'signIn.email';

/** Root of the application, identical in every host. */
export function App({ platform, i18n, features = NO_FEATURES }: AppProps) {
  const active = useMemo(() => {
    const running = activeFeatures(features, platform, fr);
    installFeatureTexts(i18n, running);
    return running;
  }, [features, platform, i18n]);
  return (
    <PlatformContext.Provider value={platform}>
      <I18nextProvider i18n={i18n}>
        <FeaturesContext.Provider value={active}>
          <Root />
        </FeaturesContext.Provider>
      </I18nextProvider>
    </PlatformContext.Provider>
  );
}

type Opening =
  | { state: 'loading' }
  | { state: 'ready'; session: ProjectSession }
  /** `notHere`: a project of the account not yet on this device, and no network. */
  | { state: 'error'; notHere?: boolean };

function Root() {
  const { t } = useTranslation();
  const platform = usePlatform();
  const [projectId, setProjectId] = useState<string>();
  const [opening, setOpening] = useState<Opening>({ state: 'loading' });
  const [library, setLibrary] = useState<{ creating: boolean } | null>(null);

  // The app the server serves (phase 4.7 a): nothing opens before signing in,
  // then the account's library; signed out, back to the sign-in screen.
  const sync = platform.sync;
  const [gate, setGate] = useState<'checking' | 'sign-in' | 'arriving' | 'open'>(
    sync?.accountRequired ? 'checking' : 'open',
  );
  // The e-mail of the last account signed in here: the door opens on the password.
  const [lastEmail, setLastEmail] = useState<string>();
  useEffect(() => {
    if (!sync?.accountRequired) return;
    let cancelled = false;
    void platform.preferences.get<string>(LAST_EMAIL).then((email) => {
      if (!cancelled && typeof email === 'string') setLastEmail(email);
    });
    void sync.account().then((account) => {
      if (!cancelled) setGate((g) => (g === 'checking' ? (account ? 'open' : 'sign-in') : g));
    });
    const stop = sync.onStatusChange((status) => {
      if (status !== 'off') return;
      void sync.account().then((account) => {
        if (cancelled || account) return;
        setGate((g) => (g === 'open' ? 'sign-in' : g));
        setLibrary(null);
        setProjectId(undefined);
      });
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [sync, platform]);
  // Signed in: once the account's library is heard (or after a while, offline),
  // the library opens on the account's novels.
  useEffect(() => {
    if (gate !== 'arriving' || !sync) return;
    let done = false;
    const arrive = async () => {
      if (done) return;
      done = true;
      // The projects come just after the library: a moment for them.
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline && (await platform.library.list()).length === 0)
        await new Promise((resolve) => setTimeout(resolve, 200));
      const projects = await platform.library.list();
      setGate('open');
      if (projects.length > 0) setLibrary({ creating: false });
    };
    const stop = sync.onStatusChange((status) => {
      if (status === 'synced' || status === 'offline') void arrive();
    });
    if (sync.status() === 'synced') void arrive();
    const timer = setTimeout(() => void arrive(), 15_000);
    return () => {
      done = true;
      stop();
      clearTimeout(timer);
    };
  }, [gate, sync, platform]);

  const titles = useMemo(
    () => ({
      project: t('manuscript.defaultProjectTitle'),
      chapter: t('manuscript.defaultChapterTitle'),
      scene: t('manuscript.defaultSceneTitle'),
    }),
    [t],
  );

  // Asked again after a failure (« Réessayer »).
  const [attempt, setAttempt] = useState(0);
  const retry = () => {
    setOpening({ state: 'loading' });
    setAttempt((n) => n + 1);
  };

  // Which project to open at start.
  useEffect(() => {
    if (projectId || gate !== 'open') return;
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
  }, [platform, titles, projectId, attempt, gate]);

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
        if (!cancelled)
          setOpening({ state: 'error', notHere: error instanceof ProjectNotHereError });
      },
    );
    return () => {
      cancelled = true;
      void opened?.close();
    };
  }, [platform, projectId, titles, attempt]);

  // Signed in on a new device: once the account's projects have come, its
  // blank start goes to the trash and the library opens, to open one of them
  // or start a new one (the most recent behind it, should the author close it).
  const current = useRef<ProjectSession | null>(null);
  useEffect(() => {
    current.current = opening.state === 'ready' ? opening.session : null;
  }, [opening]);
  useEffect(() => {
    const sync = platform.sync;
    if (!sync) return;
    let signingIn = false;
    let previous = sync.status();
    // A device already signed in when the app starts is not signing in: its
    // sync merely resumes (16 November 2026, an empty project trashed at a
    // plain relaunch). Only a sign-in after being signed out counts.
    let signedOut: boolean | undefined;
    void sync.account().then((account) => {
      signedOut ??= account === null;
    });
    return sync.onStatusChange((status) => {
      if (status === 'off') signedOut = true;
      if (previous === 'off' && status !== 'off') signingIn = true;
      previous = status;
      const session = current.current;
      if (!signingIn || status !== 'synced' || !session) return;
      signingIn = false;
      if (!signedOut) return;
      projectFromSync(platform, session, titles).then(
        (id) => {
          if (!id) return;
          setProjectId(id);
          setLibrary({ creating: false });
        },
        (error: unknown) => console.error(error),
      );
    });
  }, [platform, titles]);

  // While another project opens, the previous session is no longer shown.
  const shown =
    opening.state === 'ready' && opening.session.projectId !== projectId
      ? ({ state: 'loading' } as const)
      : opening;

  // The title bar, absent in full screen (docs/DESIGN.md §4.1).
  const [fullScreen, setFullScreen] = useState(false);
  useEffect(() => platform.onFullScreenChange?.(setFullScreen), [platform]);
  const titleBarHeight = fullScreen ? 0 : (platform.titleBarHeight ?? 0);
  // The features' bands come below the title bar, the rest below them.
  const zonesHeight = topZonesHeight(useFeatures());
  useEffect(() => {
    const style = document.documentElement.style;
    style.setProperty('--ch-titlebar-offset', `${titleBarHeight}px`);
    style.setProperty('--ch-top-offset', `${titleBarHeight + zonesHeight}px`);
  }, [titleBarHeight, zonesHeight]);

  // In the workspace, the title bar holds the novel's button (docs/DESIGN.md §4.8, 1.19).
  const [titleSlot, setTitleSlot] = useState<HTMLDivElement | null>(null);
  const inWorkspace = !library && shown.state === 'ready';
  const titleBar = titleBarHeight ? (
    <TitleBar
      root={shown.state === 'ready' ? shown.session.root : undefined}
      slot={inWorkspace ? setTitleSlot : undefined}
    />
  ) : null;

  if (gate === 'sign-in' && sync)
    return (
      <SignIn
        key={lastEmail ?? ''}
        sync={sync}
        {...(lastEmail && { email: lastEmail })}
        onSignedIn={(email) => {
          setLastEmail(email);
          void platform.preferences.set(LAST_EMAIL, email);
          setGate('arriving');
        }}
      />
    );
  if (gate === 'checking' || gate === 'arriving')
    return <p role="status">{t(gate === 'arriving' ? 'sync.screen.arriving' : 'app.loading')}</p>;

  if (library)
    return (
      <FeatureCovers>
        {titleBar}
        <FeatureTopZones ctx={null} />
        <Library
          currentProjectId={projectId}
          creating={library.creating}
          onOpen={(id) => {
            setLibrary(null);
            // The one that just failed, chosen again: another try.
            if (opening.state === 'error') retry();
            setProjectId(id);
          }}
          onClose={() => setLibrary(null)}
        />
      </FeatureCovers>
    );

  return (
    <FeatureCovers>
      {titleBar}
      {shown.state === 'ready' && (
        <ProjectWorkspace
          key={shown.session.projectId}
          session={shown.session}
          onLibrary={(creating) => setLibrary({ creating })}
          onOpenProject={setProjectId}
          titleSlot={titleBarHeight ? titleSlot : null}
        />
      )}
      {shown.state === 'loading' && <p role="status">{t('app.loading')}</p>}
      {shown.state === 'error' && (
        <div role="alert">
          <p>{t(shown.notHere ? 'app.notHere' : 'app.openError')}</p>
          <button type="button" className="ch-btn" autoFocus onClick={retry}>
            {t('app.retry')}
          </button>
          <button type="button" className="ch-btn" onClick={() => setLibrary({ creating: false })}>
            {t('app.library')}
          </button>
        </div>
      )}
    </FeatureCovers>
  );
}
