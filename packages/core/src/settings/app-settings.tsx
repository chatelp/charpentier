import type { LlmStatus, SyncAccountInfo, SyncStatus } from '@charpentier/platform';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { featureText, type SettingsSection } from '../features/feature';
import { previewSound } from '../sound/sounds';
import {
  stepMeasure,
  stepTextSize,
  TEXT_SIZE,
  type WritingPrefs,
} from '../workspace/writing-prefs';
import type { WorkspaceContext } from '../workspace/workspace-context';
import './app-settings.css';

type Ctx = WorkspaceContext;

/**
 * The app's settings (docs/DESIGN.md §4.8 « Réglages de l'app », 1.22; D-36,
 * docs/PLAN.md phase 7.3): on the Mac, the web and the X250, in the app's
 * design. They gather what the commands and the « Aa » sheet already set,
 * which stay the quick ways. On the X250 the machine's settings have their
 * own view, in the system's charter.
 */

/** A group of lines under its title in small caps. */
function Group({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="ch-aset-group" aria-label={title}>
      <h4 className="ch-aset-group-title ch-label">{title}</h4>
      {children}
    </section>
  );
}

/** A line: its label and one sentence of help, its control on the right; sunk when it names what is chosen. */
function Line({
  label,
  help,
  sunk = false,
  children,
}: {
  readonly label: ReactNode;
  readonly help?: string | undefined;
  readonly sunk?: boolean;
  readonly children?: ReactNode;
}) {
  return (
    <div className={`ch-aset-line${sunk ? ' is-sunk' : ''}`}>
      <div className="ch-aset-text">
        <p className="ch-aset-label">{label}</p>
        {help && <p className="ch-aset-help">{help}</p>}
      </div>
      <div className="ch-aset-control">{children}</div>
    </div>
  );
}

/** Setting keys (docs/DESIGN.md §4.7): the chosen one stays pressed. */
function Choice<T extends string | boolean>({
  value,
  options,
  label,
  onChange,
}: {
  readonly value: T;
  readonly options: readonly (readonly [T, string])[];
  readonly label: string;
  readonly onChange: (value: T) => void;
}) {
  return (
    <span className="ch-aset-choice" role="radiogroup" aria-label={label}>
      {options.map(([option, text]) => (
        <button
          key={String(option)}
          type="button"
          role="radio"
          aria-checked={option === value}
          className={`ch-btn ch-display-choice${option === value ? ' is-on' : ''}`}
          onClick={() => onChange(option)}
        >
          {text}
        </button>
      ))}
    </span>
  );
}

/** − value +: a number between its bounds. */
function Stepper({
  value,
  label,
  less,
  more,
  onStep,
}: {
  readonly value: string;
  readonly label: string;
  readonly less: string;
  readonly more: string;
  readonly onStep: (direction: 1 | -1) => void;
}) {
  return (
    <span className="ch-aset-stepper" role="group" aria-label={label}>
      <button type="button" className="ch-btn" aria-label={less} onClick={() => onStep(-1)}>
        −
      </button>
      <span className="ch-aset-number" aria-live="polite">
        {value}
      </span>
      <button type="button" className="ch-btn" aria-label={more} onClick={() => onStep(1)}>
        +
      </button>
    </span>
  );
}

const yesNo = (t: Ctx['t']) =>
  [
    [true, t('appSettings.yes')],
    [false, t('appSettings.no')],
  ] as const;

// ─── Apparence ───────────────────────────────────────────────────────────

function Appearance({ ctx }: { readonly ctx: Ctx }) {
  const { t } = useTranslation();
  const { prefs, updatePrefs } = ctx;
  return (
    <>
      <Group title={t('appSettings.appearance.theme')}>
        <Line label={t('display.theme')} help={t('appSettings.appearance.themeHelp')}>
          <Choice<WritingPrefs['theme']>
            label={t('display.theme')}
            value={prefs.theme}
            options={[
              ['system', t('display.system')],
              ['light', t('display.light')],
              ['dark', t('display.dark')],
            ]}
            onChange={(theme) => updatePrefs({ theme })}
          />
        </Line>
      </Group>
      <Group title={t('appSettings.appearance.motion')}>
        <Line label={t('display.motion')} help={t('appSettings.appearance.motionHelp')}>
          <Choice
            label={t('display.motion')}
            value={prefs.reducedMotion}
            options={yesNo(t)}
            onChange={(reducedMotion) => updatePrefs({ reducedMotion })}
          />
        </Line>
      </Group>
      <Group title={t('appSettings.appearance.page')}>
        <Line
          label={t('display.textSize')}
          help={t('appSettings.appearance.textSizeHelp', {
            min: TEXT_SIZE.min,
            max: TEXT_SIZE.max,
            initial: TEXT_SIZE.initial,
            keys: [ctx.shortcutLabel('increaseTextSize'), ctx.shortcutLabel('decreaseTextSize')]
              .filter(Boolean)
              .join(' '),
            reset: ctx.shortcutLabel('resetTextSize') ?? '',
          })}
        >
          <Stepper
            label={t('display.textSize')}
            value={t('appSettings.px', { value: prefs.textSize })}
            less={t('commands.decreaseTextSize')}
            more={t('commands.increaseTextSize')}
            onStep={(d) => updatePrefs((p) => stepTextSize(p, d))}
          />
        </Line>
        <Line label={t('display.column')} help={t('appSettings.appearance.columnHelp')}>
          <Stepper
            label={t('display.column')}
            value={t('appSettings.rem', { value: prefs.measure })}
            less={t('commands.narrowColumn')}
            more={t('commands.widenColumn')}
            onStep={(d) => updatePrefs((p) => stepMeasure(p, d))}
          />
        </Line>
      </Group>
    </>
  );
}

// ─── Écriture ────────────────────────────────────────────────────────────

function Writing({ ctx }: { readonly ctx: Ctx }) {
  const { t } = useTranslation();
  const { prefs, updatePrefs } = ctx;
  return (
    <>
      <Group title={t('appSettings.writing.page')}>
        <Line label={t('display.focus')} help={t('appSettings.writing.focusHelp')}>
          <Choice
            label={t('display.focus')}
            value={prefs.focusMode}
            options={yesNo(t)}
            onChange={(focusMode) => updatePrefs({ focusMode })}
          />
        </Line>
        <Line
          label={t('appSettings.writing.typewriter')}
          help={t('appSettings.writing.typewriterHelp')}
        >
          <Choice
            label={t('appSettings.writing.typewriter')}
            value={prefs.typewriter}
            options={yesNo(t)}
            onChange={(typewriter) => updatePrefs({ typewriter })}
          />
        </Line>
      </Group>
      <Group title={t('appSettings.writing.atelier')}>
        <Line
          label={t('appSettings.writing.rejected')}
          help={t('appSettings.writing.rejectedHelp')}
        >
          <Choice
            label={t('appSettings.writing.rejected')}
            value={prefs.showRejected}
            options={yesNo(t)}
            onChange={(showRejected) => updatePrefs({ showRejected })}
          />
        </Line>
      </Group>
    </>
  );
}

// ─── Sons ────────────────────────────────────────────────────────────────

function Sounds({ ctx }: { readonly ctx: Ctx }) {
  const { t } = useTranslation();
  const { prefs, updatePrefs } = ctx;
  const listen = (sound: 'click' | 'typing') => (
    <button type="button" className="ch-btn" onClick={() => previewSound(sound)}>
      {t('appSettings.sounds.listen')}
    </button>
  );
  return (
    <Group title={t('appSettings.sounds.app')}>
      <Line label={t('display.uiSounds')} help={t('appSettings.sounds.uiHelp')}>
        {listen('click')}
        <Choice
          label={t('display.uiSounds')}
          value={prefs.uiSounds}
          options={yesNo(t)}
          onChange={(uiSounds) => updatePrefs({ uiSounds })}
        />
      </Line>
      <Line label={t('display.typingSounds')} help={t('appSettings.sounds.typingHelp')}>
        {listen('typing')}
        <Choice
          label={t('display.typingSounds')}
          value={prefs.typingSounds}
          options={yesNo(t)}
          onChange={(typingSounds) => updatePrefs({ typingSounds })}
        />
      </Line>
    </Group>
  );
}

// ─── Compagnon ───────────────────────────────────────────────────────────

function useAgentsStatus(ctx: Ctx): LlmStatus {
  const agents = ctx.platform.agents;
  const [status, setStatus] = useState(() => agents.status());
  useEffect(() => agents.onStatusChange(setStatus), [agents]);
  return status;
}

function useLightModel(ctx: Ctx): readonly ['opus' | 'haiku', (m: 'opus' | 'haiku') => void] {
  const agents = ctx.platform.agents;
  const [model, setModel] = useState<'opus' | 'haiku'>('opus');
  useEffect(() => {
    let live = true;
    agents.lightModel().then(
      (m) => live && setModel(m),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [agents]);
  return [
    model,
    (next) => {
      setModel(next);
      void agents.setLightModel(next);
    },
  ];
}

function Compagnon({ ctx }: { readonly ctx: Ctx }) {
  const { t } = useTranslation();
  const status = useAgentsStatus(ctx);
  const [model, setModel] = useLightModel(ctx);
  const hasKey = status !== 'unconfigured' && status !== 'disabled';
  return (
    <>
      <Group title={t('appSettings.compagnon.key')}>
        <Line
          label={t('appSettings.compagnon.keyLabel')}
          help={t('appSettings.compagnon.keyHelp')}
          sunk={hasKey}
        >
          {status === 'disabled' ? (
            <span className="ch-aset-value">{t('appSettings.compagnon.disabled')}</span>
          ) : (
            <>
              <span className="ch-aset-value">
                {t(hasKey ? 'appSettings.compagnon.keySaved' : 'appSettings.compagnon.noKey')}
              </span>
              <button
                type="button"
                className="ch-btn"
                onClick={() => void ctx.runCommand('setApiKey')}
              >
                {t(hasKey ? 'appSettings.compagnon.change' : 'appSettings.compagnon.enter')}
              </button>
              {hasKey && (
                <button
                  type="button"
                  className="ch-btn"
                  onClick={() => void ctx.runCommand('forgetApiKey')}
                >
                  {t('appSettings.compagnon.forget')}
                </button>
              )}
            </>
          )}
        </Line>
      </Group>
      <Group title={t('appSettings.compagnon.models')}>
        <Line label={t('appSettings.compagnon.light')} help={t('appSettings.compagnon.lightHelp')}>
          <Choice
            label={t('appSettings.compagnon.light')}
            value={model}
            options={[
              ['opus', t('appSettings.compagnon.opus')],
              ['haiku', t('appSettings.compagnon.haiku')],
            ]}
            onChange={setModel}
          />
        </Line>
      </Group>
      <Group title={t('appSettings.compagnon.interview')}>
        <Line
          label={t('appSettings.compagnon.interviewLabel')}
          help={t('appSettings.compagnon.interviewHelp')}
        >
          <Choice
            label={t('appSettings.compagnon.interviewLabel')}
            value={ctx.prefs.interviewGuided}
            options={[
              [false, t('appSettings.compagnon.free')],
              [true, t('appSettings.compagnon.guided')],
            ]}
            onChange={(interviewGuided) => ctx.updatePrefs({ interviewGuided })}
          />
        </Line>
      </Group>
    </>
  );
}

// ─── Synchronisation ─────────────────────────────────────────────────────

function useSync(ctx: Ctx): { status: SyncStatus; account: SyncAccountInfo | null | undefined } {
  const sync = ctx.platform.sync;
  const [status, setStatus] = useState<SyncStatus>(() => sync?.status() ?? 'off');
  const [account, setAccount] = useState<SyncAccountInfo | null | undefined>(undefined);
  useEffect(() => {
    if (!sync) return;
    let live = true;
    const read = () =>
      void sync.account().then(
        (a) => live && setAccount(a),
        () => live && setAccount(null),
      );
    read();
    const stop = sync.onStatusChange((s) => {
      setStatus(s);
      read();
    });
    return () => {
      live = false;
      stop();
    };
  }, [sync]);
  return { status, account };
}

function Sync({ ctx }: { readonly ctx: Ctx }) {
  const { t } = useTranslation();
  const { status, account } = useSync(ctx);
  const run = (id: string) => () => void ctx.runCommand(id);
  if (account === undefined) return null;
  if (!account)
    return (
      <Group title={t('appSettings.sync.account')}>
        <Line label={t('appSettings.sync.none')} help={t('appSettings.sync.noneHelp')}>
          <button type="button" className="ch-btn" onClick={run('syncSignIn')}>
            {t('appSettings.sync.signIn')}
          </button>
        </Line>
      </Group>
    );
  return (
    <>
      <Group title={t('appSettings.sync.account')}>
        <Line
          label={account.email}
          help={t('appSettings.sync.where', {
            server: account.server.replace(/^https?:\/\//, ''),
            state: t(`appSettings.sync.state.${status}`),
          })}
          sunk
        />
        <Line label={t('appSettings.sync.devices')} help={t('appSettings.sync.devicesHelp')}>
          <button type="button" className="ch-btn" onClick={run('syncDevices')}>
            {t('appSettings.sync.see')}
          </button>
        </Line>
        <Line label={t('appSettings.sync.admin')} help={t('appSettings.sync.adminHelp')}>
          <button type="button" className="ch-btn" onClick={run('adminPage')}>
            {t('appSettings.sync.open')}
          </button>
        </Line>
      </Group>
      <Group title={t('appSettings.sync.leave')}>
        <Line label={t('appSettings.sync.signOut')} help={t('appSettings.sync.signOutHelp')}>
          <button type="button" className="ch-btn" onClick={run('syncSignOut')}>
            {t('appSettings.sync.signOut')}
          </button>
        </Line>
      </Group>
    </>
  );
}

// ─── Bibliothèque ────────────────────────────────────────────────────────

function useLibrary(ctx: Ctx): { folder: string | null; novels: number | null } {
  const [folder, setFolder] = useState<string | null>(null);
  const [novels, setNovels] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void ctx.platform.libraryFolder?.current().then((f) => live && setFolder(f));
    void ctx.platform.library.list().then((l) => live && setNovels(l.length));
    return () => {
      live = false;
    };
  }, [ctx.platform]);
  return { folder, novels };
}

function Library({ ctx }: { readonly ctx: Ctx }) {
  const { t } = useTranslation();
  const { folder } = useLibrary(ctx);
  const service = ctx.platform.libraryFolder;
  return (
    <Group title={t(service ? 'appSettings.library.folder' : 'appSettings.library.novelsTitle')}>
      {service && (
        <Line label={folder ?? '…'} help={t('appSettings.library.folderHelp')} sunk>
          <button type="button" className="ch-btn" onClick={() => void service.choose()}>
            {t('appSettings.library.change')}
          </button>
          <button type="button" className="ch-btn" onClick={() => void service.reveal()}>
            {t('appSettings.library.reveal')}
          </button>
        </Line>
      )}
      <Line label={t('appSettings.library.all')} help={t('appSettings.library.allHelp')}>
        <button type="button" className="ch-btn" onClick={() => ctx.openLibrary()}>
          {t('novel.all')}
          {ctx.shortcutLabel('openLibrary') && <kbd>{ctx.shortcutLabel('openLibrary')}</kbd>}
        </button>
      </Line>
    </Group>
  );
}

// ─── À propos ────────────────────────────────────────────────────────────

/** « 0.1.1 (43d2f0a) »: the version, then the commit it was built from. */
export const aboutVersion = (about: { readonly version: string; readonly commit?: string }) =>
  about.commit ? `${about.version} (${about.commit})` : about.version;

/** The same, the commit in retreat (muted), as in the system line. */
function VersionText({
  about,
}: {
  readonly about: { readonly version: string; readonly commit?: string };
}) {
  return (
    <>
      {about.version}
      {about.commit && <span className="ch-aset-commit"> ({about.commit})</span>}
    </>
  );
}

function About({ ctx }: { readonly ctx: Ctx }) {
  const { t } = useTranslation();
  const about = ctx.platform.about;
  if (!about) return null;
  return (
    <Group title={t('appSettings.about.version')}>
      <Line
        label={
          <>
            {t('app.name')} <VersionText about={about} />
          </>
        }
        help={t('appSettings.about.help')}
        sunk
      />
    </Group>
  );
}

// ─── The sections ────────────────────────────────────────────────────────

const value = (read: (ctx: Ctx, t: Ctx['t']) => string) =>
  function Value({ ctx }: { readonly ctx: Ctx }) {
    const { t } = useTranslation();
    return <>{read(ctx, t)}</>;
  };

function CompagnonValue({ ctx }: { readonly ctx: Ctx }) {
  const { t } = useTranslation();
  const [model] = useLightModel(ctx);
  return <>{t(`appSettings.compagnon.${model}`)}</>;
}

function SyncValue({ ctx }: { readonly ctx: Ctx }) {
  const { t } = useTranslation();
  const { status, account } = useSync(ctx);
  return <>{account ? t(`appSettings.sync.short.${status}`) : t('appSettings.sync.short.off')}</>;
}

function LibraryValue({ ctx }: { readonly ctx: Ctx }) {
  const { t } = useTranslation();
  const { novels } = useLibrary(ctx);
  return <>{novels === null ? '' : t('appSettings.library.novels', { count: novels })}</>;
}

const intro = (key: string) =>
  function Intro() {
    const { t } = useTranslation();
    return <>{featureText(t)(key)}</>;
  };

/**
 * The app's sections, as the platform allows them: the sync where there is
 * one, the library folder on a desktop, « À propos » where the version is
 * known and no feature has its own (the X250's is in the system's settings).
 */
export function appSettingsSections(
  ctx: Pick<Ctx, 'platform'>,
  options: { readonly systemAbout: boolean },
): SettingsSection[] {
  const { platform } = ctx;
  return [
    {
      id: 'appearance',
      label: 'appSettings.sections.appearance',
      value: value((c, t) => t(`display.${c.prefs.theme}`)),
      intro: intro('appSettings.appearance.intro'),
      component: Appearance,
    },
    {
      id: 'writing',
      label: 'appSettings.sections.writing',
      value: value((c, t) => t('appSettings.px', { value: c.prefs.textSize })),
      intro: intro('appSettings.writing.intro'),
      component: Writing,
    },
    {
      id: 'sounds',
      label: 'appSettings.sections.sounds',
      value: value((c, t) =>
        t(c.prefs.uiSounds || c.prefs.typingSounds ? 'appSettings.yes' : 'appSettings.no'),
      ),
      intro: intro('appSettings.sounds.intro'),
      component: Sounds,
    },
    {
      id: 'compagnon',
      label: 'appSettings.sections.compagnon',
      value: CompagnonValue,
      intro: intro('appSettings.compagnon.intro'),
      component: Compagnon,
    },
    ...(platform.sync
      ? [
          {
            id: 'sync',
            label: 'appSettings.sections.sync',
            value: SyncValue,
            intro: intro('appSettings.sync.intro'),
            component: Sync,
          },
        ]
      : []),
    {
      id: 'library',
      label: 'appSettings.sections.library',
      value: LibraryValue,
      intro: intro('appSettings.library.intro'),
      component: Library,
    },
    ...(platform.about && !options.systemAbout
      ? [
          {
            id: 'about',
            label: 'appSettings.sections.about',
            value: function AboutValue({ ctx: c }: { readonly ctx: Ctx }) {
              return c.platform.about ? <VersionText about={c.platform.about} /> : null;
            },
            intro: intro('appSettings.about.intro'),
            component: About,
          },
        ]
      : []),
  ];
}
