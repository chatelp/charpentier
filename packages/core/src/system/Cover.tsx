import type { SystemService, WifiNetwork } from '@charpentier/platform';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlatform } from '../app/platform-context';
import { featureText } from '../features/feature';
import { Signal } from './controls';
import { useSystemState } from './system-store';
import './cover.css';

/** The system's cover (phase 5.6): the lock first, else the first start. */
export function SystemCover() {
  const system = usePlatform().system as SystemService;
  const state = useSystemState(system);
  return state.lock.locked ? <LockScreen system={system} /> : <FirstStart system={system} />;
}

const MIN_DOTS = 6;

/**
 * The lock (docs/DESIGN.md §4.12): full screen on the page, the time, the
 * date in small capitals, an engraved field where each character typed is a
 * vermilion dot. No project title, no text. A wrong code shakes the field
 * once and empties it; after 5, a wait.
 */
function LockScreen({ system }: { readonly system: SystemService }) {
  const { t, i18n } = useTranslation();
  const text = featureText(t);
  const state = useSystemState(system);
  const input = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [shake, setShake] = useState(0);
  const [message, setMessage] = useState<'wrong' | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => input.current?.focus(), []);

  const retryAt = state.lock.retryAt ? Date.parse(state.lock.retryAt) : null;
  const waiting = retryAt !== null && retryAt > now.getTime();
  const seconds = waiting ? Math.ceil((retryAt - now.getTime()) / 1000) : 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!code || waiting) return;
    const result = await system.unlock(code);
    if (result === 'ok') return;
    setCode('');
    setShake((n) => n + 1);
    setMessage(result === 'wrong' ? 'wrong' : null);
  };

  const time = new Intl.DateTimeFormat(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: !state.settings.clock24,
    timeZone: state.timeZone,
  }).format(now);
  const date = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: state.timeZone,
  }).format(now);
  const dots = Math.max(MIN_DOTS, code.length + 1);

  return (
    <form
      className="ch-lock"
      aria-label={text('system.lock.label')}
      onSubmit={(e) => void submit(e)}
      onPointerDown={(e) => {
        if (e.target !== input.current) {
          e.preventDefault();
          input.current?.focus();
        }
      }}
    >
      <p className="ch-lock-time">{time}</p>
      <p className="ch-lock-date">{date}</p>
      <label className="ch-lock-field">
        <span
          className="ch-lock-dots"
          aria-hidden="true"
          key={shake}
          data-shake={shake > 0 || undefined}
        >
          {Array.from({ length: Math.min(dots, 8) }, (_, i) => (
            <span key={i} className={i < code.length ? 'is-typed' : undefined} />
          ))}
        </span>
        <input
          ref={input}
          type="password"
          className="ch-lock-input"
          aria-label={text('system.lock.code')}
          autoComplete="off"
          maxLength={8}
          value={code}
          disabled={waiting}
          onChange={(e) => {
            setCode(e.target.value);
            setMessage(null);
          }}
          onBlur={() => requestAnimationFrame(() => input.current?.focus())}
        />
      </label>
      <p className="ch-lock-hint" role="status">
        {waiting
          ? text('system.lock.wait', { seconds })
          : message
            ? text(`system.lock.${message}`)
            : text('system.lock.hint')}
      </p>
    </form>
  );
}

type Step = 'wifi' | 'code' | 'sync' | 'mentor';

/**
 * The device's first start (§4.12): before the welcome note, a centred page,
 * « Bienvenue », the fleuron, the Compagnon's sentence, then four steps, each
 * with « Continuer ⏎ » and « Plus tard Échap ». What is put off stays in the
 * system line and the settings.
 */
function FirstStart({ system }: { readonly system: SystemService }) {
  const { t } = useTranslation();
  const text = featureText(t);
  const f = (key: string, options?: Readonly<Record<string, unknown>>) =>
    text(`system.firstStart.${key}`, options);
  const platform = usePlatform();
  const steps: Step[] = [
    'wifi',
    'code',
    ...(platform.sync ? (['sync'] as const) : []),
    ...(platform.agents ? (['mentor'] as const) : []),
  ];
  const [step, setStep] = useState<Step>('wifi');
  const next = () => {
    const i = steps.indexOf(step);
    const following = steps[i + 1];
    if (following) setStep(following);
    else void system.finishFirstStart();
  };

  return (
    <div className="ch-first">
      <h1 className="ch-first-title">{f('title')}</h1>
      <div className="ch-first-fleuron" aria-hidden="true">
        ⁂
      </div>
      <p className="ch-first-mentor">{f('mentor')}</p>
      <ol className="ch-seg ch-first-steps" aria-label={f('steps')}>
        {steps.map((s) => (
          <li
            key={s}
            className={s === step ? 'is-on' : undefined}
            aria-current={s === step || undefined}
          >
            {f(`step.${s}`)}
          </li>
        ))}
      </ol>
      {step === 'wifi' && <WifiStep system={system} f={f} onDone={next} />}
      {step === 'code' && <CodeStep system={system} f={f} onDone={next} />}
      {step === 'sync' && <SyncStep f={f} onDone={next} />}
      {step === 'mentor' && <MentorStep f={f} onDone={next} />}
    </div>
  );
}

type F = (key: string, options?: Readonly<Record<string, unknown>>) => string;

/** A step: its form (⏎ continues), « Plus tard » (Échap). */
function StepForm({
  f,
  onSubmit,
  onLater,
  busy,
  message,
  extra,
  children,
}: {
  readonly f: F;
  onSubmit(): void;
  onLater(): void;
  readonly busy: boolean;
  readonly message: string | null;
  readonly extra?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <form
      className="ch-first-step"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) onSubmit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onLater();
        } else if (
          e.key === 'Enter' &&
          !(e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement)
        ) {
          // ⏎ on a network of the list continues too.
          e.preventDefault();
          if (!busy) onSubmit();
        }
      }}
    >
      {children}
      <p className="ch-first-message" role="status">
        {busy ? f('busy') : message}
      </p>
      <p className="ch-first-actions">
        <button type="submit" className="ch-btn is-mentor" disabled={busy}>
          {f('continue')} <kbd>{f('enterKey')}</kbd>
        </button>
        {extra}
        <button type="button" className="ch-btn" onClick={onLater}>
          {f('later')} <kbd>{f('escapeKey')}</kbd>
        </button>
      </p>
    </form>
  );
}

function WifiStep({
  system,
  f,
  onDone,
}: {
  readonly system: SystemService;
  readonly f: F;
  onDone(): void;
}) {
  const state = useSystemState(system);
  const networks = state.wifi.networks;
  const [chosen, setChosen] = useState<string | null>(
    () => state.wifi.connected ?? networks[0]?.ssid ?? null,
  );
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }, []);
  const network = networks.find((n) => n.ssid === chosen);
  const needsPassword = !!network && network.secure && !network.known;

  const submit = async () => {
    if (!network || state.wifi.connected === network.ssid) return onDone();
    setBusy(true);
    const result = await system.connectWifi(network.ssid, needsPassword ? password : undefined);
    setBusy(false);
    if (result === 'connected') onDone();
    else setMessage(f(result === 'wrong-password' ? 'wrongPassword' : 'failed'));
  };

  const move = (by: number) => {
    const i = networks.findIndex((n) => n.ssid === chosen);
    const target = networks[(i + by + networks.length) % networks.length];
    if (!target) return;
    setChosen(target.ssid);
    setPassword('');
    setMessage(null);
    requestAnimationFrame(() =>
      list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus(),
    );
  };

  return (
    <StepForm f={f} onSubmit={() => void submit()} onLater={onDone} busy={busy} message={message}>
      {networks.length === 0 ? (
        <p className="ch-first-intro">{f('noNetwork')}</p>
      ) : (
        <ul className="ch-first-networks" role="listbox" aria-label={f('networks')} ref={list}>
          {networks.map((n: WifiNetwork) => (
            <li
              key={n.ssid}
              role="option"
              tabIndex={n.ssid === chosen ? 0 : -1}
              aria-selected={n.ssid === chosen}
              className={n.ssid === chosen ? 'is-chosen' : undefined}
              onClick={() => {
                setChosen(n.ssid);
                setPassword('');
                setMessage(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  move(e.key === 'ArrowDown' ? 1 : -1);
                }
              }}
            >
              <span className="ch-first-ssid">{n.ssid}</span>
              <span className="ch-first-net">
                <Signal bars={n.signal} />
                {n.secure && <span>{f('protected')}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {needsPassword && (
        <input
          type="password"
          className="ch-first-input"
          aria-label={f('password', { ssid: network.ssid })}
          placeholder={f('password', { ssid: network.ssid })}
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      )}
    </StepForm>
  );
}

function CodeStep({
  system,
  f,
  onDone,
}: {
  readonly system: SystemService;
  readonly f: F;
  onDone(): void;
}) {
  const [code, setCode] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);
  const submit = async () => {
    if (code !== again) return setMessage(f('codeMismatch'));
    setBusy(true);
    const result = await system.setLockCode(code);
    setBusy(false);
    if (result === 'ok') onDone();
    else setMessage(f('codeInvalid'));
  };
  return (
    <StepForm
      f={f}
      onSubmit={() => void submit()}
      onLater={onDone}
      busy={busy}
      message={message}
      extra={
        <button type="button" className="ch-btn" onClick={onDone}>
          {f('noCode')}
        </button>
      }
    >
      <p className="ch-first-intro">{f('codeIntro')}</p>
      <input
        ref={first}
        type="password"
        className="ch-first-input"
        aria-label={f('codeField')}
        placeholder={f('codeField')}
        autoComplete="off"
        maxLength={8}
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <input
        type="password"
        className="ch-first-input"
        aria-label={f('codeAgain')}
        placeholder={f('codeAgain')}
        autoComplete="off"
        maxLength={8}
        value={again}
        onChange={(e) => setAgain(e.target.value)}
      />
    </StepForm>
  );
}

function SyncStep({ f, onDone }: { readonly f: F; onDone(): void }) {
  const { t } = useTranslation();
  const sync = usePlatform().sync;
  const [server, setServer] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);
  const submit = async () => {
    if (!sync || !server.trim() || !email.trim()) return onDone();
    setBusy(true);
    const result = await sync.signIn({ server: server.trim(), email: email.trim(), password });
    setBusy(false);
    if (result === 'ok') onDone();
    else setMessage(t(`sync.signIn.${result}`));
  };
  return (
    <StepForm f={f} onSubmit={() => void submit()} onLater={onDone} busy={busy} message={message}>
      <p className="ch-first-intro">{f('syncIntro')}</p>
      <input
        ref={first}
        type="url"
        className="ch-first-input"
        aria-label={f('server')}
        placeholder={f('server')}
        value={server}
        onChange={(e) => setServer(e.target.value)}
      />
      <input
        type="email"
        className="ch-first-input"
        aria-label={f('email')}
        placeholder={f('email')}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        className="ch-first-input"
        aria-label={f('syncPassword')}
        placeholder={f('syncPassword')}
        autoComplete="off"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
    </StepForm>
  );
}

function MentorStep({ f, onDone }: { readonly f: F; onDone(): void }) {
  const { t } = useTranslation();
  const agents = usePlatform().agents;
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => field.current?.focus(), []);
  const submit = async () => {
    if (!agents || !key.trim()) return onDone();
    setBusy(true);
    const result = await agents.setApiKey(key.trim());
    setBusy(false);
    if (result === 'saved') onDone();
    else setMessage(t(`mentor.apiKey.${result}`));
  };
  return (
    <StepForm f={f} onSubmit={() => void submit()} onLater={onDone} busy={busy} message={message}>
      <p className="ch-first-intro">{f('mentorIntro')}</p>
      <input
        ref={field}
        type="password"
        className="ch-first-input"
        aria-label={f('apiKey')}
        placeholder={f('apiKey')}
        autoComplete="off"
        value={key}
        onChange={(e) => setKey(e.target.value)}
      />
    </StepForm>
  );
}
